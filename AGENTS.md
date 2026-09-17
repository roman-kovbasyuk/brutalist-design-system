# Atomic Design rules

- Dependency direction: Basics → Components → UI blocks → Screens. Lower layers never import higher layers.
- Basics owns tokens, typography, icons and layout in `src/atomic/atoms`.
- Components owns reusable controls and interaction behavior in `src/atomic/components`.
- UI blocks compose only Basics and Components; do not introduce private controls or depend on another block as a building block.
- Expose missing reusable features in the owning lower layer first. Reusing CSS classes on private markup is not component reuse.

- Use components from `src/atomic/` for application controls and layouts before creating new markup.
- If a required pattern does not exist, add it to the design-system component library first, then use that component at the product call site.
- Keep design-system styling and interaction behavior canonical; do not create one-off tabs, buttons, menus, or form controls in screen components.
- Reuse the existing design tokens and responsive rules. Product-specific CSS should only compose or size a shared component, not redefine its interaction model.

## Component usage guidance

Before choosing or documenting a component, check the [Component Usage Guidance](docs/guides/component-usage.md). The component’s purpose, context, alternatives, and application responsibilities must be consistent with that document.

## Direct design-system changes

When a configured npm application requests a shared component change, use the local change queue so the worker can promote the verified result into this design-system repository:

1. Configure the application once with `npm run changes -- configure --app /absolute/path/to/app --check typecheck --check build` using its real verification scripts.
2. Keep `npm run changes:worker` running from the design-system checkout.
3. Submit a JSON request containing exactly `requestId`, `installedVersion`, `component`, and `change` with `npm run changes -- request --input /absolute/path/to/request.json`.
4. Inspect the durable result with `npm run changes -- get <requestId>` until it is `ready` or `failed`.

The worker gives the implementation agent an isolated worktree, enforces the allowed atomic scope, runs verification, commits the candidate, fast-forward promotes it into the clean `main` checkout, creates the retained package artifact, and adopts that exact artifact in the configured application. Read [the external changes protocol](docs/external-changes.md) before operating the queue. Do not manually stage or commit a worker request, push to a remote, publish to npm, or edit the consuming application as a shortcut; the worker owns promotion and recovery.
