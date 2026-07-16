# Phase D — Transcription + Sync

## Transcribing

Use the Apify MCP's discovery tools to find a transcription actor (e.g. search for "whisper
transcription" or "speech to text" via `search-actors`), then run it against the downloaded audio or
video file. Request per-segment timestamps, not just a flat transcript.

**Pin a known-good actor once you've found one:** replace this section with the exact actor ID/name
so future runs skip the discovery step.

Store the result on `reel.json`'s `transcript` field as an array of segments:

```json
[
  {"start": 0.0, "end": 1.8, "text": "..."},
  {"start": 1.8, "end": 4.2, "text": "..."}
]
```

Segments should be contiguous and non-overlapping where the source has continuous speech; gaps
(silence, music-only stretches) simply aren't covered by any segment — don't invent a segment to
fill a silent gap.

## Syncing to storyboard frames

For each storyboard frame at time `t`, the transcript segment where `segment.start <= t <
segment.end` is what's spoken there. This lookup is mechanical — the report's own JavaScript does it
live from the `transcript` array, so you don't need to write the match into `reel.json` yourself.
You only need `storyboard[].t` and `transcript[].start`/`end` to both be accurate; the report handles
the rest.

If a frame's timestamp falls in a gap with no covering segment, the report displays "без речи /
только визуал или музыка" automatically — no extra field needed.
