# rntme-cli

Private pnpm subproject holding the `rntme` CLI. Consumed as a git submodule
inside `vladprrs/rntme` until it is mature enough to live independently.

## Workspace members

- `packages/cli/` — `@rntme-cli/cli`, the `rntme` binary.
- `packages/platform-core/` — platform domain, use-cases, and repository seams.
- `packages/platform-storage/` — Postgres/S3-backed platform adapters.
- `packages/platform-http/` — Hono platform API and server-rendered UI.
- `packages/deploy-core/` — target-neutral project deployment planning.
- `packages/deploy-dokploy/` — Dokploy render/apply adapter.

## Standalone build

```
pnpm install
pnpm -r run build
pnpm -r run test
```

## Consumed from the parent monorepo

This repo is mounted at `rntme-cli/` inside `vladprrs/rntme`. The parent's
`pnpm-workspace.yaml` includes `rntme-cli/packages/*`, so `pnpm -r` from the
parent root automatically covers members of this subproject.
