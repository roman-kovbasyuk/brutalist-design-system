# App UI unification

**Goal:** Use the current `/design-system` reference throughout the operational app, without changing workflow or banner artwork.

**Authority:** `src/styles/tokens.css` v2 tokens and the current reference specimens. Root DESIGN.md describes an older indigo direction and is not the authority for this user-requested alignment.

## Review findings

- Shared controls drift: app buttons use 42px height, different weights and hover offsets; reference uses 48px controls and its shared physical hover treatment.
- Typography drift: app metadata falls to 10–13px and section titles vary from 18–28px. Reference defines 14px metadata, 16px body, 24px sections, 48px page titles.
- Token drift: operational screens duplicate hard-coded neutrals, borders and feedback colors. Banner palettes are correctly isolated and must remain unchanged.
- Field/table/selection drift: fields have lighter borders and inconsistent heights; view switching differs from the reference's white selected pills; statuses use separate color values.

## Implementation and verification

- [x] Extract a shared AppButton and control stylesheet used by the reference and live app. Test disabled/busy behavior and native submit semantics.
- [x] Map app chrome, fields, copy table, statuses, timeline and brand-reference typography to v2 tokens. Preserve the current layout and navigation model.
- [x] Preserve banner template CSS/manifests and preview/export typography exactly.
- [x] Verify focused components, the connected workflow, production build, and desktop/mobile screens in one batched browser inspection. Fix any regressions together and confirm once.

No new libraries, server mutations, redesign, brand management, uploads or video features in this pass.

## Results

- All 191 frontend tests pass (31 files), including shared busy/submit controls and existing campaign flow coverage.
- Production build and production validation pass. Existing VitePress chunk-size warning only.
- Shared primary button computed styles match the reference: 16px type, 600 weight, 48px height, 4px radius, RGB(121, 217, 255) fill.
- Checked brief, copy comparison, banner editor fields and template library at desktop/compact sizes. Corrected desktop menu visibility, table selection wrapping, and sidebar selection contrast. Comparison table fits its 870px desktop wrapper and scrolls within its region on smaller screens.
- No page overflow on inspected compact pages; browser errors empty. Mechanical detector returned no findings. Temporary browser tabs closed and viewport override reset.
- Banner template manifests, artwork stylesheet, animated banner renderer and exports were not modified.
