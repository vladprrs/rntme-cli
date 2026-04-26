import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { runLogin } from '../commands/login.js';
import { runLogout } from '../commands/logout.js';
import { runWhoami } from '../commands/whoami.js';
import { runProjectCreate } from '../commands/project/create.js';
import { runProjectList } from '../commands/project/list.js';
import { runProjectShow } from '../commands/project/show.js';
import { runProjectPublish } from '../commands/project/publish.js';
import { runProjectVersionList } from '../commands/project/version-list.js';
import { runProjectVersionShow } from '../commands/project/version-show.js';
import { runTokenCreate } from '../commands/token/create.js';
import { runTokenList } from '../commands/token/list.js';
import { runTokenRevoke } from '../commands/token/revoke.js';
import { runInit } from '../commands/init.js';
import { runSkillsInstall } from '../commands/skills/install.js';
import type { CommonFlags } from '../commands/harness.js';

const USAGE = `Usage: rntme [options] <command> [subcommand] [args...]

Commands:
  login                   Save credentials to local credentials file
  logout                  Remove local credentials
  whoami                  Print the authenticated user/org

  init <slug>             Scaffold a project blueprint in cwd
  skills install --agent  Install skill pack for the chosen agent

  project create <slug>   Create a new project
  project list            List projects in the org
  project show [slug]     Show a project
  project publish         Publish a project blueprint version
  project version list    List project versions
  project version show    Show a project version

  token create <name>     Create a machine token
  token list              List tokens in the org
  token revoke <id>       Revoke a token

Global options:
  --json                  Output JSON instead of human-readable text
  --base-url <url>        API base URL (default: https://platform.rntme.com)
  --profile <name>        Credentials profile to use
  --org <slug>            Org slug
  --project <slug>        Project slug
  --token <pat>           Auth token (overrides credentials file)
  --verbose               Verbose output
  -q, --quiet             Suppress output on success
  --no-color              Disable colour output
  -h, --help              Show this help and exit
  -v, --version           Print the rntme CLI version and exit
`;

function readVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(here, '..', '..', 'package.json');
  const raw = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(raw) as { version: string };
  return pkg.version;
}

// ---------------------------------------------------------------------------
// Type-narrowing helpers — avoid `as` casts throughout the switch
// ---------------------------------------------------------------------------

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
}

function setIfDefined<T, K extends keyof T>(obj: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) obj[key] = value;
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export async function main(argv: string[]): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        // global flags
        json: { type: 'boolean' },
        'base-url': { type: 'string' },
        profile: { type: 'string' },
        org: { type: 'string' },
        project: { type: 'string' },
        service: { type: 'string' },
        token: { type: 'string' },
        verbose: { type: 'boolean' },
        quiet: { type: 'boolean', short: 'q' },
        'no-color': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        // command-specific flags
        tag: { type: 'string', multiple: true },
        message: { type: 'string' },
        'previous-version-seq': { type: 'string' },
        'include-archived': { type: 'boolean' },
        limit: { type: 'string' },
        cursor: { type: 'string' },
        'display-name': { type: 'string' },
        scopes: { type: 'string', multiple: true },
        expires: { type: 'string' },
        'artifacts-dir': { type: 'string' },
        folder: { type: 'string' },
        'create-project': { type: 'boolean' },
        'dry-run': { type: 'boolean' },
        agent: { type: 'string' },
        target: { type: 'string' },
        force: { type: 'boolean' },
      },
      allowPositionals: true,
      strict: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(message + '\n');
    process.stderr.write(USAGE);
    return 1;
  }

  const { values, positionals } = parsed;

  if (asBool(values['help']) === true) {
    process.stdout.write(USAGE);
    return 0;
  }

  if (asBool(values['version']) === true) {
    process.stdout.write(readVersion() + '\n');
    return 0;
  }

  // Build commonFlags conditionally to satisfy exactOptionalPropertyTypes
  const commonFlags: CommonFlags = {};
  setIfDefined(commonFlags, 'json', asBool(values['json']));
  setIfDefined(commonFlags, 'baseUrl', asString(values['base-url']));
  setIfDefined(commonFlags, 'profile', asString(values['profile']));
  setIfDefined(commonFlags, 'org', asString(values['org']));
  setIfDefined(commonFlags, 'project', asString(values['project']));
  setIfDefined(commonFlags, 'service', asString(values['service']));
  setIfDefined(commonFlags, 'token', asString(values['token']));
  setIfDefined(commonFlags, 'verbose', asBool(values['verbose']));
  setIfDefined(commonFlags, 'quiet', asBool(values['quiet']));

  const cmd = positionals[0];

  if (!cmd) {
    process.stderr.write('No command given.\n\n');
    process.stderr.write(USAGE);
    return 1;
  }

  switch (cmd) {
    // -------------------------------------------------------------------------
    // login / logout / whoami
    // -------------------------------------------------------------------------
    case 'login': {
      const loginFlags: Parameters<typeof runLogin>[0] = {};
      setIfDefined(loginFlags, 'token', asString(values['token']));
      setIfDefined(loginFlags, 'baseUrl', asString(values['base-url']));
      setIfDefined(loginFlags, 'profile', asString(values['profile']));
      setIfDefined(loginFlags, 'json', asBool(values['json']));
      return runLogin(loginFlags);
    }

    case 'logout': {
      const logoutFlags: Parameters<typeof runLogout>[0] = {};
      setIfDefined(logoutFlags, 'json', asBool(values['json']));
      return runLogout(logoutFlags);
    }

    case 'whoami': {
      return runWhoami(commonFlags);
    }

    // -------------------------------------------------------------------------
    // project
    // -------------------------------------------------------------------------
    case 'project': {
      const sub = positionals[1];
      if (!sub) {
        process.stderr.write('Usage: rntme project <create|list|show|publish|version> ...\n');
        return 1;
      }
      switch (sub) {
        case 'create': {
          const slug = positionals[2];
          if (!slug) {
            process.stderr.write('Usage: rntme project create <slug> [--display-name <name>]\n');
            return 1;
          }
          const projectCreateArgs: Parameters<typeof runProjectCreate>[0] = { slug };
          setIfDefined(projectCreateArgs, 'displayName', asString(values['display-name']));
          return runProjectCreate(projectCreateArgs, commonFlags);
        }
        case 'list': {
          const projectListArgs: Parameters<typeof runProjectList>[0] = {};
          setIfDefined(projectListArgs, 'includeArchived', asBool(values['include-archived']));
          return runProjectList(projectListArgs, commonFlags);
        }
        case 'show': {
          const slug = positionals[2];
          const showArgs: Parameters<typeof runProjectShow>[0] = {};
          if (slug !== undefined) showArgs.slug = slug;
          return runProjectShow(showArgs, commonFlags);
        }
        case 'publish': {
          const publishArgs: Parameters<typeof runProjectPublish>[0] = {};
          setIfDefined(publishArgs, 'folder', asString(values['folder']));
          setIfDefined(publishArgs, 'createProject', asBool(values['create-project']));
          setIfDefined(publishArgs, 'dryRun', asBool(values['dry-run']));
          return runProjectPublish(publishArgs, commonFlags);
        }
        case 'version': {
          const versionSub = positionals[2];
          if (!versionSub) {
            process.stderr.write('Usage: rntme project version <list|show> ...\n');
            return 1;
          }
          switch (versionSub) {
            case 'list': {
              const limitRaw = asString(values['limit']);
              const versionListArgs: Parameters<typeof runProjectVersionList>[0] = {};
              if (limitRaw !== undefined) {
                const n = Number.parseInt(limitRaw, 10);
                if (!Number.isNaN(n)) versionListArgs.limit = n;
              }
              setIfDefined(versionListArgs, 'cursor', asString(values['cursor']));
              return runProjectVersionList(versionListArgs, commonFlags);
            }
            case 'show': {
              const seqRaw = positionals[3];
              if (!seqRaw) {
                process.stderr.write('Usage: rntme project version show <seq>\n');
                return 1;
              }
              const seq = Number.parseInt(seqRaw, 10);
              if (Number.isNaN(seq) || seq <= 0) {
                process.stderr.write(`Invalid version seq: ${seqRaw}\n`);
                return 1;
              }
              return runProjectVersionShow({ seq }, commonFlags);
            }
            default: {
              process.stderr.write(`Unknown project version subcommand: ${versionSub}\n`);
              process.stderr.write('Usage: rntme project version <list|show> ...\n');
              return 2;
            }
          }
        }
        default: {
          process.stderr.write(`Unknown project subcommand: ${sub}\n`);
          process.stderr.write('Usage: rntme project <create|list|show|publish|version> ...\n');
          return 2;
        }
      }
    }

    // -------------------------------------------------------------------------
    // token
    // -------------------------------------------------------------------------
    case 'token': {
      const sub = positionals[1];
      if (!sub) {
        process.stderr.write('Usage: rntme token <create|list|revoke> ...\n');
        return 1;
      }
      switch (sub) {
        case 'create': {
          const name = positionals[2];
          if (!name) {
            process.stderr.write('Usage: rntme token create <name> [--scopes <s>...] [--expires <iso>]\n');
            return 1;
          }
          const scopes = asStringArray(values['scopes']) ?? [];
          const tokenCreateArgs: Parameters<typeof runTokenCreate>[0] = {
            name,
            scopes,
          };
          setIfDefined(tokenCreateArgs, 'expiresAt', asString(values['expires']));
          return runTokenCreate(tokenCreateArgs, commonFlags);
        }
        case 'list': {
          return runTokenList(commonFlags);
        }
        case 'revoke': {
          const id = positionals[2];
          if (!id) {
            process.stderr.write('Usage: rntme token revoke <id>\n');
            return 1;
          }
          return runTokenRevoke({ id }, commonFlags);
        }
        default: {
          process.stderr.write(`Unknown token subcommand: ${sub}\n`);
          process.stderr.write('Usage: rntme token <create|list|revoke> ...\n');
          return 2;
        }
      }
    }

    // -------------------------------------------------------------------------
    // init + skills
    // -------------------------------------------------------------------------
    case 'init': {
      const slug = positionals[1];
      if (!slug) {
        process.stderr.write('Usage: rntme init <slug>\n');
        return 1;
      }
      const initArgs: Parameters<typeof runInit>[0] = { slug };
      setIfDefined(initArgs, 'json', asBool(values['json']));
      return runInit(initArgs);
    }

    case 'skills': {
      const sub = positionals[1];
      if (!sub) {
        process.stderr.write('Usage: rntme skills <install> ...\n');
        return 1;
      }
      switch (sub) {
        case 'install': {
          const agent = asString(values['agent']);
          if (!agent) {
            process.stderr.write('Usage: rntme skills install --agent <claude-code|cursor> [--target <p>] [--force]\n');
            return 1;
          }
          const installArgs: Parameters<typeof runSkillsInstall>[0] = { agent };
          setIfDefined(installArgs, 'target', asString(values['target']));
          setIfDefined(installArgs, 'force', asBool(values['force']));
          setIfDefined(installArgs, 'json', asBool(values['json']));
          return runSkillsInstall(installArgs);
        }
        default: {
          process.stderr.write(`Unknown skills subcommand: ${sub}\n`);
          return 2;
        }
      }
    }

    // -------------------------------------------------------------------------
    // Unknown top-level command
    // -------------------------------------------------------------------------
    default: {
      process.stderr.write(`Unknown command: ${cmd}\n\n`);
      process.stderr.write(USAGE);
      return 1;
    }
  }
}

// Only run when executed directly as the CLI entry point.
// In ESM, import.meta.url gives this file's URL; process.argv[1] is the entry file path.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)));
}
