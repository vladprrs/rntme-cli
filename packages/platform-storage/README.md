# @rntme-cli/platform-storage

Postgres (Drizzle + RLS) and rustfs (S3-compatible) adapters that implement the repository and blob-store interfaces declared in `@rntme-cli/platform-core`.

## Deploy storage

Deploy targets and deployment records live in Postgres with tenant RLS:

- `deploy_target` stores Dokploy endpoint/project metadata, event-bus config,
  policy values, default-target state, and AES-GCM encrypted API tokens.
- `deployment` stores queue/run/final status, rendered plan digest, apply
  result, verification report, warnings, errors, and heartbeat timestamps.
- `deployment_log_line` stores append-only sanitized executor logs with bounded
  message length.

`AesGcmSecretCipher.fromEnv(env)` reads `PLATFORM_SECRET_ENCRYPTION_KEY`
(64 hex chars) and implements the `SecretCipher` seam from
`@rntme-cli/platform-core`.
