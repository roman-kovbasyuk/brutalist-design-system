# Phase C — Hook Analysis

For each of the 14 storyboard frames, look at the actual image and write a caption object:

```json
{
  "scene": "short description of the scene, shot size, who/what is in focus",
  "onScreenText": "verbatim text burned into the frame, or empty string if none",
  "technique": "one retention technique label — see taxonomy below"
}
```

Store it back onto that frame's `caption` field in `reel.json`.

## Retention technique taxonomy

Pick the single most prominent one per frame — don't stack multiple labels:

- `intrigue` — visual or textual open loop that promises information later
- `cut-off-phrase` — speech or on-screen text cuts off mid-sentence
- `hard-cut` — abrupt scene change vs. the previous frame, breaking rhythm on purpose
- `close-up-face` — tight shot on a face/expression
- `question-to-viewer` — direct question posed to camera or in text
- `movement` — deliberate camera or subject motion designed to catch the eye
- `shock-frame` — visually surprising or high-contrast image
- `text-hook` — the on-screen text itself is doing the work (bold claim, number, etc.)
- `none-static` — nothing notable; a low-information/transition frame

## Per-reel hook verdict

After captioning all 14 frames, write one `hookVerdict` string (1-2 sentences) onto `reel.json`
explaining, in plain terms, *why* this hook works — referencing the specific techniques used and
their sequence, not generic praise. Example: "Opens on a close-up shocked face (0.00s) before
cutting hard to bold on-screen text mid-claim at 1.50s — the face creates curiosity, the cut-off
claim forces watching for the payoff."

If a reel's hook is weak or unclear, say so plainly — the report is only useful if verdicts are honest.
