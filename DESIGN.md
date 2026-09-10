# Brutalist Design System

This reference defines the active `/design-system` catalog and reusable library.

The application is an Operate surface: stable actions, readable state, clear workflow order, and quiet chrome around creative artwork. Preserve the current Avenir-family typography, cyan action color, black rules, 4px corners and deliberate hard interactive shadows.

## Foundations

Canonical values live in `src/components/design-system/foundations/tokens.css`, loaded by the compatibility entry `src/styles/tokens.css`. Components use semantic `--v2-*` roles; primitive palette values are defined once. Legacy unprefixed tokens remain available for older consumers.

| Role | Current contract |
| --- | --- |
| Canvas / surface / ink | #f4f4f0 / #ffffff / #000000 |
| Action / success / danger | #79d9ff / #23a094 / #dc341e |
| Secondary text | #595959; `--v2-muted` is decorative only |
| Typography | Avenir Next/Avenir fallback stack; H1–H5: 48/32/24/20/18px; Lead Large/Medium: 24/20px; Body: 16px; Small text: 14px. See [typography roles](docs/design-system/typography.md) for line heights and usage. |
| Spacing | 4, 8, 12, 16, 24, 32, 48, 64px |
| Sizing | 48px default control / 44px compact; icons 16, 20, 24px |
| Shape | 4px standard radius; pills for tabs/status; 1px structural border; thicker control/focus borders must be documented by role |
| Elevation / motion | 4px hard offset for interactive surfaces; feedback 150ms, disclosure 200ms, cubic-bezier(0.4, 0, 0.2, 1); reduced motion removes spatial movement |

Only the light application theme is supported. The SettingsBlock dark preview does not enable an app theme. Content-specific palettes, fonts, and animation do not inherit application appearance.

## Ownership and usage

Use atomic imports from `src/components/design-system/atoms`, `molecules` and `organisms`. Existing flat entry points remain compatibility exports. Example code lives in `examples`; template candidates are documented in `templates` without inventing a reusable shell API.

Shared exports: AppButton; TokenChip; TokenCopyTarget; PillTabs/PillTabPanel; WorkflowSteps; SelectMenu; PromptComposer. All others must be checked in the catalog before assuming a reusable contract. SelectMenu is currently adopted by catalog examples, not the active app. AppButton emphasis and icon shape are independent; states are native CSS/ARIA behavior rather than enumerated visual variants.

Keep application keyboard/interaction behavior in the shared component. Product CSS may size/compose it. Keep visible labels and help/error associations; use labels/icons alongside color. Tabs require real labelled panels. A read-only brief is readable and focusable, with editing/submission blocked. Busy operations must not duplicate requests.

Validate local table overflow, long copy, narrow screens, native focus and reduced motion. The internal target policy is 44px minimum for ordinary controls; do not confuse this with WCAG 2.2's 24px AA criterion and its exceptions.

See [audit](docs/design-system/audit.md), [migration map](docs/design-system/migration.md), [component contracts](docs/design-system/components.md), [roadmap](docs/design-system/roadmap.md), and [validation](docs/design-system/validation.md).
