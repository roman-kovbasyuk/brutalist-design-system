# Design-system cleanup implementation plan

**Goal:** Resolve the five findings from the repository cleanliness assessment and commit/push the verified result.

**Architecture:** The public component implementations own shared behavior. Existing JSX paths become compatibility adapters; catalog examples use those same owners. Keep design-system specifications and project tracking, remove dead product code, and verify the distributable with an actual npm tarball installation in a fresh consumer.

**Scope:** Preserve the catalog routes, tokens, example interactions, and pending Figma work. Do not add product functionality or publish a package.

1. Restore design-system plans/specifications from HEAD, including the pending Figma work. Update current documentation so links and ownership match the source.
2. Replace the directory-copy consumer check with npm pack and a fresh dependency installation; use declared versions consistently and run this check in CI.
3. Consolidate duplicate AppButton, TextAction, SelectionTile, FactGrid, ActionCard, and InlineText implementations through the public owners. Verify disabled links, editing failure recovery, source-key capture, selection, and exiting cards.
4. Remove the unreachable legacy UI subtree, its exclusive utilities/dependencies, and product-only CSS. Keep compatibility imports and design-system examples.
5. Run full tests, script tests, typecheck, app/library builds, package-install verification, documentation/source checks, and the project tracking harness. Inspect the live catalog and obtain independent review.
6. Commit the scoped changes and push the existing main branch. Report the commit and any remaining verification limitations.

## Verification record — 10 September 2026

Steps 1–5 completed. Relevant plans and Figma specifications restored; obsolete UI and dependencies removed; six component paths consolidated into public owners/adapters. Independent review found one reduced-motion styling mismatch, which was moved into canonical CSS and rechecked with no remaining review blocker.

- 179 component tests and 4 verifier tests pass; typecheck, library build, artifact verification and workbench build pass.
- Real npm pack and fresh consumer install/typecheck/build pass with registry access; sandboxed registry access was insufficient.
- Documentation relative links and patch whitespace checks pass. Live landing page, component appearance and public workbench were inspected; no document-width overflow at the inspected desktop size.
- Observatory harness remains separately failing in two test files with native Node 26 assertions, as recorded before this cleanup. The workbench build retains its large-chunk warning. Neither is presented as passing or remediated here.
- Sampled browser checks and unit tests do not constitute a full accessibility or external-product audit.
