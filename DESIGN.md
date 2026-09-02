# Lingu Studio Design System

## Direction

Lingu Studio is a calm, modern creative-operations SaaS. A true white canvas keeps campaign work in focus; cool-neutral chrome groups the operational controls around it. Indigo identifies the next action, while yellow is reserved for AI, high-cost, and human-review signals.

## Operating principles

- The workflow is an **Operate** surface: stable hierarchy and scanability take priority over decorative expression.
- Application chrome stays quiet. Campaign artwork may remain expressive within its own preview surface.
- Tables carry structured history and review information. Use card treatment for objects, galleries, and focused detail—not for data rows.
- Semantic color never stands alone: labels and icons explain all status, cost, and review states.

## Type

Inter/system UI is the single working family.

| Role | Size | Use |
| --- | ---: | --- |
| Page title | 40px desktop, 32px mobile | One primary title per view |
| Section title | 22px | Workspace and panel headings |
| Body | 14–15px | Descriptions, form content, table cells |
| Metadata | 12px | Labels, status detail, measurements |

Headings use tight but readable tracking (no tighter than -0.025em). Long-form explanations are constrained to roughly 65–75 characters.

## Color and surfaces

- Canvas/surface: #ffffff
- Cool chrome: #f7f8fb and #f3f5f9
- Ink: #1b2433
- Rules: #dde3ec / #c6d0de
- Primary action and selected state: indigo #3559d6
- Approved state: green #17734c
- AI, high-cost, in-review, and highlight: yellow #ffe27a / pale yellow #fff7d8
- Error: #b1374c

Indigo is for actionable controls and current selection. Yellow is semantic, paired with text or an icon, and is never a generic action color.

## Layout

- Desktop uses a narrow 216px navigation rail and a content frame capped at 1440px.
- The mobile shell becomes a compact horizontal top rail; labels collapse only after the navigation remains touch-safe.
- Workflow stages preserve the sequence rail on desktop and turn it into a horizontally scrollable step rail on mobile.
- Tables retain their semantic column layout and scroll horizontally below their minimum readable width.
- Galleries collapse from four/five columns to two, then one; detail panels move beneath their gallery.

## Components

- Interactive controls have a minimum 44px target.
- Buttons use 10px corners; panels and cards use 12–16px corners and a single cool-neutral border. Floating dialog surfaces use the single exception: a soft offset shadow.
- Navigation selection is a neutral fill plus a 3px indigo indicator—not a dark pill.
- Tabs use an indigo underline. Status tags are compact and may be pill-shaped.
- Focus uses a visible indigo ring with offset. Selection, caret, scrollbar, text selection, and tabular numerals are themed globally.

## Motion

- Feedback and transitions run between 140–220ms using cubic-bezier(0.16, 1, 0.3, 1).
- Hover elevation never exceeds 2px; press feedback scales to .985.
- Processing progress uses transform-based scaleX, anchored to its left edge. Stage and banner reveals use opacity, transform, or clip-path only.
- The yellow marker wipe is the single gradient treatment and is reserved for marked AI text.
- In-review Figma emphasis is a one-shot confirmation, never an infinite pulse.
- Reduced motion removes spatial/decorative animation while retaining quick color, border, and status feedback.
