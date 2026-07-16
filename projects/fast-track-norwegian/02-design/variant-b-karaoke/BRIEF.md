---
workflow: product-launch-video
flow: automation
storyboard: no
message: "Speaking Norwegian for real doesn't need rehearsal — just Fast-Track and say it."
destination: instagram-reels
aspect: 1080x1920
language: en
audience: adult English-speaking learners of Norwegian, scrolling fast, low patience for a hard sell
length: 12.2s
angle: zero-motion karaoke-caption format (variant B of a 3-variant campaign)
style_preset: brand-tokens-direct
voice: kokoro-af_sky
---

## Intent

Client Lingu, product Fast-Track Norwegian (Norwegian language course). This is
**variant B ("karaoke")** of a 3-variant paid social campaign — siblings
`variant-a-proof-funnel` and `variant-c-schema` are built in parallel by other agents
against the same brand tokens, so this variant must read as the same campaign, not a
one-off. The creative concept, frame count, timing, and voiceover script were already
decided and approved before this build (`STORYBOARD.md` / `SCRIPT.md`, pre-existing) —
this run executes that locked plan rather than re-deriving it.

Structural evidence this variant is built on (from `projects/duolingo/01-research/report.html`
and this client's `brand-brief.md` "Notes from research" section): low-production,
zero-scene-motion "reaction image + karaoke caption" reels are @duolingo's cheapest and
most repeatable high-performing format — the caption animation alone carries the video,
with no cuts or scene changes needed. This variant recreates that exact structural pattern
but in Fast-Track Norwegian's own brand gradient/typography instead of a stock reaction
photo, keeping the account's own copy pattern (concrete social payoff, not curriculum
features) and its pill-radius / royal-blue visual identity from `brand-brief.md` +
`brand-tokens.css` (sourced from the client's Figma banner set).

Tone: conversational, unhurried, a little cheeky — "texting a friend," per `SCRIPT.md`
voice direction. No live-action footage anywhere; motion graphics / kinetic typography only.

## Assets

- projects/fast-track-norwegian/02-design/brand-tokens.css — brand color/type/geometry tokens, used verbatim (no new colors/fonts/shapes invented)
- projects/fast-track-norwegian/02-design/brand-brief.md — full brand system + UI chrome geometry spec
- projects/fast-track-norwegian/.media/images/image_001.png — spark logo mark (4-point star, blue→teal→white gradient), used as-is inside the brand blue label pill
- projects/fast-track-norwegian/02-design/variant-b-karaoke/STORYBOARD.md — pre-approved 3-frame plan (locked, not redesigned by this run)
- projects/fast-track-norwegian/02-design/variant-b-karaoke/SCRIPT.md — pre-approved voiceover script (locked; promo code `FASTTRACK` is a known placeholder, kept as-is)

## Customizations

- Word-by-word karaoke caption effect is the mandatory centerpiece of Frame 2 (full-screen,
  one word/phrase highlighted at a time, synced to real TTS word timestamps) — not a
  generic caption bar.
- Spark logo mark pulses gently only on stressed words in Frame 2; otherwise the frame has
  zero scene motion (deliberate minimalism — the point of this variant per the research).
- CTA chrome (label pill, glass promo panel, pill CTA button) must match the shared brand
  geometry so this variant reads as the same campaign as variant-a and variant-c.

## Notes

- No site URL / no-capture mode: this is a script-driven promo, not a site tour.
- No live-action footage or photography anywhere in this variant.
- `mode: autonomous` per the pre-existing STORYBOARD.md frontmatter — proceeding through
  all steps without user checkpoints; heads-up summary substitutes for the live-board review.
- Brand tokens were extracted from the client's own Figma file, not the marketing-design
  skill's generic placeholders — no `[PLACEHOLDER` text should remain anywhere in this build.
- **Audio provenance:** no HeyGen credential was signed in and this machine has no
  whisper-cpp/cmake toolchain, so the standard `audio.mjs` engine could synthesize voice
  (Kokoro, local) but not word-level timestamps (`transcribeWav` returned `whisper_unavailable`).
  Word timings that Frame 2's karaoke effect depends on were produced instead via a local
  `faster-whisper` (`small.en`) pass over each Kokoro-synthesized line, hand-merged back onto
  the script's exact wording (e.g. STT's "10"/"15"+"%"/"FastTrack" normalized back to "ten" /
  "15%" / "Fast-Track" / "FASTTRACK"). `assets/voice/0{1,2,3}.wav` and `audio_meta.json` are
  the authoritative, already-correct outputs — resuming this project on a machine with
  HeyGen or whisper-cpp available does not need to regenerate them.
