---
format: 1080x1920
message: "Your tangled attempt at a conversation becomes one clear path with Fast-Track Norwegian."
arc: Hook (problem) → Problem schema → Rehook / transform → Proof → CTA
audience: adult English-speaking learners of Norwegian who've frozen up mid-conversation before
mode: autonomous
---

## Frame 1 — Hook

- scene: Headline sets the scene; a tangle of scattered word-fragments and question marks begins forming in the frame
- duration: 4s
- transition_in: cut
- status: built
- voiceover: "Your brain, trying to start a conversation on the bus:"
- src: index.html #scene-hook (0.0-4.0s) — monolithic build, see Notes below

Reframes the "bus" concept from the source banners as an internal, relatable moment rather than a
literal scene — sets up the diagram payoff that follows. No live footage; the "bus" is implied by
copy only, never shown literally.

## Frame 2 — Problem schema

- scene: Disconnected nodes (word-fragments, a question mark, a stalled arrow) jitter and drift with no clear connections between them
- duration: 5s
- transition_in: crossfade
- status: built
- voiceover: "Words everywhere. No order. No confidence."
- src: index.html #diagram-stage, scatter phase (4.0-9.2s) — merged with Frame 3 into one
  persistent DOM so the untangle is a true continuous morph, not separate files

The animated-diagram treatment of "confusion": scattered nodes with broken/dashed connectors,
subtle idle jitter (small, seek-safe looped-looking motion built from finite keyframes — no
`repeat:-1`). This is the "before" state the rehook resolves in Frame 3.

## Frame 3 — Rehook / transform

- scene: The scattered nodes from Frame 2 animate into the same clean "Listen → Repeat → Speak" schema used in variant A, snapping into an ordered line-connected path
- duration: 5s
- transition_in: morph (persistent nodes re-animate position/opacity from Frame 2's state — see note below)
- status: built
- voiceover: "Fast-Track Norwegian untangles it — one clear path at a time."
- src: index.html #diagram-stage, resolve phase (9.2-14.0s) — TRUE MORPH achieved: the same
  three `.dnode` elements from Frame 2's scatter tween their x/y/rotation to the ordered
  Listen-Repeat-Speak slots on the SAME persistent DOM (one shared timeline, no file
  boundary) — the documented crossfade+snap fallback was not needed

This is the research-backed **mid-video rehook** (present in ~35% of the top-performing @duolingo
reels) — a genuine turn, not just a scene change. Reuses the same three-node "Listen/Repeat/Speak"
vocabulary as variant A's Frame 3 so the two variants share a visual grammar even though the path
into it differs. If a literal continuous morph between Frame 2 and Frame 3 proves complex to author
safely, a fast crossfade + snap-into-place is an acceptable fallback — flag this choice to the user
during the animation refinement pass rather than silently downgrading it.

## Frame 4 — Proof

- scene: A checkmark draws in next to a short stat line
- duration: 3s
- transition_in: crossfade
- status: built
- voiceover: "Real conversations, in weeks — not years."
- src: index.html #scene-proof (14.0-17.0s)

Short, punchy proof beat — deliberately lighter-weight than variant A's full stat treatment (this
variant's proof is more about the emotional "not years" payoff than a specific number).

## Frame 5 — CTA

- scene: Same promo pill panel as variants A and B slides in and settles
- duration: 3s
- transition_in: crossfade
- status: built
- voiceover: "15% off with code FASTTRACK — start today."
- src: index.html #scene-cta (17.0-20.2s)

Identical CTA chrome to the other two variants. **`FASTTRACK` is a placeholder code — confirm the
real promo code with the client before final render.**

---

**Total duration: ~20s** — the longest and most demanding variant (5 frames, a rehook transform).
Captions mandatory throughout. No live-action footage anywhere — this variant is diagram-driven
front to back, the purest expression of the "animated schemes" requirement.

## Build notes (as implemented)

- **Architecture:** one monolithic `index.html` (no `compositions/` split). Frames 2 and 3 share a
  single persistent `#diagram-stage` DOM block so the rehook is a **true continuous morph** — the
  same three `.dnode` elements scatter, idle-jitter, then tween position/rotation into the ordered
  schema — rather than the documented crossfade+snap fallback across a file boundary. Frames 1, 4,
  5 crossfade in/out via concurrent opacity tweens on one shared paused GSAP timeline
  (`window.__timelines["main"]`).
- **Actual timing:** Hook 0-4.0s · Problem-scatter 4.0-9.2s · Transform-resolve 9.2-14.0s · Proof
  14.0-17.0s · CTA 17.0-20.2s (root `data-duration="20.2"`).
- **Voiceover:** real TTS via local Kokoro (`af_sky`), one `.wav` per script line at
  `.media/audio/voice/l1..l5.wav`, mounted as root-level `<audio>` clips. HeyGen sign-in was not
  available in this environment (offline autonomous fallback, per gate policy).
- **Captions:** burned in, one line per scene window, per-word color-highlight sync. Word
  timestamps are a deterministic char-length-weighted split of each line's real measured audio
  duration (local ASR/whisper was unavailable to derive true forced-alignment timestamps) — precise
  enough for a first draft; replace with real ASR word timestamps or HeyGen's native timestamps on
  a follow-up pass.
- **Verification:** `npx hyperframes check` passes clean — 0 lint errors (1 non-blocking
  `composition_file_too_large` info-level warning, accepted given the merge-for-true-morph
  requirement), 0 runtime errors, 0 layout issues (9 samples), 0 motion errors, 52/52 contrast
  checks pass WCAG AA.
