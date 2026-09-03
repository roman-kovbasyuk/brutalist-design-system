# Static Architecture Diagram Design

**Date:** 2026-09-03  
**Surface:** `/docs`  
**Mode:** Read  
**Status:** Approved direction

## Problem

The architecture map on the documentation page is assembled from responsive HTML grid blocks and exposes Mermaid source beneath it. The grid has a desktop-oriented minimum width, becomes awkward on narrow screens, and does not communicate the application's real production path clearly enough.

## Goal

Replace the primary architecture map with a pre-rendered SVG image that remains legible and visually coherent on desktop and mobile while accurately describing the current Lingu Studio workflow.

## Information architecture

The diagram follows the production path from left to right:

1. Brief and campaign context
2. Copy selection and editing
3. AI image assets
4. Published templates and composition
5. Immutable review package
6. Figma designer review
7. Marketer approval
8. PNG, MP4, and ZIP delivery

Supporting actors and integrations appear as secondary inputs around the main path:

- Marketer owns the brief, selections, and final approval.
- Vlad publishes versioned template manifests.
- Slack assigns the review to the designer.
- The designer edits stable review frames in Figma.
- The Figma webhook returns `Ready for Development` status to the app.

## Visual treatment

- Produce a custom static SVG using the existing documentation palette, typography, borders, and restrained accent colors.
- Group the main flow into three readable zones: Create, Review, and Deliver.
- Use short labels and visible directional connectors; do not reproduce raw Mermaid styling.
- Include a compact legend for human decisions, app-controlled steps, and external integrations.
- Preserve the surrounding documentation card, title, and source-of-truth badge.
- Remove Mermaid source disclosure from the user-facing architecture card.

## Responsive behavior

- Desktop: the full SVG fits the diagram card width.
- Tablet and mobile: the image keeps a fixed intrinsic canvas and is displayed inside a horizontally scrollable viewport rather than compressing labels until they become unreadable.
- The viewport provides a subtle mobile scroll cue and touch momentum.
- The image uses descriptive alternative text; a concise textual summary remains adjacent to it for accessibility.

## Implementation boundaries

- Add one repository-owned SVG asset under `public/docs/`.
- Replace `ArchitectureDiagram` and the primary `MermaidSource` usage with an image figure and accessible caption.
- Remove architecture-only dead components and constants after confirming they have no other callers.
- Keep marketer/designer journey content and their existing textual steps unchanged.
- Do not add a runtime Mermaid dependency.

## Verification

- Add or update component tests to assert the architecture image, alternative text, and removal of the primary Mermaid source control.
- Run the focused documentation test and full test suite.
- Run the production build.
- Inspect `/docs` at representative desktop and mobile widths, including the diagram's horizontal overflow behavior.
- After deployment, verify `/docs` returns HTTP 200 and references the SVG asset successfully.
