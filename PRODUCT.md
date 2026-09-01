# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated by the user: React 19, Vite, plain CSS, Vitest, and Testing Library. The product is local-first and must run without Claude Code, cloud infrastructure, or API credentials.

## Users

The primary user is a client marketer who has an advertising idea or free-form campaign brief but does not want to write copy, prompts, or assemble banner layouts manually. A designer is the required human reviewer between draft generation and final rendering.

## Product Purpose

Lingu Studio turns one free-form campaign brief into reviewed static and animated banner packages. The system derives copy and visual prompts, presents generated visual options to the client, assembles the selected direction in predefined templates, routes it through Figma review, and produces final resizes.

Success for V1 means a client can understand and complete the entire workflow without assistance, while the team can demonstrate the template library and design system in the same application.

## Positioning

The product combines AI content generation with a constrained template system and mandatory designer review. AI supplies copy and media direction; templates provide predictable composition; the client chooses the visual; the designer controls final quality.

## Operating Context

The V1 is an evening-build prototype used locally in a browser. It demonstrates the complete workflow with deterministic local data and simulated generation. External image/video models and Figma are integration boundaries, not runtime requirements.

The approved master design is reviewed in Figma before final output. After approval, the product adapts the creative to 1080×1080, 1080×1350, 1080×1920, and 1200×628.

## Capabilities and Constraints

- Accept one free-form text brief.
- Derive campaign strategy, headline, supporting copy, CTA, and image/video prompts.
- Generate five selectable visual directions in local demo mode.
- Provide 20 distinct template compositions across at most two authored master proportions.
- Assemble a preview from generated copy, selected visual, and selected template.
- Make the Figma/designer checkpoint explicit and blocking.
- Generate a final four-format delivery package after approval.
- Provide a separate design-system and template-library view.
- Keep V1 frontend-only and local-first; provider integrations are future adapters.
- Do not provide freeform layout editing, billing, Slack notifications, ad publishing, or automatic Figma writes in V1.

## Brand Commitments

Working product name: Lingu Studio. The V1 interface is minimal, monochrome, editorial, and deliberately quieter than the generated creative. It uses Russian product copy.

## Evidence on Hand

The repository contains an existing Claude-oriented marketing pipeline, HyperFrames animation skills, 20-template intent, example campaign artifacts, and a documented Figma human-review checkpoint. These are product evidence and reference material, not runtime dependencies for the new app.

## Product Principles

1. One brief should be enough to begin.
2. Every step and its current state must be visible.
3. Templates constrain composition without making outcomes look identical.
4. The client chooses the visual direction.
5. Nothing renders as final before designer approval.
6. Resizing is part of delivery, not an optional afterthought.

## Accessibility & Inclusion

The interface targets WCAG 2.2 AA contrast, keyboard-operable controls, visible focus states, semantic landmarks, and reduced-motion support.
