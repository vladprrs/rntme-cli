---
name: designing-pdm
description: Use when authoring or revising artifacts/pdm.json (aggregates, events, commands). Paired with designing-ui; both produce artifacts under the brief from brainstorming-rntme-service.
---

## What you're building

`artifacts/pdm.json` is the domain model: the named aggregates, their fields, foreign-key relations, and the finite-state machine that drives every mutation. Every other artifact — QSM projections, bindings endpoints, graph-IR queries, UI forms — references names declared here. The PDM is the single canonical source of truth for what exists in the domain and what can happen to it. It co-evolves with the UI artifact: UI forms express commands, and those commands must map to PDM transitions; if you add or remove a form in `designing-ui`, come back and align the PDM accordingly before advancing.

## Checklist

1. Read `brief.md` (produced by `brainstorming-rntme-service`) to know which aggregates exist and what use-cases they support.
2. For each aggregate in the brief, enumerate: the minimal set of fields needed to represent it (no derived fields), any foreign-key relations to other aggregates, the state-machine lifecycle (states → transitions → affected fields).
3. Cross-check with `designing-ui`: every UI form action (Create, Update, etc.) must map to exactly one PDM transition. No orphan actions.
4. Cross-check events: every transition produces an event (named `<Aggregate><TransitionPascal>`, e.g. `IssueReport`). Events are past-tense by convention; transitions are camelCase imperative (`report`, `submit`, `close`).
5. Write `artifacts/pdm.json`. Use the worked example below as the shape reference.
6. Run `rntme validate`. Fix any `PDM_*` codes before advancing. Do not edit `@rntme/pdm` to make validation pass — edit `pdm.json`.
7. If `designing-ui` has changed since you last read it, re-read the brief and the UI file; iterate PDM with those in mind.
8. When BOTH this skill and `designing-ui` pass `rntme validate`, invoke Skill: designing-bindings.

## Red flags

| Thought | Reality |
|---|---|
| "I'll store a derived field on the aggregate" | Derived = projection concern (QSM). PDM holds the minimum that can't be computed. `openIssueCount`, `commentCount`, `totalRevenue` all belong in a QSM projection, not on the aggregate. |
| "Two aggregates share a field, I'll copy it" | If they share semantics, extract an FK. PDM does not duplicate fields across aggregates. `name` on both `Project` and `Sprint` is fine if they're independent strings; `Project.leadId → User.id` is an FK, not a copy of `User.name`. |
| "My command and event have the same name" | Commands are imperative camelCase transitions (`createIssue`); events are the derived type name `IssueCreate`. They are related but not equal. |
| "I'll encode UI-only state (isDirty, hover, selectedTab) as an event" | UI state is client-side. Events record domain facts only. A field that only matters in the browser has no place in `pdm.json`. |
| "I need a `deletedAt` soft-delete field but will mark it generated" | `generated` only accepts `'id' | 'createdAt' | 'updatedAt' | 'actor'`. Soft-delete must be a hand-rolled nullable datetime — declare it as `{ "type": "datetime", "nullable": true, "column": "deleted_at" }` with no `generated`. |
| "I'll reference an aggregate from another service as a `to` target" | `relation.to` must resolve to a local entity in the same artifact. Cross-service references are rejected (`PDM_STRUCT_RELATION_UNKNOWN_ENTITY`). |

## Schema reference

```ts pkg=@rntme/pdm export=PdmArtifactSchema
import { z } from 'zod';

const nonEmptyString = z.string().min(1);

const scalarPrimitiveSchema = z.enum([
  'integer',
  'decimal',
  'string',
  'boolean',
  'date',
  'datetime',
]);

const generatedKindSchema = z.enum(['id', 'createdAt', 'updatedAt', 'actor']);

const fieldSchema = z
  .object({
    type: scalarPrimitiveSchema,
    nullable: z.boolean(),
    column: nonEmptyString,
    generated: generatedKindSchema.optional(),
  })
  .strict();

const relationSchema = z
  .object({
    to: nonEmptyString,
    cardinality: z.enum(['one', 'many']),
    localKey: nonEmptyString,
    foreignKey: nonEmptyString,
  })
  .strict();

const transitionSchema = z
  .object({
    from: z.union([z.null(), nonEmptyString, z.array(nonEmptyString).min(1)]),
    to: nonEmptyString,
    affects: z.array(nonEmptyString).optional(),
  })
  .strict();

const stateMachineSchema = z
  .object({
    stateField: nonEmptyString,
    initial: z.null(),
    states: z.array(nonEmptyString).min(1),
    transitions: z.record(
      nonEmptyString.regex(
        /^[a-z][a-zA-Z0-9]*$/,
        'transition name must match /^[a-z][a-zA-Z0-9]*$/',
      ),
      transitionSchema,
    ),
  })
  .strict();

const entitySchema = z
  .object({
    table: nonEmptyString,
    fields: z.record(nonEmptyString, fieldSchema),
    relations: z.record(nonEmptyString, relationSchema).optional(),
    keys: z.array(nonEmptyString).min(1),
    stateMachine: stateMachineSchema.optional(),
  })
  .strict();

export const PdmArtifactSchema = z
  .object({
    entities: z.record(nonEmptyString, entitySchema),
  })
  .strict();

export type PdmArtifactParsed = z.infer<typeof PdmArtifactSchema>;
```

Key constraints to keep in mind while authoring:

- **Every schema object uses `.strict()`** — unknown keys are rejected at parse time (`PDM_PARSE_SCHEMA_VIOLATION`). Do not add custom keys.
- **`keys` must be non-empty.** Every entity needs at least one primary-key field name.
- **`stateMachine.initial` must be the JSON literal `null`** — it is not a state name; it represents "no row yet". Creation transitions have `from: null`.
- **`states` must be non-empty** — at least one state required.
- **Transition names match `/^[a-z][a-zA-Z0-9]*$/`** — camelCase starting with a lowercase letter. Snake-case (`my_transition`) is rejected.
- **`affects` on a creation transition (`from: null`) is mandatory** — even if empty array (`[]`). The validator emits `PDM_SM_CREATION_MISSING_AFFECTS` if you omit it. The rationale: creation events have no prior row, so the payload manifest must be explicit.
- **Self-loop transitions (`from === to`) must declare a non-empty `affects`** — a self-loop with no field changes is a no-op (`PDM_SM_EMPTY_SELF_LOOP`).
- **`affects` cannot list keys or `generated` fields** — `PDM_SM_AFFECTS_KEY` / `PDM_SM_AFFECTS_GENERATED`. The resolver auto-prepends `stateField` to the resolved `affects`, so you do not list `stateField` in `affects` either — it is implicit.
- **Every state must be reachable by BFS from a creation transition** (`PDM_SM_UNREACHABLE_STATE`). Orphan states that no transition leads to will fail validation.
- **`ScalarPrimitive` is closed**: `'integer' | 'decimal' | 'string' | 'boolean' | 'date' | 'datetime'`. There is no `enum`, `json`, or `uuid` type. Approximate enums with `string` and enforce values in bindings.

## Worked example

Below is the canonical `artifacts/pdm.json` from the bundled issue-tracker example. When you author yours, model it on this shape.

```json artifact=pdm
{
  "entities": {
    "Issue": {
      "table": "issues",
      "fields": {
        "id": { "type": "integer", "nullable": false, "column": "id" },
        "projectId": { "type": "integer", "nullable": false, "column": "project_id" },
        "reporterId": { "type": "integer", "nullable": false, "column": "reporter_id" },
        "assigneeId": { "type": "integer", "nullable": true, "column": "assignee_id" },
        "sprintId": { "type": "integer", "nullable": true, "column": "sprint_id" },
        "title": { "type": "string", "nullable": false, "column": "title" },
        "status": { "type": "string", "nullable": false, "column": "status" },
        "priority": { "type": "string", "nullable": false, "column": "priority" },
        "storyPoints": { "type": "integer", "nullable": false, "column": "story_points" },
        "createdAt": { "type": "datetime", "nullable": false, "column": "created_at", "generated": "createdAt" },
        "resolvedAt": { "type": "datetime", "nullable": true, "column": "resolved_at" }
      },
      "relations": {
        "project": {
          "to": "Project",
          "cardinality": "one",
          "localKey": "projectId",
          "foreignKey": "id"
        },
        "reporter": {
          "to": "User",
          "cardinality": "one",
          "localKey": "reporterId",
          "foreignKey": "id"
        },
        "assignee": {
          "to": "User",
          "cardinality": "one",
          "localKey": "assigneeId",
          "foreignKey": "id"
        },
        "sprint": {
          "to": "Sprint",
          "cardinality": "one",
          "localKey": "sprintId",
          "foreignKey": "id"
        }
      },
      "keys": ["id"],
      "stateMachine": {
        "stateField": "status",
        "initial": null,
        "states": ["draft", "open", "in_progress", "resolved", "closed"],
        "transitions": {
          "report":   { "from": null,            "to": "draft",        "affects": ["title", "projectId", "reporterId", "priority", "storyPoints", "sprintId"] },
          "submit":   { "from": "draft",         "to": "open" },
          "assign":   { "from": "open",          "to": "in_progress",  "affects": ["assigneeId"] },
          "reassign": { "from": "in_progress",   "to": "in_progress",  "affects": ["assigneeId"] },
          "resolve":  { "from": "in_progress",   "to": "resolved",     "affects": ["resolvedAt"] },
          "reopen":   { "from": "resolved",      "to": "open" },
          "close":    { "from": "resolved",      "to": "closed" }
        }
      }
    },
    "Project": {
      "table": "projects",
      "fields": {
        "id": { "type": "integer", "nullable": false, "column": "id" },
        "key": { "type": "string", "nullable": false, "column": "key" },
        "name": { "type": "string", "nullable": false, "column": "name" },
        "leadId": { "type": "integer", "nullable": false, "column": "lead_id" },
        "status": { "type": "string", "nullable": false, "column": "status" },
        "description": { "type": "string", "nullable": true, "column": "description" },
        "createdAt": { "type": "datetime", "nullable": false, "column": "created_at", "generated": "createdAt" }
      },
      "relations": {
        "lead": {
          "to": "User",
          "cardinality": "one",
          "localKey": "leadId",
          "foreignKey": "id"
        }
      },
      "keys": ["id"],
      "stateMachine": {
        "stateField": "status",
        "initial": null,
        "states": ["active", "closed"],
        "transitions": {
          "create": {
            "from": null,
            "to": "active",
            "affects": ["key", "name", "leadId", "description"]
          },
          "close": { "from": "active", "to": "closed" }
        }
      }
    },
    "Sprint": {
      "table": "sprints",
      "fields": {
        "id": { "type": "integer", "nullable": false, "column": "id" },
        "projectId": { "type": "integer", "nullable": false, "column": "project_id" },
        "name": { "type": "string", "nullable": false, "column": "name" },
        "goal": { "type": "string", "nullable": true, "column": "goal" },
        "startsAt": { "type": "datetime", "nullable": false, "column": "starts_at" },
        "endsAt": { "type": "datetime", "nullable": false, "column": "ends_at" },
        "status": { "type": "string", "nullable": false, "column": "status" }
      },
      "relations": {
        "project": {
          "to": "Project",
          "cardinality": "one",
          "localKey": "projectId",
          "foreignKey": "id"
        }
      },
      "keys": ["id"],
      "stateMachine": {
        "stateField": "status",
        "initial": null,
        "states": ["planned", "started", "completed"],
        "transitions": {
          "plan": {
            "from": null,
            "to": "planned",
            "affects": ["projectId", "name", "goal", "startsAt", "endsAt"]
          },
          "start": { "from": "planned", "to": "started" },
          "complete": { "from": "started", "to": "completed" }
        }
      }
    },
    "User": {
      "table": "users",
      "fields": {
        "id": { "type": "integer", "nullable": false, "column": "id" },
        "username": { "type": "string", "nullable": false, "column": "username" },
        "email": { "type": "string", "nullable": false, "column": "email" },
        "role": { "type": "string", "nullable": false, "column": "role" },
        "status": { "type": "string", "nullable": false, "column": "status" },
        "joinedAt": { "type": "datetime", "nullable": false, "column": "joined_at" }
      },
      "relations": {},
      "keys": ["id"],
      "stateMachine": {
        "stateField": "status",
        "initial": null,
        "states": ["active", "deactivated"],
        "transitions": {
          "create": {
            "from": null,
            "to": "active",
            "affects": ["username", "email", "role", "joinedAt"]
          },
          "deactivate": { "from": "active", "to": "deactivated" }
        }
      }
    }
  }
}
```

Walkthrough: `Issue` carries only the fields that are domain facts — `title`, `status`, `priority`, `storyPoints`, and FK references to `Project`, `User`, and `Sprint`. It does not store `commentCount` or `openDays` because those are derivable in a QSM projection. The `report` transition is the creation event (`from: null`); it produces an `IssueReport` event whose payload includes every field listed in `affects` — those fields are what the projection-consumer INSERT binding writes into the `issues` table. When the QSM defines an entity-mirror projection over `Issue`, the `IssueReport` event populates the read-side row; downstream projections can JOIN on `projectId` or `assigneeId` to enrich it without storing derived data in the PDM aggregate itself.

## Anti-patterns

- **Storing derived/computed fields** (e.g. `openIssueCount` on `Team`, `lastActivityAt` on `Project`). Those belong in a QSM projection. The PDM aggregate holds only data that cannot be computed from other PDM facts.
- **Events that reference another aggregate by value instead of by FK id.** Store `assigneeId: integer` (FK to `User.id`), not `assigneeName: string`. The read side resolves names via JOIN in QSM.
- **A command (transition) with no corresponding event.** Every transition produces exactly one event: `<AggregateType><TransitionPascal>` (e.g. `IssueReassign`). If a transition produces no domain fact, it should not exist.
- **A field declared on the event payload that is not on the aggregate and not explicitly listed in `affects`.** The event payload is derived from `affects` — only fields listed there (plus the auto-prepended `stateField`) appear in the event. If you want a field in the event, it must be on the aggregate and in `affects`.
- **Re-using a transition name across aggregates.** Transition names must be unique within an entity's `stateMachine`. Across entities, same-named transitions are allowed but produce distinct event types (`IssueClose` vs `ProjectClose`).
- **Creation transition without `affects`.** Even if the creation event carries no custom fields (just the initial state), `affects` must be present as an explicit empty array `[]`. Omitting it entirely is a validation error (`PDM_SM_CREATION_MISSING_AFFECTS`).
- **Nullable `stateField`.** The state field (typically `status`) must be `"nullable": false`. A nullable state machine is rejected at the state-machine validation layer (`PDM_SM_STATE_FIELD_TYPE_INVALID`).

## Validation & self-review

- Re-read `brief.md`: does every use-case map to at least one transition + derived event? Is every aggregate from the brief present as an entity?
- Run `rntme validate`. Fix any `PDM_*` code — never edit `@rntme/pdm` to make validate pass; edit `pdm.json`.
- Common error codes and their meanings:
  - `PDM_PARSE_SCHEMA_VIOLATION` — Zod rejected the shape. Usually a missing required field, a wrong type, or an unknown key (`.strict()` rejects extras).
  - `PDM_STRUCT_KEY_UNKNOWN_FIELD` — `keys` array references a field name that doesn't exist in `fields`.
  - `PDM_STRUCT_RELATION_UNKNOWN_ENTITY` — `relation.to` names an entity not declared in `entities`.
  - `PDM_STRUCT_RELATION_UNKNOWN_LOCAL_KEY` / `PDM_STRUCT_RELATION_UNKNOWN_FOREIGN_KEY` — relation key references a field that doesn't exist in the source or target entity.
  - `PDM_SM_STATE_FIELD_MISSING` — `stateMachine.stateField` names a field not in `fields`.
  - `PDM_SM_STATE_FIELD_TYPE_INVALID` — `stateField` is not a non-nullable `string` field.
  - `PDM_SM_UNKNOWN_STATE` — a transition's `from` or `to` names a state not in `states`.
  - `PDM_SM_UNKNOWN_AFFECTED_FIELD` — `affects` lists a field name not in `fields`.
  - `PDM_SM_AFFECTS_KEY` — `affects` lists a key field (forbidden; keys are implicit).
  - `PDM_SM_AFFECTS_GENERATED` — `affects` lists a generated field (`createdAt`, `id`, etc.).
  - `PDM_SM_CREATION_MISSING_AFFECTS` — creation transition (`from: null`) is missing the `affects` array.
  - `PDM_SM_UNREACHABLE_STATE` — a state in `states` is never the `to` of any transition reachable from a creation transition.

## Next step

Once BOTH this skill and `designing-ui` pass `rntme validate`, invoke Skill: designing-bindings.
