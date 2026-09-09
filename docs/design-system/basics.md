# Basics reference for coding agents

Browse `/design-system?section=basics`. Existing links with `mode=workbench&section=basics` open the same catalog. A family link such as `#basics-elevation` scrolls to a group on this page.

The machine-readable reference is `/design-system/basics.json`. Vite serves it locally and emits the same file in production builds. It contains every public `--v2-*` token with its canonical declaration, resolved value and source file, plus the layout and icon IDs displayed in Basics.

- A copied `--v2-*` name refers to a CSS custom property. Use `var(--v2-accent)`, for example. Never substitute a new hard-coded value.
- Typography samples copy a complete font declaration using the canonical size, line height, weight and family tokens. Individual typography tokens can also be found by search.
- Layout IDs such as `Stack` resolve to the component source and package import in the reference.
- Icon IDs such as `lucide:Search` resolve to their `lucide-react` import. The gallery starts with common interface icons; its search covers the full installed Lucide collection by name or ID. Sizes are 16, 20, 24, 32 and 48px via the canonical icon tokens.

Canonical values remain in `src/components/design-system/basics/tokens.css`; the original foundations stylesheet imports it for compatibility. The catalog and JSON reference derive their values from that one file. Display labels live in `src/components/design-system/foundations/basics-catalog.js`.

Preserve the established palette, Avenir-family typography, corner radii, borders and hard interactive shadows. Use existing components before creating new ones. Basics does not change the Components or UI blocks galleries.
