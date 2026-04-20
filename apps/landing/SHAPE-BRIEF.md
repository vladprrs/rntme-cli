# SHAPE-BRIEF — rntme marketing landing

**Source of truth for visual tokens, voice, motion, and critique thresholds.**
**Every Phase 1–3 task in `docs/superpowers/plans/2026-04-20-landing.md` references this file.** If a token is not listed here, stop and update the brief instead of inventing a value.

**Inputs consumed:**
- Spec: `docs/superpowers/specs/2026-04-20-landing-design.md` (content + IA locked)
- `impeccable:shape` interactive pass, 2026-04-20
- `impeccable` anti-pattern rules (loaded from plugin at author time)

**Decided:**
- Theme: **light-only, editorial** (no dark mode toggle in v1)
- Type pairing: **Supreme** (display) + **Switzer** (body) + **Commit Mono** (code) — all free from Indian Type Foundry / open-source, self-hosted
- Visual character: **technical-diagram / architecture-doc** (hairline stroke, quiet grid, single accent)
- Brand hue: **ink-indigo neutral** (hue 265 in OKLCH) + **warm rust accent** (hue 38)

---

## 1. Feature summary

A ten-section static landing at `rntme.com` that converts an AI-native product team's tech lead (or CTO) into a pilot applicant. Single page, Tally-embedded form, feature-flagged live-demo section, one React island for the scroll-reveal aha moment. Engineer-first voice, no hype, one playful line at §4.6 ("Make no mistakes").

Primary conversion: click "Apply as a pilot team" → Tally form.

## 2. Primary user action

**Read §1 Hero → scroll to §3 See-it-compile → understand rntme in < 60s → submit the pilot form.**

The aha moment (§3) is the single load-bearing component. Everything else supports it.

## 3. Design direction

### 3.1 Tone and voice (engineer-first, editorial)

| Trait | Do | Don't |
|---|---|---|
| Register | Direct, declarative, short sentences. | Hedging, marketing softeners ("seamlessly", "effortlessly", "powerful"). |
| Stance | Opinionated. We assert what rntme is and what it isn't. | Listicle or feature-salad voice. |
| Authority | Technical substance, concrete objects (`POST /tickets`, "event log", "validated JSON"). | Category vocabulary without referents ("platform", "solution", "enterprise-grade"). |
| Humor | Exactly **one** playful line — §4.6 heading "Make no mistakes." | Puns, exclamation marks, "🚀", any emoji, hypothetical founder-voice asides. |
| Scarcity | Stated once in §4.9 ("onboarding the first 10 teams personally"). | Countdown timers, "limited spots!!!", any urgency copy elsewhere. |
| Forbidden words | `SQLite`, `Turso`, `SQL`, `database` (per spec §2). `revolutionize`, `simplify`, `unlock`, `game-changer`, `leverage`, `seamless`, `robust`, `world-class`. | — |

Voice exemplars (the bar):
- **Linear docs** for clarity and density.
- **Stripe docs** prose for matter-of-factness.
- **The Browser Company** landing for editorial confidence.
- **Attio** homepage for engineer-targeted conversion copy without bro-tech veneer.

### 3.2 Visual character (architecture-doc)

| Axis | Choice |
|---|---|
| Overall feel | A well-made engineering blog article meets a pilot-program one-pager. |
| Primary decorative element | Typography + hairline rules + a single accent color. |
| Secondary decorative element | Code blocks as texture (the blueprint JSON in §4.3). |
| Diagrams | Custom SVG, 1–1.5px strokes, no fills, single accent flow line, labels in mono. |
| Photography | **None.** No stock, no AI, no founder portraits. |
| Illustration | None other than typographic + SVG diagrams above. |
| Iconography | **Minimal.** One or two functional icons max (e.g., external-link chevron after GitHub link). No icon-above-every-heading pattern. |

### 3.3 Anti-pattern list (zero tolerance, check during audit)

1. Gradient text (`background-clip: text`) — banned.
2. `border-left: Npx solid <color>` accent stripes on cards/callouts — banned.
3. Purple-to-blue or cyan-on-dark gradients anywhere.
4. Glassmorphism (`backdrop-filter: blur`) used decoratively.
5. Glow / neon accents around buttons or headings.
6. Rounded-icon-above-heading pattern.
7. Card-inside-card nesting.
8. Monospace for everything "to look technical".
9. Generic drop shadows with large offsets.
10. Symmetric card grids of identical icon-heading-paragraph tiles (the classic "landing template" look).
11. `linear-gradient` on any text element, hero panel, or hover state.
12. Bounce/elastic easing (`cubic-bezier` with overshoot).

---

## 4. Design tokens

All values are normative. Components MUST import `tokens.css`; no inline colors, spacing, or font sizes.

### 4.1 Color (light-only, OKLCH)

Brand hue = 265 (indigo-ink). Accent hue = 38 (rust).

```css
:root {
  /* Backgrounds */
  --color-bg:               oklch(99.0% 0.003 265);  /* page */
  --color-surface:          oklch(97.2% 0.005 265);  /* card surface */
  --color-surface-2:        oklch(98.4% 0.006 265);  /* elevated card on page */
  --color-code-bg:          oklch(96.6% 0.008 265);  /* code block background */

  /* Text */
  --color-text:             oklch(22% 0.020 265);    /* near-black, indigo-tinted */
  --color-text-muted:       oklch(48% 0.015 265);    /* secondary */
  --color-text-subtle:      oklch(62% 0.012 265);    /* captions, meta */
  --color-text-on-accent:   oklch(99.0% 0.003 265);  /* text on accent background */

  /* Borders and rules */
  --color-border:           oklch(90.0% 0.006 265);  /* hairline */
  --color-border-strong:    oklch(80.0% 0.008 265);  /* emphasis rule */

  /* Accent — use sparingly; 60-30-10 rule, accent ≈ 10% of visual weight */
  --color-accent:           oklch(55.0% 0.190 38);   /* primary CTA, key highlights */
  --color-accent-hover:     oklch(49.0% 0.195 38);   /* -6% lightness on hover */
  --color-accent-wash:      oklch(95.0% 0.030 38);   /* background tint under accent text */

  /* Focus ring — indigo for contrast against rust */
  --color-focus:            oklch(58.0% 0.170 265);

  /* Semantic */
  --color-link:             var(--color-text);       /* links inherit text color; underline only */
  --color-link-hover:       var(--color-accent);
}
```

Rules:
- Accent color appears in exactly these roles: primary CTA fill, one link underline on the aha-reveal label, the flow-arrow color in the §4.6 diagram, the single highlighted Objection-Q badge if used. Nothing else.
- Focus ring color is **indigo**, not rust — rust is already the visual attention-grabber; focus needs its own distinct color.
- No text on a colored background other than the primary CTA (text on accent).

### 4.2 Typography

Supreme (display) and Switzer (body) are loaded from Fontshare's CDN via a single `<link rel="stylesheet">` in `BaseLayout.astro`, preceded by `<link rel="preconnect">` to warm the TLS handshake. Both are free from Indian Type Foundry (fontshare.com).

Mono is **system mono** (`ui-monospace` → SF Mono / Cascadia / Consolas). We do not ship a custom mono face: the distinctive typographic signature is carried by the Supreme + Switzer pairing, and system mono is already a well-designed monospace on every target platform. Saves bandwidth and one CDN dependency.

Fallback stack rules:
- Display: `"Supreme", ui-sans-serif, system-ui, -apple-system, "Segoe UI Variable", sans-serif`
- Body: `"Switzer", ui-sans-serif, system-ui, -apple-system, "Segoe UI Variable", sans-serif`
- Mono: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`

```css
:root {
  --font-sans:      "Switzer", ui-sans-serif, system-ui, -apple-system, "Segoe UI Variable", sans-serif;
  --font-display:   "Supreme", ui-sans-serif, system-ui, -apple-system, "Segoe UI Variable", sans-serif;
  --font-mono:      ui-monospace, "SF Mono", Menlo, Consolas, monospace;

  /* Fluid scale for marketing / content page (per impeccable: fluid clamp on headings) */
  --fs-display:     clamp(2.5rem, 1.8rem + 3.6vw, 4.25rem);  /* hero h1 */
  --fs-h2:          clamp(1.75rem, 1.3rem + 2.2vw, 2.75rem); /* section h2 */
  --fs-h3:          clamp(1.125rem, 1.0rem + 0.6vw, 1.375rem); /* card h3, step title */
  --fs-body-lg:     1.125rem;   /* hero lede + key paragraphs */
  --fs-body:        1rem;
  --fs-small:       0.875rem;   /* meta + section labels */
  --fs-micro:       0.75rem;    /* superscript, figure captions */

  /* Line-heights */
  --lh-tight:       1.05;   /* display only */
  --lh-heading:     1.15;   /* h2/h3 */
  --lh-body:        1.6;    /* body paragraphs */
  --lh-mono:        1.55;   /* code blocks */

  /* Weights (Supreme supports up to 800; Switzer supports up to 900; use only these steps) */
  --fw-regular:     400;
  --fw-medium:      500;
  --fw-semibold:    600;
  --fw-bold:        700;

  /* Tracking */
  --tracking-display: -0.02em;
  --tracking-body:    0em;
  --tracking-label:   0.08em;      /* for all-caps section labels ("Core job", "The shift") */
}
```

**Usage rules:**
- `--font-display` only on h1, h2. h3 and below use `--font-sans`.
- Section labels (the small caps above each heading, e.g. "Core job", "See it compile") use `--font-mono`, `--fs-micro`, `--fw-medium`, `text-transform: uppercase`, `--tracking-label`, `color: var(--color-text-muted)`.
- Code blocks always `--font-mono` + `--lh-mono` + `--fs-small`.
- **All-caps** restricted to section labels and the GitHub-URL style footer meta. Never paragraph text.
- Body max line-length: `max-width: 65ch` on `<p>` elements inside content sections; hero lede/pitch `max-width: 62ch` (tighter for rhythm).

### 4.3 Spacing (4pt scale, semantic mapping)

The plan references numeric tokens `--space-1..--space-6` in component source. Bind the scale as follows:

```css
:root {
  --space-1:   4px;     /* tight: gap inside inline groups */
  --space-2:   8px;     /* snug: label+value, inline icon+text */
  --space-3:   16px;    /* default gap: between paragraphs, between buttons */
  --space-4:   24px;    /* card padding, heading margin-bottom */
  --space-5:   40px;    /* sub-section gap, CTAs row margin */
  --space-6:   clamp(64px, 3vw + 40px, 112px);  /* section top/bottom padding */

  /* Inline-horizontal page gutter */
  --page-gutter: clamp(20px, 4vw, 40px);
  --page-max:    1120px;
}
```

Rules:
- Section components MUST use `padding: var(--space-6) var(--page-gutter)` (NOT `var(--space-4)`, which is cramped on desktop).
- Section content wrapper: `max-width: var(--page-max); margin: 0 auto`.
- Vertical rhythm between text elements follows `--space-3` (default paragraph gap), `--space-4` (heading-to-body), `--space-5` (headline-to-supporting block).

### 4.4 Radius

```css
:root {
  --radius-sm:   4px;     /* section labels, pill chips */
  --radius-md:   8px;     /* cards, form inputs, code blocks */
  --radius-lg:   12px;    /* larger surfaces */
  --radius-pill: 9999px;  /* CTA-pill variant (not used in v1) */
}
```

No blur, no shadow. Cards use `border: 1px solid var(--color-border)` for edge, not `box-shadow`. If elevation is needed for a single element, use `--color-surface-2` on surface, not drop shadow.

### 4.5 Motion

```css
:root {
  --motion-fast:   160ms;   /* hover state transitions */
  --motion-base:   320ms;   /* reveal fades, accordion grid-rows */
  --motion-slow:   560ms;   /* hero heading fade-in on first paint (if used) */

  /* Ease-out-quart; no bounce, no overshoot */
  --ease-out:      cubic-bezier(0.2, 0.7, 0.3, 1);
  --ease-in-out:   cubic-bezier(0.45, 0, 0.55, 1);
}
```

**Scroll-reveal (§4.3 AhaReveal panels):**
- Each panel observed by `IntersectionObserver` (threshold 0.3, `rootMargin: "0px 0px -10% 0px"`).
- On intersect: `opacity 0 → 1`, `translateY(12px) → 0`.
- Duration: `--motion-base`; easing: `--ease-out`.
- Stagger between panels: 80ms.
- **Must unobserve on first intersect** — the reveal plays once, does not replay on scroll-back.

**Accordion (§4.7 Objections):**
- Use native `<details>/<summary>`.
- Animate content height via `grid-template-rows: 0fr → 1fr` (not `height` directly — per impeccable motion rules).
- Duration: `--motion-base`; easing: `--ease-out`.
- Rotate chevron marker by 90° (CSS) as `[open]` state — `transform: rotate(90deg)`, `transition: transform var(--motion-fast) var(--ease-out)`.

**Hover states (buttons, links):**
- Primary CTA: background `--color-accent → --color-accent-hover`; duration `--motion-fast`.
- Secondary CTA: border darkens one step; duration `--motion-fast`.
- Text links: underline slides in from left via `background-size: 0% 1px → 100% 1px`, `background-position: left bottom` (no color change on hover — underline does the work).
- **No** `translateY(-Npx)` on hover (reads as jumpy on long body pages).

**Reduced motion (`prefers-reduced-motion: reduce`):**
- All transitions collapse to `0.01ms` (already in `global.css` per plan).
- Scroll-reveal panels render as immediately visible (opacity 1, no translate).

### 4.6 Focus + keyboard

- Every interactive element: `:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }`.
- Focus ring NEVER replaced by a box-shadow tint (it becomes invisible on busy backgrounds).
- Tab order: Hero CTAs → MicroJobs cards (non-interactive, skipped) → AhaReveal panels (non-interactive, skipped) → LiveDemoCard link (if present) → all Objection summaries in order → Pilot form → Footer nav in order.

### 4.7 Iconography

- Only two icons in v1: **external-link glyph** (after GitHub link), **chevron-right** (Objections summary marker). Both as inline SVG, 14×14px, `currentColor`.
- No icon library. No decorative icons.

---

## 5. Layout strategy

| Section | Density | Column model | Alignment |
|---|---|---|---|
| §1 Hero | Loose | Single column, 62ch cap | Left-aligned |
| §2 MicroJobs | Medium | `repeat(auto-fit, minmax(280px, 1fr))` grid of 3 cards | Left |
| §3 AhaReveal | Medium | 2-col `1fr 1fr` on ≥800px, stack on mobile | Left |
| §4 LiveDemo (flagged) | Loose | Single column, 62ch | Left |
| §5 Snowflake → runtime | Medium | 2-col `1fr 1fr` vignettes on ≥800px, stack on mobile | Left |
| §6 How it works | Dense (5 steps) | Single column list, each step `auto 1fr` two-col | Left |
| §7 Objections | Tight | Single column, stacked `<details>` | Left |
| §8 Competitors | Medium | 2-col `minmax(240px, 1fr) 2fr` rows on ≥720px, stack on mobile | Left |
| §9 Pilot form | Loose | Single column, Tally iframe full-width up to `--page-max` | Left |
| §10 Footer | Tight | 2-col top (logo / nav); 2-col bottom (copy / tagline) | Space-between |

Page gutter and max width apply to every section. All section root elements: `padding: var(--space-6) var(--page-gutter); max-width: var(--page-max); margin-inline: auto;`.

**Intentional grid break:** §3 AhaReveal is the one section where the left code column may visually overflow the `62ch` text cap via `font-variant-numeric: tabular-nums` on the JSON; this is deliberate. Every other section respects the text cap.

---

## 6. Key states

Static page, but still has states:

| State | Where | Behavior |
|---|---|---|
| **Default** | Every section visible except §4 | Renders per spec. |
| **Live demo flag OFF** | §4 LiveDemoCard | Entire section is absent from DOM (not display:none). Page has 9 sections. |
| **Live demo flag ON** | §4 LiveDemoCard | Section renders between §3 and §5. |
| **`prefers-reduced-motion`** | §3 AhaReveal, §7 Objections | Panels render pre-revealed; accordion still toggles but without height animation. |
| **No JS (noscript)** | §3 AhaReveal, §9 Pilot form | §3: panels render all visible (no scroll-reveal). §9: show `<noscript>` fallback link to Tally hosted form. |
| **Tally fails to load** | §9 | `<iframe>` shows empty; `<noscript>` link acts as fallback whether JS is on or off, visible below iframe. |
| **Short viewport (< 360px)** | All sections | Gutter shrinks to 16px; all 2-col grids stack. |
| **Wide viewport (> 1400px)** | All sections | Content capped at `--page-max`; no full-bleed stretching. |
| **Print** | Whole page | Not a target in v1. A `@media print` rule at end of global.css may set `display: none` on §3 canvas + §9 iframe for politeness, but not required. |

---

## 7. Interaction model

- Page entry: hero visible immediately; no loading spinner, no splash.
- Scroll: passive except §3 AhaReveal panels and any future `position: sticky` element (§6 diagram candidate; deferred).
- CTA click: primary CTA navigates to Tally-hosted form in same tab (lead-capture UX convention). Secondary CTAs (GitHub, footer links) open in same tab; add `rel="noopener"` only on external targets that are not our own.
- Objections accordion: only one panel open at a time is NOT enforced — users can open multiple.
- Form submission: handled by Tally; no client-side validation on our side.

---

## 8. Content requirements

All copy is frozen in `docs/superpowers/specs/2026-04-20-landing-design.md`. The implementation tasks copy it verbatim; `impeccable:clarify` (Task 19) is the only pass allowed to edit user-visible strings, and MUST respect:
- No `SQLite` / `Turso` / `SQL` / `database`.
- No new sections, no reordering.
- Keep "Make no mistakes" as the §6 heading.

Dynamic content (runtime-resolved):
- `env.TALLY_FORM_ID` → Tally iframe `src`.
- `env.GITHUB_URL` → hero secondary CTA + footer link.
- `env.DOCS_URL` → footer link.
- `env.PLATFORM_URL` → footer link.
- `env.DEMO_URL` → feature flag + LiveDemoCard CTA.
- `env.PLAUSIBLE_DOMAIN` → `<script>` injected into `<head>` iff set.

---

## 9. Recommended references (impeccable)

During implementation tasks (7–16) and the impeccable passes (19–21), keep these references in mind:

- **spatial-design.md** — for the 2-col AhaReveal and Competitors grids; container queries for the LiveDemo card.
- **motion-design.md** — for grid-template-rows accordion and IntersectionObserver reveal.
- **typography.md** — when loading Supreme/Switzer/Commit Mono (woff2 with `font-display: swap`; preload the two most critical files — Switzer-400, Supreme-700).
- **color-and-contrast.md** — verify every text/background pair at WCAG AA contrast ratio ≥ 4.5:1 (body) and ≥ 3:1 (large text). Accent-on-white needs contrast check too.
- **interaction-design.md** — when styling the Tally iframe container and the Objections summary.
- **ux-writing.md** — Task 19 reference, though the primary constraint is the spec-as-truth rule.

---

## 10. Numeric pass thresholds for `impeccable:critique` (Task 21)

Both personas must clear every threshold. Each axis scored 0–10 unless noted. Any axis below threshold triggers a fix pass per Task 21 Step 4 and a re-critique.

### 10.1 Persona A — tech lead at AI-native product team (ICP A-tier)

| Axis | Minimum score | Why this threshold |
|---|---|---|
| Visual hierarchy | **≥ 8.5** | They read architecture docs daily; signal-to-noise must be excellent. |
| Information architecture | **≥ 9.0** | Must answer "what is rntme / why different from Cursor+Supabase / how to join" in < 60s. |
| Emotional resonance (trust) | **≥ 7.5** | Skeptical engineer audience wants "substantive", not "exciting". 7.5 is the substantive bar. |
| Cognitive load (lower = better) | **≤ 3.5** | Dense content is fine; dense *layout* kills engagement. |
| Typography (voice + legibility) | **≥ 8.0** | Supreme + Switzer pairing must land; code blocks must feel deliberate. |
| Color (restraint + cohesion) | **≥ 7.5** | Single-accent palette cannot feel beige-boring OR garish. |
| Spatial rhythm | **≥ 8.0** | Editorial claim depends on spacing excellence. |
| Motion (purposeful, quiet) | **≥ 7.0** | One aha reveal + one accordion toggle + hover states. No more. |
| Microcopy | **≥ 8.5** | Engineer-first voice is our wedge. |
| Accessibility (WCAG 2.2 AA) | **≥ 9.5** | Task 20 audit must report zero P0/P1 as gate to Task 21. |
| AI-slop anti-pattern count | **= 0** | Zero tolerance. Anti-patterns listed in §3.3 above. |

### 10.2 Persona B — delivery lead at a 15-person dev agency (ICP B-tier)

| Axis | Minimum score | Notes |
|---|---|---|
| Visual hierarchy | **≥ 8.0** | They skim faster; still need clear hierarchy. |
| Information architecture | **≥ 8.0** | Must infer "can I reuse across clients" from §2 + §8 alone. |
| Emotional resonance (ROI confidence) | **≥ 7.0** | Tight margin; needs to feel like leverage. |
| Cognitive load | **≤ 4.0** | Slightly higher tolerance than persona A. |
| Typography | **≥ 7.5** | |
| Color | **≥ 7.0** | |
| Spatial rhythm | **≥ 7.5** | |
| Motion | **≥ 7.0** | |
| Microcopy | **≥ 8.0** | Voice tuned for A still fine here. |
| Accessibility | **≥ 9.0** | Slightly lower than A only because their daily context is less standards-driven. |
| AI-slop anti-pattern count | **= 0** | |

**Gate rule:** Tasks 20 + 21 cannot both pass unless every row in both tables above is clear. Task 21 Step 4 ("Address every axis below threshold") maps directly to these numbers.

---

## 11. Open questions (implementation-time decisions)

These are deliberately unresolved — the implementer picks, or asks if stuck:

1. **Supreme vs Switzer weight for the hero h1.** Default: Supreme 700, `--fs-display`, `--lh-tight`, `--tracking-display`. If Supreme-700 reads too dark on the cream bg, fall back to Supreme 600.
2. **Section labels (§2 "Core job", §3 "See it compile", etc.) — styled uppercase mono.** Default as spec'd in §4.2; if the visual weight competes with the h2, drop `--fs-micro` → `10px`.
3. **§6 diagram.** Whether to ship a static SVG flow (5-step chain) or delegate to `impeccable:impeccable craft` in Task 20's polish pass. Decision deferred to Task 20.
4. **OG image.** Placeholder in Task 6; real one in Task 20 polish (post-audit). Fonts must subset for the OG PNG; can use Supreme-700 + Switzer-500 at 72px/24px on `--color-bg`.
5. **Favicon.** Placeholder wordmark SVG in Task 6. Final mark at Task 20 polish — keep it as a mono-family "rn" monogram in near-black on transparent.

---

*Authored 2026-04-20 via `impeccable:shape` interactive pass. This brief supersedes any prior visual decisions. Update by re-running `impeccable:shape`; do not edit inline.*
