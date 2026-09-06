# Campaign module architecture

Status: implemented and locally verified on 2026-09-07. Independent module fixtures, explicit commands, stable hosts and real workflow tests are implemented. Physical-browser verification completed the feedback/reopen/version-2 approval and download loop, plus responsive and keyboard checks. See the [requirement audit and verification limits](2026-09-07-integration-verification.md); this is not a deployment or real-provider certification. Later step-specific changes follow their separately approved specifications.

Execution breakdown: [Six-module campaign implementation plan](2026-09-06-six-module-campaign-implementation.md). It defines reviewable phases, contracts, migration tasks, and verification without adding new step functionality.

## Approved structure

Brief → Copy → Visuals → Banners → Review → Distribute

| Module | Existing UI coverage |
| --- | --- |
| Brief | Brief |
| Copy | Copy |
| Visuals | AI assets |
| Banners | Banners |
| Review | Review file, Figma review, and Approval |
| Distribute | Assets ready |

Review is one page module with internal review and approval states. Grouping these activities does not remove their existing permissions, version checks, or approval requirements. Distribute retains existing delivery behavior until its functional changes are specified.

## Module boundaries

Each module owns its UI, actions, local state, and explicit input/output contracts. It must be possible to access, develop, and debug a module independently using representative inputs. Module UI uses shared application design-system components.

The page owns layout, navigation, and overall progress. A workflow coordinator connects validated outputs to dependent modules and tracks which results have become outdated. Internal module changes should leave the page and other modules unaffected while contracts remain compatible. Contract changes require checks at the affected connections and across the full chain.

The visible workflow is ordered, while data dependencies may span several modules: Banners uses both selected copy and selected visuals. Review and Distribute refer to the exact reviewed or approved version.

## Migration considerations

- Replace the current eight navigation positions with six stable module identities.
- Consolidate the existing review-related UI into Review, keeping its internal states distinct from the page's selected module.
- Handle existing numeric step URLs explicitly. Old `?step=5` means Figma review; it must not silently become Distribute under a new zero-based index.
- Keep drafts, errors, and loading local to each module; refreshing a result must not reset unrelated drafts.
- Verify each module independently, then verify dependencies, review gates, retries, and the complete chain.

The functions and detailed input/output changes inside each module will be specified later. No new step functionality is assumed by this plan.
