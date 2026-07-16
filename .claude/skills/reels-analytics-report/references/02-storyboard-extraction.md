# Phase B — Storyboard Extraction

## Why download first

Instagram CDN URLs are short-lived. Download every video to `01-research/raw/<reel_id>.mp4`
immediately after Phase A, before doing anything else with it. All later steps (frame extraction,
audio transcription) work from that local file, never from the original CDN URL.

## Extracting the 14-frame storyboard

Run the bundled script once per reel:

```
python3 ${CLAUDE_SKILL_DIR}/scripts/extract_frames.py storyboard 01-research/raw/reel_01.mp4 /tmp/reel_01_storyboard.json
```

This produces exactly 14 frames at `t = 0.00, 0.75, 1.50, ... 9.75` seconds, each scaled to 320px
wide and JPEG-compressed, encoded as a `data:image/jpeg;base64,...` URI. Requires `ffmpeg` on PATH.

If a reel is shorter than 10 seconds, later timestamps will fail to extract — the script records an
`"error"` for those frames instead of crashing. Carry them through as missing (`dataUri: null`) in
the final `reel.json` rather than padding with duplicate frames.

## Merging into `reel.json`

Copy the `frames` array from the script's output into `reel.json`'s `storyboard` field, one object
per frame: `{"t": ..., "dataUri": ..., "caption": null}` — you'll fill `caption` in Phase C.

## Cover image

Use the same script's `single` mode at `t=0` (or an actor-provided cover image, converted to base64
the same way) for the card gallery's cover thumbnail — a slightly larger size is fine there
(`--width 480`).
