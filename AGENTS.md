# UI implementation rules

- Use components from `src/components/design-system/` for application controls and layouts before creating new markup.
- If a required pattern does not exist, add it to the design-system component library first, then use that component at the product call site.
- Keep design-system styling and interaction behavior canonical; do not create one-off tabs, buttons, menus, or form controls in screen components.
- Reuse the existing design tokens and responsive rules. Product-specific CSS should only compose or size a shared component, not redefine its interaction model.

## Campaign module architecture

- The approved campaign flow has exactly six modules, in this order: Brief → Copy → Visuals → Banners → Review → Distribute.
- Review contains review preparation, Figma review, and approval within one module. Distribute is the new name for Assets ready. Visuals replaces the AI assets step label.
- Each module owns its functionality, local state, and explicit input/output contract, and must support independent development and debugging. The page owns layout and navigation; workflow coordination connects module outputs to their dependents.
- Internal module changes should not require page changes when the module contract stays compatible. Contract changes must be checked against dependent modules and chain tests.
- Step-specific functional changes will be defined by the user later. This structural decision does not authorize inventing functionality or changing review permissions, approval requirements, or delivery behavior.
- The live campaign page uses `src/studio/campaign/CampaignPage.jsx`, six lazy module hosts, and an actor/campaign-scoped runtime. See `src/studio/campaign/README.md` for contracts and independent test entry points. Legacy Stage exports are compatibility adapters, not the live workflow controller.
- Never key a module by campaign revision or replace the module tree during a mutation refresh. Preserve local drafts and send their captured input key through named commands. Keep backend authorization and artifact integrity authoritative.
