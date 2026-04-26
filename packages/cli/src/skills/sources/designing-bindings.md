---
name: designing-bindings
description: Use after designing-ui + designing-pdm. Authors artifacts/bindings.json — the public HTTP surface: commands + queries, derived from UI actions and PDM commands.
---

## What you're building

`artifacts/bindings.json` is a derived contract that bridges the UI artifact and the PDM domain model to a concrete HTTP surface. Commands map UI actions to PDM command transitions via HTTP method and path (`POST /v1/issues/{issueId}/actions/assign`), while queries map UI data-bindings to read-side graph queries that `@rntme/graph-ir-compiler` later compiles into SQLite. The runtime (`@rntme/bindings-http`) reads this artifact at startup to build one Hono route per binding entry, emitting an OpenAPI 3.1 document as a side effect.

## Checklist

1. From the UI artifact, enumerate every `kind: "command"` action — each `binding` ID becomes one command binding entry (`kind: "command"`, `method: "POST"`). Map each action's `paramsFromState` keys to `in: "body"` or `in: "path"` parameters.
2. From the UI artifact, enumerate every `DataBinding` in `screen.data` — each `binding` ID becomes one query binding entry (`kind: "query"`, `method: "GET"`). Map the `params` keys to `in: "query"` or `in: "path"` parameters.
3. For command paths, follow REST conventions: resource collection (`/v1/issues`) for creation, then sub-resource action paths (`/v1/issues/{issueId}/actions/submit`) for transitions. Path placeholders must match `in: "path"` parameter names exactly.
4. For query paths, model them as resource reads: `/v1/issues` (list), `/v1/issues/{id}` (detail), `/v1/issues/search` (filtered), `/v1/stats/by-project` (aggregation).
5. Declare request/response shapes by reference: parameter names must match the graph input names declared in the Graph IR, so `bindTo` must equal the graph's input key.
6. Write `artifacts/bindings.json` with `version: "1.0"`, `graphSpecRef`, `pdmRef`, `qsmRef`, and a `bindings` map.
7. Run `rntme project publish --dry-run`. Fix all `BINDINGS_*` codes.
8. Iterate with `designing-ui` if any derived type is fuzzy — for example, if a UI action's `paramsFromState` key doesn't match the graph input name, update the binding's `bindTo` field or align the UI accordingly.

## Red flags

| Symptom | Problem |
|---|---|
| Command path uses a verb (`/doAssign`, `/submitIssue`) instead of a resource + action segment | Violates REST conventions; use `/v1/issues/{issueId}/actions/assign` instead |
| Query binding has no QSM projection declared for its backing graph | The graph will compile but return empty results or fail at runtime — every query graph must have a corresponding QSM projection |
| A `bindTo` value references a field name not declared in the graph's input signature | Produces `BINDINGS_UNKNOWN_BIND_TO` at the references layer; graph inputs are the source of truth, not PDM fields |
| Two bindings share the same `method + path` combination | Produces `BINDINGS_DUPLICATE_METHOD_PATH`; HTTP routing is ambiguous — use different paths or methods |
| A `kind: "command"` binding uses `in: "query"` parameters | Forbidden by the structural layer (`BINDINGS_COMMAND_QUERY_PARAM_FORBIDDEN`); commands use only `in: "path"` and `in: "body"` |
| A `kind: "query"` binding uses `method: "POST"` while also having `in: "body"` params | Technically allowed in the schema but unusual; prefer `GET` + `in: "query"` for reads that don't mutate |

## Schema reference

```ts pkg=@rntme/bindings export=BindingArtifactSchema
import { z } from 'zod';

const nonEmptyString = z.string().min(1);

const pathString = z
  .string()
  .regex(/^\/[^?#]*$/, 'path must start with "/" and contain no "?" or "#"');

const passthrough = z.record(z.string(), z.unknown());

const parameterSchema = z
  .object({
    name: nonEmptyString,
    in: z.enum(['query', 'path', 'body']),
    bindTo: nonEmptyString,
    required: z.boolean(),
    description: z.string().optional(),
    openapi: passthrough.optional(),
  })
  .strict();

const httpSchema = z
  .object({
    method: z.enum(['GET', 'POST']),
    path: pathString,
    parameters: z.array(parameterSchema),
    summary: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(nonEmptyString).optional(),
    operationId: nonEmptyString.optional(),
    openapi: passthrough.optional(),
  })
  .strict();

const bindingEntrySchema = z
  .object({
    kind: z.enum(['query', 'command']).default('query'),
    graph: nonEmptyString,
    target: z
      .object({
        engine: nonEmptyString,
        dialect: nonEmptyString,
      })
      .strict(),
    http: httpSchema,
  })
  .strict();

const openApiDefaultsSchema = z
  .object({
    info: z
      .object({
        title: z.string().optional(),
        version: z.string().optional(),
        description: z.string().optional(),
      })
      .strict()
      .optional(),
    servers: z
      .array(
        z
          .object({
            url: nonEmptyString,
            description: z.string().optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const BindingArtifactSchema = z
  .object({
    version: z.literal('1.0'),
    graphSpecRef: nonEmptyString,
    pdmRef: nonEmptyString,
    qsmRef: nonEmptyString,
    openapi: openApiDefaultsSchema.optional(),
    bindings: z.record(z.string(), bindingEntrySchema),
  })
  .strict();

export type BindingArtifactParsed = z.infer<typeof BindingArtifactSchema>;
```

## Worked example

```json artifact=bindings
{
  "version": "1.0",
  "graphSpecRef": "issue-tracker.graphs.v1",
  "pdmRef": "issue-tracker.domain.v1",
  "qsmRef": "issue-tracker.read.v1",
  "openapi": {
    "info": {
      "title": "Issue Tracker Demo API",
      "version": "0.1.0",
      "description": "Read-only REST API backed by Graph IR → SQLite. Demo for @rntme."
    },
    "servers": [
      { "url": "http://localhost:3000", "description": "Local demo server" }
    ]
  },
  "bindings": {
    "listIssuesUi": {
      "graph": "listIssuesUi",
      "target": { "engine": "sqlite", "dialect": "sqlite" },
      "http": {
        "method": "GET",
        "path": "/v1/ui/issues",
        "tags": ["issues", "ui"],
        "summary": "Recent issues for the SPA (no predicate_optional params; UI-safe).",
        "parameters": [
          {
            "name": "limit",
            "in": "query",
            "bindTo": "limit",
            "required": false,
            "description": "Max rows (default 50)."
          }
        ]
      }
    },
    "listIssues": {
      "graph": "listIssues",
      "target": { "engine": "sqlite", "dialect": "sqlite" },
      "http": {
        "method": "GET",
        "path": "/v1/issues",
        "tags": ["issues"],
        "summary": "List recent issues, optionally filtered by status.",
        "parameters": [
          {
            "name": "status",
            "in": "query",
            "bindTo": "status",
            "required": false,
            "description": "Optional status filter (open | in_progress | done | closed)."
          },
          {
            "name": "limit",
            "in": "query",
            "bindTo": "limit",
            "required": false,
            "description": "Max rows to return (default 20)."
          }
        ]
      }
    },
    "searchIssues": {
      "graph": "searchIssues",
      "target": { "engine": "sqlite", "dialect": "sqlite" },
      "http": {
        "method": "GET",
        "path": "/v1/issues/search",
        "tags": ["issues"],
        "summary": "Search issues by title (LIKE), date range, and optional priority.",
        "parameters": [
          { "name": "q", "in": "query", "bindTo": "q", "required": true },
          {
            "name": "from",
            "in": "query",
            "bindTo": "from",
            "required": false,
            "description": "Range start (ISO-8601). Defaults to 1970-01-01T00:00:00.000Z when omitted."
          },
          {
            "name": "to",
            "in": "query",
            "bindTo": "to",
            "required": false,
            "description": "Range end (ISO-8601). Defaults to 9999-12-31T23:59:59.999Z when omitted."
          },
          { "name": "priority", "in": "query", "bindTo": "priority", "required": false },
          { "name": "limit", "in": "query", "bindTo": "limit", "required": false }
        ]
      }
    },
    "issueDetail": {
      "graph": "issueDetail",
      "target": { "engine": "sqlite", "dialect": "sqlite" },
      "http": {
        "method": "GET",
        "path": "/v1/issues/{id}",
        "tags": ["issues"],
        "summary": "Fetch an issue with project/reporter/assignee join.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "bindTo": "id",
            "required": true,
            "description": "Issue id."
          }
        ]
      }
    },
    "issuesByProject": {
      "graph": "issuesByProject",
      "target": { "engine": "sqlite", "dialect": "sqlite" },
      "http": {
        "method": "GET",
        "path": "/v1/stats/by-project",
        "tags": ["stats"],
        "summary": "Issue count + story points aggregated per project.",
        "parameters": []
      }
    },
    "sprintBurndown": {
      "graph": "sprintBurndown",
      "target": { "engine": "sqlite", "dialect": "sqlite" },
      "http": {
        "method": "GET",
        "path": "/v1/sprints/{sprintId}/burndown",
        "tags": ["sprints"],
        "summary": "Open work in a sprint, grouped by status.",
        "parameters": [
          {
            "name": "sprintId",
            "in": "path",
            "bindTo": "sprintId",
            "required": true,
            "description": "Sprint id."
          }
        ]
      }
    },
    "reportIssue": {
      "kind": "command",
      "graph": "reportIssue",
      "target": { "engine": "sqlite", "dialect": "sqlite" },
      "http": {
        "method": "POST",
        "path": "/v1/issues",
        "tags": ["issues"],
        "summary": "Report a new issue (creation transition).",
        "parameters": [
          { "name": "issueId",     "in": "body", "bindTo": "issueId",     "required": true },
          { "name": "title",       "in": "body", "bindTo": "title",       "required": true },
          { "name": "projectId",   "in": "body", "bindTo": "projectId",   "required": true },
          { "name": "reporterId",  "in": "body", "bindTo": "reporterId",  "required": true },
          { "name": "priority",    "in": "body", "bindTo": "priority",    "required": true },
          { "name": "storyPoints", "in": "body", "bindTo": "storyPoints", "required": true },
          { "name": "sprintId",    "in": "body", "bindTo": "sprintId",    "required": false }
        ]
      }
    },
    "submitIssue": {
      "kind": "command",
      "graph": "submitIssue",
      "target": { "engine": "sqlite", "dialect": "sqlite" },
      "http": {
        "method": "POST",
        "path": "/v1/issues/{issueId}/actions/submit",
        "tags": ["issues"],
        "summary": "Submit a draft issue (draft → open).",
        "parameters": [
          { "name": "issueId", "in": "path", "bindTo": "issueId", "required": true }
        ]
      }
    },
    "assignIssue": {
      "kind": "command",
      "graph": "assignIssue",
      "target": { "engine": "sqlite", "dialect": "sqlite" },
      "http": {
        "method": "POST",
        "path": "/v1/issues/{issueId}/actions/assign",
        "tags": ["issues"],
        "summary": "Assign an open issue (open → in_progress).",
        "parameters": [
          { "name": "issueId",    "in": "path", "bindTo": "issueId",    "required": true },
          { "name": "assigneeId", "in": "body", "bindTo": "assigneeId", "required": true }
        ]
      }
    },
    "assignIssueWithGuard": {
      "kind": "command",
      "graph": "assignIssueWithCapacityGuard",
      "target": { "engine": "sqlite", "dialect": "sqlite" },
      "http": {
        "method": "POST",
        "path": "/v1/issues/{issueId}/actions/assign-with-guard",
        "tags": ["issues"],
        "summary": "Assign with capacity guard (rejects if assignee has ≥3 in_progress issues).",
        "parameters": [
          { "name": "issueId",    "in": "path", "bindTo": "issueId",    "required": true },
          { "name": "assigneeId", "in": "body", "bindTo": "assigneeId", "required": true }
        ]
      }
    },
    "reassignIssue": {
      "kind": "command",
      "graph": "reassignIssue",
      "target": { "engine": "sqlite", "dialect": "sqlite" },
      "http": {
        "method": "POST",
        "path": "/v1/issues/{issueId}/actions/reassign",
        "tags": ["issues"],
        "summary": "Reassign an in-progress issue (self-loop on in_progress).",
        "parameters": [
          { "name": "issueId",    "in": "path", "bindTo": "issueId",    "required": true },
          { "name": "assigneeId", "in": "body", "bindTo": "assigneeId", "required": true }
        ]
      }
    },
    "resolveIssue": {
      "kind": "command",
      "graph": "resolveIssue",
      "target": { "engine": "sqlite", "dialect": "sqlite" },
      "http": {
        "method": "POST",
        "path": "/v1/issues/{issueId}/actions/resolve",
        "tags": ["issues"],
        "summary": "Resolve an in-progress issue (in_progress → resolved).",
        "parameters": [
          { "name": "issueId",    "in": "path", "bindTo": "issueId",    "required": true },
          { "name": "resolvedAt", "in": "body", "bindTo": "resolvedAt", "required": true }
        ]
      }
    },
    "reopenIssue": {
      "kind": "command",
      "graph": "reopenIssue",
      "target": { "engine": "sqlite", "dialect": "sqlite" },
      "http": {
        "method": "POST",
        "path": "/v1/issues/{issueId}/actions/reopen",
        "tags": ["issues"],
        "summary": "Reopen a resolved issue (resolved → open).",
        "parameters": [
          { "name": "issueId", "in": "path", "bindTo": "issueId", "required": true }
        ]
      }
    },
    "closeIssue": {
      "kind": "command",
      "graph": "closeIssue",
      "target": { "engine": "sqlite", "dialect": "sqlite" },
      "http": {
        "method": "POST",
        "path": "/v1/issues/{issueId}/actions/close",
        "tags": ["issues"],
        "summary": "Close a resolved issue (resolved → closed).",
        "parameters": [
          { "name": "issueId", "in": "path", "bindTo": "issueId", "required": true }
        ]
      }
    }
  }
}
```

Walkthrough: The `issues-new` screen in the UI artifact declares a `kind: "command"` action with `binding: "reportIssue"` and `paramsFromState` collecting six form fields; the `reportIssue` command binding above maps those same field names to `in: "body"` parameters with `bindTo` equal to the graph input name (`issueId`, `title`, etc.), using `POST /v1/issues`. The `issues-browse` screen's `DataBinding` with `binding: "listIssuesUi"` becomes the `listIssuesUi` query binding above — `GET /v1/ui/issues` with a single optional `limit` query param that maps to the graph's `limit` input via `bindTo: "limit"`. The runtime compiles both at startup; commands emit to the event store and return a `CommandResult` row, while queries run the compiled SQL and stream rows directly as a JSON array.

## Anti-patterns

- **Exposing PDM internals directly** — mapping aggregate field names to HTTP parameters without going through a graph input; the graph is the boundary, and its input signature (not the aggregate schema) determines what `bindTo` values are valid.
- **Commands without an action-path segment when they share the collection resource** — `POST /v1/issues` is fine for creation, but using `POST /v1/issues` for both creation and update causes `BINDINGS_DUPLICATE_METHOD_PATH`; use `/v1/issues/{id}/actions/update` for subsequent transitions.
- **Coupling query response shape to one specific projection table** — the `resolveShape` resolver should return a named `ResolvedShape` (e.g. `IssueRow`) that QSM declares; binding the response directly to raw table columns couples the HTTP surface to projection internals and breaks on schema migrations.
- **Query binding with no `response` schema declared in the graph** — if the graph output is not declared as `rowset<ShapeName>` or `row<ShapeName>`, the bindings consistency layer emits `BINDINGS_UNSUPPORTED_OUTPUT_TYPE`; every query must have a typed output.
- **Commands with non-idempotent paths used as if they were idempotent** — rntme command graphs are POST-only by design (transitions are not idempotent); do not add `PUT` or `PATCH` paths trying to simulate idempotency — instead model retries via a guard in the graph IR.
- **Reusing the same binding ID for two different graphs** — binding IDs are keys in the `bindings` map; duplicates are silently overwritten at the JSON level before Zod even runs, making one graph unreachable.
- **`in: "path"` parameters with `required: false`** — path placeholders are always structurally required (`BINDINGS_PATH_NOT_REQUIRED`); the structural layer enforces this regardless of what the schema specifies.

## Validation & self-review

Run `rntme project publish --dry-run` from the project blueprint root. Errors are returned as `BindingsError[]` objects with `layer`, `code`, `message`, and optional `path` and `hint`. Common codes:

- `BINDINGS_PARSE_SCHEMA_VIOLATION` — unknown key in the artifact, wrong `version` literal, or invalid enum value (method, in). The artifact schema is strict end-to-end.
- `BINDINGS_DUPLICATE_METHOD_PATH` — two bindings share the same `method + path` pair; rename one path or use different HTTP methods.
- `BINDINGS_PATH_PLACEHOLDER_MISMATCH` — the set of `{name}` placeholders in `path` does not exactly match the set of `in: "path"` parameter names; add or remove parameters to align.
- `BINDINGS_COMMAND_METHOD_NOT_POST` — a `kind: "command"` binding uses `GET`; commands must always be `POST`.
- `BINDINGS_COMMAND_QUERY_PARAM_FORBIDDEN` — a `kind: "command"` binding has an `in: "query"` parameter; move it to `in: "body"` or `in: "path"`.
- `BINDINGS_UNRESOLVED_GRAPH` — the `graph` ID in a binding entry has no matching graph in the compiled graph spec; check the Graph IR artifact.
- `BINDINGS_UNKNOWN_BIND_TO` — a `bindTo` value does not match any input declared in the graph's signature; check the Graph IR input names.
- `BINDINGS_UNRESOLVED_OUTPUT_SHAPE` — the graph's output shape name has no matching declaration in the QSM artifact.
- `BINDINGS_UNBOUND_INPUT` — a graph input with `mode: "required"` or `mode: "nullable"` has no matching parameter in the binding; add a parameter or change the graph's mode.
- `BINDINGS_COMMAND_ON_NON_COMMAND_GRAPH` — a `kind: "command"` binding references a graph whose role is not `"command"`; align the graph role in the Graph IR.
- `BINDINGS_QUERY_ON_COMMAND_GRAPH` — a `kind: "query"` (or default) binding references a graph whose role is `"command"`; either add `kind: "command"` to the binding or change the graph role.

## Next step

Invoke in parallel: Skill: designing-qsm AND Skill: designing-graph-ir.
