---
format: 1080x1920
message: "Speaking Norwegian for real doesn't need rehearsal — just Fast-Track and say it."
arc: Hook → Karaoke body (the whole message) → CTA
audience: adult English-speaking learners of Norwegian, scrolling fast, low patience for a hard sell
mode: autonomous
music: none
---

## Video direction

- **Palette** (from `frame.md`): brand diagonal gradient `135deg, #3A42FF → #A5A8FF` full-bleed on
  every frame, same direction throughout for continuity. Text white (`#FFFFFF`); CTA button white
  fill / near-black text (`#060B13`); promo panel `#0209BD` glass at 24% opacity. Pill radius
  (label/panel/button) on every UI element — never a sharp corner.
- **Motion grammar + reveal model**: each frame gets exactly ONE entrance beat (or, in Frame 2, one
  continuous per-word beat), then settles to a held read — `power2.out` / `back.out(1.5)` per
  `frame.md`'s motion tokens, never bouncy overshoot beyond that. This is the deliberate opposite
  of the usual VO-paced multi-element reveal: the research pattern this variant recreates
  (`@duolingo`'s "reaction image + karaoke caption" format) is carried entirely by the caption
  animation, so Frames 1 and 3 intentionally have almost no motion budget at all, and Frame 2's
  entire motion budget is the word-by-word karaoke highlight + the logo's beat-pulse.
- **Rhythm / held-frame allocation**: Frame 1 and Frame 3 are held frames — one small entrance,
  then dead static to the end of their window. Frame 2 is the one continuously-live frame in the
  video (the per-word highlight sweep never stops until its last word lands, then it also holds).
- **Negative list**: no live-action footage or photography anywhere; no camera pans/zooms/parallax
  on any frame; no second background hue outside the blue/periwinkle family; no sharp corners; no
  front-loaded-then-frozen dumps (each frame's single beat IS the whole reveal, not a truncated
  multi-element one); no idle "breathing"/drift added just to seem alive — stillness is correct.

## Frame 1 — Hook

- scene: Bold caption punches in over an almost-static brand gradient; spark logo sits still, no motion yet
- duration: 3.2s
- transition_in: cut
- status: animated
- voiceover: "Ever wanted to just... say what you think? In Norwegian?"
- src: compositions/frames/01-hook.html
- asset_candidates: assets/image_001.png — spark logo mark, static, no motion this frame
- blueprint: kinetic-type-beats (Adapt)
- focal: assets/image_001.png
- roles: image_001.png = supporting (small, top-of-frame, static)

Mirrors the @duolingo research's cheapest-to-produce, most-repeatable pattern: a near-static
"reaction" frame carried entirely by caption typography and music, not by scene changes. Headline
sets up the "neighbour" concept (tell someone your opinion) without yet showing the payoff.

Adapt: keep kinetic-type-beats' in-place hard-cut token swap as the signature move; one clause
swap, not an escalating multi-beat build (this frame's whole VO is short and conversational, not
an escalating claim).

Scene 1 (0.0–0.3s): brand gradient full-bleed ground present from t=0 (static). Label pill (spark
logo + small wordmark) hard-cuts in at top, ~10% of frame — Centered-top, static from the instant
it appears.
Scene 2 (0.3–1.5s): as the VO says "Ever wanted to just...", the first clause hard-cuts (flash, no
fade/slide) into the center of the content area, ending on the trailing ellipsis — Centered,
~45% of frame, one heavy line.
Scene 3 (1.5–3.0s): as the VO reaches "say what you think? In Norwegian?", the line swaps in place
(discrete-text-sequence state swap, same position/size) to the full question and holds static to
the end of the frame — no further motion, held read.

## Frame 2 — Karaoke body

- scene: Full-screen word-by-word karaoke captions (one word/phrase highlighted at a time, matching the source pattern of burned-in bilingual lyric captions); spark mascot pulses gently on each stressed word, otherwise the frame does not change
- duration: 5.333s
- transition_in: crossfade
- status: animated
- voiceover: "Not memorize it. Not rehearse it in your head for ten minutes. Just say it — like a local would."
- src: compositions/frames/02-karaoke-body.html
- asset_candidates: assets/image_001.png — spark logo mark, the only element that moves, beat-pulse on stressed words
- blueprint: compose (karaoke word-highlight is a bespoke discrete-per-word reveal, not a stock blueprint — see discrete-text-sequence / asr-keyword-glow rule recipes)
- focal: assets/image_001.png
- roles: image_001.png = supporting (small, top-of-frame, pulses on stressed words only)

This is the format's whole point: **zero scene changes, the caption animation IS the motion.**
Directly recreates Duolingo's lowest-production, highest-repeatability format (their reels with
literally zero visual motion beyond captions) but executed in Fast-Track Norwegian's own brand
gradient/typography instead of a stock reaction image. The spark logo's beat-synced pulse is the
only other moving element — keeps interest without adding production cost.

Compose: no stock blueprint fits a full-screen per-word karaoke sweep timed to real TTS word
timestamps — built from the motion vocabulary directly (per-word discrete opacity/scale state,
`discrete-text-sequence` + `asr-keyword-glow`-style keyword emphasis, statically timed rather than
live-ASR-driven since the words and their timestamps are already known from TTS).

Scene 1 (0.0s): brand gradient ground continues from Frame 1 (crossfade transition_in already
carries this). Label pill (logo + wordmark) sits small and static at top, ~10% of frame — same
position as Frame 1, never moves again. The full sentence's words are laid out center-frame,
wrapped naturally across 2–3 lines, ALL at rest state (~38% opacity, no scale) — nothing is
"spoken" yet.
Scene 2 (0.0–5.28s, continuous, one phase per word): each word's opacity/scale animates from rest
(~38%, 1.0×) to active (100%, ~1.06×) exactly at its real TTS word-timestamp start (from
`audio_meta.json` frame 2 `words[]` — real Whisper-aligned timestamps, not estimates), and settles
to a "read" state (~70% opacity, 1.0× scale) once the next word activates — a left-to-right
karaoke highlight sweep across the static text field, Centered, ~60% of frame. On the sentence's
stressed words ("memorize" 0.26–0.8s, "rehearse" 1.52–1.92s, "say" 3.98–4.24s, "local" 4.74–5.0s)
the spark logo additionally pulses (scale 1.0→1.12→1.0 + brief glow) in sync, its only motion in
the entire video.
Scene 3 (5.0–5.483s): final word "would." lands active and holds fully lit to the end of the
frame — held read, no further motion.

## Frame 3 — CTA

- scene: Same promo pill panel as the other two variants slides in and settles, holds to end
- duration: 3.691s
- transition_in: crossfade
- status: animated
- voiceover: "Fast-Track Norwegian. 15% off with code FASTTRACK."
- src: compositions/frames/03-cta.html
- asset_candidates: assets/image_001.png — spark logo mark, inside the brand-blue label pill
- blueprint: logo-assemble-lockup (Adapt)
- focal: assets/image_001.png
- roles: image_001.png = cutout (inside label pill lockup)

Identical CTA chrome/geometry to variant A and C — this is what makes all three read as one
campaign rather than three unrelated experiments. **`FASTTRACK` is a placeholder code — confirm
the real promo code with the client before final render.**

Adapt: keep logo-assemble-lockup's signature "elements settle into the fixed lockup" move; a
single glass promo panel rather than a full multi-element assemble (matches this variant's
near-zero-motion budget).

Scene 1 (0.0–0.8s): brand gradient ground present (crossfade continues from Frame 2). As the VO
opens "Fast-Track Norwegian.", the label pill (logo + full wordmark) settles into place top-center
via one springy scale/slide-down entrance (`back.out(1.5)`) — Centered-top, ~15% of frame.
Scene 2 (0.8–2.0s): as the VO says "15% off", the glass promo panel (`#0209BD` @24%, pill-radius)
scales/slides up from below center and settles, revealing "15% off" (Plus Jakarta Sans 700; the
brand's decorative flourish face is unavailable locally — see `frame.md` known gaps) — Centered,
~55% of frame.
Scene 3 (2.0–3.2s): as the VO reaches "with code FASTTRACK", the "with code FASTTRACK" caption line
and the white CTA pill-button (dark text, chevrons) fade/slide in beneath the price line, inside
the same panel — same centered column.
Scene 4 (3.2–4.0s): everything holds static to the end of the frame — settle-and-hold, no further
motion; this is the video's final frame.

---

**Total duration: 12.224s** (real TTS-timed: 3.2s + 5.333s + 3.691s, tiled with two 0.5s
crossfades) — shorter than the original ~15s estimate now that it's built against actual voice
timing rather than a guess; still the shortest and cheapest of the three to render (only 3 frames,
one of them a long static-ish hold). Captions mandatory and are the primary carrier of meaning in
Frame 2. No live-action footage anywhere in this variant.
