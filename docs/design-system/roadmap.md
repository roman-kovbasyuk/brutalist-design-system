# Design-system roadmap

This workspace ships a library and workbench, not a campaign application. Product workflow changes belong to consuming repositories.

1. Keep workbench examples aligned with public controls and clearly label exploratory specimens and local-only APIs.
2. Add broader browser, keyboard, assistive-technology, forced-colors and visual-regression coverage before claiming accessibility conformance.
3. Complete the separately tracked [Figma library plan](../superpowers/plans/2026-09-10-figma-core-ui-library.md) when its external access blocker is resolved.
4. Expand or version public APIs only against demonstrated consumer requirements, with package-install verification and migration notes.

Dark themes, extra density modes, virtualization and additional workflow components remain proposals, not commitments. Existing public controls and UI Blocks are listed in the [package entry](../../src/components/design-system/index.ts).
