# Lingu Studio Design System

## Direction

A modern creative-operations SaaS: white canvas, precise neutral layers, compact data views, and restrained semantic color. The interface recedes so campaign visuals remain expressive, while indigo actions, yellow AI/review signals, and green approval states make the workflow immediately legible.

## Modes

- Workflow: **Operate**. Prioritize state, next action, and confidence.
- Template and design-system views: **Experience**. Let compositions lead while navigation stays quiet.

## Typography

- Display and UI: Inter, loaded locally through the system stack for the prototype.
- Page headings use a fixed 28–40px operating scale at 600 weight, tight but never below `-0.03em` tracking.
- Body copy is 13–15px with a comfortable 1.5 line height.
- Measurements and format labels use tabular numerals.

## Color

- Canvas: `#ffffff`
- Surface: `#ffffff`
- Navigation: `#fafafa`
- Ink: `#17171b`
- Secondary: `#64646f`
- Muted: `#9696a0`
- Rule: `#e8e8ec`
- Strong rule: `#d4d4da`
- Accent: `#5b5bd6`
- Success: `#27835b`
- Warning: `#9a6500`
- Highlight: `#ffe27a`
- Error: `#9a2929`

Generated campaign visuals may use color. Application chrome remains monochrome.

## Layout

- Desktop shell: 232px navigation rail plus fluid workspace.
- Workflow pages use a compact horizontal stage tracker above a flexible work area.
- Content max width: 1440px.
- Major gaps: 32–48px; grouped controls: 8–16px.
- Mobile collapses both rails into horizontal navigation and stacked content.

## Components

- Buttons: 10px radius, no pill shapes except compact status tags.
- Panels: 14px radius, either one border or one shadow, never both.
- Inputs: white surface, 1px rule, 12px radius, strong focus ring.
- Selected objects: black outline with a small black check marker.
- Status tags: compact, semantic text plus dot; never color alone.
- Banner canvases: ratio-correct previews with strict clipping and container queries where useful.

## Interaction

- Screen and tab changes crossfade and rise 6–10px over 180–220ms.
- Hover states increase border contrast and move interactive thumbnails by at most 2px.
- AI text and in-review surfaces use a dynamic yellow wash; selected objects use an indigo outline.
- Buttons move their trailing icon 2–3px on hover.
- Loading generation shows progressive text states rather than a decorative spinner.
- `prefers-reduced-motion` removes movement while retaining state changes.

## Copy

English, concise, operational, and specific. Controls use explicit actions: “Analyze brief”, “Generate visual”, “Send to Figma for review”, and “Download assets”.

## Browser Surfaces

Black focus ring with a 2px offset, ink-colored text selection on a pale neutral background, narrow neutral scrollbar, and underlines with a 3px offset.
