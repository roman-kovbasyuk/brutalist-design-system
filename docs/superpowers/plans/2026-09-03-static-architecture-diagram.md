# Static Architecture Diagram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the brittle HTML architecture map on `/docs` with an accurate, accessible, pre-rendered SVG that remains readable on mobile.

**Architecture:** A repository-owned SVG in `public/docs/` is the single visual artifact. `DocumentationScreen` embeds it in a semantic figure with adjacent accessible explanation, while CSS owns responsive sizing and horizontal overflow.

**Tech Stack:** React 19, static SVG, plain CSS, Vitest, Testing Library, Vite

**Spec:** `docs/superpowers/specs/2026-09-03-static-architecture-diagram-design.md`

## Global Constraints

- Preserve the existing documentation visual language and Russian product copy.
- The main flow must be Brief → Copy → AI assets → Templates → Review package → Figma review → Approval → Delivery.
- Show Marketer, Vlad, Designer, Slack, and the Figma ready webhook as supporting actors or integrations.
- Do not add a runtime Mermaid dependency.
- On narrow screens, preserve legibility with horizontal scrolling instead of compressing the SVG.
- Meet WCAG 2.2 AA expectations with descriptive alternative text and a textual caption.

---

### Task 1: Add the static architecture artifact and its contract test

**Files:**
- Create: `public/docs/lingu-studio-architecture.svg`
- Modify: `src/screens/DocumentationScreen.test.jsx`

**Interfaces:**
- Produces: public asset URL `/docs/lingu-studio-architecture.svg`.
- Produces: an image contract requiring accessible name `Архитектура Lingu Studio: от брифа до готового пакета`.

- [ ] **Step 1: Write the failing component test**

Add to the first `DocumentationScreen` test:

```jsx
const architecture = screen.getByRole('img', {
  name: 'Архитектура Lingu Studio: от брифа до готового пакета',
})
expect(architecture).toHaveAttribute('src', '/docs/lingu-studio-architecture.svg')
expect(screen.queryByText('Показать Mermaid source')).not.toBeInTheDocument()
```

- [ ] **Step 2: Run the focused test and verify the new contract fails**

Run: `npm test -- --run src/screens/DocumentationScreen.test.jsx`

Expected: FAIL because the accessible SVG image is not rendered yet.

- [ ] **Step 3: Create the SVG asset**

Create a `1440 × 820` SVG with three horizontal zones (`CREATE`, `REVIEW`, `DELIVER`), concise Russian labels, accessible `<title>` and `<desc>`, arrow markers, and the existing design-system colors: canvas `#ffffff`, chrome `#f7f8fb`, ink `#1b2433`, rule `#dde3ec`, indigo `#3559d6`, green `#17734c`, and yellow `#ffe27a`.

The primary route must contain these eight named nodes in order:

```text
Brief → Copy → AI assets → Templates → Review package → Figma review → Approval → Delivery
```

Add secondary nodes for `Маркетолог`, `Vlad`, `Slack`, `Дизайнер`, and `Ready webhook`, with dashed connectors into the relevant primary nodes. Include a bottom legend distinguishing human decision, app step, and external integration.

- [ ] **Step 4: Validate the SVG syntax and required labels**

Run:

```bash
xmllint --noout public/docs/lingu-studio-architecture.svg
rg -n "Brief|Copy|AI assets|Templates|Review package|Figma review|Approval|Delivery|Маркетолог|Vlad|Slack|Дизайнер|Ready webhook" public/docs/lingu-studio-architecture.svg
```

Expected: `xmllint` exits 0 and every required label is found.

- [ ] **Step 5: Commit the asset and failing UI contract together**

```bash
git add public/docs/lingu-studio-architecture.svg src/screens/DocumentationScreen.test.jsx
git commit -m "test: define static architecture diagram contract"
```

### Task 2: Integrate the SVG and make the viewport responsive

**Files:**
- Modify: `src/screens/DocumentationScreen.jsx`
- Modify: `src/styles/app.css`
- Test: `src/screens/DocumentationScreen.test.jsx`

**Interfaces:**
- Consumes: `/docs/lingu-studio-architecture.svg` from Task 1.
- Produces: `.docs-architecture-figure`, `.docs-architecture-viewport`, and `.docs-architecture-caption` presentation hooks.

- [ ] **Step 1: Replace the HTML architecture renderer**

Replace `<ArchitectureDiagram />` and the adjacent primary `<MermaidSource>` with:

```jsx
<figure className="docs-architecture-figure">
  <div className="docs-architecture-viewport">
    <img
      src="/docs/lingu-studio-architecture.svg"
      alt="Архитектура Lingu Studio: от брифа до готового пакета"
      width="1440"
      height="820"
    />
  </div>
  <figcaption className="docs-architecture-caption">
    Маркетолог задаёт контекст и принимает финальное решение; приложение управляет генерацией и package, а дизайнер подтверждает качество в Figma.
  </figcaption>
</figure>
```

Delete `overallMermaid`, `ArchitectureDiagram`, `DiagramNode`, and `DiagramConnector` after confirming they have no other callers. Leave journey Mermaid disclosures unchanged because they are outside this narrow replacement.

- [ ] **Step 2: Add responsive figure styling**

Implement these behaviors in `src/styles/app.css`:

```css
.docs-architecture-figure { margin: 0; }
.docs-architecture-viewport { overflow-x: auto; overscroll-behavior-inline: contain; -webkit-overflow-scrolling: touch; }
.docs-architecture-viewport img { display: block; width: 100%; height: auto; min-width: 760px; }
.docs-architecture-caption { margin-top: 14px; max-width: 72ch; color: var(--muted); font-size: 12px; line-height: 1.5; }

@media (max-width: 640px) {
  .docs-architecture-viewport { margin-inline: -18px; padding-inline: 18px; }
  .docs-architecture-viewport img { min-width: 720px; }
}
```

Remove the obsolete `.docs-architecture-row`, `.docs-diagram-node`, `.docs-diagram-connector`, and `.docs-diagram-label` rules.

- [ ] **Step 3: Run the focused test and verify it passes**

Run: `npm test -- --run src/screens/DocumentationScreen.test.jsx`

Expected: all documentation tests pass.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm test -- --run
npm run build
git diff --check
```

Expected: all tests pass, Vite production build exits 0, and no whitespace errors are reported.

- [ ] **Step 5: Inspect desktop and mobile rendering**

Run the production preview and inspect `/docs` at `1440 × 1000` and `390 × 844`. Confirm the entire diagram is readable on desktop; on mobile, the diagram viewport scrolls horizontally while the page itself does not gain unintended horizontal overflow.

- [ ] **Step 6: Commit the integration**

```bash
git add src/screens/DocumentationScreen.jsx src/styles/app.css src/screens/DocumentationScreen.test.jsx public/docs/lingu-studio-architecture.svg
git commit -m "feat: render docs architecture as responsive SVG"
```

### Task 3: Deploy and verify the documentation update

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: verified production build from Task 2.
- Produces: a new ready Cloud Run revision for `lingu-studio` in `europe-west6`.

- [ ] **Step 1: Deploy the verified source**

Run:

```bash
CLOUDSDK_PYTHON=/opt/homebrew/bin/python3.11 gcloud run deploy lingu-studio --source . --project=gen-lang-client-0466191751 --region=europe-west6 --allow-unauthenticated --quiet
```

Expected: Cloud Run reports a ready revision receiving 100% traffic.

- [ ] **Step 2: Verify the live page and asset**

Run:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://lingu-studio-7irz6jmdqa-oa.a.run.app/docs
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://lingu-studio-7irz6jmdqa-oa.a.run.app/docs/lingu-studio-architecture.svg
```

Expected: `/docs` returns `200`; the SVG returns `200 image/svg+xml`.
