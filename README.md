# Brutalist Design System

A standalone React design-system library and interactive workbench. The workbench runs at [Design System](http://127.0.0.1:5178/design-system).

## Run locally

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5178
```

## Repository boundaries

- `src/components/design-system/index.ts`, `basics/`, `components/`, and `ui-blocks/`: public library.
- `atoms/`, `molecules/`, and `organisms/`: retained local APIs and compatibility adapters; not all are package exports.
- `examples/`, `workbench/`, `src/screens/`, and app styles: interactive documentation and specimen layouts.
- `fixtures/package-consumer/` and `scripts/`: package build and isolated consumer verification.
- `docs/`: design-system reference and relevant historical plans, including pending Figma work.
- `observatory/`: retained project-local task tracking infrastructure.

Legacy campaign application assets, unrelated projects and agent-plugin bundles have been removed. Sample campaign wording in specimens is illustrative data, not a shipped product workflow.

## Verify

```sh
npm run typecheck
npm run test:run
npm run build:library
npm run verify:package
npm run test:scripts
npm run verify:consumer
npm run build
```

The consumer check packs `dist-library/`, installs the tarball and declared dependencies into a fresh temporary directory, then typechecks and builds it without source aliases or copied host modules. It requires npm registry access.

Task-tracker verification is separate: `npm --prefix observatory run harness`.

## Consume the library

Build with `npm run build:library`, then run `npm pack ./dist-library` to create an installable tarball. The repository root is private; the generated artifact is the consumer package.

```tsx
import { DesignSystemRoot, AppButton } from 'brutalist-design-system'
import 'brutalist-design-system/styles.css'

export function App() {
  return <DesignSystemRoot><AppButton variant="primary">Save</AppButton></DesignSystemRoot>
}
```

See [getting started](docs/design-system/getting-started.md), [component ownership](src/components/design-system/README.md), and [validation](docs/design-system/validation.md).
