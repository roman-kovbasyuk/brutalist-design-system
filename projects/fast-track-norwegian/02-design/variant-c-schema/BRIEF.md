---
workflow: general-video
flow: automation
storyboard: yes
message: "Your tangled attempt at a conversation becomes one clear path with Fast-Track Norwegian."
destination: reels
aspect: 1080x1920
language: en
length: 20s
angle: rehook-schema
---

## Intent

Variant C of three parallel Fast-Track Norwegian creatives (sibling variants: `variant-a-proof-funnel`,
`variant-b-karaoke`). Pure motion-graphics / animated-diagram treatment — no live-action footage
anywhere. Recreates the research-backed mid-video "rehook" pattern found in ~35% of top-performing
@duolingo reels (see `../../01-research/report.html`) as a literal diagram transformation: a scattered,
disconnected "problem" state untangles into the same clean three-node "Listen → Repeat → Speak"
schema used in variant A's Frame 3, so the two variants share one visual vocabulary. Tone: wry/anxious
on the problem beats, turning warm and confident the instant the rehook lands — the tonal turn IS the
rehook.

## Assets

- ../brand-tokens.css — brand palette/type/geometry/motion tokens, used verbatim (inlined into this
  composition's `:root`, not linked, for self-contained render).
- ../../.media/images/image_001.png — brand spark-mark logo; copied to `assets/images/logo-spark.png`
  for a self-contained project.
- STORYBOARD.md / SCRIPT.md (pre-approved, already present at project root before this build) — the
  confirmed 5-frame plan this composition implements exactly.

## Customizations

- Real TTS voiceover (local Kokoro engine, voice `af_sky` — casual/marketing register) generated per
  script line, since HeyGen sign-in was not available in this environment (see Notes).
- Burned-in word-synced captions across all 5 scenes/frame windows.
- True continuous morph for the Frame 2 -> Frame 3 rehook (see Notes) rather than the documented
  crossfade+snap fallback.

## Notes

- **Auth/offline note:** `npx hyperframes auth status` reported not signed in to HeyGen. Per the
  autonomous-flow gate, continued with the local Kokoro TTS engine (free, offline) instead of
  blocking. Flagging this to the user: signing in to HeyGen would unlock higher-quality voice options
  and native word-timestamps for future revisions.
- **Caption timing method:** local ASR (parakeet-mlx / whisper.cpp) was unavailable in this
  environment (`npx hyperframes transcribe` returned `whisper_unavailable`), so per-word caption
  timestamps are computed deterministically from each line's real generated audio duration via a
  char-length-weighted split (not forced alignment). This is precise enough for a first draft but
  should be replaced with real ASR-derived word timestamps once whisper.cpp/parakeet is available, or
  once HeyGen TTS (which returns native word timestamps) is used.
- **Promo code:** `FASTTRACK` is a known placeholder per SCRIPT.md — kept as-is, not invented.
- No live-action footage or photography anywhere (image_004/image_005 photo references deliberately
  unused) — every frame is motion graphics / animated diagrams per the hard requirement.
