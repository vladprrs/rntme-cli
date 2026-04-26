---
name: composing-blueprint
description: Use after service-level artifacts are ready. Authors a project blueprint folder that can be uploaded with rntme project publish.
---

## What you're building
A project blueprint folder rooted at `project.json`. The folder declares the project name, its services, routes, middleware, and mounts. Each service lives under `services/<slug>/` and may contain QSM, graph, bindings, UI, and seed material.

## Checklist
1. Confirm `project.json` exists at the project root and has a stable `name`.
2. Make sure every service listed in `project.json.services` has a matching `services/<slug>/service.json`.
3. Keep shared PDM material under `pdm/` and service-specific material under `services/<slug>/`.
4. Wire user-facing surfaces through `routes.ui` and `routes.http` in `project.json`.
5. Run `rntme project publish --dry-run --project <slug> <blueprint-dir>` before publishing.

## Red flags
| Thought | Reality |
|---|---|
| "I'll publish a single artifacts directory" | Uploads are project-first now: publish the blueprint root. |
| "Service tags decide promotion" | Tags were removed from Track 1. Use project version seqs. |
| "The dry-run is optional" | Dry-run is the local gate replacing the old standalone validate command. |

## Worked example

```bash
rntme init product-catalog
cd product-catalog
# edit project.json and services/app/*
rntme project publish --dry-run --org acme --project product-catalog .
```

## Validation & self-review
Exit when `rntme project publish --dry-run` succeeds and the bundle summary names the expected project services and routes.

## Next step
Invoke Skill: publishing-via-rntme-cli.
