# Project status — Lingu / Fast-Track Norwegian

- **Client:** Lingu — product: Fast-Track Norwegian (language course)
- **Competitive research reference:** `@duolingo` (content/format benchmark only — NOT a visual reference; see `projects/duolingo/01-research/report.html`)
- **Brand source:** client-supplied Figma banner set (file `0cskZimr4ZevIRiPUaQ8I3`, section "FTO 15 off")
- **Created:** 2026-07-16
- **Last updated:** 2026-07-16
- **Locale:** English only (Norwegian deferred — noted as future extension)
- **3 approved video variants (all 1080×1920, all caption-mandatory, no live footage — motion graphics/animated schemas only):**
  1. `variant-a-proof-funnel` — "cashier" hook → animated stat → Listen/Repeat/Speak node schema → CTA (~18s)
  2. `variant-b-karaoke` — "neighbour" hook → full karaoke-caption body (near-static, mascot pulse) → CTA (~15s)
  3. `variant-c-schema` — "bus" hook → problem schema → rehook/transform schema → proof → CTA (~20s)

## Pipeline progress

| Stage | Status | Output | Notes |
|---|---|---|---|
| 1. Research (competitive reference) | done (external) | `projects/duolingo/01-research/report.html` | Duolingo Reels analysis reused as content/structure benchmark for this client — not re-run under this slug. |
| 2. Design (`design-strategist`) | done (3/3) | `02-design/variant-{a,b,c}-*/` | All 3 variants built and `hyperframes check`-clean. **variant-a-proof-funnel**: 4 scenes, 16.82s, real crossfades (alternating tracks, 0.3s overlap, incoming-only fade), animated 0→83% stat + "6 weeks" marker, Listen→Repeat→Speak node/connector schema. **variant-b-karaoke**: 3 scenes, 12.224s, full word-synced karaoke sweep + logo beat-pulse, near-zero scene motion by design. **variant-c-schema**: 5 scenes, 20.2s, true continuous morph (scattered→ordered) for the mid-video rehook. All 3: 0 lint/runtime/layout/motion errors, WCAG AA contrast pass, no live footage, captions burned in throughout, brand tokens applied verbatim, `FASTTRACK` placeholder code kept as instructed. |
| 3. Animate (orchestrator + HyperFrames skills) | done (draft pass) | `03-creatives/*.mp4` | Snapshot-reviewed all 3 (`hyperframes snapshot`); found and fixed a real bug in variant-a (karaoke word-scale animation caused adjacent active words to visually merge, e.g. "canfollow", "Norwegiantoday" — widened caption flex gap 12px→26px and reduced MAX_SCALE_BOOST 0.16→0.10 in `02-proof-stat.html`/`03-method-schema.html`/`04-cta.html`; re-verified clean with fresh snapshots + `hyperframes check`). All 3 rendered at **draft** quality into `03-creatives/`. Local review site running at `http://localhost:8081/` (index.html embeds all 3 videos + open-items notes). Final high-quality render pending client sign-off on the draft cut + the FASTTRACK code confirmation. |

Status values: `not started` / `in progress` / `blocked — <reason>` / `done`.

## Brand system extracted (2026-07-16)

- **Logo/assets frozen:** `.media/images/image_001.png` (spark mark), `image_002.png`/`image_003.png` (grid background texture), `image_004.png`/`image_005.png` (hero photography style reference), `image_006.svg` (secondary icon glyph) — provenance in `.media/manifest.jsonl`, human index in `.media/index.md`
- **Palette:** primary `#3A42FF`, secondary `#A5A8FF`, accent `#111AFA`, glass overlay `#0209BD`@24%, text `#FFFFFF` / `#060B13`
- **Type:** Inter (headline/body), Plus Jakarta Sans (CTA/UI), "Sweet Sucker Punch" (decorative numeral only)
- **Signature geometry:** fully-rounded pill chrome everywhere (label ~17px, promo panel ~34px, CTA button ~26px radius)
- **Formats confirmed in source:** 1200×628, 1200×1200, 1080×1920 (this last one is our animate-stage target)
- Full detail in `02-design/brand-brief.md`; machine-readable tokens in `02-design/brand-tokens.css`

## 3-variant plan (approved 2026-07-16)

- **variant-a-proof-funnel** — maps to @duolingo's brand-collab funnel pattern (hook→intro→key→objection→cta with explicit stats as proof). Frames: hook / animated count-up stat / Listen→Repeat→Speak node schema / CTA.
- **variant-b-karaoke** — maps to @duolingo's zero-motion "reaction + karaoke caption" pattern, cheapest to produce. Frames: hook / long karaoke-caption body (mascot beat-pulse only) / CTA.
- **variant-c-schema** — pure animated-diagram explainer with a genuine mid-video rehook (present in ~35% of @duolingo's top reels): problem schema → transform into the same Listen/Repeat/Speak schema as variant A → proof → CTA.
- All 3 share identical CTA chrome (promo pill panel) so they read as one campaign.
- Placeholder promo code `FASTTRACK` used in all 3 scripts — **must be confirmed with client before final render/TTS lock.**

## Blockers / open questions

- Two Figma layers (`dispersion glass` overlay, `Norway Flag` photo) are currently toggled invisible in the source frames inspected — confirm with client whether intentional before using them in the video.
- Figma file has no published team-library styles/variables (Enterprise-gated); palette/type were derived manually from node fills/text styles via REST rather than `hyperframes figma tokens` (that command found nothing to record). Fine for now — flagged in case of future re-import.
- Placeholder promo code `FASTTRACK` used across all 3 scripts — needs client confirmation before final TTS/render.

## Client review round 1 (2026-07-16)

- **variant-a-proof-funnel**: approved as-is → **re-rendered at `--quality high`, FINAL.**
- **variant-b-karaoke**: approved as-is → **re-rendered at `--quality high`, FINAL.**
- **variant-c-schema**: revision requested — typography reads weak, redundant gray caption bar duplicates on-screen text (and is the only caption during the diagram scenes), scattered "problem" diagram nodes are washed-out/low-contrast ("smeared"), elements too small / composition under-uses the 1080×1920 frame. `design-strategist` fixed: removed the duplicate gray bar from hook/proof/CTA scenes (one typographic voice per scene now); designed a proper on-brand caption treatment for the 2 diagram scenes (large Inter 800 headline-style text, anchored top, swaps in sync with the scatter→resolve morph instead of sitting as a disconnected utility bar); redesigned scattered "problem" nodes with real contrast (solid navy-blue fill instead of near-invisible translucent, heavier dash, brighter icons) so the before/after contrast actually reads; enlarged diagram pills (220×92→264×110) and rebalanced vertical spacing to use the full 1080×1920 frame instead of clustering in a thin middle band. Orchestrator re-verified visually via fresh snapshots (confirmed: no gray bar, single typographic voice, crisp high-contrast nodes, better space usage) + re-ran `npx hyperframes check` independently (0 errors, 15/15 WCAG AA) → **re-rendered at `--quality high`, FINAL.**

## Final deliverables

- Analytics report (competitive reference): `projects/duolingo/01-research/report.html`
- Brand brief: `projects/fast-track-norwegian/02-design/brand-brief.md`
- Brand tokens: `projects/fast-track-norwegian/02-design/brand-tokens.css`
- Storyboards/scripts: `02-design/variant-a-proof-funnel/`, `02-design/variant-b-karaoke/`, `02-design/variant-c-schema/`
- Rendered video(s) — **all 3 FINAL, high quality:**
  - `projects/fast-track-norwegian/03-creatives/variant-a-proof-funnel.mp4` (16.8s, 4.1MB)
  - `projects/fast-track-norwegian/03-creatives/variant-b-karaoke.mp4` (12.2s, 2.0MB)
  - `projects/fast-track-norwegian/03-creatives/variant-c-schema.mp4` (20.2s, 4.5MB) — revised per client feedback (round 1)
  - Local review page: `projects/fast-track-norwegian/03-creatives/index.html`, served at `http://localhost:8081/`
- **Open:** confirm real promo code (replacing placeholder `FASTTRACK`) across all 3 before public use. Otherwise pipeline complete.
