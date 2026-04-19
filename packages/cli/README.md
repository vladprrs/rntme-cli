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
| `RNTME_ORG` | Default org slug (overrides `rntme.json` and `--org`) | `my-org` |
| `RNTME_PROJECT` | Default project slug (overrides `rntme.json` and `--project`) | `my-project` |
| `RNTME_SERVICE` | Default service slug (overrides `rntme.json` and `--service`) | `my-service` |
| `RNTME_PROFILE` | Credentials profile name (overrides `--profile`) | `work` |
| `RNTME_NO_COLOR` | Disable colored output (set to any value to enable) | `1` |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error (missing argument, invalid input, API error) |
| `2` | Unknown subcommand |

## Error Codes

Error codes follow the format `CLI_<LAYER>_<KIND>`:

- `CLI_PARSE_MISSING_ARG` — Required argument missing
- `CLI_PARSE_INVALID_ARG` — Argument parsing failed
- `CLI_AUTH_MISSING` — No credentials found; run `rntme login`
- `CLI_AUTH_INVALID` — Token is invalid or expired
- `CLI_CONFIG_INVALID` — rntme.json is malformed or incomplete
- `CLI_VALIDATE_FAILED` — Bundle validation failed (detailed errors follow)
- `CLI_PUBLISH_FAILED` — Publish operation failed
- `CLI_API_ERROR` — Platform API returned an error
- `CLI_IO_ERROR` — File system or network I/O error

## See Also

- **Design spec:** [platform-commands-design.md](../../docs/superpowers/specs/2026-04-19-platform-commands-design.md) — Full architecture and command behavior
- **Platform API design:** [platform-api-design.md](../../docs/superpowers/specs/platform-api-design.md) — REST API contract and integration details
- **Implementation plan:** [platform-commands-plan.md](../../docs/superpowers/plans/platform-commands-plan.md) — Development phases and task breakdown
