---
name: marketing-design
description: Brand and creative-direction template for marketing campaign design — palette, typography, voice, campaign frameworks, and platform specs. Use when creating or reviewing marketing creative, ad copy, or campaign visuals, or when the design-strategist agent needs brand direction for a client.
---

# Marketing Design

This skill is a **template**. Every `[PLACEHOLDER]` below should be replaced with a specific
client's real brand direction before `design-strategist` uses it for real creative work. If you run
multiple accounts through this system, fill in a separate copy of
[assets/brand-brief.template.md](assets/brand-brief.template.md) per client and save it under that
client's `projects/<slug>/02-design/` folder rather than overwriting this shared skill.

## Brand identity

**Palette** — `[PLACEHOLDER: primary #HEXHEX, secondary #HEXHEX, accent #HEXHEX, background
#HEXHEX, text #HEXHEX]`. Pull these straight into
[assets/brand-tokens.template.css](assets/brand-tokens.template.css), which is shaped to drop
directly into a HyperFrames composition's `:root` custom properties.

**Typography** — `[PLACEHOLDER: primary typeface + fallback stack, display typeface + fallback
stack, minimum readable size for 9:16 mobile]`. Avoid HyperFrames' own banned default fonts (Inter,
Roboto, Poppins, Playfair, Fraunces) unless the brand's actual identity already uses one of them —
pick something that differentiates the client.

**Logo usage** — `[PLACEHOLDER: clear-space rule, minimum size, light/dark variants, where it may
and may not appear on a Reel]`.

**Voice & tone** — `[PLACEHOLDER: 3-5 adjectives, one sentence of "we sound like X, not Y", any
words/phrases to avoid]`.

**Imagery style** — `[PLACEHOLDER: photography vs. illustration vs. UI-screenshot-led, color
grading notes, general mood references]`.

## Campaign frameworks

Ground every creative decision in the evidence `reels-analytics-report` produced, not in generic
best practice. That report segments each top-performing reel into six structural blocks — reuse the
same vocabulary here so research and design stay traceable to each other:

| Block | Purpose | Design implication |
|---|---|---|
| Hook | First seconds, stops the scroll | Match the retention techniques that scored highest in research (close-up face, on-screen text, hard cut, etc.) |
| Intro | Promise/context | State what the viewer gets, fast — not the place for brand throat-clearing |
| Key moments | Core value/payoff | The scenes worth the most animation budget |
| Rehook | Mid-roll re-catch | Only include if the research formula shows top reels use one — don't invent structure the account's own data doesn't support |
| Objection handling | Proof, social proof, results | Concrete beats abstract: numbers, before/after, testimonial |
| CTA | Ask | Match the timing research found CTAs actually start at for this account, not a generic "last 3 seconds" rule |

See [references/campaign-frameworks.md](references/campaign-frameworks.md) for longer-form strategy
notes (funnel stages, hook archetypes, objection-handling patterns) that don't need to load every time.

## Platform specs — 9:16 short-form (Reels/Shorts/TikTok)

- Safe zone: keep essential text/UI inside the center ~80% width and ~75% height — the top and
  bottom are covered by platform UI (profile bar, captions, action buttons).
- The first frame doubles as the static thumbnail/cover — it must read as a compelling image on its
  own, paused, with no motion required to make sense.
- Captions/on-screen text: high contrast, large enough to read muted, positioned clear of safe-zone
  edges.

## Do / Don't

- Do let research evidence override personal taste on structure and hook style.
- Do keep brand tokens (`assets/brand-tokens.template.css`) as the single source of truth for colors
  and type, so every creative for a client stays consistent.
- Don't invent structural blocks (a rehook, an objection-handling beat) that the account's own data
  doesn't support.
- Don't hand off a creative with literal `[PLACEHOLDER` text still in it — grep for it before
  declaring done.
