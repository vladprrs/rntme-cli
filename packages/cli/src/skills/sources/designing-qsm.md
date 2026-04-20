---
name: designing-qsm
description: Use after designing-bindings. Paired with designing-graph-ir. Authors artifacts/qsm.json — projections (read tables) + relations (JOIN metadata) derived from queries declared in bindings.
---

## What you're building

`artifacts/qsm.json` is the read-side of the rntme runtime. It declares two things: **projections** — materialized tables that `@rntme/projection-consumer` builds by applying PDM events, one row per aggregate instance — and **relations** — single-hop JOIN metadata that `@rntme/graph-ir-compiler` uses to resolve dot-navigation in graph queries (e.g. `issue.project.key`). The 2026-04-16 migration moved all read-side relation metadata from PDM into QSM; the compiler now reads only QSM for JOIN structure, consulting PDM solely for field-to-column resolution. Every projection is an `entity-mirror`: a 1:1 read table kept in sync with one PDM entity through its event stream. The `derived` backing is reserved for future use and is currently rejected at validation.

## Checklist

1. From the bindings artifact, enumerate every query binding. Each query graph must have at least one projection it can read from. List the projection names you need.
2. For each projection, identify the source PDM entity. Set `backing: "entity-mirror"`, `source.entity` to the entity name, `keys` and `grain` to the entity's key field(s) (must be set-equal to each other and to the entity's own `keys`).
3. Declare `exposed`: the subset of entity fields that consumers may read. Do not include `generated` fields (`id`, `createdAt`, `updatedAt`, `actor`) — the validator rejects them in `exposed` (`QSM_XREF_EXPOSED_INCLUDES_GENERATED`). Include only the fields your queries actually need.
4. Set `table` to a stable SQL identifier (e.g. `"projection_issue"`, `"projects"`, `"users"`). If omitted, it defaults to `projection_<lowercased projection name>`. Collisions between two projections that resolve to the same table name are rejected (`QSM_STRUCT_DUPLICATE_TABLE`).
5. For each query graph that uses dot-navigation (e.g. `issue.project.key`), declare a relation in the `relations` map. The key is `"<SourceProjection>.<relationName>"` where `<relationName>` matches the PDM relation name exactly (no rename). Fill `to` (target projection name), `localKey`, `foreignKey`, `cardinality`, and optionally `role`. Relations are B2 cross-validated against PDM — the `to` projection's source entity must match PDM's `to`, and `localKey`, `foreignKey`, `cardinality` must be identical to the PDM relation.
6. Write `artifacts/qsm.json`. Validate with `rntme validate`. Fix all `QSM_*` codes.
7. If a projection shape changes (e.g. you add a field to `exposed`), re-check the bindings queries and graph-ir nodes that read from it — their output shapes may need updating.
8. `cardinality: "many"` is valid in the schema but the SQL compiler refuses to lower it (`NAV_FAN_OUT_NOT_ALLOWED`). Do not declare many-cardinality relations expecting them to produce JOINs; they are reserved for forward compatibility only.

## Red flags

| Symptom | Problem |
|---|---|
| Projection declared but no query binding references its table | YAGNI — the projection will be maintained by the event consumer but never read. Remove it or add a query that uses it. |
| Projection has no matching event in PDM (no creation transition) | The projection table will be created but will always be empty. Every `entity-mirror` projection is populated by PDM events; if there is no creation event, there is no data. |
| Relation key `"<A>.<R>"` where `A` is not declared in `projections` | Produces `QSM_XREF_RELATION_UNKNOWN_SOURCE_PROJECTION`; the source projection must exist. |
| Relation `to` points to a projection that does not exist | Produces `QSM_XREF_RELATION_UNKNOWN_TARGET_PROJECTION`; the target projection must also be declared in this QSM. |
| Relation declared with `cardinality: "many"` expecting a SQL JOIN | The compiler emits `NAV_FAN_OUT_NOT_ALLOWED`; many-cardinality relations are not lowered. Use `cardinality: "one"` for all navigable JOINs. |
| `exposed` includes a field with `generated` in the PDM entity | Produces `QSM_XREF_EXPOSED_INCLUDES_GENERATED`; generated fields are always present in the materialized table and do not need to be listed in `exposed`. |

## Schema reference

```ts pkg=@rntme/qsm export=QsmArtifactSchema
import { z } from 'zod';
import { CARDINALITY_VALUES, RELATION_ROLE_VALUES } from '../types/artifact.js';

const nonEmptyString = z.string().min(1);

const backingSchema = z.enum(['entity-mirror', 'derived']);

/**
 * Projection source — two shapes; validator layer enforces which one belongs
 * to which `backing`.
 */
const entitySourceSchema = z
  .object({
    entity: nonEmptyString,
    pathPrefix: nonEmptyString.optional(),
  })
  .strict();

const graphSourceSchema = z
  .object({
    graph: nonEmptyString,
  })
  .strict();

const sourceSchema = z.union([entitySourceSchema, graphSourceSchema]);

const projectionSchema = z
  .object({
    backing: backingSchema.optional(),
    source: sourceSchema,
    keys: z.array(nonEmptyString),
    grain: z.array(nonEmptyString),
    exposed: z.array(nonEmptyString),
    table: nonEmptyString.optional(),
  })
  .strict();

const cardinalitySchema = z.enum(CARDINALITY_VALUES);
const roleSchema = z.enum(RELATION_ROLE_VALUES);

const relationSchema = z
  .object({
    to: nonEmptyString,
    localKey: nonEmptyString,
    foreignKey: nonEmptyString,
    cardinality: cardinalitySchema,
    role: roleSchema.optional(),
  })
  .strict();

export const QsmArtifactSchema = z
  .object({
    projections: z.record(nonEmptyString, projectionSchema).default({}),
    relations: z.record(nonEmptyString, relationSchema).default({}),
  })
  .strict();

export type QsmArtifactParsed = z.output<typeof QsmArtifactSchema>;
```

Key constraints to keep in mind while authoring:

- **Both `projections` and `relations` use `.strict()`** — unknown keys are rejected at parse time (`QSM_PARSE_SCHEMA_VIOLATION`). Do not add custom keys.
- **`keys` and `grain` must be set-equal for `entity-mirror` projections** — the validator enforces this at cross-ref (`QSM_XREF_ENTITY_MIRROR_KEYS_MISMATCH`, `QSM_XREF_ENTITY_MIRROR_GRAIN_MISMATCH`).
- **Only one `entity-mirror` projection per source entity** — two mirrors over the same entity are rejected (`QSM_XREF_ENTITY_MIRROR_DUPLICATE`).
- **Relation key format is `"<ProjectionName>.<relationName>"`** — exactly one dot, both segments match `[A-Za-z_][A-Za-z0-9_]*`. Digit-leading or multi-dot keys are rejected (`QSM_RELATION_KEY_MALFORMED`).
- **`localKey` and `foreignKey` are field names, not column names** — the DDL generator resolves field → column internally; mixing them breaks DDL silently.
- **`backing: 'derived'`** — parses but fails at cross-ref with `QSM_BACKING_DERIVED_NOT_SUPPORTED`. Do not use in MVP.

## Worked example

```json artifact=qsm
{
  "projections": {
    "IssueView": {
      "backing": "entity-mirror",
      "source": { "entity": "Issue" },
      "keys": ["id"],
      "grain": ["id"],
      "exposed": [
        "id",
        "projectId",
        "reporterId",
        "assigneeId",
        "sprintId",
        "title",
        "status",
        "priority",
        "storyPoints",
        "resolvedAt"
      ],
      "table": "projection_issue"
    },
    "project_mirror": {
      "backing": "entity-mirror",
      "source": { "entity": "Project" },
      "keys": ["id"],
      "grain": ["id"],
      "exposed": [
        "id",
        "key",
        "name",
        "leadId",
        "status",
        "description"
      ],
      "table": "projects"
    },
    "user_mirror": {
      "backing": "entity-mirror",
      "source": { "entity": "User" },
      "keys": ["id"],
      "grain": ["id"],
      "exposed": [
        "id",
        "username",
        "email",
        "role",
        "status",
        "joinedAt"
      ],
      "table": "users"
    },
    "sprint_mirror": {
      "backing": "entity-mirror",
      "source": { "entity": "Sprint" },
      "keys": ["id"],
      "grain": ["id"],
      "exposed": [
        "id",
        "projectId",
        "name",
        "goal",
        "startsAt",
        "endsAt",
        "status"
      ],
      "table": "sprints"
    },
    "reportedIssueCountByProject": {
      "backing": "derived",
      "source": { "graph": "reportedIssueCountByProject" },
      "keys": ["projectId"],
      "grain": ["projectId"],
      "exposed": ["projectId", "count"],
      "table": "projection_reported_count"
    }
  },
  "relations": {
    "IssueView.project":  { "to": "project_mirror", "localKey": "projectId",  "foreignKey": "id", "cardinality": "one", "role": "dimension" },
    "IssueView.reporter": { "to": "user_mirror",    "localKey": "reporterId", "foreignKey": "id", "cardinality": "one", "role": "dimension" },
    "IssueView.assignee": { "to": "user_mirror",    "localKey": "assigneeId", "foreignKey": "id", "cardinality": "one", "role": "dimension" },
    "IssueView.sprint":   { "to": "sprint_mirror",  "localKey": "sprintId",   "foreignKey": "id", "cardinality": "one", "role": "dimension" }
  }
}
```

Walkthrough: `IssueView` is an `entity-mirror` over the `Issue` PDM entity; its `keys` and `grain` both equal `["id"]`, matching `Issue.keys`. The `exposed` list omits `createdAt` because that field has `generated: "createdAt"` in PDM (generated fields are automatically present in the materialized table but must not appear in `exposed`). The relation `"IssueView.project"` declares a single-hop JOIN from `IssueView` to `project_mirror` using `localKey: "projectId"` (a field on `Issue`) and `foreignKey: "id"` (a key field on `Project`); this matches the PDM relation `Issue.relations.project` exactly (B2 cross-validation). When the graph `issueDetail` uses dot-navigation `issue.project.key`, the compiler walks this relation, resolves the table `projects`, and emits `LEFT JOIN projects AS project ON projection_issue.project_id = project.id`.

## Anti-patterns

- **Caching a derived value that graph-ir can compute on read** — e.g. adding a `commentCount` field to `IssueView`. Derived aggregations belong in a separate QSM projection or are computed inline via graph-ir `aggregate` nodes. Storing them on the entity-mirror forces you to update them on every event that changes the count, which is fragile.
- **Duplicating PDM field types manually** — do not re-declare field types in QSM. The DDL generator derives column types from PDM (`integer` → `INTEGER`, `string`/`date`/`datetime` → `TEXT`, `boolean` → `INTEGER`, `decimal` → `REAL`). If a field type changes in PDM, the DDL follows automatically.
- **Using a mutable FK as the projection primary key** — `keys` on an `entity-mirror` must match the PDM entity's own `keys` (typically an auto-generated `id`). Using a mutable field like `status` or `assigneeId` as a key will fail at cross-ref (`QSM_XREF_ENTITY_MIRROR_KEYS_MISMATCH`) and would make idempotent updates impossible even if it passed.
- **Declaring a relation with `to` pointing to a PDM entity name instead of a projection name** — `QsmRelation.to` is always a projection name within this QSM artifact (e.g. `"project_mirror"`), never a PDM entity name (e.g. `"Project"`). The cross-ref validator looks up `to` in `qsm.projections`, not `pdm.entities`.
- **Declaring a relation in QSM that contradicts the PDM relation** — if `QsmRelation.localKey` differs from `pdm.entities[E].relations[R].localKey`, the cross-ref layer emits `QSM_XREF_RELATION_LOCAL_KEY_MISMATCH`. PDM is canon; QSM relations must agree with PDM exactly (B2 parity). Fix the QSM value to match PDM, never the reverse.
- **Declaring multi-hop relations** — each QSM relation is single-hop. If a query navigates `issue.project.lead.username`, you need two separate relations: `IssueView.project` and `project_mirror.lead`. Declaring a `through` path or chaining within a single relation entry is not supported.

## Validation & self-review

Run `rntme validate` from the service root. Fix all `QSM_*` codes — never edit `@rntme/qsm` to make validation pass; edit `qsm.json`. Common codes and their meaning:

- `QSM_PARSE_SCHEMA_VIOLATION` — Zod rejected the shape. Usually an unknown key (`.strict()` rejects extras), wrong type, or missing required field.
- `QSM_STRUCT_PROJECTION_KEYS_EMPTY` / `QSM_STRUCT_PROJECTION_GRAIN_EMPTY` / `QSM_STRUCT_PROJECTION_EXPOSED_EMPTY` — the respective array is empty; all three must have at least one entry.
- `QSM_STRUCT_DUPLICATE_TABLE` — two projections resolve to the same table name after `defaultTableName` lowercasing; use an explicit `table` to disambiguate.
- `QSM_RELATION_KEY_MALFORMED` — the relation key is not in `"<Projection>.<relation>"` form (must have exactly one dot, each segment matches `[A-Za-z_][A-Za-z0-9_]*`).
- `QSM_RELATION_TO_MISSING` / `QSM_RELATION_KEY_MISSING` — `to`, `localKey`, or `foreignKey` is empty; all are required.
- `QSM_XREF_SOURCE_UNKNOWN_ENTITY` — `source.entity` names a PDM entity that does not exist; check spelling against `pdm.json`.
- `QSM_XREF_KEY_UNKNOWN_FIELD` / `QSM_XREF_GRAIN_UNKNOWN_FIELD` / `QSM_XREF_EXPOSED_UNKNOWN_FIELD` — a field name in `keys`, `grain`, or `exposed` is not declared in the source entity's `fields`.
- `QSM_XREF_EXPOSED_INCLUDES_GENERATED` — `exposed` lists a field with a `generated` clause; remove it.
- `QSM_XREF_ENTITY_MIRROR_REQUIRES_STATE_MACHINE` — the source entity has no `stateMachine`; `entity-mirror` requires one (the handler deriver uses transitions to determine insert vs update ops).
- `QSM_XREF_ENTITY_MIRROR_KEYS_MISMATCH` / `QSM_XREF_ENTITY_MIRROR_GRAIN_MISMATCH` — projection `keys` or `grain` does not set-equal the source entity's `keys`; align them.
- `QSM_XREF_ENTITY_MIRROR_DUPLICATE` — two projections declare the same `source.entity`; only one mirror per entity is allowed.
- `QSM_XREF_RELATION_UNKNOWN_SOURCE_PROJECTION` / `QSM_XREF_RELATION_UNKNOWN_TARGET_PROJECTION` — the source or target projection in a relation key is not declared in `projections`.
- `QSM_XREF_RELATION_NOT_IN_PDM` — no PDM relation with this name exists on the source entity; check spelling against `pdm.json`.
- `QSM_XREF_RELATION_TO_MISMATCH` / `QSM_XREF_RELATION_LOCAL_KEY_MISMATCH` / `QSM_XREF_RELATION_FOREIGN_KEY_MISMATCH` / `QSM_XREF_RELATION_CARDINALITY_MISMATCH` — B2 mismatch; the QSM relation field does not match the corresponding PDM relation field; update QSM to agree with PDM.
- `QSM_XREF_RELATION_LOCAL_KEY_UNKNOWN_FIELD` / `QSM_XREF_RELATION_FOREIGN_KEY_UNKNOWN_FIELD` — the key field does not exist on the source or target entity.
- `QSM_XREF_RELATION_FOREIGN_KEY_NOT_A_KEY` — `foreignKey` must be in the target projection source entity's `keys`; a non-key FK join target is rejected.
- `QSM_BACKING_DERIVED_NOT_SUPPORTED` — `backing: "derived"` is parser-accepted but validator-rejected in MVP; remove or replace with `entity-mirror`.

## Next step

When BOTH this skill and designing-graph-ir are green, invoke Skill: composing-manifest.
