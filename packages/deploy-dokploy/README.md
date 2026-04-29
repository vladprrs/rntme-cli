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

## Auth and external event bus rendering

Domain-service workloads always receive `RNTME_EVENT_BUS_BROKERS` and
`RNTME_EVENT_BUS_PROTOCOL`. When the deployment plan uses
`security.protocol: "sasl_ssl"`, render adds:

- `RNTME_EVENT_BUS_MECHANISM`
- `RNTME_EVENT_BUS_USERNAME` with `secret: true`
- `RNTME_EVENT_BUS_PASSWORD` with `secret: true`
- optional `RNTME_EVENT_BUS_TOPIC_PREFIX`

The username/password values are secret references, not plaintext credentials.

When `kind: "auth"` middleware is mounted on a domain-service route, render
adds `RNTME_AUTH_PROVIDER`, `RNTME_AUTH_AUDIENCE`, `RNTME_AUTH_MODULE_SLUG`,
and `RNTME_AUTH_MODULE_ENDPOINT=<module-resource>:50051` to that domain
service. It also generates public `/srv/config.json` with Auth0 `domain`,
`clientId`, `audience`, `redirectUri`, and runtime `manifestUrl`. The file must
contain only public SPA values.

Nginx deliberately does not validate JWTs. Auth middleware renders comments in
the location block only; enforcement is delegated to runtime pre-step calls into
the identity module.

## Specs

- `docs/superpowers/specs/2026-04-24-project-deployment-pipeline-design.md`
- `docs/superpowers/specs/2026-04-29-notes-demo-auth0-design.md`

## Security

Rendered plans and apply results must not contain secret values. The package
never accepts secret values as input: secrets are closed over inside the
injected `DokployClient` implementation and never enter render or apply
argument surfaces. Leak-prevention is structural for render/apply inputs; apply
error cause serialization also redacts common credential-bearing fragments from
client error messages while preserving non-secret diagnostic context.
