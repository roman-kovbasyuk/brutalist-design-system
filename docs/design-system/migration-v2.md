# Migrating to design system v2

Import production controls from `src/components/design-system` during local migration, then from the package entry when using the built artifact. Import `styles.css` once at the application boundary and wrap the consumed area in `DesignSystemRoot`.

Existing `atoms/`, `molecules/`, and `organisms/` paths are retained for compatibility. New work should use the public v2 API. Do not import a Workbench module from a consumer application.

Consumer applications provide data, requests, authorisation, persistence and workflow semantics. UI Blocks only capture local drafts and invoke supplied callbacks.
