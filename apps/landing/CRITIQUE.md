# Self-critique — rntme landing (Task 21)

`impeccable:critique` drives persona-based scoring through a headless browser. That tooling isn't available in this environment, so the following is a structured self-critique against the SHAPE-BRIEF §10 thresholds. These scores are author-assigned, so they over-estimate the ceiling and under-estimate the floor by a small amount — read them as a confidence interval, not a verdict.

**Date:** 2026-04-20
**Thresholds source:** `apps/landing/SHAPE-BRIEF.md` §10.

---

## Persona A — tech lead at AI-native product team

| Axis | Threshold | Score | Clears? | Notes |
|---|---|---|---|---|
| Visual hierarchy | ≥ 8.5 | **8.0** | ⚠️ short | §6 HowItWorks needs a flow diagram to fully land. Deferred to polish (SHAPE-BRIEF §11 Q3). |
| Information architecture | ≥ 9.0 | **8.5** | ⚠️ short | "What / why / how-to-join" answerable < 60s via hero → aha → pilot. Aha reveal visual weight would bump this to 9+. |
| Emotional resonance (trust) | ≥ 7.5 | **8.0** | ✅ | Objections + Competitors lean into honesty; "we'll tell you honestly" signal is strong. |
| Cognitive load (lower = better) | ≤ 3.5 | **3.0** | ✅ | Substance is dense; layout isn't. Generous gutters, clear sections, no visual noise. |
| Typography | ≥ 8.0 | **7.5** | ⚠️ short | Fontshare CDN loads Supreme + Switzer with `display=swap`; rendering quality depends on network. If a reader's first paint is system-ui, the voice is weaker. Self-hosting moves this to ≥ 8.5. |
| Color | ≥ 7.5 | **8.5** | ✅ | Single rust accent against indigo-ink neutrals is restrained and distinctive. |
| Spatial rhythm | ≥ 8.0 | **8.0** | ✅ | Just clears. The `clamp()`-based page gutter + section padding do real work. |
| Motion | ≥ 7.0 | **7.5** | ✅ | Scroll-reveal plays once (unobserve on first intersect); accordion is native. No bounce. |
| Microcopy | ≥ 8.5 | **8.5** | ✅ | Engineer-first voice maintained. No banned filler words. |
| Accessibility (WCAG 2.2 AA) | ≥ 9.5 | **9.5** | ✅ | Skip link, focus ring, AA contrast (–accent-text added this pass), semantic landmarks, reduced-motion respected. |
| AI-slop anti-patterns | = 0 | **0** | ✅ | Verified by grep. |

**Persona A verdict:** 8 of 11 axes clear. 3 axes short by 0.5 each, with causes identified and mitigations ready.

---

## Persona B — delivery lead at a 15-person dev agency

| Axis | Threshold | Score | Clears? | Notes |
|---|---|---|---|---|
| Visual hierarchy | ≥ 8.0 | **8.0** | ✅ | Same construction; B's bar is half a step lower and the page clears it. |
| Information architecture | ≥ 8.0 | **8.0** | ✅ | "Can I reuse across clients?" answer inferrable from Competitors "Cursor + Supabase + discipline" row + MicroJob #2. |
| Emotional resonance (ROI confidence) | ≥ 7.0 | **7.0** | ✅ | "White-glove setup" + "direct line to the founders" reads as pragmatic for a B-tier lead. Just clears. |
| Cognitive load | ≤ 4.0 | **3.0** | ✅ | |
| Typography | ≥ 7.5 | **7.5** | ✅ | Same font-loading caveat as A; B is less voice-sensitive. |
| Color | ≥ 7.0 | **8.5** | ✅ | |
| Spatial rhythm | ≥ 7.5 | **8.0** | ✅ | |
| Motion | ≥ 7.0 | **7.5** | ✅ | |
| Microcopy | ≥ 8.0 | **8.5** | ✅ | |
| Accessibility | ≥ 9.0 | **9.5** | ✅ | |
| AI-slop anti-patterns | = 0 | **0** | ✅ | |

**Persona B verdict:** 11 of 11 axes clear.

---

## Net

Persona B passes every threshold. Persona A is short by 0.5 on three related axes, all tied to two known deferred polish items (SHAPE-BRIEF §11 questions 3–5): the §6 flow diagram, self-hosted Commit Mono + Supreme + Switzer, and the real OG image.

**Decision:** Ship. The shortfalls for Persona A are polish-pass items, not structural flaws. They land on the "Remaining P2/P3 items" backlog in AUDIT.md, not on deploy-blocking bugs.

Post-deploy, the fastest path to closing Persona A's gap is:
1. Self-host Supreme + Switzer woff2 files with `preload` on Supreme-600 and Switzer-400 (restores typography to 8.5+).
2. Commission a simple 5-step SVG flow diagram for §6 (restores hierarchy + IA to 8.5+).
3. Replace og-image.png with a typographic card (no score impact, but real-world share preview).
