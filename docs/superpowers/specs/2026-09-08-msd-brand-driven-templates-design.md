# MSD brand-driven banner templates

## Problem

The three current banner drafts contain their own presentation colors, text colors, and font metadata. Brand systems already model reusable colors, typography, and approved assets, but templates do not reference a brand system yet. This makes it impossible for the current drafts to inherit MSD branding or for future template creation to stay aligned with a published brand system.

## Goal

Make the current three draft banner templates consume one assigned MSD brand system while preserving their existing geometry and saved-manifest compatibility. The Studio shell stays unchanged. Template creation and multi-brand assignment remain future work, but the data model should establish a stable boundary for both.

## Design

### Brand system as the source of truth

The published MSD brand snapshot supplies:

- semantic color roles: primary, accent, canvas, surface, primary text, and inverse text;
- heading and body typography choices, weights, and scale;
- approved logo assets, with the primary logo role used by templates;
- optional approved graphic assets when a template declares a graphic slot.

The source values remain in the existing brand-system record. Templates refer to the record and published revision rather than copying raw values into each manifest.

### Template assignment

Each current draft template receives a `brandSystemId` and `brandSystemVersion` assignment for MSD. Assignment is metadata for the draft template record and does not rewrite historical manifests. All three existing drafts use the same MSD assignment in this slice.

The resolver loads the assigned published snapshot once, validates that the snapshot is usable, and exposes semantic roles to the renderer. A missing, unpublished, or unavailable assignment falls back to the template's immutable manifest values so existing saved compositions continue to render.

### Manifest and renderer boundary

Template geometry remains immutable and local to the template: ratios, safe areas, placements, shapes, and slot limits stay in the manifest. Presentation values that are brand-owned become semantic references:

- text slots resolve their color from a brand role;
- text slots resolve their font family and weight from heading/body role;
- logo and graphic slots resolve an approved asset from the assigned snapshot;
- template-specific shapes can use a brand role or a documented neutral value.

The preview component and the PNG renderer receive the same resolved presentation object so browser previews and delivery output stay aligned. A logo slot is optional for backward compatibility, but the current MSD drafts include the approved primary logo in their safe area across square, portrait, story, and landscape ratios.

### MSD visual direction

The MSD treatment uses the supplied logo and the reference page as the visual source. The implementation records sampled brand colors and typography in the MSD brand system, then maps those values to semantic roles rather than scattering hex codes through templates. The three existing layouts keep their distinct composition—editorial split, product spotlight, and bold announcement—while sharing the MSD palette, type system, logo treatment, and graphic rules.

### UI behavior

The Templates screen continues to show the three existing draft previews. Each preview renders through the assigned MSD snapshot. No new template-authoring UI is introduced. If a brand assignment is unavailable, the preview remains usable with its immutable manifest fallback and exposes no broken image or font state.

## Data flow

1. The Templates screen loads current template records and their assigned brand reference.
2. The resolver fetches the published MSD snapshot and checks its revision.
3. The resolver maps semantic roles and approved assets into a renderer-ready presentation object.
4. `AnimatedBanner` and the server PNG renderer consume that same object.
5. Historical compositions continue to use their stored manifest and version without re-resolution.

## Validation

- Unit tests cover assignment resolution, published-revision mismatch, fallback behavior, semantic color/font mapping, and logo selection.
- Manifest tests verify all four delivery ratios include valid logo placements and retain safe-area constraints.
- Renderer tests compare preview and PNG inputs at the resolved presentation boundary rather than relying on duplicated fixtures.
- The Templates screen is checked in the live browser for MSD logo visibility, typography, color roles, and unchanged template navigation.
- Build and focused tests must pass before the task is marked ready.

## Out of scope

- A template creation or editing workflow.
- A global Studio theme switch.
- Multiple simultaneous brand assignments per template.
- Rewriting historical compositions or published manifests.
