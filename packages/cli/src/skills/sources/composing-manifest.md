---
name: composing-manifest
description: Use after all other artifacts pass rntme validate. Authors artifacts/manifest.json — the index over the other 6 artifacts plus org/project/service identity and plugin seam config.
---

## What you're building

`artifacts/manifest.json` is the entry-point that `@rntme/runtime` reads first. It declares service identity (`service.name`, `service.version`), the runtime protocol version (`rntmeVersion`), HTTP surface config, persistence mode, and optional plugin seam overrides. The runtime's `loadService(dir)` call validates the manifest, then loads every other artifact from the same directory. Nothing boots — no event-store, no projections, no HTTP listener — until the manifest is present and valid.

## Checklist

1. Set `service.name` from the brief (e.g. `"issue-tracker-api"`). This value must match the service name used in any `seed.json` event payloads — a mismatch causes `SEED_INVALID` at load time.
2. Set `service.version` from the brief semantic version string (e.g. `"1.0.0"`).
3. Set `rntmeVersion` to `"1.0"` (the current runtime major; a different major returns `MANIFEST_VERSION_MAJOR_MISMATCH`).
4. Confirm all 6 other artifacts exist in the same `artifacts/` directory and each passes `rntme validate` individually: `pdm.json`, `qsm.json`, `graphs/` (one or more `*.json`), `bindings.json`, `ui.json`, and `seed.json` (if needed).
5. Declare `surface.http.port` if you need a non-default port (default is runtime-assigned ephemeral; `port: 0` is also valid for tests). Leave the `surface` block out entirely to accept the default.
6. Leave plugin seams at their defaults unless you have a concrete reason to override: `BetterSqliteDriver` (SQLite), `InMemoryBus`, `HttpSurface`. Do not introduce a Postgres driver — the only supported dialect is SQLite (scale-out goes through Turso).
7. Write `artifacts/manifest.json`.
8. Run `rntme validate` on the full artifact bundle. All layers must be green before proceeding.

## Red flags

| Symptom | Problem |
|---|---|
| Paths in manifest point to files outside the `artifacts/` directory | `loadService` resolves all artifact paths relative to the directory it receives; absolute or `../` paths break Docker deployments and `rntme validate` in CI |
| `service.name` differs from the name used in `seed.json` event payloads | Seed apply fails with `SEED_INVALID`; confirm both sides use the exact same string |
| `persistence.mode: "persistent"` with only one path field | Both `eventStorePath` and `qsmPath` are required in persistent mode; omitting either yields `MANIFEST_MISSING_EVENT_STORE_PATH` or `MANIFEST_MISSING_QSM_PATH` |
| Plugin override to Postgres | Forbidden — SQLite is the only supported dialect per project constraint; scale-out goes through Turso (SQLite-compatible), not Postgres |
| `rntmeVersion` major differs from the runtime's `RUNTIME_VERSION.major` | `MANIFEST_VERSION_MAJOR_MISMATCH`; the runtime rejects the manifest entirely |
| Extra top-level keys not in the schema | The schema is `.strict()` — any unknown key returns `MANIFEST_UNKNOWN_KEY` |

## Type reference

The manifest schema is defined with Zod in `@rntme/runtime`. Hand-rolled type reference (not a drift-gated fence):

```ts
import { z } from 'zod';

export const StudioConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    mountPath: z.string().startsWith('/').default('/_studio'),
    maxRows: z.number().int().min(1).max(1_000_000).default(10_000),
  })
  .strict();

export type StudioConfig = z.infer<typeof StudioConfigSchema>;

export const ManifestSchema = z
  .object({
    rntmeVersion: z.string(),
    service: z.object({
      name: z.string().min(1),
      version: z.string().min(1),
    }),
    surface: z
      .object({
        http: z
          .object({
            enabled: z.boolean().optional(),
            port: z.number().int().min(0).max(65535).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    persistence: z
      .object({
        mode: z.enum(['ephemeral', 'persistent']).optional(),
        eventStorePath: z.string().optional(),
        qsmPath: z.string().optional(),
      })
      .strict()
      .optional(),
    bus: z
      .object({
        mode: z.literal('in-memory').optional(),
      })
      .strict()
      .optional(),
    auth: z
      .object({
        mode: z.literal('header').optional(),
        headerName: z.string().min(1).optional(),
        actorKind: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    observability: z
      .object({
        health: z
          .object({ path: z.string().startsWith('/').optional() })
          .strict()
          .optional(),
        metrics: z
          .object({ path: z.string().startsWith('/').optional() })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    seed: z
      .object({
        enabled: z.boolean().optional(),
        path: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    studio: StudioConfigSchema.optional(),
  })
  .strict();
```

## Worked example

```json artifact=manifest
{
  "rntmeVersion": "1.0",
  "service": { "name": "issue-tracker-api", "version": "1.0.0" },
  "surface": { "http": { "port": 3000 } },
  "studio": {
    "enabled": true,
    "mountPath": "/_studio",
    "maxRows": 10000
  }
}
```

Walkthrough: `service.name` is `"issue-tracker-api"` — the same string that appears in the seed event payloads and in the Kafka topic `rntme.issue-tracker-api.<aggregate>`. The `surface.http.port` field pins the listener to port 3000; omit it entirely (or use `port: 0`) to get an OS-assigned port, which is useful in tests. No `persistence` block means the runtime defaults to `ephemeral` mode — both the event-store and QSM databases open as `:memory:`. The `studio` block is optional; it enables the built-in query UI at `/_studio` (useful during development). The three plugin seams (`BetterSqliteDriver`, `InMemoryBus`, `HttpSurface`) are in effect by default without any explicit fields in the manifest.

## Anti-patterns

- **Embedding artifact schemas inline** — the manifest is a pointer document. Do not copy PDM entity definitions, QSM projection schemas, or bindings routes into `manifest.json`. Each artifact owns its own schema; the manifest just tells the runtime where to find the directory.
- **Per-environment branching in manifest** — do not create `manifest.staging.json` or conditional objects inside `manifest.json`. Use env overrides (`RNTME_HTTP_PORT`, `RNTME_PERSISTENCE_MODE`, `RNTME_EVENT_STORE_PATH`, `RNTME_QSM_PATH`, `RNTME_AUTH_HEADER_NAME`) to vary behavior across environments at deploy time.
- **Runtime-only fields in the author-time manifest** — fields like actual port bindings or resolved database file paths belong in the environment, not in the committed manifest. The manifest declares intent; the runtime resolves actuals.
- **Postgres plugin override** — `BetterSqliteDriver` is the only shipped `DbDriver`. The target scale-out path is Turso (SQLite-compatible Rust), not Postgres. Do not introduce a Postgres-backed driver or Postgres-specific SQL anywhere in the artifact pipeline.
- **Omitting `service.name` or `service.version`** — both fields are `z.string().min(1)` (required, non-empty). Leaving either out returns `MANIFEST_MISSING_FIELD`; an empty string returns `MANIFEST_INVALID_TYPE`.
- **Setting `persistence.mode: "persistent"` without both paths** — both `eventStorePath` and `qsmPath` must be present when mode is `persistent`. Providing only one yields a hard error at load time; the service will not start.

## Validation & self-review

Run `rntme validate <artifacts-dir>` — the CLI exits 1 and emits a JSON error array if anything is wrong. The entire bundle (manifest + all 6 artifacts) must be green. Common manifest error codes:

- `MANIFEST_NOT_JSON` — file is not valid JSON.
- `MANIFEST_UNKNOWN_KEY` — an unrecognized top-level key is present (schema is `.strict()`).
- `MANIFEST_MISSING_FIELD` — `service.name` or `service.version` is absent.
- `MANIFEST_INVALID_PORT` — `surface.http.port` is outside `[0, 65535]` or is not an integer; also emitted if `RNTME_HTTP_PORT` env override is non-numeric.
- `MANIFEST_INVALID_VERSION` — `rntmeVersion` is not a valid semver string.
- `MANIFEST_VERSION_MAJOR_MISMATCH` — `rntmeVersion` major does not match the runtime's current major (`1`).
- `MANIFEST_MISSING_EVENT_STORE_PATH` / `MANIFEST_MISSING_QSM_PATH` — `persistence.mode` is `"persistent"` but the corresponding path field is absent.

Fix all manifest errors before re-running the full bundle validate.

## Next step

Invoke Skill: publishing-via-rntme-cli.
