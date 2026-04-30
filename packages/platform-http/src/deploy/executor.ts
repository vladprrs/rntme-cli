import { clearInterval, setInterval } from 'node:timers';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { loadComposedBlueprint, type ComposedBlueprint } from '@rntme/blueprint';
import type { ComposedProjectInput, ProjectDeploymentConfig, ProjectDeploymentPlan } from '@rntme-cli/deploy-core';
import { buildProjectDeploymentPlan } from '@rntme-cli/deploy-core';
import type { DeploymentApplyResult, RenderedDokployPlan } from '@rntme-cli/deploy-dokploy';
import { applyDokployPlan, renderDokployPlan } from '@rntme-cli/deploy-dokploy';
import { build, type Plugin } from 'esbuild';
import {
  isOk,
  type BlobStore,
  type CanonicalBundle,
  type DeployTarget,
  type DeployTargetRepo,
  type DeployTargetWithSecret,
  type DeploymentRepo,
  type ProjectVersionRepo,
  type VerificationReport,
} from '@rntme-cli/platform-core';
import type { Logger } from 'pino';
import { buildDokployTargetConfig, buildProjectDeploymentConfig } from './build-deploy-config.js';
import type { DokployClientFactory } from './dokploy-client-factory.js';
import { redact } from './log-redactor.js';
import type { SmokeVerifier } from './smoke-verifier.js';

type ResultLike<T, E = { readonly code: string; readonly message: string }> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly E[] };

export type TxRepos = {
  readonly deployments: DeploymentRepo;
  readonly projectVersions: ProjectVersionRepo;
  readonly deployTargets: DeployTargetRepo;
};

export type ExecutorDeps = {
  readonly blob: BlobStore;
  readonly withOrgTx: <T>(orgId: string, fn: (repos: TxRepos) => Promise<T>) => Promise<T>;
  readonly orgSlugFor: (orgId: string) => Promise<string>;
  readonly dokployClientFactory: DokployClientFactory;
  readonly smoker: SmokeVerifier;
  readonly logger: Pick<Logger, 'error' | 'warn' | 'info'>;
  readonly loadComposed?: (dir: string) => ResultLike<LoadedDeployProject>;
  readonly planProject?: typeof buildProjectDeploymentPlan;
  readonly renderPlan?: typeof renderDokployPlan;
  readonly applyPlan?: typeof applyDokployPlan;
  readonly heartbeatMs?: number;
  readonly publicDeployDomain?: string;
};

type DeploymentContext = {
  readonly projectVersionId: string;
  readonly targetId: string;
  readonly configOverrides: Record<string, unknown>;
  readonly bundleBlobKey: string;
};

type LoadedDeployProject = ComposedProjectInput | ComposedBlueprint;

const IDENTITY_INTROSPECTION_PROTO = `syntax = "proto3";
package rntme.contracts.identity.v1;

message IntrospectSessionRequest {
  string token = 1;
  string audience = 2;
}

message Session {
  string session_id = 2;
  string user_id = 3;
  string organization_id = 4;
  int32 token_type = 5;
  repeated string roles = 6;
  repeated string permissions = 7;
  repeated string verified_factors = 8;
  int32 status = 9;
  string ip_address = 10;
  string user_agent = 11;
}

service IdentityModule {
  rpc IntrospectSession(IntrospectSessionRequest) returns (Session);
}
`;

export async function runDeployment(
  deploymentId: string,
  orgId: string,
  deps: ExecutorDeps,
): Promise<void> {
  const heartbeat = setInterval(() => {
    void deps
      .withOrgTx(orgId, (repos) => repos.deployments.touchHeartbeat(deploymentId))
      .catch(() => undefined);
  }, deps.heartbeatMs ?? 5_000);
  let tmpDir: string | null = null;

  try {
    const ctx = await startAndResolveContext(deploymentId, orgId, deps);
    await appendLog(deps, deploymentId, orgId, 'info', 'init', 'Starting deployment');
    await deps.withOrgTx(orgId, (repos) => repos.deployments.touchHeartbeat(deploymentId));

    const raw = await deps.blob.getRaw(ctx.bundleBlobKey);
    if (!isOk(raw)) {
      await finalize(deps, deploymentId, orgId, 'failed', {
        errorCode: 'DEPLOY_EXECUTOR_BLOB_FETCH_FAILED',
        errorMessage: raw.errors[0]?.message ?? 'unable to fetch project version bundle',
      });
      return;
    }

    const bundle = JSON.parse(gunzipSync(raw.value).toString('utf8')) as CanonicalBundle;
    tmpDir = await materializeBundle(bundle);

    await appendLog(deps, deploymentId, orgId, 'info', 'plan', 'Re-validating blueprint');
    const composed = (deps.loadComposed ?? defaultLoadComposed)(tmpDir);
    if (!composed.ok) {
      await finalize(deps, deploymentId, orgId, 'failed', {
        errorCode: 'DEPLOY_EXECUTOR_BLUEPRINT_REVALIDATION_FAILED',
        errorMessage: redact(errorSummary(composed.errors)),
      });
      return;
    }

    const target = await resolveTarget(deps, orgId, ctx.targetId);
    const orgSlug = await deps.orgSlugFor(orgId);
    const redactedTarget = redactTarget(target);
    const config = buildProjectDeploymentConfig(redactedTarget, orgSlug, ctx.configOverrides);
    const deployInput = await toDeployCoreInput(composed.value, tmpDir, config);
    const plan = (deps.planProject ?? buildProjectDeploymentPlan)(deployInput, config);
    if (!plan.ok) {
      await finalize(deps, deploymentId, orgId, 'failed', {
        errorCode: plan.errors[0]?.code ?? 'DEPLOY_PLAN_UNKNOWN',
        errorMessage: redact(errorSummary(plan.errors)),
      });
      return;
    }

    await appendLog(deps, deploymentId, orgId, 'info', 'render', 'Rendering Dokploy plan');
    const rendered = (deps.renderPlan ?? renderDokployPlan)(
      plan.value as ProjectDeploymentPlan,
      buildDokployTargetConfig(redactedTarget, ctx.configOverrides, {
        orgSlug,
        projectSlug: plan.value.project.projectSlug,
        environment: plan.value.project.environment,
        ...(deps.publicDeployDomain === undefined ? {} : { publicDeployDomain: deps.publicDeployDomain }),
      }),
    );
    if (!rendered.ok) {
      await finalize(deps, deploymentId, orgId, 'failed', {
        errorCode: rendered.errors[0]?.code ?? 'DEPLOY_RENDER_DOKPLOY_UNKNOWN',
        errorMessage: redact(errorSummary(rendered.errors)),
      });
      return;
    }
    await deps.withOrgTx(orgId, (repos) =>
      repos.deployments.setRenderedDigest(deploymentId, rendered.value.digest),
    );

    await appendLog(deps, deploymentId, orgId, 'info', 'apply', 'Applying Dokploy plan');
    const applied = await (deps.applyPlan ?? applyDokployPlan)(
      rendered.value as RenderedDokployPlan,
      deps.dokployClientFactory(target),
    );
    if (!applied.ok) {
      await finalize(deps, deploymentId, orgId, 'failed', {
        errorCode: applied.errors[0]?.code ?? 'DEPLOY_APPLY_DOKPLOY_UNKNOWN',
        errorMessage: redact(errorSummary(applied.errors)),
      });
      return;
    }
    await deps.withOrgTx(orgId, (repos) =>
      repos.deployments.setApplyResult(
        deploymentId,
        applied.value as unknown as Record<string, unknown>,
      ),
    );

    await appendLog(deps, deploymentId, orgId, 'info', 'verify', 'Running smoke verification');
    const verification = await deps.smoker.verify(applied.value as DeploymentApplyResult);
    await finalizeFromVerification(deps, deploymentId, orgId, verification);
  } catch (cause) {
    deps.logger.error({ deploymentId, cause }, 'deploy executor failed');
    await finalize(deps, deploymentId, orgId, 'failed', {
      errorCode: 'DEPLOY_EXECUTOR_UNCAUGHT',
      errorMessage: redact(cause instanceof Error ? cause.message : String(cause)),
    });
  } finally {
    clearInterval(heartbeat);
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function startAndResolveContext(
  deploymentId: string,
  orgId: string,
  deps: ExecutorDeps,
): Promise<DeploymentContext> {
  return deps.withOrgTx(orgId, async (repos) => {
    const startedAt = new Date();
    const transition = await repos.deployments.transition(deploymentId, 'running', { startedAt });
    if (!isOk(transition)) throw new Error(transition.errors[0]?.code ?? 'DEPLOYMENT_INVALID_TRANSITION');
    const deployment = await repos.deployments.getById(deploymentId);
    if (!isOk(deployment) || !deployment.value) throw new Error('DEPLOYMENT_NOT_FOUND');
    const version = await repos.projectVersions.getById(deployment.value.projectVersionId);
    if (!isOk(version) || !version.value) throw new Error('PROJECT_VERSION_NOT_FOUND');
    return {
      projectVersionId: deployment.value.projectVersionId,
      targetId: deployment.value.targetId,
      configOverrides: deployment.value.configOverrides,
      bundleBlobKey: version.value.bundleBlobKey,
    };
  });
}

async function resolveTarget(
  deps: ExecutorDeps,
  orgId: string,
  targetId: string,
): Promise<DeployTargetWithSecret> {
  return deps.withOrgTx(orgId, async (repos) => {
    const target = await repos.deployTargets.getWithSecretById(targetId);
    if (!isOk(target) || !target.value) throw new Error('DEPLOY_TARGET_NOT_FOUND');
    return target.value;
  });
}

async function appendLog(
  deps: ExecutorDeps,
  deploymentId: string,
  orgId: string,
  level: 'info' | 'warn' | 'error',
  step: string,
  message: string,
): Promise<void> {
  await deps.withOrgTx(orgId, async (repos) => {
    await repos.deployments.appendLog({ deploymentId, orgId, level, step, message: redact(message) });
  });
}

async function finalizeFromVerification(
  deps: ExecutorDeps,
  deploymentId: string,
  orgId: string,
  verificationReport: VerificationReport,
): Promise<void> {
  if (verificationReport.ok) {
    await finalize(deps, deploymentId, orgId, 'succeeded', { verificationReport });
    return;
  }
  if (verificationReport.partialOk) {
    await finalize(deps, deploymentId, orgId, 'succeeded_with_warnings', {
      verificationReport,
      warnings: ['smoke verification completed with warnings'],
    });
    return;
  }
  await finalize(deps, deploymentId, orgId, 'failed', {
    errorCode: 'DEPLOY_EXECUTOR_SMOKE_FAILED',
    errorMessage: 'smoke verification failed',
    verificationReport,
  });
}

async function finalize(
  deps: ExecutorDeps,
  deploymentId: string,
  orgId: string,
  status: 'succeeded' | 'succeeded_with_warnings' | 'failed' | 'failed_orphaned',
  args: {
    readonly errorCode?: string;
    readonly errorMessage?: string;
    readonly verificationReport?: VerificationReport;
    readonly warnings?: unknown[];
  },
): Promise<void> {
  await deps.withOrgTx(orgId, async (repos) => {
    const result = await repos.deployments.finalize(deploymentId, { status, ...args });
    if (!isOk(result)) deps.logger.warn({ deploymentId, errors: result.errors }, 'finalize failed');
  });
}

async function materializeBundle(bundle: CanonicalBundle): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rntme-deploy-'));
  for (const [relPath, value] of Object.entries(bundle.files)) {
    const path = join(dir, relPath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(value));
  }
  return dir;
}

function defaultLoadComposed(dir: string): ResultLike<LoadedDeployProject> {
  const result = loadComposedBlueprint(dir);
  return result as ResultLike<LoadedDeployProject>;
}

async function toDeployCoreInput(
  value: LoadedDeployProject,
  rootDir: string,
  config: ProjectDeploymentConfig,
): Promise<ComposedProjectInput> {
  if (!isComposedBlueprint(value)) return value;

  const publicConfigJson = resolvePublicConfigPlaceholders(value.publicConfigJson ?? null, config);
  const uiBuildFiles =
    value.virtualEntrySource === null || value.virtualEntrySource === undefined
      ? {}
      : await bundleVirtualEntrySource(value.virtualEntrySource, rootDir);

  return {
    name: value.project.name,
    publicConfigJson,
    services: Object.fromEntries(
      await Promise.all(
        value.project.services.map(async (slug) => [
          slug,
          {
            slug,
            kind: value.services[slug]?.kind ?? 'domain',
            ...(value.services[slug]?.kind === 'domain'
              ? { runtimeFiles: await buildRuntimeArtifactFiles(value, rootDir, slug, uiBuildFiles) }
              : {}),
          },
        ]),
      ),
    ),
    ...(value.project.routes === undefined ? {} : { routes: value.project.routes }),
    ...(value.project.middleware === undefined ? {} : { middleware: value.project.middleware }),
    ...(value.project.mounts === undefined ? {} : { mounts: value.project.mounts }),
  };
}

async function buildRuntimeArtifactFiles(
  project: ComposedBlueprint,
  rootDir: string,
  serviceSlug: string,
  uiBuildFiles: Record<string, string>,
): Promise<Record<string, string>> {
  const service = project.services[serviceSlug];
  if (service === undefined) throw new Error(`DEPLOY_EXECUTOR_SERVICE_ARTIFACTS_NOT_FOUND:${serviceSlug}`);
  if (service.graphSpec === null) throw new Error(`DEPLOY_EXECUTOR_SERVICE_GRAPHS_NOT_FOUND:${serviceSlug}`);
  if (service.qsmValidated === null) throw new Error(`DEPLOY_EXECUTOR_SERVICE_QSM_NOT_FOUND:${serviceSlug}`);
  if (service.bindings === null) throw new Error(`DEPLOY_EXECUTOR_SERVICE_BINDINGS_NOT_FOUND:${serviceSlug}`);

  const files: Record<string, string> = {};
  const modules = runtimeModulesForService(project, serviceSlug);
  addJsonFile(files, 'manifest.json', {
    rntmeVersion: '1.0',
    service: { name: serviceSlug, version: '1.0.0' },
    surface: { http: { enabled: true, port: 3000 } },
    seed: { enabled: service.seed !== null, path: 'seed.json' },
    modules,
  });
  for (const module of modules) {
    files[module.protoPath] = IDENTITY_INTROSPECTION_PROTO;
  }
  addJsonFile(files, 'pdm.json', project.pdm);
  addJsonFile(files, 'qsm.json', service.qsmValidated);
  addJsonFile(files, 'bindings.json', service.bindings.artifact);
  addJsonFile(files, 'shapes.json', service.graphSpec.shapes);

  for (const [graphId, graph] of Object.entries(service.graphSpec.graphs)) {
    addJsonFile(files, `graphs/${graphId}.json`, graph);
  }

  await addOptionalDirectoryFiles(files, rootDir, `services/${serviceSlug}/ui`, 'ui');
  Object.assign(files, uiBuildFiles);
  if (service.seed !== null) {
    await addOptionalTextFile(files, rootDir, `services/${serviceSlug}/seed/seed.json`, 'seed.json');
  }

  return files;
}

function resolvePublicConfigPlaceholders(
  publicConfigJson: string | null,
  config: ProjectDeploymentConfig,
): string | null {
  if (publicConfigJson === null) return null;
  const placeholder = '${AUTH0_SPA_CLIENT_ID}';
  if (!publicConfigJson.includes(placeholder)) return publicConfigJson;
  const clientId = config.auth?.auth0?.clientId;
  if (clientId === undefined || clientId.length === 0) {
    throw new Error('AUTH0_SPA_CLIENT_ID deploy target auth.auth0.clientId is required');
  }
  return publicConfigJson.split(placeholder).join(clientId);
}

async function bundleVirtualEntrySource(
  virtualEntrySource: string,
  rootDir: string,
): Promise<Record<string, string>> {
  const workspaceRoot = findWorkspaceRoot();
  const result = await build({
    stdin: {
      contents: virtualEntrySource,
      sourcefile: '__rntme_ui_entry.tsx',
      resolveDir: workspaceRoot,
      loader: 'tsx',
    },
    absWorkingDir: workspaceRoot,
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    sourcemap: true,
    write: false,
    outfile: join(rootDir, '.rntme-ui-build', 'main.js'),
    loader: { '.css': 'empty' },
    plugins: [workspacePackageResolver(workspaceRoot)],
  });

  const js = result.outputFiles.find((file) => file.path.endsWith('/main.js') || file.path.endsWith('\\main.js'));
  const map = result.outputFiles.find(
    (file) => file.path.endsWith('/main.js.map') || file.path.endsWith('\\main.js.map'),
  );
  if (js === undefined) throw new Error('DEPLOY_EXECUTOR_UI_BUNDLE_MISSING_MAIN_JS');

  return {
    'ui-build/main.js': js.text,
    ...(map === undefined ? {} : { 'ui-build/main.js.map': map.text }),
    'ui-build/main.css': readUiRuntimeCss(workspaceRoot),
  };
}

function workspacePackageResolver(workspaceRoot: string): Plugin {
  const packageDirs = discoverWorkspacePackageDirs(workspaceRoot);
  return {
    name: 'rntme-workspace-package-resolver',
    setup(buildApi) {
      buildApi.onResolve({ filter: /^@rntme\// }, (args) => {
        const packageName = packageNameFromImport(args.path);
        const packageDir = packageDirs.get(packageName);
        if (packageDir === undefined) return undefined;
        const subpath = args.path.slice(packageName.length);
        return { path: resolveWorkspaceExport(packageDir, subpath.length === 0 ? '.' : `.${subpath}`) };
      });
      buildApi.onResolve({ filter: /^\..*\.js$/ }, (args) => {
        const jsPath = join(args.resolveDir, args.path);
        if (existsSync(jsPath)) return undefined;
        const withoutJs = jsPath.slice(0, -'.js'.length);
        for (const candidate of [`${withoutJs}.ts`, `${withoutJs}.tsx`]) {
          if (existsSync(candidate)) return { path: candidate };
        }
        return undefined;
      });
    },
  };
}

function discoverWorkspacePackageDirs(workspaceRoot: string): Map<string, string> {
  const dirs = new Map<string, string>();
  for (const parent of ['packages', 'modules']) {
    collectPackageDirs(join(workspaceRoot, parent), dirs);
  }
  return dirs;
}

function collectPackageDirs(dir: string, output: Map<string, string>): void {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(dir, entry.name);
    const packageJsonPath = join(path, 'package.json');
    if (existsSync(packageJsonPath)) {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: unknown };
      if (typeof pkg.name === 'string') output.set(pkg.name, path);
      continue;
    }
    collectPackageDirs(path, output);
  }
}

function packageNameFromImport(value: string): string {
  const [scope, name] = value.split('/');
  return `${scope}/${name}`;
}

function resolveWorkspaceExport(packageDir: string, subpath: string): string {
  const packageJsonPath = join(packageDir, 'package.json');
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    exports?: unknown;
    main?: unknown;
  };
  const target = exportTargetForSubpath(pkg.exports, subpath) ?? (subpath === '.' ? pkg.main : undefined);
  if (typeof target === 'string') return resolveWorkspaceTarget(packageDir, target);
  return join(packageDir, subpath === '.' ? 'index.js' : subpath.slice(2));
}

function resolveWorkspaceTarget(packageDir: string, target: string): string {
  const normalized = target.replace(/^\.\//, '');
  const direct = join(packageDir, normalized);
  if (existsSync(direct)) return direct;

  for (const candidate of sourceFallbacks(packageDir, normalized)) {
    if (existsSync(candidate)) return candidate;
  }

  return direct;
}

function sourceFallbacks(packageDir: string, normalized: string): string[] {
  const withoutJs = normalized.endsWith('.js') ? normalized.slice(0, -'.js'.length) : normalized;
  const candidates: string[] = [];

  if (withoutJs.startsWith('dist/client/')) {
    const rest = withoutJs.slice('dist/client/'.length);
    candidates.push(join(packageDir, 'client', `${rest}.ts`));
    candidates.push(join(packageDir, 'client', `${rest}.tsx`));
    candidates.push(join(packageDir, 'src', 'client', `${rest}.ts`));
    candidates.push(join(packageDir, 'src', 'client', `${rest}.tsx`));
  }

  if (withoutJs.startsWith('dist/')) {
    const rest = withoutJs.slice('dist/'.length);
    candidates.push(join(packageDir, 'src', `${rest}.ts`));
    candidates.push(join(packageDir, 'src', `${rest}.tsx`));
  }

  return candidates;
}

function exportTargetForSubpath(exportsField: unknown, subpath: string): string | undefined {
  if (typeof exportsField === 'string' && subpath === '.') return exportsField;
  if (typeof exportsField !== 'object' || exportsField === null) return undefined;
  const exportsMap = exportsField as Record<string, unknown>;
  const value = exportsMap[subpath];
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    const conditionMap = value as Record<string, unknown>;
    if (typeof conditionMap.import === 'string') return conditionMap.import;
    if (typeof conditionMap.default === 'string') return conditionMap.default;
  }
  return undefined;
}

function findWorkspaceRoot(): string {
  for (const start of [process.cwd(), dirname(fileURLToPath(import.meta.url))]) {
    let current = start;
    while (true) {
      if (
        existsSync(join(current, 'packages', 'ui-runtime', 'package.json')) &&
        existsSync(join(current, 'modules'))
      ) {
        return current;
      }
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return process.cwd();
}

function readUiRuntimeCss(workspaceRoot: string): string {
  const cssPath = join(workspaceRoot, 'packages', 'ui-runtime', 'build', 'main.css');
  if (existsSync(cssPath)) return readFileSync(cssPath, 'utf8');
  return '/* rntme ui runtime styles unavailable at deploy bundle time */\n';
}

function runtimeModulesForService(
  project: ComposedBlueprint,
  serviceSlug: string,
): Array<{ name: string; grpc: { address: string }; protoPath: string }> {
  const slugs = new Set<string>();
  for (const [middlewareName, declaration] of Object.entries(project.project.middleware ?? {})) {
    if (declaration.kind !== 'auth' || declaration.moduleSlug === undefined) continue;
    if (!middlewareAppliesToService(project.project, middlewareName, serviceSlug)) continue;
    slugs.add(declaration.moduleSlug);
  }
  return [...slugs].sort().map((slug) => ({
    name: slug,
    grpc: { address: `${slug}:50051` },
    protoPath: `${slug}.proto`,
  }));
}

function middlewareAppliesToService(
  project: ComposedBlueprint['project'],
  middlewareName: string,
  serviceSlug: string,
): boolean {
  for (const mount of project.mounts ?? []) {
    if (!mount.use.includes(middlewareName)) continue;
    if (serviceForMountTarget(project, mount.target) === serviceSlug) return true;
  }
  return false;
}

function serviceForMountTarget(project: ComposedBlueprint['project'], target: string): string | undefined {
  if (target.startsWith('http:')) return project.routes?.http?.[target.slice('http:'.length)];
  if (target.startsWith('ui:')) return project.routes?.ui?.[target.slice('ui:'.length)];
  return undefined;
}

async function addOptionalDirectoryFiles(
  files: Record<string, string>,
  rootDir: string,
  sourceRel: string,
  targetRel: string,
): Promise<void> {
  const sourceRoot = join(rootDir, sourceRel);
  try {
    await addDirectoryFilesFrom(files, sourceRoot, sourceRoot, targetRel);
  } catch (cause) {
    if (errorCode(cause) === 'ENOENT') return;
    throw cause;
  }
}

async function addDirectoryFilesFrom(
  files: Record<string, string>,
  sourceRoot: string,
  currentDir: string,
  targetRel: string,
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await addDirectoryFilesFrom(files, sourceRoot, sourcePath, targetRel);
      continue;
    }
    if (entry.isFile()) {
      files[join(targetRel, relative(sourceRoot, sourcePath))] = await readFile(sourcePath, 'utf8');
    }
  }
}

async function addOptionalTextFile(
  files: Record<string, string>,
  rootDir: string,
  sourceRel: string,
  targetRel: string,
): Promise<void> {
  try {
    files[targetRel] = await readFile(join(rootDir, sourceRel), 'utf8');
  } catch (cause) {
    if (errorCode(cause) === 'ENOENT') return;
    throw cause;
  }
}

function addJsonFile(files: Record<string, string>, targetRel: string, value: unknown): void {
  files[targetRel] = `${JSON.stringify(value, null, 2)}\n`;
}

function errorCode(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return undefined;
  const code = (cause as { readonly code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function isComposedBlueprint(value: LoadedDeployProject): value is ComposedBlueprint {
  return (
    typeof value === 'object' &&
    value !== null &&
    'project' in value &&
    'pdm' in value &&
    'routing' in value &&
    'bindingRegistry' in value
  );
}

function redactTarget(target: DeployTargetWithSecret): DeployTarget {
  const {
    apiTokenCiphertext: _ciphertext,
    apiTokenNonce: _nonce,
    apiTokenKeyVersion: _keyVersion,
    ...rest
  } = target;
  return { ...rest, apiTokenRedacted: '***' };
}

function errorSummary(errors: readonly { readonly code?: string; readonly message?: string }[]): string {
  return errors.map((error) => `${error.code ?? 'UNKNOWN'}: ${error.message ?? ''}`).join('; ');
}
