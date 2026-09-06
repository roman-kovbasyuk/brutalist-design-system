# Design-system separation implementation plan

**Goal:** Separate the application reference from banner brand styles, and position campaign status beside its breadcrumb name.

**Approved design:** The application system governs all app interfaces and lives outside the campaign menu. The existing Design system menu item refers to banner brands. Keep existing banner styling; client/brand creation and management are deferred. Banner styles must never mutate app tokens.

**Architecture:** `/design-system` renders the existing component reference without the authenticated workspace shell. `/mvp/system` renders a read-only description of current bundled banner styles, derived from the existing template manifests. No database or template changes. Native links enter and leave the standalone reference.

**Tech stack:** Existing React, shared template manifests, CSS, Vitest and Testing Library. No new dependencies.

## Tasks

- [x] Add route tests: the standalone reference shows real specimens and a return link, while the workspace menu opens brand styles rather than app specimens.
- [x] Add a campaign-header regression check that the name and status share the breadcrumb group.
- [x] Route `src/App.jsx` to a lazy standalone `src/screens/ApplicationDesignSystemPage.jsx`; preserve the existing StudioApp route for all other paths. Add a return link to `/mvp` and rename the reference heading to Application design system.
- [x] Add `src/studio/BrandDesignSystems.jsx`: list current bundled style names, colors and type families directly from `studioTemplates`; clearly label the absence of custom brand management. Scope styling to this page.
- [x] Replace the workspace reference with the brand component. Move the status span immediately after the breadcrumb campaign name; retain its status/attention styling and mobile shrink behavior.
- [x] Run focused tests and production build, inspect both pages and the campaign header at desktop/mobile widths, and record results.

## Constraints

- Keep all three primary menu items and the campaign steps.
- No fictional client brands, nonfunctional creation controls, paid provider calls, or changes to existing campaigns/templates.
- Preserve unrelated campaign-layout work in the shared checkout.

## Verification

- 58 focused tests passed across app entry, connected studio, reference specimens and campaign layout.
- Production build and production verification passed; existing VitePress chunk-size warning remains.
- Browser-checked brand page at 1440px and 390px, standalone reference at 1280px and 390px, and campaign badge at desktop and 390px. No horizontal overflow on compact views; standalone browser error log empty. Temporary viewport override reset.
