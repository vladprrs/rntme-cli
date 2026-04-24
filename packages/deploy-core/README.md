# @rntme-cli/deploy-core

Target-neutral project deployment planning for rntme.

## Role

`deploy-core` accepts an already validated/composed project model and produces a
`ProjectDeploymentPlan`. It does not read raw blueprint folders, collect
secrets, call Dokploy, or run browser verification.

## Public API

- `buildProjectDeploymentPlan(project, config)` — creates a preview deployment
  plan or returns `DEPLOY_PLAN_*` errors.
- `ProjectDeploymentConfig` — org/environment/mode, external event bus,
  integration module image config, and policy values.
- `ComposedProjectInput` — deploy-relevant structural subset of the composed
  project model.

## Where to look first

- `src/plan.ts` — deployment plan and workload construction.
- `src/edge.ts` — route and middleware planning.
- `src/config.ts` — target-neutral deployment config types.

## Specs

- `docs/superpowers/specs/2026-04-24-project-deployment-pipeline-design.md`

## MVP limits

- Only `mode: "preview"` is supported.
- Only `environment: "default"` is supported.
- Production mode is rejected until Kafka/Redpanda runtime bus support,
  persistence, auth middleware, and deployment records are designed.
- Integration modules require explicit image config.
