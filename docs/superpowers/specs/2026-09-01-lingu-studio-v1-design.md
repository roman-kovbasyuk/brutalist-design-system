# Lingu Studio V1 — PRD and Product Specification

## 1. Summary

Lingu Studio is a local-first web prototype that turns a free-form campaign brief into a designer-reviewed package of static and animated banners. V1 demonstrates the complete controlled process without requiring Claude Code, a cloud backend, model credentials, or an automatic Figma integration.

The prototype uses deterministic local generation so the workflow can be evaluated immediately. Real providers can later replace the local adapters without changing the UI state model.

## 2. Problem

Open-ended AI design generation produces visually similar or inconsistent banners and makes quality hard to control. Clients also should not have to write copy, understand prompting, or assemble layouts.

The V1 solves this by separating responsibilities:

- AI interprets the brief and prepares copy and media prompts.
- A curated library of 20 compositions constrains layout.
- The client selects one of five generated visual directions.
- A designer approves the master layout in Figma.
- The system renders and resizes only after approval.

## 3. Goals

1. Make the whole process legible as a sequence of visible stages.
2. Demonstrate that 20 compositions can share one design-system and data contract.
3. Let a client go from brief to selected visual and assembled draft without assistance.
4. Make designer review an explicit blocking state.
5. Demonstrate delivery in four major advertising formats.
6. Run locally with one install and no secrets.

## 4. Non-goals

- Production AI generation or provider billing.
- Automatic Figma creation or editing.
- Authentication, organizations, persistence, or collaboration.
- Freeform design editing.
- Ad-platform distribution.
- Arbitrary formats outside the four demonstrated outputs.
- Production-grade video rendering.

## 5. Primary Workflow

### Stage 1 — Brief

The client enters a free-form campaign idea. The prototype includes a prefilled example but accepts arbitrary text. A non-empty brief is required.

### Stage 2 — Strategy and Copy

Local generation derives:

- audience and campaign goal;
- offer;
- headline;
- supporting copy;
- CTA;
- one static-image prompt;
- one video prompt.

The client can inspect and edit generated copy before continuing.

### Stage 3 — Visual Generation

The system creates five visually distinct directions from the prompt. V1 renders deterministic abstract compositions locally and labels them as demo generation.

### Stage 4 — Client Selection

The client selects exactly one visual. Each option exposes its art direction and prompt.

### Stage 5 — Template Assembly

The client selects one of 20 template compositions. The selected copy and visual appear inside a ratio-correct banner preview. Templates differ by text position, media balance, background treatment, content density, and alignment.

### Stage 6 — Figma Review

The app prepares a review packet containing the brief, copy, prompts, visual choice, template ID, and master format. The stage becomes blocked until the user simulates designer approval. The UI explains that production integration exports this packet to Figma and receives an approved link/version.

### Stage 7 — Final Package and Resizes

After approval, the system presents final previews for:

- 1080×1080;
- 1080×1350;
- 1080×1920;
- 1200×628.

The layouts reflow according to format family rather than stretching the master. The delivery summary distinguishes static PNG/JPEG and animated MP4 outputs as production targets; V1 exports a JSON job manifest and provides browser previews.

## 6. Information Architecture

### `/` Workflow

Persistent product navigation plus a seven-step progress rail. Only completed and current stages are directly available; a user can return to previous stages without losing state.

### `/templates` Template Library

Twenty filterable templates with ratio, density, alignment, media treatment, and animation style. Selecting a template can return the user to the assembly stage.

### `/system` Design System

Visualizes colors, typography, spacing, controls, statuses, content contract, format rules, and motion principles.

## 7. Template Contract

Each template defines:

```ts
type Template = {
  id: string;
  name: string;
  index: number;
  family: 'split' | 'overlay' | 'editorial' | 'poster' | 'product';
  masterRatio: 'portrait' | 'story';
  alignment: 'left' | 'center' | 'right';
  density: 'quiet' | 'balanced' | 'dense';
  mediaMode: 'full' | 'split' | 'window' | 'background';
  motion: string;
  layout: string;
};
```

Runtime content uses one stable shape:

```ts
type CampaignContent = {
  headline: string;
  body: string;
  cta: string;
  offer: string;
  visualId: string;
};
```

## 8. State Model

The app stores one in-memory `CampaignState`:

```ts
type CampaignState = {
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  brief: string;
  strategy: GeneratedStrategy | null;
  visuals: VisualDirection[];
  selectedVisualId: string | null;
  selectedTemplateId: string | null;
  review: { status: 'not-ready' | 'ready' | 'in-review' | 'approved'; figmaUrl?: string };
};
```

State transitions are validated by pure functions. Refresh resets the prototype, which is acceptable for V1.

## 9. Local-first Architecture

- `src/domain/` contains pure workflow, generation, template, and resize logic.
- `src/components/` contains reusable UI and banner rendering.
- `src/screens/` contains workflow stages and reference views.
- `src/data/` contains 20 template definitions and demo visual seeds.
- No code imports or invokes `.claude`, Claude Code, HyperFrames, Apify, or cloud SDKs.
- Future integrations implement the same local service interfaces.

## 10. Error and Edge States

- Empty brief: inline recovery message; generation stays disabled.
- Long generated copy: preview clamps visually and reports overflow warning.
- No selected visual/template: next action remains disabled with specific guidance.
- Review pending: final render action is blocked.
- Reduced motion: all nonessential transitions disabled.
- Narrow viewport: navigation and step rail become horizontal scrollers.

## 11. Acceptance Criteria

- App loads locally with no credentials.
- User can complete all seven stages.
- Five visual directions are shown after brief analysis.
- Template library contains exactly 20 distinct entries.
- Design-system page is accessible from global navigation.
- Figma review is visibly blocking before approval.
- Four final format previews appear only after approval.
- Domain tests cover validation, generation, template count, stage gating, and resize layout decisions.
- Production build succeeds.
- Desktop and mobile views have no horizontal page overflow or inaccessible primary controls.

## 12. Deliberate V1 Simulation

The app labels generated content, Figma handoff, rendering, and exports as prototype behavior where no external adapter exists. It must never imply that a real API call or Figma write occurred.
