# Typography roles

The application uses Avenir Next / Avenir with the existing fallback stack. The [live typography reference](http://127.0.0.1:5176/design-system#ds-typography) presents the following roles in one column. Values are font size / line height at the default scale; line-height tokens are unitless so they follow text scaling.

| Role | Size / line height | Weight | Purpose | Tokens |
| --- | --- | --- | --- | --- |
| H1 | 48px / 52px | Medium 500 | Page title | `--v2-text-h1`, `--v2-line-h1` |
| H2 | 32px / 36px | Medium 500 | Major section heading | `--v2-text-h2`, `--v2-line-h2` |
| H3 | 24px / 28px | Medium 500 | Section heading | `--v2-text-h3`, `--v2-line-h3` |
| H4 | 20px / 24px | Medium 500 | Subsection heading | `--v2-text-h4`, `--v2-line-h4` |
| H5 | 18px / 24px | Medium 500 | Nested subsection heading | `--v2-text-h5`, `--v2-line-h5` |
| Lead Large | 24px / 36px | Regular 400 | Page introduction or summary | `--v2-text-lead-large`, `--v2-line-lead-large` |
| Lead Medium | 20px / 28px | Regular 400 | Section introduction or supporting summary | `--v2-text-lead-medium`, `--v2-line-lead-medium` |
| Body | 16px / 22px | Regular 400 | General interface and reading text | `--v2-text-body`, `--v2-line-body` |
| Small text | 14px / 20px | Regular 400 | Captions, metadata and supporting details | `--v2-text-small`, `--v2-line-small` |

Each rendered role is a copy target. Click or use Enter/Space on its visual sample to copy one combined declaration containing the font family, role size, line height and weight, for example `font: var(--v2-weight-heading) var(--v2-text-h1) / var(--v2-line-h1) var(--v2-font);`. Token names stay out of the specimen layout; the Library detail view exposes the underlying names when documenting a component. Color swatches and spacing markers use the same copy interaction and copy their single semantic token.

Headings use `--v2-weight-heading`; leads and reading text use `--v2-weight-text`. The extra leading and regular weight distinguish lead copy from headings of the same size. Keep paragraph measures around 65 characters where the layout allows; allow wrapping and browser zoom.

Choose HTML heading levels by document hierarchy. Lead text is a paragraph. The catalog uses paragraph samples to demonstrate appearance without introducing extra page headings. A visual role does not justify skipping heading levels.

Canonical tokens live in [foundations/tokens.css](../../src/components/design-system/foundations/tokens.css). Existing size tokens remain aliases: page → H1, display → H2, section → H3, component → H4, meta → Small text. This reorganization adds H5 and lead roles and updates the reference; existing application consumers keep their current size values. Adopt the new line-height roles deliberately when changing a consuming component.

Validated 6 September 2026: all nine rendered sizes, line heights and weights match this table; desktop and 320px samples wrap without horizontal overflow. The 35 existing catalog/token tests and production build pass. Pre-change files for this typography update are backed up in `/tmp/banner-studio-typography-before`.
