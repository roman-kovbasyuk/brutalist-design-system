# Design system v2: getting started

Use the public API and stylesheet together:

```tsx
import { DesignSystemRoot, AppButton } from 'brutalist-design-system'
import 'brutalist-design-system/styles.css'

export function App() {
  return <DesignSystemRoot><AppButton variant="primary">Save</AppButton></DesignSystemRoot>
}
```

The library currently supports the light off-white, white, black, cyan, teal and red palette. The font token uses the documented Avenir-family fallback stack. UI Blocks own local draft state only; applications own persistence, permissions, networking and workflow rules.

Legacy source paths remain compatibility surfaces while consumers migrate to public exports.
## Browsing Basics

Open `/design-system?section=basics` to browse or search foundations. Click a sample to copy its token or component ID. Agents can resolve copied identifiers using `/design-system/basics.json`; see [Basics reference](basics.md) for the format and canonical source.
