# Campaign request — [client/campaign name]

The standardized intake for this pipeline. **This is Stage 0 — a human checkpoint, not an agent
output.** Fill it in (or have the orchestrator help you fill it in conversationally) and confirm it
before any research or design agent starts work. Save the completed copy to
`projects/<slug>/00-brief/campaign-request.md`.

It has three parts, matching the three inputs this system needs before it can produce grounded
creative: what the business wants, what the competitive landscape already looks like, and the
marketer's actual message. Don't let an agent infer any of these — that's exactly the generic-best-
practice failure mode this whole system is built to avoid.

## 1. Marketing input

**Product/service** — `[PLACEHOLDER: one sentence]`.

**Business goal for this campaign** — `[PLACEHOLDER: awareness, installs, signups, sales, etc — be
specific, "grow the brand" is not a goal an agent can design against]`.

**Primary audience** — `[PLACEHOLDER: one or two sentences — demographic/psychographic]`.

**Success metric** — `[PLACEHOLDER: what "this worked" looks like, even roughly]`.

**Own account(s) to research** — `[PLACEHOLDER: @handle(s), or "none — brief-driven only, skip
research"]`.

## 2. Competitor analysis

**Known competitor accounts to analyze** — `[PLACEHOLDER: @handle(s), or "none yet"]`. If listed,
the research stage runs the *same* procedure (`reels-analytics-report` /
`static-creatives-report`) against each one and saves the result under
`01-research/competitors/<handle>/` or `01-research-static/competitors/<handle>/` — same rigor as
the client's own account, used as reference/differentiation, never copied wholesale.

**Known competitor creative to reference** — `[PLACEHOLDER: links/screenshots, or "none"]`.

**What "good" already looks like in this category** — `[PLACEHOLDER: one or two sentences, or "let
research surface it"]`.

## 3. Marketer's brief

**Offer/hook** — `[PLACEHOLDER: the deal, promo, or angle, if any]`.

**Message/headline direction** — `[PLACEHOLDER: the single idea every piece of creative must land]`.

**Proof points** — `[PLACEHOLDER: stats, testimonials, before/after, or "none available yet"]`.

**Tone** — `[PLACEHOLDER: 3-5 adjectives — reuse marketing-design's brand-voice section if this
client already has one filled in]`.

**CTA** — `[PLACEHOLDER: exact wording + destination]`.

**Mandatory/legal copy** — `[PLACEHOLDER: any required disclaimer/price disclosure, or "none" — never
invent one if unsure, ask]`.

## Pipeline & scope

**Pipeline** — `[PLACEHOLDER: video / static banners / both]`.

**Static variant, if applicable** — `[PLACEHOLDER: A — research-driven (needs an own account above)
/ B — brief-driven (skip research, design straight from this brief)]`.

**Reel/post count, if researching** — `[PLACEHOLDER: N, default 20 if left blank]`.

**Sizes/formats needed** — `[PLACEHOLDER: see static-banner-design/references/platform-specs.md for
the standard list; default is Instagram Feed Square + Story/Vertical if left blank]`.

**Resize/variant pass wanted after human review?** — `[PLACEHOLDER: yes — list target sizes/how many
variable variants / no]`.

## Sign-off

`[PLACEHOLDER: name/date confirming this brief is approved to start Stage 1]`. Nothing downstream
should start against a brief that hasn't been explicitly confirmed — an agent asking "does this
brief look right before I start scraping?" is not being overly cautious, it's the intended gate.
