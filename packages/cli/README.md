# @rntme-cli/cli

The **rntme CLI** is a command-line interface for interacting with the rntme platform. It provides tools for authentication, publishing service bundles, managing projects and services, versioning, tagging, and token management.

## Quick Start

### 1. Install

```bash
npm install -g @rntme-cli/cli
# or
pnpm add -g @rntme-cli/cli
```

### 2. Create `rntme.json` in your service directory

```json
{
  "name": "my-service",
  "org": "my-org",
  "project": "my-project",
  "service": "my-service",
  "artifacts": {
    "pdm": "./artifacts/pdm.json",
    "qsm": "./artifacts/qsm.json",
    "ui": "./artifacts/ui.json",
    "seed": "./artifacts/seed.json"
  }
}
```

### 3. Authenticate

```bash
rntme login
# Obtain a token from https://platform.rntme.com and paste it when prompted
```

### 4. Validate the bundle

```bash
rntme validate
```

### 5. Publish

```bash
rntme publish --tag production
```

## Commands

```
Usage: rntme [options] <command> [subcommand] [args...]

Commands:
  login                   Save credentials to local credentials file
  logout                  Remove local credentials
  whoami                  Print the authenticated user/org
  validate                Validate the local bundle (rntme.json)
  publish                 Publish the local bundle to the platform

  project create <slug>   Create a new project
  project list            List projects in the org
  project show [slug]     Show a project

  service create <slug>   Create a new service
  service list            List services in the project
  service show [slug]     Show a service

  version list            List published versions
  version show <seq|tag>  Show a specific version

  tag list                List tags for a service
  tag set <name> <seq>    Point a tag at a version
  tag delete <name>       Delete a tag

  token create <name>     Create a machine token
  token list              List tokens in the org
  token revoke <id>       Revoke a token

Global options:
  --json                  Output JSON instead of human-readable text
  --base-url <url>        API base URL (default: https://platform.rntme.com)
  --profile <name>        Credentials profile to use
  --org <slug>            Org slug (overrides rntme.json)
  --project <slug>        Project slug (overrides rntme.json)
  --service <slug>        Service slug (overrides rntme.json)
  --token <pat>           Auth token (overrides credentials file)
  --verbose               Verbose output
  -q, --quiet             Suppress output on success
  --no-color              Disable colour output
  -h, --help              Show this help and exit
  -v, --version           Print the rntme CLI version and exit
```

## Environment Variables

| Variable | Effect | Example |
|----------|--------|---------|
| `RNTME_BASE_URL` | API base URL (overrides `--base-url`) | `https://platform.rntme.com` |
| `RNTME_TOKEN` | Authentication token (overrides credentials file and `--token`) | `pat_...` |
| `RNTME_PROFILE` | Credentials profile name (overrides `--profile`) | `work` |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Generic error or internal failure |
| `2` | Config or credentials problem |
| `3` | Authentication failed |
| `4` | Forbidden (insufficient scope) |
| `5` | Not found or archived resource |
| `6` | Validation failed |
| `7` | Concurrency conflict (version mismatch) |
| `8` | Rate limited |
| `9` | Network error |
| `10` | Server error (5xx from platform) |

## Error Codes

Error codes follow the format `CLI_<LAYER>_<KIND>`. Exit code mapping per [exit.ts](src/errors/exit.ts).

### Config Layer

- `CLI_CONFIG_MISSING` — rntme.json not found in any parent directory
- `CLI_CONFIG_INVALID` — rntme.json is malformed or invalid JSON
- `CLI_CONFIG_ARTIFACT_NOT_FOUND` — Required artifact file referenced in rntme.json does not exist

### Credentials Layer

- `CLI_CREDENTIALS_MISSING` — Credentials file not found; run `rntme login`
- `CLI_CREDENTIALS_INVALID` — Credentials file is malformed or corrupted
- `CLI_CREDENTIALS_PERMISSIONS_TOO_OPEN` — Credentials file has unsafe permissions (not 0600)

### Runtime Layer

- `CLI_RESPONSE_PARSE_FAILED` — Platform API response could not be parsed (exit 10)
- `CLI_VALIDATE_LOCAL_FAILED` — Local bundle validation failed (exit 6)
- `CLI_PUBLISH_DIGEST_MISMATCH` — Published digest does not match local bundle (exit 1)
- `CLI_NETWORK_TIMEOUT` — Network request timed out (exit 9)
- `CLI_USAGE` — Incorrect command usage (exit 2)

## See Also

- **CLI design spec:** See `docs/superpowers/specs/2026-04-19-rntme-cli-platform-commands-design.md` in the rntme monorepo
- **Platform API design:** See `docs/superpowers/specs/2026-04-19-platform-api-design.md` in the rntme monorepo
