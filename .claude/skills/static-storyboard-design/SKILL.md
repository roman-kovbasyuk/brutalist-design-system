---
name: static-storyboard-design
description: Turns video-pipeline research into a static storyboard — one designed static frame per structural block (hook/intro/key/rehook/objection/cta), no animation, no HyperFrames — rendered as HTML/PNG in a layout that imports cleanly into Figma for human review. Use for the video pipeline's design stage (design-strategist) instead of drafting a HyperFrames composition.
---

# Static Storyboard Design

Produces the video pipeline's design-stage deliverable: a **static storyboard**, not a draft video.
Each structural block the research found (hook, intro, key, rehook, objection, cta — whichever are
actually present) gets one fully-designed static frame at the target video aspect ratio. No motion,
no timeline, no HyperFrames — this is deliberately the same "single frame, real HTML/CSS, headless-
browser screenshot" discipline as `static-banner-design`, applied to a sequence of scenes instead of
one ad. Animation only happens later, in `video-animator`, after a human has reviewed and adjusted
this storyboard in Figma.

## Why no HyperFrames here

A first-draft HyperFrames composition locks in motion decisions before a human has even seen the
static design — expensive to revise and hard for a non-technical marketer to review. A static
storyboard is reviewable by anyone in Figma, cheap to iterate on, and gives `video-animator` a
locked, human-approved visual target to animate *toward* instead of *from scratch*. Don't invoke the
`hyperframes` skill, `hyperframes-core`, or any `npx hyperframes` command from this workflow.

## Scene taxonomy (reuse the research's own vocabulary)

Pull the block list straight from the research's structural formula — don't invent scenes the
account's own data doesn't support:

| Block | Purpose |
|---|---|
| `hook` | First seconds, stops the scroll |
| `intro` | Promise/context |
| `key` | Core value/payoff (often needs 2-3 frames if the research shows multiple key moments) |
| `rehook` | Mid-roll re-catch — only if the research formula shows top content actually uses one |
| `objection` | Proof, social proof, results |
| `cta` | The ask |

Mark any block the research shows as consistently absent as skipped — don't pad the storyboard to
hit six scenes if the evidence says five.

## Author each scene as a real static frame

Same discipline as `static-banner-design`: exact pixel canvas at the target aspect ratio (default
1080×1920 for Reels/Shorts/TikTok unless the brief says otherwise), real brand tokens, real copy —
never `[PLACEHOLDER` text in a shipped draft. Full grammar for how scenes assemble into one
storyboard strip (critical — read before authoring):
[references/scene-grammar.md](references/scene-grammar.md).

## Write a director note per scene

Below each frame, write one short **director note** describing the intended motion for that scene —
not on-screen copy, motion intent for whoever animates it later. Use the shared note-verb vocabulary
in [references/scene-grammar.md](references/scene-grammar.md) (`EXPLOSION/BURST`, `SLIDES...`,
`MORPH/REVEALS`, `CYCLE THROUGH...`, or a plain sentence if none fit) — this vocabulary is the same
one the `figma` skill's storyboard-import phase already parses, so writing in it now means
`video-animator` can read your intent mechanically later instead of re-guessing it.

## Render and assemble

Render every scene frame individually (`npx playwright screenshot`, exact `--viewport-size`) and
also render the whole strip as one wide contact-sheet PNG for fast human review. Full render/self-
check commands: [references/scene-grammar.md](references/scene-grammar.md).

## Hand off for Figma import — you do not push to Figma yourself

Nothing in this system can write to Figma (confirmed against the `figma` skill's own read-only
design — see its `SKILL.md` auth section). Your job ends at a clean, Figma-import-ready HTML/PNG
storyboard plus a plain-language handoff note. Tell the human exactly what to do next:

1. Open the storyboard strip HTML (or each scene's HTML) and import it into a Figma file — the
   official **html.to.design** Figma plugin is the standard path; paste the local HTML or its
   rendered contact-sheet PNG as visual reference if the plugin route isn't available.
2. Arrange (or confirm) the scenes as frame-sized nodes inside one Figma **SECTION**, left-to-right
   in scene order, with each director-note text sitting below its scene, matching the layout you
   already built — this is exactly the grammar `figma` skill's storyboard-import phase expects, so
   getting the arrangement right here saves rework later.
3. Edit whatever needs editing, then share the file/section link back.

Write this handoff note to `<output>/figma-handoff.md` (URL/status fields left blank for the human
or the orchestrator to fill in once the link comes back) — this is the record Stage 3 (the human
checkpoint) resolves against.

## Do / Don't

- Do keep every scene traceable to a specific research finding — cite it in your final report.
- Do write director notes in the shared note-verb vocabulary so they parse mechanically later.
- Don't invoke `hyperframes`/`hyperframes-core`/`hyperframes-animation`/any `npx hyperframes`
  command — motion is out of scope for this skill by design.
- Don't hand off a storyboard with literal `[PLACEHOLDER` text still baked into a rendered frame.
- Don't claim you pushed anything to Figma — you didn't, and can't; say clearly what the human needs
  to do next instead.
