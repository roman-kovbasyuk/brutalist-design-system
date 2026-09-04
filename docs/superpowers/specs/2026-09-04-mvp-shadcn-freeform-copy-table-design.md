# Banner Studio MVP — shadcn Shell, Free-form Brief, and Copy Table

**Date:** 2026-09-04  
**Status:** Approved design direction; implementation pending written-spec review  
**Route:** `/mvp` only

## Outcome

Refine the frontend-first MVP without changing its workflow sequence. The new `/mvp` workspace uses real shadcn/ui component source, a Vercel-inspired monochrome visual system, one free-form campaign brief, and a responsive editable table for generated copy.

The existing application outside `/mvp` remains visually and technically unchanged.

## Interaction model

### Campaign brief

- Replace Product, Audience, Goal, Offer, and Notes controls with one large `Textarea` labelled **Campaign brief**.
- The user writes naturally rather than completing a form schema.
- Display a character count and a short example below the field.
- Require non-whitespace content before enabling **Analyze brief**.
- The mock frontend treats analysis as the save boundary. The future Gemini adapter will extract structured campaign facts server-side.
- Editing an analyzed brief displays a warning that saving will clear selected copy, image ideas, and template work.

### Copy table

- Generate three copy variants per round.
- Display columns in this order: **Select**, **Headline**, **Body**, **Offer**, **CTA**.
- Use controlled `Input` and `Textarea` components in cells. Do not use `contentEditable`.
- Selecting a row atomically saves that row's current controlled values, makes it the campaign's active copy, and advances the workflow to `copy_ready`.
- Editing the selected row and saving returns later work to the `copy_ready` boundary.
- Use one explicit **Save copy changes** action for the selected row. Unselected rows remain editable locally; their current values are persisted when that row is selected.
- Keep **Generate 3 options** available and label the provider as mock.

### Responsive behavior

- At desktop widths, use a true table with a sticky header and horizontally safe minimum column sizes.
- At tablet widths, hide low-priority explanatory text before reducing editable field sizes.
- Below the mobile breakpoint, render the same row data as stacked bordered groups with labels. Do not force users to edit a horizontally scrolling desktop table.
- Selection, validation, save, and generation behavior must be identical across layouts.

## Visual system

The visual reference is Vercel's restrained product language, translated rather than copied:

- white canvas and surfaces;
- near-black foreground;
- neutral grey secondary text and fills;
- one-pixel neutral borders;
- compact control heights and spacing;
- small corner radii;
- no gradients, decorative shadows, glass effects, or ornamental color;
- status and destructive feedback may use restrained semantic color when meaning would otherwise be lost.

Typography stays system-first for this slice. A Geist font dependency is unnecessary until the broader product identity is decided.

### ChatGPT-like campaign sidebar

Use the supplied screenshot as an information-layout reference, not as a palette reference.

- The left sidebar is persistent on desktop and visually separate from the workspace with a neutral surface and right border.
- Its header contains the Banner Studio wordmark and a collapse control.
- A prominent **New campaign** action sits above the campaign history.
- The scrollable main area is labelled **Recent campaigns** and lists campaigns by name with a quiet status indicator.
- The active campaign uses a subtle neutral filled state; inactive campaigns remain text-first without card borders.
- Long campaign names truncate to one line and expose the complete name through accessible text.
- The footer contains the current user and role.
- Collapsing the sidebar leaves a narrow icon rail with tooltips for controls.
- On mobile, the sidebar becomes a shadcn `Sheet` opened from the top bar and closes after campaign selection.

Do not reproduce the screenshot's blue brand mark, coloured status dots, or large unused vertical gaps. The sidebar remains monochrome except where a semantic warning or error requires colour.

## shadcn boundary

Install and configure shadcn/ui for the `/mvp` implementation only. Add repository-owned components under `src/components/ui/` and use them from `src/mvp/`.

Required primitives:

- `Button`
- `Input`
- `Textarea`
- `Table`
- `RadioGroup`
- `Badge`
- `Alert`
- `Separator`
- `ScrollArea`
- `Sheet`
- `Tooltip`

The MVP shell composes these primitives into campaign navigation, phase navigation, workspace content, and version status. Existing screens and their CSS are not migrated.

## Data contract and migration

The brief contract adds a canonical `text` field while retaining optional derived fields for future provider output:

```js
brief: {
  text: string,
  product: string,
  audience: string,
  goal: string,
  offer: string,
}
```

For the frontend mock:

- `text` is the only required user input.
- mock copy generation derives deterministic variants directly from `text`;
- derived fields may remain empty;
- existing locally persisted campaigns are migrated by combining their populated structured fields and notes into `text`;
- invalid or unknown persisted records continue to fail closed rather than crash the workspace.

The public asynchronous gateway interface and idempotency rules do not change.

## Component boundaries

| Component | Responsibility |
| --- | --- |
| `MvpShell` | shadcn-based responsive shell, phase rail, workspace, and version summary |
| `CampaignSidebar` | collapsible ChatGPT-like campaign history, new-campaign action, active state, and user footer |
| `BriefStage` | controlled free-form brief, validation, character count, reset warning |
| `CopyStage` | generation controls, desktop table, mobile row groups, selection and save |
| `CopyRowFields` | shared controlled inputs used by desktop and mobile representations |
| workflow rules | authoritative status changes and downstream invalidation |
| mock gateway | asynchronous persistence, migration, and idempotent mutations |

React components never assign campaign statuses directly.

## States and errors

- Buttons expose loading text and remain disabled during a mutation.
- Empty brief shows guidance without an error banner; submit remains disabled.
- Gateway failures appear in the existing workspace alert region.
- A copy row requires a non-empty headline and CTA before it can be selected or saved.
- The reset warning appears before the user saves an edited brief with downstream work.
- The mock-provider badge remains visible at all times.
- Keyboard users can reach every field, select a row, save, and regenerate without pointer input.

## Testing

Use test-driven development for each behavior change:

1. schema and persisted-data migration tests;
2. workflow tests for free-form brief saves and downstream invalidation;
3. `BriefStage` tests for free-form input, validation, character count, and warning;
4. `CopyStage` tests for table semantics, controlled editing, selection, save, and mobile representation markers;
5. shell tests confirming shadcn primitives and existing navigation behavior;
6. complete MVP test suite and production build;
7. one bounded browser QA pass at desktop and mobile widths.

## Non-goals

- Migrating existing non-MVP screens to shadcn/ui.
- Replacing the workflow state machine or gateway boundary.
- Adding real Gemini calls, authentication, PostgreSQL, or Cloud Storage in this slice.
- Adding copy duplication, deletion, drag reordering, bulk selection, or spreadsheet keyboard shortcuts.
- Matching Vercel's marketing site pixel for pixel.
