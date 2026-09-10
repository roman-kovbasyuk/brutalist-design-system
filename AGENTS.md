# UI implementation rules

- Use components from `src/components/design-system/` for application controls and layouts before creating new markup.
- If a required pattern does not exist, add it to the design-system component library first, then use that component at the product call site.
- Keep design-system styling and interaction behavior canonical; do not create one-off tabs, buttons, menus, or form controls in screen components.
- Reuse the existing design tokens and responsive rules. Product-specific CSS should only compose or size a shared component, not redefine its interaction model.

<!-- task-observatory:start -->
## Task Observatory

Before acting on project requests, read and follow [observatory/AGENT-INSTRUCTIONS.md](observatory/AGENT-INSTRUCTIONS.md). Use its CLI to pull existing tasks, record new requests, report progress, and verify completion. Keep credentials and sensitive application data out of task records.
<!-- task-observatory:end -->
