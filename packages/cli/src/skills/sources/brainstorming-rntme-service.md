---
name: brainstorming-rntme-service
description: Use after `rntme init`, before any designing-* skill. Turns a natural-language idea into a structured brief — aggregates, use-cases, UI style, read models — that later skills reference.
---

## What you're building
A brief (`brief.md`) in the service root documenting the domain and use-cases at a level concrete enough to author UI+PDM from it. This is NOT a full spec — it is an anchor the other skills consult.

## Checklist
1. Read or collect from the user the NL idea ("issue tracker for Acme's SRE team").
2. Ask one question at a time to fill the brief template (see Worked example below).
3. Write `brief.md` in the service root (same dir as `rntme.json`).
4. Confirm brief with user; iterate on unclear sections.
5. Invoke paired skills (`designing-ui` + `designing-pdm`) in parallel.

## Red flags
| Thought | Reality |
|---|---|
| "I'll just guess the aggregates" | No — ask explicitly what "things" exist in the domain. |
| "User said 'issues and comments', I'll skip Q&A" | Confirm 2-3 key use-cases anyway; half-specified briefs produce wrong PDMs. |
| "I'll skip the UI question if backend-only" | Every rntme service has UI artifact. If truly no UI, brief says "headless" and `designing-ui` authors a placeholder. |
| "I'll include SQL queries in the brief" | No — those go in graph-ir later. Brief is domain-level. |

## Brief template (what you're producing)

```markdown
# <service-name> brief

## Purpose
<1-2 sentences: what this service does for whom>

## Aggregates (likely)
- <AggregateA> — <1 sentence>
- <AggregateB> — ...

## Use-cases
1. <Actor> <does> <thing>, resulting in <outcome>
2. ...

## Read models (what consumers need to see)
- <List or detail view> — <fields>
- ...

## UI style
<"admin back-office" | "consumer" | "headless" | other>

## Out of scope
- <things explicitly not in v1>
```

## Worked example

User said: "I want an issue tracker for our team."

Brief after Q&A:

```markdown
# issue-tracker brief

## Purpose
Minimal issue tracker for Acme's platform team. Replaces a shared spreadsheet.

## Aggregates (likely)
- Issue — a unit of work with status and owner
- Comment — discussion attached to an issue

## Use-cases
1. Team member opens an issue with title + description
2. Team member assigns an owner
3. Team member adds comments to an issue
4. Anyone closes an issue (marks resolved)
5. Team lead views all open issues assigned to a person

## Read models
- List of open issues (title, owner, updated-at)
- Issue detail page (all fields + comment thread)

## UI style
Admin back-office — table + detail pages, no public pages.

## Out of scope
- Notifications / email
- Attachments
- SLA tracking
```

## Anti-patterns
- Skipping the "out of scope" section. Without explicit cuts, the agent will keep expanding.
- Naming aggregates as verbs (`CreateIssue`) — those are commands, not aggregates.
- Including field-level schema here (that's PDM's job).

## Validation & self-review
Before exiting:
- Brief file exists at `<service-root>/brief.md`.
- At least 2 aggregates listed.
- At least 3 use-cases listed.
- UI style declared.
- User confirmed "looks right".

## Next step
Invoke in parallel: Skill: designing-ui AND Skill: designing-pdm.
They co-evolve — iterate between them before advancing to designing-bindings.
