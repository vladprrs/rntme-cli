import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import { Result, ok, err } from '../result.js';
import { CliError, cliError } from '../errors/codes.js';

const OrgSlug = z.string().regex(/^[a-z0-9-]{3,40}$/);
const ProjSlug = z.string().regex(/^[a-z0-9-]{3,60}$/);
const SvcSlug = z.string().regex(/^[a-z0-9-]{3,60}$/);

const RntmeProjectConfigSchema = z.object({
  $schema: z.string().url().optional(),
  org: OrgSlug,
  project: ProjSlug,
  service: SvcSlug,
  artifacts: z.object({
    manifest: z.string(),
    pdm: z.string(),
    qsm: z.string(),
    graphIr: z.string(),
    bindings: z.string(),
    ui: z.string(),
    seed: z.string(),
  }),
  defaults: z
    .object({
      tags: z.array(z.string()).optional(),
      message: z.string().optional(),
    })
    .optional(),
});

export type RntmeProjectConfig = z.infer<typeof RntmeProjectConfigSchema>;

export type DiscoveredConfig = {
  path: string;
  dir: string;
  config: RntmeProjectConfig;
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function discoverProjectConfig(
  startDir: string,
): Promise<Result<DiscoveredConfig, CliError>> {
  let dir = resolve(startDir);
  while (true) {
    const candidate = join(dir, 'rntme.json');
    if (await fileExists(candidate)) {
      return parseProjectConfig(candidate);
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return err(
    cliError(
      'CLI_CONFIG_MISSING',
      'rntme.json not found in current directory or any parent',
      'create `rntme.json` at the service root (see `rntme --help`)',
    ),
  );
}

export async function parseProjectConfig(
  path: string,
): Promise<Result<DiscoveredConfig, CliError>> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (cause) {
    return err(cliError('CLI_CONFIG_MISSING', `cannot read ${path}`, undefined, cause));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return err(cliError('CLI_CONFIG_INVALID', `invalid JSON in ${path}`, undefined, cause));
  }

  const schemaResult = RntmeProjectConfigSchema.safeParse(parsed);
  if (!schemaResult.success) {
    return err(
      cliError(
        'CLI_CONFIG_INVALID',
        `rntme.json schema violation: ${schemaResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      ),
    );
  }

  const cfg = schemaResult.data;

  for (const [key, p] of Object.entries(cfg.artifacts)) {
    if (isAbsolute(p)) {
      return err(
        cliError(
          'CLI_CONFIG_INVALID',
          `artifacts.${key} must be a relative path (got: ${p})`,
        ),
      );
    }
  }

  return ok({ path, dir: dirname(path), config: cfg });
}
