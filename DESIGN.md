# Lingu Studio Design System

## Direction

An editorial production desk: white paper, black ink, fine rules, compact controls, and large typographic hierarchy. The interface recedes so campaign visuals remain the only color-bearing objects.

## Modes

- Workflow: **Operate**. Prioritize state, next action, and confidence.
- Template and design-system views: **Experience**. Let compositions lead while navigation stays quiet.

## Typography

- Display and UI: Inter, loaded locally through the system stack for the prototype.
- Large headings use 600 weight, tight but never below `-0.04em` tracking.
- Body copy is 14–16px with a comfortable 1.5 line height.
- Measurements and format labels use tabular numerals.

## Color

- Canvas: `#f4f4f1`
- Surface: `#ffffff`
- Ink: `#111111`
- Secondary: `#666660`
- Muted: `#a2a29b`
- Rule: `#d9d9d2`
- Strong rule: `#b9b9b1`
- Success: `#1d6b43`
- Warning: `#8a5a00`
- Error: `#9a2929`

Generated campaign visuals may use color. Application chrome remains monochrome.

## Layout

- Desktop shell: 248px navigation rail plus fluid workspace.
- Workflow pages use a narrow 184px step rail and a flexible work area.
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

- One authored transition: the work area crossfades and rises slightly when the workflow step advances.
- Hover states increase border contrast and move thumbnails by at most 2px.
- Loading generation shows progressive text states rather than a decorative spinner.
- `prefers-reduced-motion` removes movement while retaining state changes.

## Copy

Russian, concise, operational, and specific. Controls use actions: «Разобрать бриф», «Выбрать визуал», «Отправить на ревью», «Собрать пакет».

## Browser Surfaces

Black focus ring with a 2px offset, ink-colored text selection on a pale neutral background, narrow neutral scrollbar, and underlines with a 3px offset.
