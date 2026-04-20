---
name: using-rntme
description: Use when starting work on a rntme service — navigator for the outside-in authoring pipeline (brief → UI+PDM → bindings → QSM+graph-IR → manifest → publish).
---

## What you're building
rntme services are authored as 7 declarative JSON artifacts (manifest, pdm, qsm, graph-ir, bindings, ui, seed) and published as a bundle. This skill routes you through the pipeline.

## Choose your mode

### New service mode
You ran `rntme init <slug>` and have empty-but-valid artifacts. Start with the brief.

  → Invoke Skill: brainstorming-rntme-service

### Quick-edit mode
You have an existing service bundle and want to change ONE artifact. Skip brainstorming. Cross-artifact consistency is your responsibility; `rntme validate` catches structural mismatches.

  → Invoke the matching skill:
    - change a screen/form/list → designing-ui
    - add an aggregate/event/command → designing-pdm
    - expose a new command/query → designing-bindings
    - add a projection / JOIN → designing-qsm
    - change query compilation → designing-graph-ir
    - bump metadata or wire services → composing-manifest
    - just publish → publishing-via-rntme-cli

## Red flags
| Thought | Reality |
|---|---|
| "I'll design PDM first" | PDM co-evolves with UI — do them together, not before. |
| "I'll start with QSM since projections are the hard part" | QSM is DERIVED from bindings. Bindings come before QSM. |
| "I'll skip validate between steps" | Validate after every artifact change. Compounding errors are hard to debug. |
| "I'll write graph-ir before QSM is stable" | Graph-ir lowers QSM queries. Stabilise QSM shape first, then author graph-ir for it. |

## Checklist
1. Confirm you have `rntme.json` in your cwd. Missing → run `rntme init <slug>` first.
2. Decide: new service (full pipeline) vs quick-edit (single skill).
3. Invoke the matching Skill; do not freelance.
4. After each design-skill completes, run `rntme validate`. Do not advance until exit 0.
5. Never edit @rntme/* packages to make validate pass — edit the artifact.

## Anti-patterns
- Starting without `rntme init` (no rntme.json to anchor paths).
- Editing multiple artifacts simultaneously without validating between them.
- Calling `rntme publish` before a clean `rntme validate`.

## Validation & self-review
This skill produces no artifact. Exit when you have invoked the next skill.

## Next step
- New service → Invoke Skill: brainstorming-rntme-service
- Quick-edit → Invoke the matching designing-* skill directly
