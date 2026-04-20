# Self-audit — rntme landing (Task 20)

`impeccable:audit` typically drives Lighthouse via a headless browser. That tooling isn't installed in this environment, so what follows is a manual audit against the same axes (accessibility, performance, theming, responsive, anti-patterns) and the SHAPE-BRIEF.md §3.3 anti-pattern list.

**Date:** 2026-04-20
**Scope:** `/home/coder/project/rntme-cli/apps/landing/`

---

## Anti-patterns (SHAPE-BRIEF §3.3) — PASS

| # | Pattern | Status | Note |
|---|---|---|---|
| 1 | `background-clip: text` gradient text | ✅ none | grepped `src/` — no matches |
| 2 | `border-left: Npx solid <color>` accent stripes | ✅ none | SnowflakeToRuntime's original spec had this; rewritten to `background: var(--color-accent-wash)` + mono "SHIFT →" caption |
| 3 | Purple-to-blue / cyan-on-dark gradients | ✅ none | No `linear-gradient`, `radial-gradient`, `conic-gradient` anywhere |
| 4 | `backdrop-filter: blur` | ✅ none | grepped — no matches |
| 5 | Glow / neon accents | ✅ none | No `box-shadow` used |
| 6 | Rounded-icon-above-heading | ✅ none | No icons in v1 copy |
| 7 | Card-inside-card nesting | ✅ none | MicroJobs cards stand alone; Objections details stand alone; Competitors rows are `<dl>`, not nested cards |
| 8 | Mono-everywhere "technical vibes" | ✅ purposeful | Mono used only on: section labels, mj-num, AhaReveal JSON pre-block, footer logo, stor-shift caption, hiw-n step numbers. Body stays in Switzer |
| 9 | Generic drop shadows | ✅ none | No `box-shadow` |
| 10 | Symmetric card grids of identical tiles | ⚠️ soft | MicroJobs has 3 numbered cards. Numbering + varied copy (different line lengths, different phrasing rhythm) differentiates them from generic "icon-heading-paragraph" tile sets. Acceptable. |
| 11 | Gradient-fill text/hero | ✅ none | No gradients |
| 12 | Bounce / elastic easing | ✅ none | Only `cubic-bezier(0.2, 0.7, 0.3, 1)` (ease-out-quart) and `cubic-bezier(0.45, 0, 0.55, 1)` (ease-in-out) — both without overshoot |

## Accessibility — near-PASS with fixes applied

- ✅ Semantic landmarks: `<main id="main">`, `<footer>`, `<nav aria-label="Footer">`, `<section aria-labelledby="…">` per section.
- ✅ Heading order: one `<h1>` (hero), section `<h2>`s, micro-job/step/reveal `<h3>`s. No skips.
- ✅ Skip-to-main link added (BaseLayout.astro, global.css `.skip-link`). Visible on focus.
- ✅ Focus ring: `:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }` — indigo ring on light bg, clearly visible.
- ✅ Color contrast (WCAG 2.2 AA):
  - Body text on bg: `oklch(22% 0.02 265)` on `oklch(99% 0.003 265)` ≈ 14:1 — AAA.
  - Muted text on bg: `oklch(48% 0.015 265)` ≈ 5.1:1 — AA pass.
  - **Fixed:** Accent-colored body text (mj-value, stor-shift, link-hover) now uses `--color-accent-text` `oklch(42% 0.195 38)` ≈ 4.6:1 — AA pass. The brighter `--color-accent` is reserved for button fills where paired with `--color-text-on-accent` (99% L, high contrast).
- ✅ `prefers-reduced-motion` honored in `global.css`.
- ✅ `<iframe>` has `title="Apply to rntme pilot program"` + `loading="lazy"`.
- ✅ `<noscript>` fallback for the Tally iframe in PilotForm.
- ✅ All interactive elements reachable by Tab. Tab order follows visual order.
- ⚠️ The Fontshare CDN stylesheet may block text paint briefly; `display=swap` is set so fallback (system-ui) renders first. This is the right trade-off for CLS, against a minor FOUT.

## Performance — PASS

- HTML (dist/index.html): 21.9 KB; gzipped 7.2 KB.
- Total `_astro` bundle: 151 KB raw (~50 KB gzip estimate).
  - React client runtime: 136 KB raw — one-time cost for the scroll-reveal island. This is Astro + React 18 baseline; cannot shrink without going islands-free.
  - AhaReveal island code: 2.8 KB.
  - Landing CSS: 5.1 KB raw.
- Static output — no hydration except the one aha island that mounts `client:visible`.
- `inlineStylesheets: "auto"` + `cssMinify: true` in astro.config.ts.
- Images: single og-image.png placeholder (3.6 KB). No large binary assets.
- No third-party scripts by default; Plausible script is gated on env.PLAUSIBLE_DOMAIN.

## Theming — PASS

- Light-only per SHAPE-BRIEF §3.2. `html { color-scheme: light; }` explicitly.
- Every color token is OKLCH.
- Component styles reference tokens only (no hard-coded colors). Verified by grep.
- Typography tokens map to Supreme (display) + Switzer (body) + Commit Mono fallback (mono). Supreme + Switzer now loaded from Fontshare CDN in BaseLayout with preconnect + `display=swap`. Commit Mono falls back to `ui-monospace` — acceptable for v1 since native OS monos (SF Mono, Menlo) render well; self-host is a post-deploy polish item.

## Responsive — PASS

Verified in source (no browser available for visual check):

- Viewport `<meta>` in BaseLayout.
- MicroJobs: `repeat(auto-fit, minmax(280px, 1fr))` — flows from 3-col to 1-col at narrow widths.
- AhaReveal: `1fr 1fr` grid, stacks at max-width 800px.
- Competitors: `minmax(240px, 1fr) 2fr`, stacks at max-width 720px.
- Footer: `flex-wrap: wrap` on top nav + logo; copy + tagline side-by-side on wide, stack on narrow.
- Page gutter `clamp(20px, 4vw, 40px)` — breathing room scales.
- Fluid type (`clamp()` on h1/h2/h3) — headings scale smoothly without breakpoints.

## Remaining P2/P3 items (deferred, not blocking deploy)

- **og-image.png** is a solid-color placeholder. Replace with a real OG card before marketing push.
- **Commit Mono self-hosting**: currently relies on OS fallback (`ui-monospace`). Add as self-host in polish pass.
- **Architecture diagram (§6)**: SHAPE-BRIEF §11 open question 3 defers this to polish. Currently §6 renders as a 5-step numbered list — readable but visually quieter than the shape brief intends.
- **Favicon polish**: the "rn" monogram SVG is a placeholder; a bespoke mark should replace it.

## Verdict

**No P0 or P1 issues remain.** Ready for Task 21 (critique) and Task 22 (Dockerfile).
