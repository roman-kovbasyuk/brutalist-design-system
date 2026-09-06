# Banners module — implementation handoff

Implemented in `codex/integrated-mvp`. Existing app layout and the six-module chain are preserved. No commit or deployment was made by this task; Architecture owns final whole-app synchronization and verification.

## Delivered

- **Design:** published template gallery, approved-copy and ready-visual filters, protected copy-specific pairings, consistent square/horizontal/vertical preview proportions, multi-selection and select-all-visible.
- **Sizes & formats:** compatible output presets with proportional rectangle icons and Social media, Google Ads, Stories and Video filters. Preview proportions and output selections are independent.
- **Verification:** exact selected-design × size total; modal lists every design/content pairing and size before saving and preparing immutable review output.
- **Persistence/output:** full batch identities survive reload. Exact historical manifests restore old selections. Every design × size is rendered and included in approved delivery, with per-design source provenance and immutable snapshots.
- **Recovery:** changed-source protection, exact saved-composition confirmation receipt, safe retry, and actionable per-design/per-size text-fit errors before persistence. No silent copy truncation or partial review versions.
- **Design system:** existing tabs, buttons, selects and dialog reused. Generic `SelectionTile` added to the shared library and documented; selected-state text uses ink on cyan.

## Ownership and entry points

| Area | Entry points |
| --- | --- |
| Module UI/state | `src/studio/campaign/modules/banners/BannersView.jsx`, `bannerSelection.js`, `banners.css` |
| Commands and handoff | `bannersCommands.js`, `BannersModule.jsx`, Banners projections in `moduleContracts.js` and `workflowCoordinator.js` |
| API | `src/studio/api.js`; `PUT /api/v1/campaigns/:id/banner-batch` in `server/routes/versions.js` |
| Backend | `server/services/versionService.js`, `deliveryService.js`, `server/repositories/versionRepository.js` |
| Contracts/catalog | `shared/contracts.js`, `bannerFormats.js`, `studioTemplates.js` |
| Database | `027_banner_batches.sql`, `028_banner_batch_source_provenance.sql` |
| Shared component | `src/components/design-system/molecules/SelectionTile.jsx`, `selection-tile.css` |

Shared files also contain other threads' work; preserve those changes when integrating. Applied migrations must not be rewritten.

## Verification evidence

- Latest backend focused run: **10 files / 78 tests passed**, covering batch save, every output, ZIP contents, legacy compatibility, provenance, immutability, offer tags and exact text-fit rejection.
- Latest frontend error-recovery run: **2 files / 14 tests passed**. Earlier complete Banners-focused run: **9 files / 34 tests passed**; broader campaign-module check: **33 files / 232 tests passed** before the final historical-template additions.
- App/docs build passed before the final text-fit error-feedback changes; docs reported a chunk-size advisory. Final synchronized build and full suite remain Architecture-owned.
- Live local UI: **3 designs × 3 sizes → 9 review PNGs**, immutable version `109f6c2f-4fe9-4173-a2a2-326fb26dbe02`, synthetic campaign `d5e828e0-831f-401c-b0ec-0ae01051ce1c` (Studio headphones). No external Figma action, approval or delivery shortcut.
- Independent scoped backend/frontend reviews approved. Visual reviewer scored the selected-size contrast fix resolved from 2252px, 1440px and 390px captures. Detector ran once with no findings. `git diff --check` passed.
- Latest demo API restart was coordinated: port3010 healthy, mock provider and persistent local data; Vite5176 preserved.

## Current limits

- Catalog includes **three predefined designs and seven common size presets**, not an exhaustive ad-network inventory.
- Video filters represent placement dimensions; generated review/delivery artwork is **static PNG**.
- Figma handoff remains **manual PNG import plus a Figma link in Review**, clearly disclosed in verification. Direct editable Figma publishing is not implemented here.
- Rendering enforces existing text-fit, image, deadline and package-size limits. Large-batch throughput beyond the tested cases is not established.
- Responsive grids use **module container widths**: one column below480px, two from480px, three from800px. Narrow-mobile category/action density and the page-level mobile anchor offset were reported to Architecture for its page QA; no global layout change was made.

The parent-owned `server/services/campaignRuntimeFlow.integration.test.js` covers the real runtime/coordinator/HTTP/database flow. Its new notes-only overflow case prompted the final preflight fix; Architecture is synchronizing that regression and running the final whole-app suite.
