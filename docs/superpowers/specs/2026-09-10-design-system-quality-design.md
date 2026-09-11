# Design-system quality completion — proposed design

Status: approved by the user on 10 September 2026. Implementation and verification are tracked in the companion plan.

## Outcome and boundary

Finish the standalone design-system cleanup and correct the confirmed quality gaps while preserving its current visual design, routes, public imports, and supported compatibility entry points. A “10/10” result means every acceptance item below has direct evidence and no known unresolved in-scope defect; it is not a guarantee that no undiscovered defect exists.

The work does not add a product workflow, redesign the site, implement the pending Figma task, publish an npm package, or remove the retained Task Observatory installation.

## Approaches considered

1. Focused hardening (recommended): connect isolated specimen state, correct canonical tab identity, remove genuinely unused workbench layers, and improve verification. This preserves the existing gallery and addresses the observed failures directly.
2. Restore the former details/options/export interface: reconnect a larger set of dormant features. This changes the approved gallery experience and increases the verification surface.
3. Replace the workbench: establish a new documentation application. This is a separate design and migration effort, beyond these confirmed defects.

## Proposed architecture

### Interactive specimens

Each specimen owns an isolated draft keyed by its registry entry/example identity. Existing state infrastructure may be simplified and reused when it serves that contract. The renderer receives current values, not immutable initial values, and callbacks update only that specimen. Draft values remain in memory; they must not be copied to URLs or persisted as application data. Preserve the gallery layout without adding an options sidebar or code panel.

Dialogs and popovers open, dismiss with Escape, and restore focus. Checkboxes, selections, tabs, text-entry examples and composed interactive examples update their displayed state. Demonstrations with deliberately unavailable external actions must identify that limitation rather than falsely confirming real work. No provider/network action is introduced.

### Canonical tab identity

Tabs and TabPanel use the same stable value-based identity within their supplied group prefix; visible labels do not determine identity. Duplicate visible labels with distinct values remain distinguishable. Disabled items cannot activate through pointer or keyboard navigation. Retain the legacy PillTabs/PillTabPanel API and shared visual styling without introducing a second independent interaction model. Document the requirement for unique group prefixes when rendering multiple groups.

### Repository and documentation

Audit the live app and package import graphs. Remove details/options/context-export implementations only after confirming they have no supported runtime or package consumer. Keep or connect the state implementation needed by the gallery. Remove tests only when their exclusively tested implementation is deliberately removed, not to conceal failures. Preserve relevant specifications and deliberate compatibility exports.

Update release and ownership documentation to reflect actual tarball installation verification and current workbench behavior. Registry source/example metadata must not suggest unsupported package names or non-compiling snippets; remove unused generation surfaces or retain them with verified output, according to the live feature boundary.

## Acceptance evidence

| Requirement | Required evidence |
| --- | --- |
| Interactive gallery | Failing-before/passing-after integration tests for opening/dismissing overlays, toggling choices, selecting tabs and editing controlled values; live browser reproduction of the original failures now succeeding. |
| Isolation | Two specimens can change independently; navigation/remount behavior is deliberate and tested; input text is absent from URL parameters. |
| Tabs | Rendered tab and panel ID references resolve for different labels/values and duplicate labels; keyboard movement, disabled items, active panel visibility, and unique supplied prefixes are tested. |
| Canonical compatibility | Legacy and public entry points retain their contracts and use one interaction owner; existing compatibility tests pass. |
| Cleanup | App/package reachability inspection plus explicit disposition of retained compatibility and test-only tooling; no broken imports or orphaned styles created by removal. |
| Documentation | Relative links resolve; release/ownership text matches current code; exposed source snippets use the actual package and valid props. |
| Package portability | Fresh library build, public declarations/CSS checks, actual tarball installation, typecheck and consumer build; extend the consumer beyond AppButton to cover the repaired tab contract. |
| Regression verification | Full source tests, script tests, typecheck, app and library builds, patch hygiene and final independent review. |
| Visual and browser quality | Inspect both reference catalog and public workbench, representative narrow and desktop layouts, focus and disabled states; record observed sizes and limitations rather than claiming untested coverage. |
| Retained infrastructure | Rerun Observatory harness and distinguish supported-runtime results from any pre-existing infrastructure failure; do not silently label a failed check as passing. |

## Completion report

Record the commands, actual results, browser checks, review disposition and any remaining limitation. If an acceptance item cannot be verified, keep the goal incomplete and explain the specific missing evidence. Committing or pushing further changes requires clear authorization for that operation; the previous cleanup commit remains intact.
