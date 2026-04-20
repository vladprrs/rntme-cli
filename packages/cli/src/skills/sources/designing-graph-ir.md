---
name: designing-graph-ir
description: Use after designing-bindings. Paired with designing-qsm. Authors artifacts/graph-ir.json — the dataflow graphs that compile query bindings to SQLite and execute command bindings against the event store.
---

## What you're building

`artifacts/graph-ir.json` is an authoring spec whose top-level fields are `version: "1.0-rc7"`, `pdmRef`, `qsmRef`, `shapes`, and `graphs`. Each graph is a typed DAG of nodes: a query graph describes a dataflow that lowers to a SQLite SELECT run against QSM projection tables; a command graph declares an `emit` node that reads state, validates a PDM transition, and appends events to the event store via `@rntme/event-store`. The compiler (`@rntme/graph-ir-compiler`) validates, normalises, and lowers every graph; one graph is compiled per call, so each binding entry in `bindings.json` corresponds to exactly one key in `graphs`.

## Choose the right graph role

The compiler's `inferRole()` determines dispatch by inspecting nodes and output type. A graph is a **query** when it has no `emit` node and its output is `rowset<Shape>` or `row<Shape>`. A graph is a **command** when it has at least one `emit` node and its output is `row<CommandResult>` (or `rowset<CommandResult>`). If you mix an `emit` node with a `rowset` output, `inferRole` returns `GRAPH_MIXED_ROLE` — these are structurally incompatible. You do not set the role explicitly; it is inferred. Non-emit nodes before an `emit` node form the read prelude: `compileCommand` lowers them as an independent SELECT, runs it, and rejects with `COMMAND_GUARD_REJECTED` if zero rows match.

## Checklist

1. From `bindings.json`, enumerate every query binding (`kind: "query"`) and every command binding (`kind: "command"`). Each entry's `graph` field must match a key in `graphs`.
2. For each **query binding**: decide the output shape (`rowset<ShapeName>` for lists/aggregations, `row<ShapeName>` for lookups). Declare the shape under `shapes` if it is not already there. Pick the QSM projection(s) your nodes will read from and confirm the corresponding entity-mirror projection is declared in `qsm.json`.
3. Build the query graph's node chain: `findMany` (or `eventType`) → optional `filter` → optional `map`/`reduce` → optional `sort` → optional `limit`. Set `signature.output.from` to the last node's id; set `signature.output.type` to `rowset<ShapeName>` or `row<ShapeName>`. Every `filter.expr` must reference only fields exposed in the QSM projection (e.g. `issue.status`).
4. For each **command binding**: declare the graph's `signature.inputs` for every parameter the binding's `parameters` list carries (`required` for mandatory, `nullable` for optional FKs). Output must be `{ type: "row<CommandResult>", from: "<emitNodeId>" }`. Declare exactly one `emit` node referencing the correct PDM aggregate and transition; fill `payload` with `{ $param: ... }` expressions for each `affects` field.
5. If a query needs **dot-navigation** (e.g. `issue.project.key`): confirm the relation is declared in `qsm.json` under `relations` with `cardinality: "one"`. The compiler resolves dot-nav at lower-time into LEFT JOINs; many-cardinality NAV is rejected with `NAV_FAN_OUT_NOT_ALLOWED`.
6. For **nullable filters** (`predicate_optional` inputs): place all `predicate_optional` inputs **at the end** of the `signature.inputs` declaration order. The `wrapPredicateOptional` mechanism appends an `OR (? IS NULL)` clause; if a `predicate_optional` `$param` appears before other `$param` references in the same filter expression, positional `?` binding goes out of order (known `rntme_predicate_optional_bug` — fixed in `bcce017`, but the authoring rule remains: keep `predicate_optional` inputs last in signature to avoid reintroducing the misalignment). Place the `predicate_optional` filter in a **separate** `filter` node after any non-optional filters.
7. Write `artifacts/graph-ir.json`. Run `rntme validate`. Fix all `GRAPH_IR_*` / `GIC_` / `SEM_` / `STRUCT_` / `CMD_` codes.
8. Cross-check: for every shape declared under `shapes`, confirm each `map.into` or `reduce.into` references it, and that every shape field is produced exactly once (`STRUCT_MAP_SHAPE_COVERAGE` / `STRUCT_REDUCE_SHAPE_COVERAGE` enforce coverage).

## Red flags

| Symptom | Problem |
|---|---|
| `predicate_optional` input declared before `required`/`defaulted` inputs in the same filter expression | Known `wrapPredicateOptional` SQL `?` positional misalignment — `lowerExpr` appends `?` in visit order; placing a `predicate_optional` `$param` before fixed params shifts all subsequent ordinals off-by-N. Keep `predicate_optional` inputs at the end of the signature and in a dedicated `filter` node. |
| Dot-navigation across service boundaries (e.g. `issue.userFromOtherService.email`) | Cross-service joins are forbidden — they couple services at the read layer. Cross-service reads must go through Zeebe orchestration (`rntme_orchestration_only`). Only navigate relations declared in the current service's `qsm.json`. |
| Writing a raw SQL string instead of using node vocabulary (`findMany` + `filter` + `map`) | The compiler only accepts declared node types (`findMany`, `filter`, `map`, `reduce`, `sort`, `limit`, `emit`). Hand-written SQL is not a graph node and will be rejected at parse time (`PARSE_SCHEMA_VIOLATION`). |
| Referencing a QSM column that does not exist in the projection's `exposed` list | Produces `SEM_FIELD_NOT_FOUND` at semantic validation; the field path must be resolvable through the entity's fields after the QSM `exposed` filter. |
| `emit` node referencing a PDM aggregate or transition that does not exist | Produces `CMD_UNKNOWN_AGGREGATE` or `CMD_UNKNOWN_TRANSITION`; the aggregate name and transition name must match PDM exactly (case-sensitive). |
| Graph output `type` does not match what the binding's response shape expects | Produces `BINDINGS_UNRESOLVED_OUTPUT_SHAPE` or `BINDINGS_QUERY_ON_COMMAND_GRAPH`; align `signature.output.type` with the shape name declared in `shapes` and with the binding's expected response. |

## Schema reference

```ts pkg=@rntme/graph-ir-compiler export=AuthoringSpecSchema
import { z } from 'zod';

const primitiveType = z.enum(['integer', 'long', 'decimal', 'string', 'boolean', 'date', 'datetime']);

const inputType = z.union([
  primitiveType,
  z.object({ list: primitiveType }).strict(),
  z.object({ row: z.string() }).strict(),
  z.object({ rowset: z.string() }).strict(),
]);

const inputMode = z.enum(['root', 'required', 'nullable', 'defaulted', 'predicate_optional']);

const inputDecl = z.object({
  type: inputType,
  mode: inputMode,
  default: z.unknown().optional(),
});

const fieldDecl = z.object({ type: primitiveType, nullable: z.boolean() });
const namedShape = z.object({ fields: z.record(z.string(), fieldDecl) }).strict();

const expr: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.object({ $literal: z.string() }).strict(),
    z.object({ $param: z.string() }).strict(),
    z.object({ $list: z.array(expr) }).strict(),
    z.object({ between: z.tuple([expr, expr, expr]) }).strict(),
    z
      .object({
        case: z
          .object({
            when: z.array(z.tuple([expr, expr])),
            else: expr,
          })
          .strict(),
      })
      .strict(),
    z
      .object({ exists: z.object({ relation: z.string(), where: expr.optional() }).strict() })
      .strict(),
    z.record(z.string(), z.array(expr)),
  ]),
);

const fieldExpr = z.union([
  expr,
  z
    .object({
      lookup: z
        .object({
          entity: z.string(),
          path: z.string().optional(),
          match: z.record(z.string(), z.string()),
          field: z.string(),
          optional: z.boolean().optional(),
        })
        .strict(),
    })
    .strict(),
]);

const findManyNode = z
  .object({
    id: z.string(),
    type: z.literal('findMany'),
    config: z
      .object({
        source: z.union([
          z.object({ entity: z.string().min(1) }).strict(),
          z.object({ projection: z.string().min(1) }).strict(),
          z.object({ eventType: z.string().min(1) }).strict(),
        ]),
      })
      .strict(),
  })
  .strict();

const filterNode = z
  .object({
    id: z.string(),
    type: z.literal('filter'),
    config: z
      .object({
        input: z.string(),
        expr: expr.optional(),
        predicate: z.string().optional(),
      })
      .strict(),
  })
  .strict();

const mapNode = z
  .object({
    id: z.string(),
    type: z.literal('map'),
    config: z
      .object({
        input: z.string(),
        into: z.string(),
        fields: z.record(z.string(), fieldExpr),
      })
      .strict(),
  })
  .strict();

const measureSpec = z
  .object({
    fn: z.enum(['count', 'count_distinct', 'sum', 'avg', 'min', 'max', 'group_array']),
    expr: expr.optional(),
  })
  .strict();

const reduceNode = z
  .object({
    id: z.string(),
    type: z.literal('reduce'),
    config: z
      .object({
        input: z.string(),
        into: z.string(),
        group: z.record(z.string(), z.string()),
        measures: z.record(z.string(), measureSpec),
      })
      .strict(),
  })
  .strict();

const sortKey = z
  .object({
    field: z.string(),
    dir: z.enum(['asc', 'desc']).optional(),
    nulls: z.enum(['first', 'last']).optional(),
  })
  .strict();

const sortNode = z
  .object({
    id: z.string(),
    type: z.literal('sort'),
    config: z.object({ input: z.string(), by: z.array(sortKey).min(1) }).strict(),
  })
  .strict();

const limitCount = z.union([z.number().int().nonnegative(), z.object({ $param: z.string() }).strict()]);

const limitNode = z
  .object({
    id: z.string(),
    type: z.literal('limit'),
    config: z.object({ input: z.string(), count: limitCount }).strict(),
  })
  .strict();

const distinctNode = z
  .object({
    id: z.string(),
    type: z.literal('distinct'),
    config: z.object({ input: z.string() }).strict(),
  })
  .strict();

const lookupOneNode = z
  .object({
    id: z.string(),
    type: z.literal('lookupOne'),
    config: z
      .object({
        input: z.string(),
        entity: z.string(),
        as: z.string(),
        match: z.record(z.string(), z.string()),
        optional: z.boolean().optional(),
        path: z.string().optional(),
      })
      .strict(),
  })
  .strict();

const emitNode = z
  .object({
    id: z.string(),
    type: z.literal('emit'),
    config: z
      .object({
        aggregate: z.string(),
        aggregateId: expr,
        transition: z.string(),
        payload: z.record(z.string(), expr),
        actor: expr.optional(),
      })
      .strict(),
  })
  .strict();

const graphNode = z.discriminatedUnion('type', [
  findManyNode,
  filterNode,
  mapNode,
  reduceNode,
  sortNode,
  limitNode,
  distinctNode,
  lookupOneNode,
  emitNode,
]);

const graphDecl = z
  .object({
    id: z.string(),
    signature: z
      .object({
        inputs: z.record(z.string(), inputDecl),
        output: z.object({ type: z.string(), from: z.string() }).strict(),
      })
      .strict(),
    nodes: z.array(graphNode),
  })
  .strict();

export const AuthoringSpecSchema = z
  .object({
    version: z.literal('1.0-rc7'),
    pdmRef: z.string(),
    qsmRef: z.string(),
    shapes: z.record(z.string(), namedShape),
    graphs: z.record(z.string(), graphDecl),
  })
  .strict();

export type AuthoringSpecInput = z.input<typeof AuthoringSpecSchema>;
export type AuthoringSpecOutput = z.output<typeof AuthoringSpecSchema>;
```

## Worked example

```json artifact=graph-ir
{
  "version": "1.0-rc7",
  "pdmRef": "issue-tracker.domain.v1",
  "qsmRef": "issue-tracker.read.v1",
  "graphs": {
    "assignIssue": {
      "id": "assignIssue",
      "signature": {
        "inputs": {
          "issueId": {
            "type": "integer",
            "mode": "required"
          },
          "assigneeId": {
            "type": "integer",
            "mode": "required"
          }
        },
        "output": {
          "type": "row<CommandResult>",
          "from": "emit"
        }
      },
      "nodes": [
        {
          "id": "emit",
          "type": "emit",
          "config": {
            "aggregate": "Issue",
            "aggregateId": {
              "$param": "issueId"
            },
            "transition": "assign",
            "payload": {
              "assigneeId": {
                "$param": "assigneeId"
              }
            }
          }
        }
      ]
    },
    "assignIssueWithCapacityGuard": {
      "id": "assignIssueWithCapacityGuard",
      "signature": {
        "inputs": {
          "issueId": {
            "type": "integer",
            "mode": "required"
          },
          "assigneeId": {
            "type": "integer",
            "mode": "required"
          }
        },
        "output": {
          "type": "row<CommandResult>",
          "from": "emit"
        }
      },
      "nodes": [
        {
          "id": "currentLoad",
          "type": "findMany",
          "config": {
            "source": {
              "entity": "Issue"
            }
          }
        },
        {
          "id": "filteredLoad",
          "type": "filter",
          "config": {
            "input": "currentLoad",
            "expr": {
              "and": [
                {
                  "eq": [
                    "issue.assigneeId",
                    {
                      "$param": "assigneeId"
                    }
                  ]
                },
                {
                  "eq": [
                    "issue.status",
                    {
                      "$literal": "in_progress"
                    }
                  ]
                }
              ]
            }
          }
        },
        {
          "id": "loadCount",
          "type": "reduce",
          "config": {
            "input": "filteredLoad",
            "into": "LoadCount",
            "group": {},
            "measures": {
              "count": {
                "fn": "count"
              }
            }
          }
        },
        {
          "id": "guardCapacity",
          "type": "filter",
          "config": {
            "input": "loadCount",
            "expr": {
              "lt": [
                "count",
                3
              ]
            }
          }
        },
        {
          "id": "emit",
          "type": "emit",
          "config": {
            "aggregate": "Issue",
            "aggregateId": {
              "$param": "issueId"
            },
            "transition": "assign",
            "payload": {
              "assigneeId": {
                "$param": "assigneeId"
              }
            }
          }
        }
      ]
    },
    "closeIssue": {
      "id": "closeIssue",
      "signature": {
        "inputs": {
          "issueId": {
            "type": "integer",
            "mode": "required"
          }
        },
        "output": {
          "type": "row<CommandResult>",
          "from": "emit"
        }
      },
      "nodes": [
        {
          "id": "emit",
          "type": "emit",
          "config": {
            "aggregate": "Issue",
            "aggregateId": {
              "$param": "issueId"
            },
            "transition": "close",
            "payload": {}
          }
        }
      ]
    },
    "issueDetail": {
      "id": "issueDetail",
      "signature": {
        "inputs": {
          "id": {
            "type": "integer",
            "mode": "required"
          }
        },
        "output": {
          "type": "rowset<IssueDetail>",
          "from": "proj"
        }
      },
      "nodes": [
        {
          "id": "items",
          "type": "findMany",
          "config": {
            "source": {
              "entity": "Issue"
            }
          }
        },
        {
          "id": "filtered",
          "type": "filter",
          "config": {
            "input": "items",
            "expr": {
              "eq": [
                "issue.id",
                {
                  "$param": "id"
                }
              ]
            }
          }
        },
        {
          "id": "proj",
          "type": "map",
          "config": {
            "input": "filtered",
            "into": "IssueDetail",
            "fields": {
              "id": "issue.id",
              "title": "issue.title",
              "status": "issue.status",
              "priority": "issue.priority",
              "storyPoints": "issue.storyPoints",
              "createdAt": "issue.createdAt",
              "resolvedAt": "issue.resolvedAt",
              "projectKey": "issue.project.key",
              "projectName": "issue.project.name",
              "reporterUsername": "issue.reporter.username",
              "assigneeUsername": "issue.assignee.username"
            }
          }
        }
      ]
    },
    "issuesByProject": {
      "id": "issuesByProject",
      "signature": {
        "inputs": {},
        "output": {
          "type": "rowset<ProjectStats>",
          "from": "grouped"
        }
      },
      "nodes": [
        {
          "id": "items",
          "type": "findMany",
          "config": {
            "source": {
              "entity": "Issue"
            }
          }
        },
        {
          "id": "grouped",
          "type": "reduce",
          "config": {
            "input": "items",
            "into": "ProjectStats",
            "group": {
              "projectKey": "issue.project.key"
            },
            "measures": {
              "issueCount": {
                "fn": "count"
              },
              "totalStoryPoints": {
                "fn": "sum",
                "expr": "issue.storyPoints"
              },
              "avgStoryPoints": {
                "fn": "avg",
                "expr": "issue.storyPoints"
              }
            }
          }
        }
      ]
    },
    "listIssues": {
      "id": "listIssues",
      "signature": {
        "inputs": {
          "status": {
            "type": "string",
            "mode": "predicate_optional"
          },
          "limit": {
            "type": "integer",
            "mode": "defaulted",
            "default": 20
          }
        },
        "output": {
          "type": "rowset<IssueListItem>",
          "from": "enriched"
        }
      },
      "nodes": [
        {
          "id": "items",
          "type": "findMany",
          "config": {
            "source": {
              "entity": "Issue"
            }
          }
        },
        {
          "id": "filtered",
          "type": "filter",
          "config": {
            "input": "items",
            "expr": {
              "eq": [
                "issue.status",
                {
                  "$param": "status"
                }
              ]
            }
          }
        },
        {
          "id": "sorted",
          "type": "sort",
          "config": {
            "input": "filtered",
            "by": [
              {
                "field": "issue.createdAt",
                "dir": "desc",
                "nulls": "last"
              }
            ]
          }
        },
        {
          "id": "paged",
          "type": "limit",
          "config": {
            "input": "sorted",
            "count": {
              "$param": "limit"
            }
          }
        },
        {
          "id": "enriched",
          "type": "map",
          "config": {
            "input": "paged",
            "into": "IssueListItem",
            "fields": {
              "id": "issue.id",
              "title": "issue.title",
              "status": "issue.status",
              "priority": "issue.priority",
              "storyPoints": "issue.storyPoints",
              "createdAt": "issue.createdAt",
              "resolvedAt": "issue.resolvedAt",
              "projectKey": "issue.project.key",
              "projectName": "issue.project.name",
              "reporterUsername": "issue.reporter.username",
              "assigneeUsername": "issue.assignee.username",
              "sprintName": "issue.sprint.name"
            }
          }
        }
      ]
    },
    "listIssuesUi": {
      "id": "listIssuesUi",
      "signature": {
        "inputs": {
          "limit": {
            "type": "integer",
            "mode": "defaulted",
            "default": 50
          }
        },
        "output": {
          "type": "rowset<IssueListItem>",
          "from": "enriched"
        }
      },
      "nodes": [
        {
          "id": "items",
          "type": "findMany",
          "config": {
            "source": {
              "entity": "Issue"
            }
          }
        },
        {
          "id": "sorted",
          "type": "sort",
          "config": {
            "input": "items",
            "by": [
              {
                "field": "issue.createdAt",
                "dir": "desc",
                "nulls": "last"
              }
            ]
          }
        },
        {
          "id": "paged",
          "type": "limit",
          "config": {
            "input": "sorted",
            "count": {
              "$param": "limit"
            }
          }
        },
        {
          "id": "enriched",
          "type": "map",
          "config": {
            "input": "paged",
            "into": "IssueListItem",
            "fields": {
              "id": "issue.id",
              "title": "issue.title",
              "status": "issue.status",
              "priority": "issue.priority",
              "storyPoints": "issue.storyPoints",
              "createdAt": "issue.createdAt",
              "resolvedAt": "issue.resolvedAt",
              "projectKey": "issue.project.key",
              "projectName": "issue.project.name",
              "reporterUsername": "issue.reporter.username",
              "assigneeUsername": "issue.assignee.username",
              "sprintName": "issue.sprint.name"
            }
          }
        }
      ]
    },
    "reassignIssue": {
      "id": "reassignIssue",
      "signature": {
        "inputs": {
          "issueId": {
            "type": "integer",
            "mode": "required"
          },
          "assigneeId": {
            "type": "integer",
            "mode": "required"
          }
        },
        "output": {
          "type": "row<CommandResult>",
          "from": "emit"
        }
      },
      "nodes": [
        {
          "id": "emit",
          "type": "emit",
          "config": {
            "aggregate": "Issue",
            "aggregateId": {
              "$param": "issueId"
            },
            "transition": "reassign",
            "payload": {
              "assigneeId": {
                "$param": "assigneeId"
              }
            }
          }
        }
      ]
    },
    "reopenIssue": {
      "id": "reopenIssue",
      "signature": {
        "inputs": {
          "issueId": {
            "type": "integer",
            "mode": "required"
          }
        },
        "output": {
          "type": "row<CommandResult>",
          "from": "emit"
        }
      },
      "nodes": [
        {
          "id": "emit",
          "type": "emit",
          "config": {
            "aggregate": "Issue",
            "aggregateId": {
              "$param": "issueId"
            },
            "transition": "reopen",
            "payload": {}
          }
        }
      ]
    },
    "reportIssue": {
      "id": "reportIssue",
      "signature": {
        "inputs": {
          "issueId": {
            "type": "integer",
            "mode": "required"
          },
          "title": {
            "type": "string",
            "mode": "required"
          },
          "projectId": {
            "type": "integer",
            "mode": "required"
          },
          "reporterId": {
            "type": "integer",
            "mode": "required"
          },
          "priority": {
            "type": "string",
            "mode": "required"
          },
          "storyPoints": {
            "type": "integer",
            "mode": "required"
          },
          "sprintId": {
            "type": "integer",
            "mode": "nullable"
          }
        },
        "output": {
          "type": "row<CommandResult>",
          "from": "emit"
        }
      },
      "nodes": [
        {
          "id": "emit",
          "type": "emit",
          "config": {
            "aggregate": "Issue",
            "aggregateId": {
              "$param": "issueId"
            },
            "transition": "report",
            "payload": {
              "title": {
                "$param": "title"
              },
              "projectId": {
                "$param": "projectId"
              },
              "reporterId": {
                "$param": "reporterId"
              },
              "priority": {
                "$param": "priority"
              },
              "storyPoints": {
                "$param": "storyPoints"
              },
              "sprintId": {
                "$param": "sprintId"
              }
            }
          }
        }
      ]
    },
    "reportedIssueCountByProject": {
      "id": "reportedIssueCountByProject",
      "signature": {
        "inputs": {},
        "output": {
          "type": "rowset<ReportedCountRow>",
          "from": "r"
        }
      },
      "nodes": [
        {
          "id": "src",
          "type": "findMany",
          "config": {
            "source": {
              "eventType": "IssueReport"
            }
          }
        },
        {
          "id": "r",
          "type": "reduce",
          "config": {
            "input": "src",
            "into": "ReportedCountRow",
            "group": {
              "projectId": "issueReport.projectId"
            },
            "measures": {
              "count": {
                "fn": "count"
              }
            }
          }
        }
      ]
    },
    "resolveIssue": {
      "id": "resolveIssue",
      "signature": {
        "inputs": {
          "issueId": {
            "type": "integer",
            "mode": "required"
          },
          "resolvedAt": {
            "type": "datetime",
            "mode": "required"
          }
        },
        "output": {
          "type": "row<CommandResult>",
          "from": "emit"
        }
      },
      "nodes": [
        {
          "id": "emit",
          "type": "emit",
          "config": {
            "aggregate": "Issue",
            "aggregateId": {
              "$param": "issueId"
            },
            "transition": "resolve",
            "payload": {
              "resolvedAt": {
                "$param": "resolvedAt"
              }
            }
          }
        }
      ]
    },
    "searchIssues": {
      "id": "searchIssues",
      "signature": {
        "inputs": {
          "q": {
            "type": "string",
            "mode": "required"
          },
          "from": {
            "type": "datetime",
            "mode": "defaulted",
            "default": "1970-01-01T00:00:00.000Z"
          },
          "to": {
            "type": "datetime",
            "mode": "defaulted",
            "default": "9999-12-31T23:59:59.999Z"
          },
          "priority": {
            "type": "string",
            "mode": "predicate_optional"
          },
          "limit": {
            "type": "integer",
            "mode": "defaulted",
            "default": 20
          }
        },
        "output": {
          "type": "rowset<IssueListItem>",
          "from": "enriched"
        }
      },
      "nodes": [
        {
          "id": "items",
          "type": "findMany",
          "config": {
            "source": {
              "entity": "Issue"
            }
          }
        },
        {
          "id": "baseFiltered",
          "type": "filter",
          "config": {
            "input": "items",
            "expr": {
              "and": [
                {
                  "like": [
                    "issue.title",
                    {
                      "$param": "q"
                    }
                  ]
                },
                {
                  "between": [
                    "issue.createdAt",
                    {
                      "$param": "from"
                    },
                    {
                      "$param": "to"
                    }
                  ]
                }
              ]
            }
          }
        },
        {
          "id": "priorityFiltered",
          "type": "filter",
          "config": {
            "input": "baseFiltered",
            "expr": {
              "eq": [
                "issue.priority",
                {
                  "$param": "priority"
                }
              ]
            }
          }
        },
        {
          "id": "sorted",
          "type": "sort",
          "config": {
            "input": "priorityFiltered",
            "by": [
              {
                "field": "issue.createdAt",
                "dir": "desc",
                "nulls": "last"
              }
            ]
          }
        },
        {
          "id": "paged",
          "type": "limit",
          "config": {
            "input": "sorted",
            "count": {
              "$param": "limit"
            }
          }
        },
        {
          "id": "enriched",
          "type": "map",
          "config": {
            "input": "paged",
            "into": "IssueListItem",
            "fields": {
              "id": "issue.id",
              "title": "issue.title",
              "status": "issue.status",
              "priority": "issue.priority",
              "storyPoints": "issue.storyPoints",
              "createdAt": "issue.createdAt",
              "resolvedAt": "issue.resolvedAt",
              "projectKey": "issue.project.key",
              "projectName": "issue.project.name",
              "reporterUsername": "issue.reporter.username",
              "assigneeUsername": "issue.assignee.username",
              "sprintName": "issue.sprint.name"
            }
          }
        }
      ]
    },
    "sprintBurndown": {
      "id": "sprintBurndown",
      "signature": {
        "inputs": {
          "sprintId": {
            "type": "integer",
            "mode": "required"
          }
        },
        "output": {
          "type": "rowset<BurndownBucket>",
          "from": "grouped"
        }
      },
      "nodes": [
        {
          "id": "items",
          "type": "findMany",
          "config": {
            "source": {
              "entity": "Issue"
            }
          }
        },
        {
          "id": "filtered",
          "type": "filter",
          "config": {
            "input": "items",
            "expr": {
              "eq": [
                "issue.sprintId",
                {
                  "$param": "sprintId"
                }
              ]
            }
          }
        },
        {
          "id": "grouped",
          "type": "reduce",
          "config": {
            "input": "filtered",
            "into": "BurndownBucket",
            "group": {
              "status": "issue.status"
            },
            "measures": {
              "issueCount": {
                "fn": "count"
              },
              "totalStoryPoints": {
                "fn": "sum",
                "expr": "issue.storyPoints"
              }
            }
          }
        }
      ]
    },
    "submitIssue": {
      "id": "submitIssue",
      "signature": {
        "inputs": {
          "issueId": {
            "type": "integer",
            "mode": "required"
          }
        },
        "output": {
          "type": "row<CommandResult>",
          "from": "emit"
        }
      },
      "nodes": [
        {
          "id": "emit",
          "type": "emit",
          "config": {
            "aggregate": "Issue",
            "aggregateId": {
              "$param": "issueId"
            },
            "transition": "submit",
            "payload": {}
          }
        }
      ]
    }
  },
  "shapes": {
    "IssueDetail": {
      "fields": {
        "id": {
          "type": "integer",
          "nullable": false
        },
        "title": {
          "type": "string",
          "nullable": false
        },
        "status": {
          "type": "string",
          "nullable": false
        },
        "priority": {
          "type": "string",
          "nullable": false
        },
        "storyPoints": {
          "type": "integer",
          "nullable": false
        },
        "createdAt": {
          "type": "datetime",
          "nullable": false
        },
        "resolvedAt": {
          "type": "datetime",
          "nullable": true
        },
        "projectKey": {
          "type": "string",
          "nullable": true
        },
        "projectName": {
          "type": "string",
          "nullable": true
        },
        "reporterUsername": {
          "type": "string",
          "nullable": true
        },
        "assigneeUsername": {
          "type": "string",
          "nullable": true
        }
      }
    },
    "IssueListItem": {
      "fields": {
        "id": {
          "type": "integer",
          "nullable": false
        },
        "title": {
          "type": "string",
          "nullable": false
        },
        "status": {
          "type": "string",
          "nullable": false
        },
        "priority": {
          "type": "string",
          "nullable": false
        },
        "storyPoints": {
          "type": "integer",
          "nullable": false
        },
        "createdAt": {
          "type": "datetime",
          "nullable": false
        },
        "resolvedAt": {
          "type": "datetime",
          "nullable": true
        },
        "projectKey": {
          "type": "string",
          "nullable": true
        },
        "projectName": {
          "type": "string",
          "nullable": true
        },
        "reporterUsername": {
          "type": "string",
          "nullable": true
        },
        "assigneeUsername": {
          "type": "string",
          "nullable": true
        },
        "sprintName": {
          "type": "string",
          "nullable": true
        }
      }
    },
    "ProjectStats": {
      "fields": {
        "projectKey": {
          "type": "string",
          "nullable": false
        },
        "issueCount": {
          "type": "integer",
          "nullable": false
        },
        "totalStoryPoints": {
          "type": "integer",
          "nullable": false
        },
        "avgStoryPoints": {
          "type": "decimal",
          "nullable": false
        }
      }
    },
    "BurndownBucket": {
      "fields": {
        "status": {
          "type": "string",
          "nullable": false
        },
        "issueCount": {
          "type": "integer",
          "nullable": false
        },
        "totalStoryPoints": {
          "type": "integer",
          "nullable": false
        }
      }
    },
    "LoadCount": {
      "fields": {
        "count": {
          "type": "integer",
          "nullable": false
        }
      }
    },
    "ReportedCountRow": {
      "fields": {
        "projectId": {
          "type": "integer",
          "nullable": false
        },
        "count": {
          "type": "integer",
          "nullable": false
        }
      }
    }
  }
}
```

Walkthrough: The `listIssues` graph shows a typical query pipeline — `signature.inputs` declares `status` as `predicate_optional` (placed last, after no other fixed params in the same filter, to respect `?` positional ordering) and `limit` as `defaulted`; the node chain `findMany → filter → sort → limit → map` lowers to a single `SELECT … WHERE … ORDER BY … LIMIT ?` against the `projection_issue` table. The `filter` node's `expr.eq["issue.status", {$param:"status"}]` becomes `OR (? IS NULL)` in SQL via `wrapPredicateOptional` so omitting `status` returns all rows. The `reportIssue` command graph shows the command path: `signature.output.type` is `row<CommandResult>` and `from` points at the sole `emit` node; at runtime `executeCommand` replays the `Issue` aggregate stream, checks that `Issue` is in the `null` state (creation), derives the `IssueReport` event payload from `$param` expressions, and appends it with optimistic concurrency.

## Anti-patterns

- **`signature.output.type` does not match the node the binding expects** — if `output.type` is `rowset<IssueListItem>` but the binding declares a single-row response, the shape mismatch surfaces at the bindings consistency layer; align output type to the binding's response contract.
- **`emit` node with an event type not derived from the PDM** — the derived event type name is `PascalCase(aggregate) + PascalCase(transition)` (e.g. `Issue` + `report` → `IssueReport`); if that pair does not exist in PDM, `CMD_UNKNOWN_AGGREGATE` or `CMD_UNKNOWN_TRANSITION` fires at compile time. Do not invent event type names — they are derived from PDM transitions.
- **Runtime-only fields leaking into graph signatures** — `id`, `createdAt`, `updatedAt`, `actor` are generated fields managed by the event store; they must not appear in `emit` payload expressions. Putting them there will either produce `CMD_PAYLOAD_EXTRANEOUS_FIELD` (if PDM marks them generated) or silently overwrite store-managed values.
- **Hand-written SQL instead of the node vocabulary** — the compiler only accepts the declared node types; any attempt to embed raw SQL in a `filter.expr` or elsewhere will be rejected at parse time. Use `filter`, `reduce`, `sort`, and expression operators (`eq`, `like`, `between`, `and`, etc.) to compose queries.
- **`predicate_optional` input mixed with fixed-param expressions in the same filter node** — the `wrapPredicateOptional` fix (`bcce017`) aligns `?` positions correctly when the `predicate_optional` param is isolated in its own `filter` node; mixing it with other `$param` references in the same `expr` risks reintroducing positional misalignment. Always give each `predicate_optional` param its own dedicated `filter` node, placed after all non-optional filters.
- **Dot-navigation to a relation with `cardinality: "many"`** — `NAV_FAN_OUT_NOT_ALLOWED`; only `one`-cardinality relations are navigable by the compiler. Many-cardinality relations are declared in QSM for forward compatibility but cannot be lowered to JOINs.

## Validation & self-review

Run `rntme validate` from the service root. Fix all errors before proceeding. Key code groups:

- `PARSE_INVALID_JSON` / `PARSE_SCHEMA_VIOLATION` — JSON or Zod shape error; check the offending `location.path`.
- `STRUCT_DAG_CYCLE` — a node references itself or forms a cycle; check `config.input` chains.
- `STRUCT_DUPLICATE_NODE_ID` — two nodes in the same graph share an `id`; rename one.
- `STRUCT_INVALID_OUTPUT_FROM` — `signature.output.from` references a node that does not exist or is unreachable.
- `STRUCT_MAP_SHAPE_COVERAGE` / `STRUCT_REDUCE_SHAPE_COVERAGE` — a shape field is missing or produced more than once in a `map` or `reduce` node; align `fields` / `measures` keys to the shape declaration.
- `STRUCT_UNKNOWN_SHAPE` — `map.into` or `reduce.into` names a shape not declared in `shapes`; add it or correct the typo.
- `TIER1_UNSUPPORTED_NODE` — the graph uses `distinct`, `lookupOne`, or another Tier 2 node; only `findMany`, `filter`, `map`, `reduce`, `sort`, `limit`, `emit` are supported in MVP.
- `SEM_SOURCE_NOT_FOUND` / `SEM_FIELD_NOT_FOUND` — the entity or field path is not resolvable through QSM projections + PDM fields; verify the entity name in `findMany.source.entity` and field paths in `filter.expr` / `map.fields`.
- `SEM_PARAM_CONTEXT` — a `predicate_optional` param appeared outside a `filter`; move it to a dedicated `filter` node.
- `NAV_PROJECTION_REQUIRED` — dot-navigation requires an `entity-mirror` projection for the scan entity in QSM; add the projection or use the projection name directly.
- `NAV_NOT_ALLOWED` — the relation key used in dot-navigation is not declared in `qsm.relations`; add the relation or correct the field path.
- `CMD_UNKNOWN_AGGREGATE` / `CMD_UNKNOWN_TRANSITION` — the `emit` node references a PDM aggregate or transition that does not exist; check spelling against `pdm.json`.
- `CMD_PAYLOAD_MISSING_FIELD` / `CMD_PAYLOAD_EXTRANEOUS_FIELD` / `CMD_PAYLOAD_TYPE_MISMATCH` — the `emit` payload does not match the PDM transition's `affects` field list or types; align the payload to the PDM transition exactly.
- `GRAPH_MIXED_ROLE` — the graph mixes `emit` nodes with a `rowset` output; split into separate query and command graphs.

## Next step

When BOTH this skill and designing-qsm are green, invoke Skill: composing-manifest.
