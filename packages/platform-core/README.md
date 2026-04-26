# @rntme-cli/platform-core

Domain + use-cases + seam interfaces for the rntme platform control-plane.

## Deploy surface

This package owns the deploy target and deployment domain contracts used by
the platform API:

- deploy target schemas and use-cases for create/update/delete/default/rotate;
- deployment schemas and use-cases for queue/list/show/log reads;
- repository interfaces for deploy targets, deployment records, and log lines;
- `SecretCipher`, the encryption seam used before storage adapters persist
  Dokploy API tokens.

See `docs/superpowers/specs/done/2026-04-19-platform-api-design.md` in the public repo.
Deployment design: `docs/superpowers/specs/2026-04-24-project-deployment-pipeline-design.md`.
