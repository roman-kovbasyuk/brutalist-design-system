# SCRIPT — fast-track-norwegian / variant-c-schema

**Voice:** TBD (same voice as variants A/B recommended, for cross-campaign consistency — see `media-use` → `tts.md`)
**Voice settings:** stability ~0.4 · similarity ~0.75 · style ~0.3
**Voice direction:** Starts a little anxious/wry on the problem beats, turns warm and assured the moment the rehook lands ("Fast-Track Norwegian untangles it"). The tonal shift IS the rehook — deliver it as a genuine turn, not a flat read.

---

## Line 1 — Hook (Frame 1)

**Time:** 0.0 – 4.0s
**Delivery:** Wry, self-aware, slightly anxious.

    Your brain, trying to start a conversation on the bus:

## Line 2 — Problem schema (Frame 2)

**Time:** 4.0 – 9.0s
**Delivery:** Clipped, a little overwhelmed — short fragments, not a flowing sentence.

    Words everywhere. No order. No confidence.

## Line 3 — Rehook / transform (Frame 3)

**Time:** 9.0 – 14.0s
**Delivery:** The turn. Warm, confident, resolving — this line should sound like relief.

    Fast-Track Norwegian untangles it — one clear path at a time.

## Line 4 — Proof (Frame 4)

**Time:** 14.0 – 17.0s
**Delivery:** Light and quick, upbeat.

    Real conversations, in weeks — not years.

## Line 5 — CTA (Frame 5)

**Time:** 17.0 – 20.0s
**Delivery:** Friendly close, matches variants A/B's CTA energy.

    15% off with code FASTTRACK — start today.

---

## To TTS

Feed each line to `npx hyperframes tts` per `media-use/audio/references/tts.md`. The tonal shift
between Line 2 and Line 3 is the whole rehook — if the TTS voice can't deliver it convincingly,
flag that to the user rather than smoothing it into a flat read. **Placeholder code `FASTTRACK`
must be confirmed with the client before this script is locked for final TTS.**
