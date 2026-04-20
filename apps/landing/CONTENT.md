# rntme landing — content inventory

Весь копирайт страницы `rntme.com`, собранный из `src/components/*.astro`,
`src/content/*.mdx` и `src/layouts/BaseLayout.astro`.
Порядок секций совпадает с порядком рендера в `src/pages/index.astro`.

---

## Meta (BaseLayout)

- **Title:** rntme — the safe runtime for AI-generated workflow apps
- **Description:** Stop reinventing a backend every time your agent builds you one. rntme turns a validated service blueprint into a working API and UI on a standard runtime.

## Chrome

### StatusBar (sticky top)

| Left | Right |
| --- | --- |
| `rntme` / `/ pilot` · `v0.1 · cohort of 10` | ● `onboarding` · [github](https://github.com/rntme/runtime) |

### SideRail (fixed left, ≥1280px)

| § | Label |
| --- | --- |
| 01 | Hero |
| 02 | Jobs |
| 03 | Compile |
| 04 | Demo |
| 05 | Shift |
| 06 | Steps |
| 07 | Q&A |
| 08 | Compare |
| 09 | Apply |
| 10 | End |

### Skip link

`Skip to main content`

---

## §01 — Hero

- **Eyebrow:** rntme · pilot program · 2026
- **H1:** Stop reinventing a backend every time your agent builds you one.
- **Lede:** Your first Cursor-built approval tool shipped in two days. The fourth one has a schema you've never seen, events that half-work, and a review queue nobody reads.
- **Pitch:** rntme is a standard runtime for these services. One blueprint describes the domain, the data, the state, the API, and the UI. The runtime enforces it. Service #10 looks like service #1.
- **CTAs:**
  - `Apply as a pilot team →` → Tally form
  - `See it on GitHub` → `GITHUB_URL`
- **Meta row (4 cells):**
  - Runtime → **event-sourced**
  - Unit of work → **validated JSON**
  - Output → **API + UI + events**
  - Pilot cohort → **10 teams**

---

## §02 — MicroJobs

- **Marker:** §02 · Core job / Three things, end-to-end
- **Label:** Core job
- **H2:** Ship repeatable business workflow services without architectural drift.

### Card 01

- **Title:** Describe a service once, in a single validated JSON blueprint.
- **Action:** Domain, data, state transitions, HTTP bindings, UI — one file, validated in layers.
- **Value:** → No more per-service scaffolding. No "how is this one laid out" confusion on service #5.

### Card 02

- **Title:** Boot it on a standard runtime — no service-specific code.
- **Action:** The runtime compiles the blueprint and serves an HTTP API + a declarative UI. Event-sourced state, durable storage, OpenAPI 3.1 out of the box.
- **Value:** → You stop writing backends. You write blueprints. Service #10 looks like service #1.

### Card 03

- **Title:** Let the agent edit the blueprint, not the codebase.
- **Action:** Validator enforces invariants before anything runs. Reviewable JSON diffs replace sprawling PRs.
- **Value:** → Your agent cannot silently ship a broken service. You review intent, not implementation.

---

## §03 — AhaSection

- **Marker:** §03 · See it compile / Fig. 01 — blueprint schema
- **Label:** See it compile
- **H2:** One blueprint, one runtime.
- **Lede:** A scaffold gives you a starting point you have to keep alive. A blueprint describes a service — the runtime keeps it alive. The difference shows up on service #5, when you have to explain what any of these systems actually does.

### Code block (`blueprint.json`)

```json
{
  "service": "ticketing",
  "aggregates": {
    "Ticket": {
      "fields": { "title": "string", "description": "string", "assignee": "UserId?" },
      "states": ["Open", "Assigned", "Resolved", "Closed"],
      "commands": {
        "open":   { "from": "*",        "to": "Open" },
        "assign": { "from": "Open",     "to": "Assigned", "params": { "assignee": "UserId" } },
        "resolve":{ "from": "Assigned", "to": "Resolved" },
        "close":  { "from": "Resolved", "to": "Closed" }
      }
    }
  },
  "ui": { "screens": ["List", "Detail", "Assign"] }
}
```

- **Figcaption:** **Fig. 01** · One input. Three effects. Keep reading →

### Reveal panels

| # | Title | Body |
| --- | --- | --- |
| 01 | HTTP endpoints | POST /tickets · GET /tickets/{id} · GET /tickets · PATCH /tickets/{id}/assign — emitted with OpenAPI 3.1. |
| 02 | Declarative UI | List view, detail view, and command forms — all from the same blueprint, none hand-coded. |
| 03 | State machine | Open → Assigned → Resolved · Closed — invariants enforced by the runtime, not by you. |

---

## §04 — LiveDemoCard (feature-flagged on `DEMO_URL`)

- **Marker:** §04 · Live demo / issue-tracker · ops-console
- **Label:** Try it · live
- **H2:** See a real service running.
- **Lede:** The `issue-tracker` demo is a full rntme service — blueprint, API, UI, seed data. Every object you see was produced by the runtime from one JSON file.

### Playground card

**Header label:** `rntme / playground`

**Input pane (`Input · blueprint.json`):**

```json
{ "service": "issues",
  "aggregates": { "Issue": { "states": ["Open", "Closed"] } },
  "ui": { "screens": ["List", "Detail"] } }
```

**Output pane (`Output · running service`):**

```
boot issues.v1 → staging
↳ schema      applied
↳ API         mounted at /api
↳ UI          mounted at /
↳ event log   ready
```

**CTA:** `Open live demo →` → `DEMO_URL`

---

## §05 — SnowflakeToRuntime

- **Marker:** §05 · The shift / Before / after
- **Label:** The shift
- **H2:** From snowflake chaos to a standard runtime.

### Before

- Your first Cursor-built **ticketing tool** took a weekend. The fourth — a **customer-ops console** — has a migration your team lead refuses to run.
- The **back-office dashboard** you built last month passes tests, but fires two events on every retry. You spent more time reviewing AI diffs than writing anything new.
- *The agent didn't slow down. Your architecture did.*

### After

- A week from now, service #5 is a blueprint you edited in 40 minutes. The runtime is the same one #1 runs. The diff is 12 lines of JSON.
- Your team lead signs off in five minutes — the runtime didn't change, only the domain. You tell the agent "build an escalation flow" and it writes a blueprint, not a repo.
- **Shift →**

---

## §06 — HowItWorks

- **Marker:** §06 · How it works / Fig. 02 — pipeline
- **Label:** How it works
- **H2:** Make no mistakes.

### ASCII pipeline

```
  ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
  │  author  │ ───→ │ validate │ ───→ │ compile  │ ───→ │   boot   │ ───→ │   fork   │
  │blueprint │      │ in layers│      │& migrate │      │ runtime  │      │for svc#2 │
  └──────────┘      └──────────┘      └──────────┘      └──────────┘      └──────────┘
      01                02                03                04                05
                                                        ↑ event log appends at every arrow
```

### Steps

| # | Title | Body |
| --- | --- | --- |
| 01 | Author a blueprint | One JSON file: domain, data, state transitions, HTTP/UI bindings, seed. Written by hand or by an agent. |
| 02 | Validate in layers | Parse → structural → references → consistency. An agent cannot silently produce a broken service. Errors come with stable codes. |
| 03 | Compile & migrate | The runtime produces the schema, the migration plan, and the event log your service needs. No manual DBA work. |
| 04 | Boot the runtime | Same event log, same projection consumer, same HTTP surface, same UI surface — for every service. Zero service-specific code. |
| 05 | Fork for service #2 | Copy the blueprint. Change the domain. Ship. Service #5 reads like service #1. |

---

## §07 — Objections

- **Marker:** §07 · Objections / The questions you're actually asking
- **Label:** Objections we hear
- **H2:** Honest answers.

### Q&A

**Q:** This looks like lock-in.
**A:** Blueprint is plain JSON. Runtime is open source. Your data is in a standard format you can read with any tool.

**Q:** Workflow apps only? That's narrow.
**A:** Yes. Narrow is the feature. If your service is a Notion-competitor or a game backend, rntme is the wrong tool on purpose.

**Q:** What if my logic doesn't fit the runtime?
**A:** If it doesn't, rntme is wrong for that service — not for every service your team builds. We'll tell you honestly at pilot intake.

**Q:** Is this production-ready today?
**A:** We're onboarding pilot teams to answer exactly that. The runtime core is stable; the control plane is in beta; we'll tell you honestly which of your services fit today and which don't.

---

## §08 — Competitors

- **Marker:** §08 · Compare / rntme / vs
- **Label:** Why not just…
- **H2:** We know what you're already trying.

| Name | Body |
| --- | --- |
| Cursor + Supabase + discipline | Works on service #1. Compounds entropy on service #5. |
| Retool / Appsmith / ToolJet | UI-over-data. rntme is state + workflow + UI from one blueprint. Different shape of service. |
| Lovable / Bolt / Firebase Studio | Optimized for first-run wow. rntme is optimized for service #10 looking like service #1. |
| Supabase / Firebase / PocketBase | Menu of primitives. rntme is a standard runtime across many services. |

---

## §09 — PilotForm

- **Marker:** §09 · Pilot / Onboarding the first 10 teams
- **Label:** Pilot program
- **H2:** We're onboarding the first 10 teams personally.
- **Lede:** Paid pilot. White-glove setup. A direct line to the founders. Tell us about your team and the second service you'd build on rntme.
- **Iframe chrome label:** `tally.so / rntme-pilot`
- **Iframe src:** `https://tally.so/embed/{TALLY_FORM_ID}?alignLeft=1&transparentBackground=1&dynamicHeight=1`
- **Noscript fallback:** `Open the pilot application form →` → `https://tally.so/r/{TALLY_FORM_ID}`

---

## §10 — Footer

- **Logo:** `rntme` (with accent dot)
- **Nav:**
  - GitHub → `GITHUB_URL`
  - Docs → `DOCS_URL`
  - Platform login → `PLATFORM_URL`
  - Privacy → `/privacy`
  - Terms → `/terms`
- **Copy (left):** © {current year} rntme
- **Tagline (right):** Make no mistakes.

---

## Env-зависимые значения

Подставляются из `process.env` во время билда (`src/env.ts`):

| Переменная | Где используется |
| --- | --- |
| `TALLY_FORM_ID` | Hero CTA, PilotForm iframe и noscript |
| `GITHUB_URL` | StatusBar, Hero CTA, Footer nav |
| `DOCS_URL` | Footer nav |
| `PLATFORM_URL` | Footer nav |
| `DEMO_URL` *(optional)* | включает §04 и ставит его как CTA |
| `PLAUSIBLE_DOMAIN` *(optional)* | подгружает `plausible.io/js/script.js` |

---

## Источники

- Компоненты: `src/components/*.astro`, `src/components/AhaReveal.tsx`, `src/components/SideRail.tsx`, `src/components/StatusBar.astro`
- Контент-слой (MDX): `src/content/micro-jobs.mdx`, `src/content/objections.mdx`, `src/content/competitors.mdx`
- Мета: `src/pages/index.astro`, `src/layouts/BaseLayout.astro`
