# @rntme-cli/cli

The **rntme CLI** is a command-line interface for interacting with the rntme platform. It provides tools for authentication, publishing project blueprint versions, managing projects, token management, and project deploy planning through the deploy packages.

## Quick Start

### 1. Install

```bash
npm install -g @rntme-cli/cli
# or
pnpm add -g @rntme-cli/cli
```

### 2. Create a project blueprint

```bash
rntme init my-project
```

The canonical authoring and versioning unit is the project blueprint folder rooted at `project.json`.

### 3. Authenticate

```bash
rntme login
# Obtain a token from https://platform.rntme.com and paste it when prompted
```

### 4. Validate the blueprint

```bash
rntme project publish --dry-run --org my-org --project my-project .
```

### 5. Publish

```bash
rntme project publish --org my-org --project my-project .
```

## Commands

```
Usage: rntme [options] <command> [subcommand] [args...]

Commands:
  login                   Save credentials to local credentials file
  logout                  Remove local credentials
  whoami                  Print the authenticated user/org
  project create <slug>   Create a new project
  project list            List projects in the org
  project show [slug]     Show a project
  project publish [dir]   Upload or dry-run a project blueprint
  project version list    List project versions
  project version show    Show a project version

  token create <name>     Create a machine token
  token list              List tokens in the org
  token revoke <id>       Revoke a token

  deploy plan             Produce a redacted project deployment plan
  deploy render dokploy   Render the plan for Dokploy
  deploy apply dokploy    Apply the rendered Dokploy plan

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

- `CLI_CONFIG_MISSING` — required local config was not found
- `CLI_CONFIG_INVALID` — local config is malformed or invalid JSON
- `CLI_CONFIG_ARTIFACT_NOT_FOUND` — required blueprint material does not exist

### Credentials Layer

- `CLI_CREDENTIALS_MISSING` — Credentials file not found; run `rntme login`
- `CLI_CREDENTIALS_INVALID` — Credentials file is malformed or corrupted
- `CLI_CREDENTIALS_PERMISSIONS_TOO_OPEN` — Credentials file has unsafe permissions (not 0600)

### Runtime Layer

- `CLI_RESPONSE_PARSE_FAILED` — Platform API response could not be parsed (exit 10)
- `CLI_VALIDATE_LOCAL_FAILED` — local blueprint validation failed (exit 6)
- `CLI_PUBLISH_DIGEST_MISMATCH` — published digest does not match local project bundle (exit 1)
- `CLI_NETWORK_TIMEOUT` — Network request timed out (exit 9)
- `CLI_USAGE` — Incorrect command usage (exit 2)

## See Also

- **CLI design spec:** See `docs/superpowers/specs/done/2026-04-19-rntme-cli-platform-commands-design.md` in the rntme monorepo
- **Platform API design:** See `docs/superpowers/specs/done/2026-04-19-platform-api-design.md` in the rntme monorepo
- **Deployment pipeline design:** See `docs/superpowers/specs/2026-04-24-project-deployment-pipeline-design.md` in the rntme monorepo

## Bootstrapping a new project

```bash
rntme init tracker
rntme skills install --agent claude-code   # or --agent cursor
```

In your agent, invoke `Skill: using-rntme`. The pack routes through:
brainstorming-rntme-service → designing-ui + designing-pdm → designing-bindings → designing-qsm + designing-graph-ir → composing-blueprint → publishing-via-rntme-cli.

### `rntme init <slug>`

Scaffolds `project.json` plus a minimal `services/app` project blueprint. Refuses to overwrite an existing `project.json`.

### `rntme skills install --agent <name>`

Installs the 9-skill pack. Agents: `claude-code` (→ `.claude/skills/rntme/*.md`), `cursor` (→ `.cursor/rules/rntme/*.mdc`). Flags: `--target <path>`, `--force`.
