# Phase E — Structure Segmentation

Reason over the whole reel (video + transcript together) and divide it into up to six blocks. Store
them on `reel.json`'s `structure` field as an array, one entry per block type — **always include all
six block keys**, even when absent:

```json
{"block": "hook", "present": true, "start": 0.0, "end": 2.5, "summary": "...", "frame": {"dataUri": "..."}}
{"block": "rehook", "present": false, "note": "рехук отсутствует"}
```

## Block definitions

| Block | Definition |
|---|---|
| `hook` | First seconds — whatever grabs attention before any promise is made. Usually overlaps the storyboard window. |
| `intro` | The promise/context: what this video is about, what the viewer gets. |
| `key` | The core value — the main payoff/demonstration/content. |
| `rehook` | A second attention-catch mid-video (open loop, "and then...", a tempo change). Only mark present if there's a genuine second catch, not just a scene change. |
| `objection` | Proof / social proof / result demonstration that handles skepticism. |
| `cta` | The explicit ask — subscribe, comment, link in bio, etc. |

## Rules

- Timecodes must be within `[0, durationSec]`; blocks shouldn't overlap (one ends where the next
  begins), though gaps are fine if a stretch belongs to no block.
- `summary` is one line — the essence of that block, not a transcript dump.
- For any block whose `start >= 10` (outside the storyboard window), extract one representative
  frame with `python3 ${CLAUDE_SKILL_DIR}/scripts/extract_frames.py single <video> <timestamp>
  <out.json>` at a timestamp inside the block, and put its `dataUri` on `frame.dataUri`.
- **Never invent a block that isn't really there.** If a reel has no rehook, no objection-handling,
  or no explicit CTA, set `"present": false` and a short `note` explaining what's missing instead of
  fabricating a timestamp. An honest "absent" is more valuable than a made-up one.
