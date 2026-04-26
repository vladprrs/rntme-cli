# @rntme-cli/deploy-dokploy

Dokploy target adapter for rntme project deployments.

## Role

`deploy-dokploy` renders a `ProjectDeploymentPlan` into redacted Dokploy
resources and applies them through an injected Dokploy HTTP client. It does not
load raw blueprints, store platform credentials, or run browser verification.

On the platform path, deploy target credentials are decrypted inside
`@rntme-cli/platform-http`'s Dokploy client factory. This package receives only
redacted target configuration and the injected client seam.

## Public API

- `renderDokployPlan(plan, config)` — creates a redacted Dokploy plan with
  deterministic names, labels, generated Nginx config, and digest.
- `applyDokployPlan(rendered, client)` — upserts Dokploy resources through an
  injected client and returns a structured apply result.
- `DokployClient` — narrow interface for the real HTTP client and tests.

## Where to look first

- `src/render.ts` — redacted Dokploy resource rendering and digesting.
- `src/nginx.ts` — generated Nginx edge config.
- `src/apply.ts` — idempotent apply flow through an injected client.
- `src/client.ts` — narrow Dokploy client seam.

## Specs

- `docs/superpowers/specs/2026-04-24-project-deployment-pipeline-design.md`

## Security

Rendered plans and apply results must not contain secret values. The package
never accepts secret values as input: secrets are closed over inside the
injected `DokployClient` implementation and never enter render or apply
argument surfaces. Leak-prevention is structural, not detector-based.
