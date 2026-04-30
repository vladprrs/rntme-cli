# @rntme-cli/deploy-core

Target-neutral project deployment planning for rntme.

## Role

`deploy-core` accepts an already validated/composed project model and produces a
`ProjectDeploymentPlan`. It does not read raw blueprint folders, collect
secrets, call Dokploy, or run browser verification.

On the platform path, `@rntme-cli/platform-http` fetches and revalidates an
immutable project-version bundle, converts the saved deploy target into
`ProjectDeploymentConfig`, and then calls this package before handing the plan
to a target adapter.

## Public API

- `buildProjectDeploymentPlan(project, config)` — creates a preview deployment
  plan or returns `DEPLOY_PLAN_*` errors.
- `ProjectDeploymentConfig` — org/environment/mode, external event bus,
  integration module image config, backend auth config, and policy values.
- `ComposedProjectInput` — deploy-relevant structural subset of the composed
  project model.

### Auth and SASL

`ExternalEventBusConfig.security` is a discriminated union:

- `{ protocol: "plaintext" }` for unauthenticated Kafka-compatible endpoints.
- `{ protocol: "sasl_ssl", mechanism, secretRefs }` for managed Redpanda/Kafka.
  `mechanism` must be `scram-sha-256` or `scram-sha-512`; `secretRefs.username`
  and `secretRefs.password` are required and are secret names, not secret values.

Edge middleware supports `kind: "auth"` as a runtime marker:

```json
{
  "kind": "auth",
  "provider": "auth0",
  "audience": "https://notes.example.com/api",
  "moduleSlug": "identity-auth0"
}
```

The matching integration module workload must exist, and Auth0 modules must
carry non-empty `AUTH0_DOMAIN` env. Public SPA config comes from the composed
project `publicConfigJson` sidecar, not from deployment auth settings.

## Where to look first

- `src/plan.ts` — deployment plan and workload construction.
- `src/edge.ts` — route and middleware planning.
- `src/config.ts` — target-neutral deployment config types.

## Specs

- `docs/superpowers/specs/2026-04-24-project-deployment-pipeline-design.md`
- `docs/superpowers/specs/2026-04-29-notes-demo-auth0-design.md`

## MVP limits

- Only `mode: "preview"` is supported.
- Only `environment: "default"` is supported.
- Production mode is rejected until persistence and deployment records are
  designed for the production path.
- Integration modules require explicit image config.
