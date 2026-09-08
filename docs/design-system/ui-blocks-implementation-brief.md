# UI blocks: implement the Basics catalog presentation

## Outcome

Make `/design-system?section=ui-blocks` visibly use the same catalog structure as Basics. Implement the approved direction now. The user has approved the design, grouped alphabetical navigation, and inline execution. Use only existing blocks and controls. The framework will grow substantially; groups are not a fixed final taxonomy.

## Visual contract

- Use the current Basics page as the visual authority: canvas background, full-width white group panels, 1px black outlines, large rounded outer corners, 32px panel padding, 48px group spacing, and 24px specimen-cell padding, using existing tokens and responsive equivalents.
- Put the group heading inside its panel. Inside the panel, arrange previews in a bordered grid with shared cell rules, as Basics does. Rounded panels belong to groups; avoid another rounded catalog card around every specimen.
- Each cell contains its live preview and a compact identifying name. Keep headings at weight 500 and use the existing typography scale. Remove redundant documentation headings, section numbering, Reference disclosure, and introductory marketing copy from this route. Preserve labels and instructions needed to operate the actual preview.
- Let a single block fill the group's available width. Use additional columns only when the available container width can fit the blocks comfortably. Scheduling needs enough room for its summary and picker; stack them based on preview container width at narrow sizes. Never shrink or clip controls to fit a forced column count.
- Match Basics hover/focus panel treatment and reduced-motion handling. Do not use blanket overflow clipping: headings, focus outlines, menus and copy feedback must stay visible.

## Structure and behavior

- Extract a small shared catalog group/grid presentation component under `src/components/design-system/` and use it for both Basics and UI blocks. Preserve Basics' current appearance and all its specimens. Avoid a general schema engine or unrelated component refactors.
- Derive sidebar groups and rendered groups from one registry. Stable IDs, group, display name, existing preview and explicit copy reference are sufficient. Sort groups and names A–Z. Registering another existing block should not require edits to page layout or sidebar logic.
- Preserve the current Prompt input, Scheduling and Settings form previews and their local interactions. Do not invent AI chat or new product capabilities.
- Reuse `TokenCopyTarget` for a clearly identifiable copyable name or dedicated non-interactive specimen area. Copy the exact existing component reference (for example `PromptInputBlock`) or an accurate existing recipe; never invent a props contract. Show the black Copy label following the pointer without physics and Copied plus a check only after clipboard success.
- Keep preview inputs, buttons and menus independently operable. Do not nest interactive previews inside a copy button or intercept their clicks to copy.
- Preserve working Basics sidebar links, grouped UI-block links and search. Switching sections must not leave stale queries or broken anchors.

## Confirmed causes to correct

1. `src/styles/design-system.css` contains catalog reset rules that remove `.v2-specimen-card` background, border and padding. Prior changes added radius/shadow without restoring a proper group surface.
2. `src/styles/ui-blocks.css` adds `overflow: hidden` to unpadded specimen cards, visibly clipping heading starts and controls.
3. `.v2-ui-block-grid` always reserves two columns, even for one block.
4. Scheduling's `@container v2-specimens` rules do not have the intended named preview container.
5. `SpecimenSection` injects Reference metadata for index 10. Use the shared catalog presentation instead on the UI-block route.
6. UI-block names currently render as plain headings, so the requested copying was never wired up.
7. `LibraryIndex` currently renders supplied navigation items only when they have a group; Basics supplies ungrouped items. Restore the flat navigation path as part of ensuring Basics remains intact.

## Files to inspect

- `src/components/design-system/examples/BasicsCatalog.jsx` and `basics-catalog.css`
- `src/components/design-system/examples/UIBlocks.jsx`
- `src/components/design-system/examples/LibraryIndex.jsx` and `library-index.css`
- `src/components/design-system/examples/SpecimenCard.jsx`, `SpecimenSection.jsx`, `PreviewMetadata.jsx`
- `src/components/design-system/atoms/TokenCopyTarget.jsx` and `token-copy-target.css`
- `src/screens/DesignSystemScreen.jsx`
- `src/styles/design-system.css` and `ui-blocks.css`

## Verification and delivery

- Inspect the live Basics and UI-block routes before editing and visually verify desktop and narrow layouts after implementation. Use screenshots/computed styles to verify actual white panels, visible rules, padding, heading alignment and usable preview widths. A successful build alone is insufficient.
- Verify grouped A–Z navigation, all Basics anchors, search, actual clipboard payload and confirmation, and independent prompt/scheduling/settings interactions. Verify menus and focus indicators are not clipped.
- Run relevant focused tests and `npm run build`. Add meaningful regression coverage for navigation/group rendering/copy behavior where missing. Some BasicsCatalog tests already fail because they expect older heading names and icon-size copy buttons; inspect and distinguish stale expectations from regressions rather than claiming the whole suite passes.
- Leave the app available on port 5800. Report what actually changed and what was actually verified. Do not claim browser verification without inspecting the browser.
- Preserve the dirty worktree and prior cleanup. Do not stage unrelated files, remove existing component implementations, or make broad commits. No new approval or planning round is needed for the approved implementation.
