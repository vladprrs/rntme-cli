---
name: designing-ui
description: Use when authoring artifacts/ui.json (pages, components, forms, lists). Paired with designing-pdm; every UI action must map to a PDM command.
---

## What you're building

`artifacts/ui.json` is a `ResolvedSource` bundle — a `SourceManifest` plus inlined layouts, screens, and fragments assembled by `@rntme/ui`'s `resolve()` pipeline. The runtime (`@rntme/ui-runtime`) binds screen actions to PDM commands via compiled `binding` IDs resolved through `@rntme/bindings`, and populates screen data by issuing HTTP queries declared in `ScreenDescriptor.data`. Every route in the manifest corresponds to one layout + one screen pair; forms collect input into `/form/*` state paths and dispatch named actions that the runtime executes as HTTP POST calls against the bindings layer.

## Checklist

1. Read `brief.md` (produced by `brainstorming-rntme-service`) to enumerate the pages and use-cases the service must support.
2. For each use-case, identify the page it lives on and the primary component type: list (repeating card/row), detail (single record view), or form (mutation entry).
3. For each list or detail page, declare a `DataBinding` in `screen.data` mapping a `/data/<name>` state path to a bindings query ID (e.g. `"binding": "listIssues"`).
4. For each form page, map every input field to the corresponding PDM aggregate field; bind inputs to `/form/<fieldName>` state paths; declare a `command` action whose `paramsFromState` collects those paths.
5. Cross-check with `designing-pdm`: every `kind: "command"` action `binding` must correspond to a PDM aggregate transition, and every form field listed in `paramsFromState` must exist on the PDM aggregate.
6. Declare `manifest.routes` — every page needs a route pattern (e.g. `"/issues"`, `"/issues/:id"`). The `layout` key must match a key in `manifest.layouts`; the `screen` key must be a base path under `screens/`.
7. Write `artifacts/ui.json` in `ResolvedSource` form (see type reference and worked example below).
8. Run `rntme validate`. Fix any `UI_*` codes before advancing.
9. Sync-point with `designing-pdm`: if any command `binding` ID changed, update `paramsFromState` keys to match the PDM `affects` field names.

## Red flags

| Symptom | Problem |
|---|---|
| A `kind: "command"` action whose `binding` has no corresponding PDM transition | UI mutates state that the domain doesn't know about — the POST will 404 or fail validation |
| Form fields in `paramsFromState` that don't exist in the PDM aggregate `fields` map | Orphan params the event-store will reject; creates silent data loss |
| Hard-coded record IDs in `on.press` navigate params instead of `{ "$state": "/route/params/id" }` | Navigation breaks for any record other than the hard-coded one |
| A route pattern in `manifest.routes` whose `layout` key is not in `manifest.layouts` | `UI_REFERENCES_UNKNOWN_LAYOUT` at compile time; screen will never render |
| A `DataBinding.binding` ID that isn't declared in `artifacts/bindings.json` | `UI_REFERENCES_UNKNOWN_BINDING_QUERY` at compile; data fetch will 404 at runtime |
| State paths in `$state` refs that don't start with `/form/`, `/route/params/`, `/data/`, or `/actions/` | `UNCOVERED_STATE_PATH` — the compiler cannot verify these are populated |

## Type reference (non-schema)

The UI artifact is a `ResolvedSource` — a bundle of `SourceManifest` + inlined layouts/screens/fragments. No Zod; types live in `@rntme/ui/src/types/source.ts`:

```ts
/** manifest.json — root of a UI application */
export type SourceManifest = {
  version: '2.0';
  pdmRef: string;
  qsmRef: string;
  graphSpecRef: string;
  bindingsRef: string;
  metadata: {
    title: string;
    description?: string;
  };
  layouts: Record<string, string>;       // layout name → base path (e.g. "layouts/main")
  routes: Record<string, RouteEntry>;    // route pattern → screen config
};

export type RouteEntry = {
  layout: string;                        // layout name (key in manifest.layouts)
  screen: string;                        // base path (e.g. "screens/issues-home")
};

/** *.screen.json — data fetching, actions, metadata for a screen or layout */
export type ScreenDescriptor = {
  metadata?: { title?: string };
  data?: Record<string, DataBinding>;    // state path → data source
  actions?: Record<string, ActionDef>;
};

export type DataBinding = {
  binding: string;                       // binding ID from bindings artifact
  params?: Record<string, ParamValue>;
  refetchOn?: Array<'mount' | 'params'>;
};

export type ParamValue = string | number | boolean | StateRef;
export type StateRef = { $state: string };

export type ActionDef = NavigationAction | CommandAction | RefetchAction;

export type NavigationAction = {
  kind: 'navigation';
  navigateTo: string;
  paramsFromState?: Record<string, string>;
};

export type CommandAction = {
  kind: 'command';
  binding: string;
  paramsFromState: Record<string, string>;
  onSuccess?: { navigateTo?: string; refetchData?: string[]; clearFormState?: string[] };
  onError?: { showAlert?: boolean };
};

export type RefetchAction = {
  kind: 'refetch';
  targets: string[];
};

/**
 * A json-render Spec. The `elements` map can include regular elements
 * or $ref elements (fragment references, resolved at compile time).
 */
export type SpecJson = {
  root: string;
  elements: Record<string, ElementJson | RefElement>;
};

export type ElementJson = {
  type: string;
  props: Record<string, unknown>;
  children?: string[];
  visible?: unknown;
  on?: Record<string, unknown>;
  watch?: Record<string, unknown>;
  repeat?: { statePath: string; key?: string };
};

export type RefElement = {
  $ref: string;                          // base path to fragment (e.g. "fragments/issue-card")
  bind: Record<string, unknown>;         // param name → value (literal, $state, etc.)
};

export function isRefElement(el: ElementJson | RefElement): el is RefElement {
  return '$ref' in el;
}

/**
 * Resolved source — after Phase 1 (Resolve), all files have been read
 * and assembled into this structure.
 */
export type ResolvedSource = {
  manifest: SourceManifest;
  baseDir: string;
  layouts: Record<string, { spec: SpecJson; screen: ScreenDescriptor }>;
  screens: Record<string, { spec: SpecJson; screen: ScreenDescriptor }>;
  fragments: Map<string, SpecJson>;      // base path → parsed fragment spec
};
```

## Worked example

Below is the canonical `artifacts/ui.json` from the bundled issue-tracker example.

```json artifact=ui
{
  "manifest": {
    "version": "2.0",
    "pdmRef": "issue-tracker.domain.v1",
    "qsmRef": "issue-tracker.read.v1",
    "graphSpecRef": "issue-tracker.graphs.v1",
    "bindingsRef": "issue-tracker.bindings.v1",
    "metadata": {
      "title": "Issue Tracker"
    },
    "layouts": {
      "main": "layouts/main"
    },
    "routes": {
      "/issues": {
        "layout": "main",
        "screen": "screens/issues-home"
      },
      "/issues/browse": {
        "layout": "main",
        "screen": "screens/issues-browse"
      },
      "/issues/new": {
        "layout": "main",
        "screen": "screens/issues-new"
      },
      "/issues/search": {
        "layout": "main",
        "screen": "screens/issues-search"
      },
      "/issues/:id": {
        "layout": "main",
        "screen": "screens/issue-detail"
      },
      "/sprints/:sprintId": {
        "layout": "main",
        "screen": "screens/sprint-burndown"
      }
    }
  },
  "baseDir": "./demo/issue-tracker-api/artifacts/ui",
  "layouts": {
    "main": {
      "spec": {
        "root": "shell",
        "elements": {
          "shell": {
            "type": "Stack",
            "props": {
              "direction": "vertical",
              "gap": "lg"
            },
            "children": [
              "header",
              "nav"
            ]
          },
          "header": {
            "type": "Heading",
            "props": {
              "level": 1,
              "text": "Issue Tracker"
            }
          },
          "nav": {
            "type": "Stack",
            "props": {
              "direction": "horizontal",
              "gap": "sm"
            },
            "children": [
              "nav-home",
              "nav-browse",
              "nav-new",
              "nav-search"
            ]
          },
          "nav-home": {
            "type": "Button",
            "props": {
              "label": "Home",
              "variant": "secondary"
            },
            "on": {
              "press": {
                "action": "navigate",
                "params": {
                  "to": "/issues"
                }
              }
            }
          },
          "nav-browse": {
            "type": "Button",
            "props": {
              "label": "Browse",
              "variant": "secondary"
            },
            "on": {
              "press": {
                "action": "navigate",
                "params": {
                  "to": "/issues/browse"
                }
              }
            }
          },
          "nav-new": {
            "type": "Button",
            "props": {
              "label": "New Issue",
              "variant": "secondary"
            },
            "on": {
              "press": {
                "action": "navigate",
                "params": {
                  "to": "/issues/new"
                }
              }
            }
          },
          "nav-search": {
            "type": "Button",
            "props": {
              "label": "Search",
              "variant": "secondary"
            },
            "on": {
              "press": {
                "action": "navigate",
                "params": {
                  "to": "/issues/search"
                }
              }
            }
          }
        }
      },
      "screen": {}
    }
  },
  "screens": {
    "issues-home": {
      "spec": {
        "root": "page",
        "elements": {
          "page": {
            "type": "Stack",
            "props": {
              "direction": "vertical",
              "gap": "lg"
            },
            "children": [
              "heading",
              "stats-list",
              "burndown-link"
            ]
          },
          "heading": {
            "type": "Heading",
            "props": {
              "level": 2,
              "text": "Issues by Project"
            }
          },
          "stats-list": {
            "type": "Stack",
            "props": {
              "direction": "vertical",
              "gap": "sm"
            },
            "children": [
              "stat-card"
            ],
            "repeat": {
              "statePath": "/data/stats"
            }
          },
          "stat-card": {
            "type": "Card",
            "props": {
              "title": {
                "$item": "projectKey"
              }
            },
            "children": [
              "stat-badges"
            ]
          },
          "stat-badges": {
            "type": "Stack",
            "props": {
              "direction": "horizontal",
              "gap": "sm"
            },
            "children": [
              "badge-count",
              "badge-points"
            ]
          },
          "badge-count": {
            "type": "Badge",
            "props": {
              "text": {
                "$template": "${issueCount} issues"
              }
            }
          },
          "badge-points": {
            "type": "Badge",
            "props": {
              "text": {
                "$template": "${totalStoryPoints} pts"
              },
              "variant": "secondary"
            }
          },
          "burndown-link": {
            "type": "Button",
            "props": {
              "label": "Sprint Burndown (Sprint 1)",
              "variant": "secondary"
            },
            "on": {
              "press": {
                "action": "navigate",
                "params": {
                  "to": "/sprints/1"
                }
              }
            }
          }
        }
      },
      "screen": {
        "metadata": {
          "title": "Home"
        },
        "data": {
          "/data/stats": {
            "binding": "issuesByProject",
            "refetchOn": [
              "mount"
            ]
          }
        }
      }
    },
    "issues-browse": {
      "spec": {
        "root": "page",
        "elements": {
          "page": {
            "type": "Stack",
            "props": {
              "direction": "vertical",
              "gap": "lg"
            },
            "children": [
              "heading",
              "issues-list"
            ]
          },
          "heading": {
            "type": "Heading",
            "props": {
              "level": 2,
              "text": "Recent Issues"
            }
          },
          "issues-list": {
            "type": "Stack",
            "props": {
              "direction": "vertical",
              "gap": "sm"
            },
            "children": [
              "issue-card"
            ],
            "repeat": {
              "statePath": "/data/issues"
            }
          },
          "issue-card": {
            "type": "Card",
            "props": {
              "title": {
                "$item": "title"
              }
            },
            "children": [
              "card-content"
            ]
          },
          "card-content": {
            "type": "Stack",
            "props": {
              "direction": "horizontal",
              "gap": "sm",
              "align": "center"
            },
            "children": [
              "badge-id",
              "badge-status",
              "badge-priority",
              "link-detail"
            ]
          },
          "badge-id": {
            "type": "Badge",
            "props": {
              "text": {
                "$template": "#${id}"
              },
              "variant": "outline"
            }
          },
          "badge-status": {
            "type": "Badge",
            "props": {
              "text": {
                "$item": "status"
              }
            }
          },
          "badge-priority": {
            "type": "Badge",
            "props": {
              "text": {
                "$item": "priority"
              },
              "variant": "secondary"
            }
          },
          "link-detail": {
            "type": "Link",
            "props": {
              "label": "View →"
            },
            "on": {
              "press": {
                "action": "navigate",
                "params": {
                  "to": {
                    "$template": "/issues/${id}"
                  }
                }
              }
            }
          }
        }
      },
      "screen": {
        "metadata": {
          "title": "Browse"
        },
        "data": {
          "/data/issues": {
            "binding": "listIssuesUi",
            "params": {
              "limit": 50
            },
            "refetchOn": [
              "mount"
            ]
          }
        }
      }
    },
    "issues-new": {
      "spec": {
        "root": "page",
        "elements": {
          "page": {
            "type": "Stack",
            "props": {
              "direction": "vertical",
              "gap": "lg"
            },
            "children": [
              "heading",
              "form-fields",
              "submit-btn"
            ]
          },
          "heading": {
            "type": "Heading",
            "props": {
              "level": 2,
              "text": "Report a New Issue"
            }
          },
          "form-fields": {
            "type": "Stack",
            "props": {
              "direction": "vertical",
              "gap": "md"
            },
            "children": [
              "field-issueId",
              "field-title",
              "field-projectId",
              "field-reporterId",
              "field-priority",
              "field-storyPoints"
            ]
          },
          "field-issueId": {
            "type": "Input",
            "props": {
              "label": "Issue ID",
              "name": "issueId",
              "type": "number",
              "value": {
                "$bindState": "/form/issueId"
              }
            }
          },
          "field-title": {
            "type": "Input",
            "props": {
              "label": "Title",
              "name": "title",
              "value": {
                "$bindState": "/form/title"
              }
            }
          },
          "field-projectId": {
            "type": "Input",
            "props": {
              "label": "Project ID",
              "name": "projectId",
              "type": "number",
              "value": {
                "$bindState": "/form/projectId"
              }
            }
          },
          "field-reporterId": {
            "type": "Input",
            "props": {
              "label": "Reporter ID",
              "name": "reporterId",
              "type": "number",
              "value": {
                "$bindState": "/form/reporterId"
              }
            }
          },
          "field-priority": {
            "type": "Input",
            "props": {
              "label": "Priority",
              "name": "priority",
              "value": {
                "$bindState": "/form/priority"
              }
            }
          },
          "field-storyPoints": {
            "type": "Input",
            "props": {
              "label": "Story Points",
              "name": "storyPoints",
              "type": "number",
              "value": {
                "$bindState": "/form/storyPoints"
              }
            }
          },
          "submit-btn": {
            "type": "Button",
            "props": {
              "label": "Submit",
              "variant": "primary"
            },
            "on": {
              "press": {
                "action": "dispatch",
                "params": {
                  "name": "submit"
                }
              }
            }
          }
        }
      },
      "screen": {
        "metadata": {
          "title": "Report Issue"
        },
        "actions": {
          "submit": {
            "kind": "command",
            "binding": "reportIssue",
            "paramsFromState": {
              "issueId": "/form/issueId",
              "title": "/form/title",
              "projectId": "/form/projectId",
              "reporterId": "/form/reporterId",
              "priority": "/form/priority",
              "storyPoints": "/form/storyPoints"
            },
            "onSuccess": {
              "navigateTo": "/issues/browse"
            },
            "onError": {
              "showAlert": true
            }
          }
        }
      }
    },
    "issues-search": {
      "spec": {
        "root": "page",
        "elements": {
          "page": {
            "type": "Stack",
            "props": {
              "direction": "vertical",
              "gap": "lg"
            },
            "children": [
              "heading",
              "search-form",
              "search-btn",
              "results-list"
            ]
          },
          "heading": {
            "type": "Heading",
            "props": {
              "level": 2,
              "text": "Search Issues"
            }
          },
          "search-form": {
            "type": "Stack",
            "props": {
              "direction": "vertical",
              "gap": "md"
            },
            "children": [
              "field-q",
              "field-from",
              "field-to",
              "field-priority",
              "field-limit"
            ]
          },
          "field-q": {
            "type": "Input",
            "props": {
              "label": "Query (title search)",
              "name": "q",
              "value": {
                "$bindState": "/form/q"
              }
            }
          },
          "field-from": {
            "type": "Input",
            "props": {
              "label": "From date (ISO-8601)",
              "name": "from",
              "placeholder": "2025-01-01T00:00:00.000Z",
              "value": {
                "$bindState": "/form/from"
              }
            }
          },
          "field-to": {
            "type": "Input",
            "props": {
              "label": "To date (ISO-8601)",
              "name": "to",
              "placeholder": "2026-12-31T23:59:59.999Z",
              "value": {
                "$bindState": "/form/to"
              }
            }
          },
          "field-priority": {
            "type": "Input",
            "props": {
              "label": "Priority (optional)",
              "name": "priority",
              "value": {
                "$bindState": "/form/priority"
              }
            }
          },
          "field-limit": {
            "type": "Input",
            "props": {
              "label": "Max results",
              "name": "limit",
              "type": "number",
              "value": {
                "$bindState": "/form/limit"
              }
            }
          },
          "search-btn": {
            "type": "Button",
            "props": {
              "label": "Search",
              "variant": "primary"
            },
            "on": {
              "press": {
                "action": "dispatch",
                "params": {
                  "name": "search"
                }
              }
            }
          },
          "results-list": {
            "type": "Stack",
            "props": {
              "direction": "vertical",
              "gap": "sm"
            },
            "children": [
              "result-card"
            ],
            "repeat": {
              "statePath": "/data/results"
            }
          },
          "result-card": {
            "type": "Card",
            "props": {
              "title": {
                "$item": "title"
              }
            },
            "children": [
              "result-meta"
            ]
          },
          "result-meta": {
            "type": "Stack",
            "props": {
              "direction": "horizontal",
              "gap": "sm"
            },
            "children": [
              "result-badge-id",
              "result-badge-status",
              "result-badge-priority",
              "result-link"
            ]
          },
          "result-badge-id": {
            "type": "Badge",
            "props": {
              "text": {
                "$template": "#${id}"
              },
              "variant": "outline"
            }
          },
          "result-badge-status": {
            "type": "Badge",
            "props": {
              "text": {
                "$item": "status"
              }
            }
          },
          "result-badge-priority": {
            "type": "Badge",
            "props": {
              "text": {
                "$item": "priority"
              },
              "variant": "secondary"
            }
          },
          "result-link": {
            "type": "Link",
            "props": {
              "label": "View →"
            },
            "on": {
              "press": {
                "action": "navigate",
                "params": {
                  "to": {
                    "$template": "/issues/${id}"
                  }
                }
              }
            }
          }
        }
      },
      "screen": {
        "metadata": {
          "title": "Search"
        },
        "data": {
          "/data/results": {
            "binding": "searchIssues",
            "params": {
              "q": {
                "$state": "/form/q"
              },
              "from": {
                "$state": "/form/from"
              },
              "to": {
                "$state": "/form/to"
              },
              "priority": {
                "$state": "/form/priority"
              },
              "limit": {
                "$state": "/form/limit"
              }
            }
          }
        },
        "actions": {
          "search": {
            "kind": "refetch",
            "targets": [
              "/data/results"
            ]
          }
        }
      }
    },
    "issue-detail": {
      "spec": {
        "root": "page",
        "elements": {
          "page": {
            "type": "Stack",
            "props": {
              "direction": "vertical",
              "gap": "lg"
            },
            "children": [
              "heading",
              "detail-list",
              "lifecycle-hint",
              "actions-section"
            ]
          },
          "heading": {
            "type": "Heading",
            "props": {
              "level": 2,
              "text": "Issue Detail"
            }
          },
          "detail-list": {
            "type": "Stack",
            "props": {
              "direction": "vertical",
              "gap": "sm"
            },
            "children": [
              "detail-card"
            ],
            "repeat": {
              "statePath": "/data/detail"
            }
          },
          "detail-card": {
            "type": "Card",
            "props": {
              "title": {
                "$item": "title"
              }
            },
            "children": [
              "detail-badges"
            ]
          },
          "detail-badges": {
            "type": "Stack",
            "props": {
              "direction": "horizontal",
              "gap": "sm"
            },
            "children": [
              "badge-id",
              "badge-status",
              "badge-priority",
              "badge-project",
              "badge-assignee",
              "badge-reporter"
            ]
          },
          "badge-id": {
            "type": "Badge",
            "props": {
              "text": {
                "$template": "#${id}"
              },
              "variant": "outline"
            }
          },
          "badge-status": {
            "type": "Badge",
            "props": {
              "text": {
                "$item": "status"
              }
            }
          },
          "badge-priority": {
            "type": "Badge",
            "props": {
              "text": {
                "$item": "priority"
              },
              "variant": "secondary"
            }
          },
          "badge-project": {
            "type": "Badge",
            "props": {
              "text": {
                "$template": "Project: ${projectKey}"
              },
              "variant": "outline"
            }
          },
          "badge-assignee": {
            "type": "Badge",
            "props": {
              "text": {
                "$template": "Assignee: ${assigneeUsername}"
              },
              "variant": "outline"
            }
          },
          "badge-reporter": {
            "type": "Badge",
            "props": {
              "text": {
                "$template": "Reporter: ${reporterUsername}"
              },
              "variant": "outline"
            }
          },
          "lifecycle-hint": {
            "type": "Text",
            "props": {
              "text": "Lifecycle: Submit (draft→open), Assign, Reassign, Resolve (in_progress→resolved), Reopen, Close (resolved→closed)."
            }
          },
          "actions-section": {
            "type": "Stack",
            "props": {
              "direction": "vertical",
              "gap": "md"
            },
            "children": [
              "action-submit__btn",
              "action-assign__row",
              "action-reassign__row",
              "action-resolve__row",
              "action-reopen__btn",
              "action-close__btn"
            ]
          },
          "action-submit__btn": {
            "type": "Button",
            "props": {
              "label": "Submit (draft → open)",
              "variant": "secondary"
            },
            "on": {
              "press": {
                "action": "dispatch",
                "params": {
                  "name": "cmdSubmit"
                }
              }
            }
          },
          "action-assign__row": {
            "type": "Stack",
            "props": {
              "direction": "horizontal",
              "gap": "sm",
              "align": "end"
            },
            "children": [
              "action-assign__field",
              "action-assign__btn"
            ]
          },
          "action-assign__field": {
            "type": "Input",
            "props": {
              "label": "Assignee user ID",
              "name": "assigneeId",
              "type": "number",
              "value": {
                "$bindState": "/form/assigneeId"
              }
            }
          },
          "action-assign__btn": {
            "type": "Button",
            "props": {
              "label": "Assign",
              "variant": "primary"
            },
            "on": {
              "press": {
                "action": "dispatch",
                "params": {
                  "name": "cmdAssign"
                }
              }
            }
          },
          "action-reassign__row": {
            "type": "Stack",
            "props": {
              "direction": "horizontal",
              "gap": "sm",
              "align": "end"
            },
            "children": [
              "action-reassign__field",
              "action-reassign__btn"
            ]
          },
          "action-reassign__field": {
            "type": "Input",
            "props": {
              "label": "New assignee ID",
              "name": "assigneeId",
              "type": "number",
              "value": {
                "$bindState": "/form/assigneeId"
              }
            }
          },
          "action-reassign__btn": {
            "type": "Button",
            "props": {
              "label": "Reassign",
              "variant": "primary"
            },
            "on": {
              "press": {
                "action": "dispatch",
                "params": {
                  "name": "cmdReassign"
                }
              }
            }
          },
          "action-resolve__row": {
            "type": "Stack",
            "props": {
              "direction": "horizontal",
              "gap": "sm",
              "align": "end"
            },
            "children": [
              "action-resolve__field",
              "action-resolve__btn"
            ]
          },
          "action-resolve__field": {
            "type": "Input",
            "props": {
              "label": "Resolved at (ISO-8601)",
              "name": "resolvedAt",
              "type": "text",
              "value": {
                "$bindState": "/form/resolvedAt"
              }
            }
          },
          "action-resolve__btn": {
            "type": "Button",
            "props": {
              "label": "Resolve",
              "variant": "primary"
            },
            "on": {
              "press": {
                "action": "dispatch",
                "params": {
                  "name": "cmdResolve"
                }
              }
            }
          },
          "action-reopen__btn": {
            "type": "Button",
            "props": {
              "label": "Reopen (resolved → open)",
              "variant": "secondary"
            },
            "on": {
              "press": {
                "action": "dispatch",
                "params": {
                  "name": "cmdReopen"
                }
              }
            }
          },
          "action-close__btn": {
            "type": "Button",
            "props": {
              "label": "Close (resolved → closed)",
              "variant": "danger"
            },
            "on": {
              "press": {
                "action": "dispatch",
                "params": {
                  "name": "cmdClose"
                }
              }
            }
          }
        }
      },
      "screen": {
        "metadata": {
          "title": "Issue Detail"
        },
        "data": {
          "/data/detail": {
            "binding": "issueDetail",
            "params": {
              "id": {
                "$state": "/route/params/id"
              }
            },
            "refetchOn": [
              "mount"
            ]
          }
        },
        "actions": {
          "cmdSubmit": {
            "kind": "command",
            "binding": "submitIssue",
            "paramsFromState": {
              "issueId": "/route/params/id"
            },
            "onSuccess": {
              "refetchData": [
                "/data/detail"
              ]
            },
            "onError": {
              "showAlert": true
            }
          },
          "cmdAssign": {
            "kind": "command",
            "binding": "assignIssue",
            "paramsFromState": {
              "issueId": "/route/params/id",
              "assigneeId": "/form/assigneeId"
            },
            "onSuccess": {
              "refetchData": [
                "/data/detail"
              ]
            },
            "onError": {
              "showAlert": true
            }
          },
          "cmdReassign": {
            "kind": "command",
            "binding": "reassignIssue",
            "paramsFromState": {
              "issueId": "/route/params/id",
              "assigneeId": "/form/assigneeId"
            },
            "onSuccess": {
              "refetchData": [
                "/data/detail"
              ]
            },
            "onError": {
              "showAlert": true
            }
          },
          "cmdResolve": {
            "kind": "command",
            "binding": "resolveIssue",
            "paramsFromState": {
              "issueId": "/route/params/id",
              "resolvedAt": "/form/resolvedAt"
            },
            "onSuccess": {
              "refetchData": [
                "/data/detail"
              ]
            },
            "onError": {
              "showAlert": true
            }
          },
          "cmdReopen": {
            "kind": "command",
            "binding": "reopenIssue",
            "paramsFromState": {
              "issueId": "/route/params/id"
            },
            "onSuccess": {
              "refetchData": [
                "/data/detail"
              ]
            },
            "onError": {
              "showAlert": true
            }
          },
          "cmdClose": {
            "kind": "command",
            "binding": "closeIssue",
            "paramsFromState": {
              "issueId": "/route/params/id"
            },
            "onSuccess": {
              "refetchData": [
                "/data/detail"
              ]
            },
            "onError": {
              "showAlert": true
            }
          }
        }
      }
    },
    "sprint-burndown": {
      "spec": {
        "root": "page",
        "elements": {
          "page": {
            "type": "Stack",
            "props": {
              "direction": "vertical",
              "gap": "lg"
            },
            "children": [
              "heading",
              "burndown-list",
              "back-btn"
            ]
          },
          "heading": {
            "type": "Heading",
            "props": {
              "level": 2,
              "text": "Sprint Burndown"
            }
          },
          "burndown-list": {
            "type": "Stack",
            "props": {
              "direction": "vertical",
              "gap": "sm"
            },
            "children": [
              "status-card"
            ],
            "repeat": {
              "statePath": "/data/burndown"
            }
          },
          "status-card": {
            "type": "Card",
            "props": {
              "title": {
                "$item": "status"
              }
            },
            "children": [
              "status-badges"
            ]
          },
          "status-badges": {
            "type": "Stack",
            "props": {
              "direction": "horizontal",
              "gap": "sm"
            },
            "children": [
              "badge-issues",
              "badge-points"
            ]
          },
          "badge-issues": {
            "type": "Badge",
            "props": {
              "text": {
                "$template": "${issueCount} issues"
              }
            }
          },
          "badge-points": {
            "type": "Badge",
            "props": {
              "text": {
                "$template": "${totalStoryPoints} pts"
              },
              "variant": "secondary"
            }
          },
          "back-btn": {
            "type": "Button",
            "props": {
              "label": "← Back to Home",
              "variant": "secondary"
            },
            "on": {
              "press": {
                "action": "navigate",
                "params": {
                  "to": "/issues"
                }
              }
            }
          }
        }
      },
      "screen": {
        "metadata": {
          "title": "Sprint Burndown"
        },
        "data": {
          "/data/burndown": {
            "binding": "sprintBurndown",
            "params": {
              "sprintId": {
                "$state": "/route/params/sprintId"
              }
            },
            "refetchOn": [
              "mount"
            ]
          }
        }
      }
    }
  },
  "fragments": {}
}
```

Walkthrough: `manifest.routes` maps six URL patterns to the single `"main"` layout; each route's `screen` key is a base path whose trailing segment becomes the compiled screen key (`issues-home`, `issue-detail`, etc.). Within a screen, `screen.data` binds state paths like `/data/issues` to a named binding ID (`listIssuesUi`), and `refetchOn: ["mount"]` triggers the fetch automatically on enter. The `issue-detail` screen passes `{ "$state": "/route/params/id" }` as the `id` param — the runtime extracts the `:id` segment from the current URL and injects it into the query at fetch time.

## Anti-patterns

- **Embedding business logic in UI** — visibility conditions that replicate state-machine rules, or action guards that shadow PDM transition guards. Logic belongs in the domain layer; the UI should only reflect state already in `/data/*`.
- **Client-side state as events** — writing to `/form/*` paths does not produce PDM events. Only `kind: "command"` actions do. Do not model ephemeral form state as something the event store needs to persist.
- **Duplicating PDM structure inline** — defining the same field twice (once in the form, once hard-coded in a badge prop). Derive display values from `/data/*` state populated by the data binding; don't embed them as literal props.
- **Ad-hoc queries bypassing bindings** — using a raw URL path in `DataBinding.binding` instead of a named binding ID. The `binding` field is a logical ID resolved via `artifacts/bindings.json`; it must not be an HTTP path string.
- **Layout strings without a corresponding layout key** — a `RouteEntry.layout` value that doesn't appear in `manifest.layouts` compiles but fails at runtime because the server has no `/_layouts/<name>.json` to serve.
- **Orphan screens** — defining a screen in `screens/` that no route references. The compiled artifact only includes screens reachable via `manifest.routes`; unreachable screens are silently dropped.
- **`$state` paths with unknown prefixes** — any `{ "$state": "/foo/bar" }` reference where `/foo` is not `/form`, `/route/params`, `/data`, `/actions`, or `/data/__status`/`/data/__error` will fail with `UNCOVERED_STATE_PATH` at validate time.

## Validation & self-review

Run `rntme validate` from the service root. Fix `UI_*` error codes before advancing. Common codes and their meanings:

- `UI_STRUCTURAL_MISSING_SCREEN` — a route's `screen` base path has no corresponding `.spec.json` / `.screen.json` pair in the resolved source.
- `UI_REFERENCES_UNKNOWN_BINDING_QUERY` — a `DataBinding.binding` or `CommandAction.binding` ID is not present in the bindings artifact (validated by `resolvers.resolveBinding`).
- `UNRESOLVED_BINDING` — same as above; emitted directly from the references validation layer.
- `UNCOVERED_STATE_PATH` — a `{ "$state": "..." }` reference uses a path not covered by a data binding or a recognized prefix (`/form/`, `/route/params/`, etc.).
- `UNKNOWN_ROUTE` — a `NavigationAction.navigateTo` target does not match any pattern in `manifest.routes` or the caller-supplied `resolveRoute`.
- `MISSING_ROOT` — a spec's `root` key names an element ID that doesn't exist in `elements`.
- `ORPHAN_ELEMENT` — an element in `elements` is neither the root nor referenced as a child of any other element.
- `SLOT_NOT_IN_LAYOUT` — a `type: "Slot"` element appears in a screen spec rather than a layout spec; Slots are layout-only.

Do not edit `@rntme/ui` source to make validation pass — fix `ui.json`.

## Next step

When BOTH this skill and designing-pdm pass `rntme validate`, invoke Skill: designing-bindings.
