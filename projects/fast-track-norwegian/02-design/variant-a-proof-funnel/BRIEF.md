---
workflow: general-video
flow: automation
storyboard: yes
message: "Fast-Track Norwegian gets you understanding real conversations in weeks — here's the proof and the method."
destination: instagram-reels
aspect: 1080x1920
language: en
length: 17s
angle: proof-funnel
---

## Intent

Client: Lingu — product: Fast-Track Norwegian. This is variant A of three pre-approved creative
concepts for the same campaign ("proof-funnel"), built to a plan already confirmed with the client
(`STORYBOARD.md` / `SCRIPT.md` in this folder — treat as locked, not a draft to redesign).

Structure: Hook (relatable/embarrassing moment) → Proof (animated stat) → Method (animated
node-and-connector schema) → CTA (promo pill). Grounded in the @duolingo competitive research
(`projects/duolingo/01-research/report.html`): relatable/embarrassment-payoff hooks outperform
feature-led hooks for this audience, and the account's brand-collab top reels use a fuller
hook→intro→key→objection→cta funnel with an explicit statistic as the proof beat — which is exactly
what Frames 1-2 of this variant reproduce.

Voice: direct, encouraging, conversational, a little cheeky — a friendly local, not a classroom
textbook (per `../brand-brief.md`).

No live-action footage or photography anywhere in this variant — every frame is motion graphics /
kinetic typography / animated diagrams only. Burned-in, word-synced captions are mandatory
throughout (via real local TTS + ASR word timestamps, not estimated timing). Must share the exact
brand tokens (gradient, pill radii, logo, type) with sibling variants B (karaoke) and C (schema)
being built in parallel — no improvised new colors/fonts/shapes.

## Assets

- `../brand-tokens.css` — palette, gradient, pill-radius geometry, type stack (source of truth,
  used verbatim).
- `../brand-brief.md` — voice, imagery constraints, promo-panel geometry reference.
- `../../.media/images/image_001.png` — brand spark-mark logo (66×66, star gradient blue→teal→white).
  Used for the hook's pulsing mark and the CTA lockup pill.
- `../../.media/images/image_006.svg` — secondary monochrome glyph lockup (66×27). Not used in this
  variant's 4 frames (no natural slot); available for future extension.
- `../../.media/images/image_002.png`, `image_003.png` — inspected and found to be blank Figma
  canvas exports (dot-grid, no content) — excluded.
- `../../.media/images/image_004.png`, `image_005.png` — hero photography style reference —
  excluded per the no-live-action/no-photography constraint.
- `projects/duolingo/01-research/report.html` — competitive research (structure/timing reference
  only, not a visual reference).

## Customizations

- Frame 2 stat count-up: `counting-dynamic-scale` (0→83%) paired with `stat-bars-and-fills` progress
  fill for the "6 weeks" milestone bar (`hyperframes-animation` blueprint `dataviz-countup`, Adapt
  posture).
- Frame 3 node schema: `spring-pop-entrance` for each node pop + hand-authored inline SVG icons
  (Listen/Repeat/Speak) + `svg-path-draw` for the connector stroke-dashoffset draw-in between nodes
  (Compose — no blueprint covers a bespoke node-and-connector diagram).
- Frame 4 CTA: a custom slide-up + staggered-settle promo panel (Compose), closed by an
  `ambient-glow-bloom`-style single glow pulse behind the CTA button.
- Captions: `asr-keyword-glow`, karaoke variant, driven by per-word timings (see Notes on how those
  timings were derived).

## Notes

- Voiceover audio for all 4 lines already existed on disk at session start (`assets/audio/line1-hook.wav`
  … `line4-cta.wav`, real Kokoro-generated local TTS). **No local ASR engine was available this
  session** (`npx hyperframes doctor` showed `whisper-cpp` not installed, and `npx hyperframes auth
  status` showed no HeyGen/ElevenLabs credential), so word-level caption timings were **not** derived
  from a real transcript alignment. Instead they were computed deterministically from each line's
  known script text + real audio duration via a character-weighted proportional split (baked as a
  static per-scene `TIMINGS`/`WORDS` array in each scene's `<script>`, never computed at render time
  — so it stays fully seek-safe/deterministic). This is a reasonable approximation for these short,
  simple lines, but is **not** ASR ground truth — re-verify against the actual rendered audio (or
  regenerate via `whisper-cpp`/HeyGen once available) before this ships for client sign-off. Actual
  line durations used to true up scene timing: 3.691s / 5.376s / 3.328s / 4.416s (total 16.811s,
  root padded to 16.82s) vs. the script's ~18s estimate; per `production-loop.md`, real voice
  duration overrides the storyboard's estimated per-frame timing — updated in `STORYBOARD.md`.
- Promo code `FASTTRACK` is a confirmed placeholder — kept as-is per instruction, not invented.
- The brand's decorative flourish font "Sweet Sucker Punch" is not a bundled HyperFrames family and
  not a real Google Font (a `fonts.googleapis.com` lookup 400'd), so it could not be self-hosted this
  session either. Rather than silently falling back to a generic `cursive` stack, the oversized "15%"
  numeral in Frame 4 is set in the brand's own **Plus Jakarta Sans at weight 800**, with the same
  37%→100% white opacity-gradient fill `brand-brief.md` specifies (via `background-clip: text`) —
  preserves the intended visual effect on-brand rather than falling back off-brand. Flag for the
  client: swap in the real licensed "Sweet Sucker Punch" font file when available.
- **Plus Jakarta Sans** (the brand's real display/UI typeface) is not in HyperFrames' pre-bundled font
  set, so it was downloaded once from Google Fonts (weights 400/600/700) and self-hosted at
  `assets/fonts/PlusJakartaSans-*.ttf` with `@font-face` in `index.html` — this avoids any
  render-time network dependency for a font that's genuine client brand truth (not a generic AI
  default the typography skill would otherwise flag).
- Brand tokens are otherwise complete (not placeholder) — this is real client brand data extracted
  from Figma, not the marketing-design skill's generic defaults.
