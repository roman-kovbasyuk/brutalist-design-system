---
format: 1080x1920
message: "Fast-Track Norwegian gets you understanding real conversations in weeks — here's the method and the proof."
arc: Hook → Proof (stat) → Method (schema) → CTA
audience: adult English-speaking learners of Norwegian, considering a paid course
mode: autonomous
---

## Frame 1 — Hook

- scene: Kinetic type punches in over the brand gradient; spark logo pulses once on the beat
- duration: 3.691s (actual generated VO length; visual slot holds to 3.991s so Frame 2 can crossfade over its tail)
- transition_in: cut
- status: built
- voiceover: "You know that moment... the cashier says something, and you just nod?"
- src: compositions/frames/01-hook.html

Cold open on the relatable, slightly embarrassing moment — mirrors the @duolingo research finding
that recognition/embarrassment-payoff hooks outperform feature-led hooks. No real footage: bold
headline typography over the `--gradient-brand` background, logo mark as the only "character".
Captions burned in, synced word-for-word to the voiceover.

## Frame 2 — Proof (animated stat)

- scene: A count-up statistic animates from 0% to 83% alongside a milestone timeline marker at "6 weeks"
- duration: 5.376s (actual generated VO length; visual slot runs 3.691s-9.367s so it can crossfade in over Frame 1's tail and hold for Frame 3's)
- transition_in: crossfade
- status: built
- voiceover: "83% of Fast-Track learners can follow a real conversation within 6 weeks."
- src: compositions/frames/02-proof-stat.html

Directly modeled on the research finding that Duolingo's brand-collab ads (the only reels with a
full hook→intro→key→objection→cta funnel) use explicit statistics as their proof point. Animated
number count-up (data-viz technique, no chart libraries needed — GSAP-driven digit tween) plus a
simple horizontal timeline bar filling to a "6 weeks" marker. Pill-radius chrome around the stat
card per brand tokens.

## Frame 3 — Method (animated schema)

- scene: Three nodes — "Listen", "Repeat", "Speak" — draw in left to right, connected by an animating line, each with a small icon
- duration: 3.328s (actual generated VO length; visual slot runs 9.067s-12.695s so it can crossfade in over Frame 2's tail and hold for Frame 4's)
- transition_in: crossfade
- status: built
- voiceover: "The method is simple: Listen. Repeat. Speak — for real."
- src: compositions/frames/03-method-schema.html

The animated-diagram requirement: a node-and-connector schema (not a literal product screenshot)
visualizing the course mechanic. Nodes reveal in sequence with a stagger, connector line draws
between them (SVG stroke-dashoffset or equivalent seek-safe technique), each node pulses once as
its word is spoken.

## Frame 4 — CTA

- scene: The brand promo pill (logo lockup + "15% off" + code + button) slides up into frame and settles
- duration: 4.416s (actual generated VO length; visual slot runs 12.395s-16.811s, crossfades in over Frame 3's tail; no trailing hold needed — final frame)
- transition_in: crossfade
- status: built
- voiceover: "Start Fast-Track Norwegian today — 15% off with code FASTTRACK."
- src: compositions/frames/04-cta.html

Reuses the exact promo-panel geometry extracted from the client's Figma banners (glass panel,
pill button, chevron icons) so the CTA is instantly recognizable as the same campaign as the
static banners. **`FASTTRACK` is a placeholder code — confirm the real promo code with the client
before final render.**

---

**Total duration: 16.811s** (real Kokoro-generated VO length across all 4 lines; supersedes the
original ~18s estimate — actual voice duration overrides the script's estimate per
`hyperframes-core/references/production-loop.md`). Captions mandatory throughout (burned-in,
word-synced karaoke sweep, `asr-keyword-glow` karaoke variant — timings are a deterministic
character-weighted split of each line's real generated audio duration; no local ASR engine was
available this session to derive them from an actual transcript alignment). No live-action footage
anywhere in this variant — hook typography, animated stat, animated node schema, CTA panel.
Crossfade transitions (Frames 2-4) are implemented via a 0.3s overlap: each outgoing frame's visual
slot holds 0.3s past its own VO, and the incoming frame — on the alternate track (1/2/1/2), later in
DOM order so it paints on top — fades itself in over that same 0.3s window. All 4 frames built;
`npx hyperframes check` run before handoff.
