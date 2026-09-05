# Brief and Copy UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace form-filling with a brief composer and compare five banner copy options in table, card, and banner views.

**Architecture:** Preserve existing campaign endpoints, generation jobs, selection and review gates. Expand freeform brief input, reuse the `offer` copy field for tags, and version template additions.

**Tech Stack:** React, Fastify, Zod, PostgreSQL, Gemini provider, existing SVG/Sharp rendering.

**Spec:** docs/superpowers/specs/2026-09-05-brief-copy-ux-design.md

## Global Constraints

- Preserve the approved Banner Studio visual system, sidebar, and eight-step flow.
- Work only in the integrated-mvp worktree; do not touch the original ui-v2 checkout.
- No cloud mutations or paid provider calls. Never log document content or credentials.
- Exactly five new copy options: headline 80, body 160, CTA 24, optional tag 40 characters. Preserve legacy records.
- Maximum attachment 5 MB; maximum combined brief 20,000 characters. Reject rather than silently truncate.

### Task 1: Backend freeform brief and five-option contract

**Files:** shared/contracts.js and tests; server/providers/{mockProvider,geminiProvider}.js and tests; a focused server brief-text extraction module and authenticated route with tests; src/studio/api.js and tests; package files if extraction dependencies are required.

**Interfaces:** Existing brief accepts `notes` alone; legacy fields default to empty strings, locale defaults to `auto`. At least useful notes or the legacy required fields must exist. POST `/api/v1/brief-files/extract` consumes `{name,mimeType,data}` (base64), returns `{text}`. Client exposes `extractBriefFile(input)`. It must enforce existing editor roles, bounded decoding/parsing, text-only extraction for TXT/MD/PDF/DOCX, and safe errors. Real provider infers campaign subject, audience, intent, and language from notes; mock is explicitly a deterministic demo, not real AI. `copy.offer` remains the optional tag. Provider boundary rejects generated counts other than five; legacy persisted schemas retain compatibility.

- [x] Write tests for notes-only input and empty rejection, exactly five generated options and missing tag, extraction success and malformed/oversized/unsupported/unauthorized requests.
- [x] Run focused tests and record expected RED failures.
- [x] Implement bounded extraction and prompt/schema updates; preserve generation guard/idempotency logic.
- [x] Run focused provider/contracts/API/extraction tests; record GREEN evidence and self-review.
- [x] Commit only task files and report changes, commands, results, and concerns.

### Task 2: Composer and comparison views

**Files:** src/components/design-system/PromptComposer.jsx, src/studio/{BriefStage,CopyStage,StudioApp}.jsx, src/studio/briefInput.js, styles and focused tests.

**Interfaces:** BriefStage submits `{title,brief:{notes}}` from one text/file composer. Files extracted with Task 1's API. Existing structured fields are converted to readable prompt text when notes do not contain them. Save before generation; saved brief remains recoverable after provider failure. CopyStage defaults to Table with Cards/Banners switches and identical candidate ids/selections. Preserve existing versions and read-only gates.

- [x] Add failing tests for one-field submission, file-only input, parser errors, pending/locked state, and view switching without losing selection.
- [x] Implement reusable composer styling from existing design-system prompt block, without settings or mock timers.
- [x] Wire create/save then generate through real campaign/job API, preserving drafts on error.
- [x] Add table, cards and five banner previews; do not auto-generate images.
- [x] Run focused UI/workflow tests and inspect desktop/mobile once, correcting findings together.

### Task 3: Optional tag in templates and delivery

**Files:** shared/studioTemplates.js and tests; src/studio/{AnimatedBanner,BannerStage,exportAnimation}.jsx/js and tests; rendering tests as needed.

**Interfaces:** optional text slot `tag`, sourced from `copy.offer`, max 40 characters. New template version 1.1.0; old version 1.0.0 continues available to existing immutable records. The same slot geometry drives browser SVG and static rendering. Blank tag is absent. HTML export accepts `tag` and escapes it.

- [x] Add failing tests for tag preview, static render, HTML export and blank omission; verify legacy template availability in the running demo.
- [x] Implement optional slot/geometry and pass it through editor persistence and export.
- [x] Run focused template/rendering/export and UI tests.

### Task 4: Review and regression verification

- [x] Independent review of scoped backend and integrated changes; address material findings.
- [x] Run full suite once changes settle, production build and actual local workflow with a freeform brief and tag.
- [x] Update this plan with evidence and hand off the preview with honest live-provider/cloud limitations.

## Verified result — September 5, 2026

- `npm run test:run -- --reporter=dot`: 78 files, 979 tests passed in 57.94 seconds.
- `npm run build`, `npm run verify:production`, and `npm run smoke:production`: passed. VitePress retains its large-chunk advisory; no build errors.
- Independent backend and integrated-feature reviews approved after fixes for legacy copy compatibility, bounded document parsing, oversized paste preservation, and Markdown MIME handling.
- Real browser at 1440px and 390px: one-field creation, five-option table, shared selection, banner previews, saved brief, image selection, optional tag, four-format composition validation, and immutable review assets. No page overflow or console errors in the inspected path.
- API restart retained the campaign, five copy options, tag, version 1.1.0 composition, and review assets. Actual `.markdown` extraction endpoint returned HTTP 200.
- UI uses the approved design-system composer styling and retains the sidebar and eight steps. Table is the default; Cards and Banners visualize the same candidates. Banner previews do not trigger extra paid image requests.
- Local preview: `http://127.0.0.1:5176/mvp`; API: `npm run dev:api` on port 3010. Work remains on `codex/integrated-mvp`; original `ui-v2` checkout untouched.
- Local generation remains a deterministic mock, not live AI. Gemini context-inference prompts and structured output are tested with provider fixtures; no paid generation or cloud deployment is claimed.

### Decisions

Proceeded without another design-approval pause, following the user's prior no-questions instruction and explicit UX direction. Interpreted five banners as five copy previews within the existing image-selection flow. If five separately generated images were intended, that is a follow-up workflow change, not a hidden provider cost.
