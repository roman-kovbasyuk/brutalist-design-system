# SCRIPT — fast-track-norwegian / variant-b-karaoke

**Voice:** TBD (same voice as variant A recommended, for cross-campaign consistency — see `media-use` → `tts.md`)
**Voice settings:** stability ~0.35 · similarity ~0.75 · style ~0.35 (a touch more playful/casual than variant A — this is the "chatty" variant)
**Voice direction:** Conversational, unhurried, almost like texting a friend. This line does the heaviest lifting of the three scripts — let it breathe; the karaoke captions carry the energy visually.

---

## Line 1 — Hook (Frame 1)

**Time:** 0.0 – 3.0s
**Delivery:** Light, curious, trailing off slightly on "just...".

    Ever wanted to just... say what you think? In Norwegian?

## Line 2 — Karaoke body (Frame 2)

**Time:** 3.0 – 11.0s
**Delivery:** Building confidence across the line — start a little wry ("not memorize", "not rehearse"), land firm and warm on "like a local would."

    Not memorize it. Not rehearse it in your head for ten minutes. Just say it — like a local would.

## Line 3 — CTA (Frame 3)

**Time:** 11.0 – 15.0s
**Delivery:** Friendly close, slight upbeat lift on the code.

    Fast-Track Norwegian. 15% off with code FASTTRACK.

---

## To TTS

Feed each line to `npx hyperframes tts` per `media-use/audio/references/tts.md`. Line 2 is the
critical one to get word-timestamps right for — the karaoke caption effect depends on accurate
per-word timing, not just per-line. **Placeholder code `FASTTRACK` must be confirmed with the
client before this script is locked for final TTS.**
