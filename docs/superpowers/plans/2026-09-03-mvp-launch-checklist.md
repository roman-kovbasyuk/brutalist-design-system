# MVP Launch Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Встроить в `/docs` интерактивный локальный checklist запуска MVP с распределением задач по владельцам и стадиям.

**Architecture:** Данные checklist будут константой внутри `DocumentationScreen.jsx`; локальное состояние выполненных task IDs будет храниться через `useState` и `localStorage`. UI добавляется отдельным section между scope/templates, без изменения backend и существующих campaign flow.

**Tech Stack:** React, Vitest, Testing Library, существующие CSS tokens и Lucide icons.

**Spec:** `docs/superpowers/specs/2026-09-03-mvp-launch-checklist-design.md`

## Global Constraints

- MVP checklist is local-only and requires no backend.
- Task owners are Ira, Vlad, Roman + Codex, and the whole team.
- Stages are `До implementation`, `Parallel work`, and `Launch readiness`.
- Existing campaign workflow must remain unchanged.

### Task 1: Add checklist behavior tests

**Files:**
- Modify: `src/screens/DocumentationScreen.test.jsx`

- [ ] **Step 1: Write failing tests**

Add assertions that the page renders `MVP Launch Checklist`, owner/stage filters, a task with visible artifact/dependency metadata, and that checking a task updates progress and survives a remount.

- [ ] **Step 2: Run tests to verify failure**

Run `npm test -- --run src/screens/DocumentationScreen.test.jsx`.
Expected: FAIL because the checklist section and behavior do not exist.

### Task 2: Implement checklist state and UI

**Files:**
- Modify: `src/screens/DocumentationScreen.jsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- `checklistItems`: array of `{ id, owner, stage, title, artifact, dependency }`.
- `ChecklistSection`: renders filters, progress summary, and task checkboxes.

- [ ] **Step 1: Add checklist data and local persistence**

Use a stable storage key `lingu-studio-mvp-checklist-v1`; initialize completed IDs defensively from JSON and write only valid IDs.

- [ ] **Step 2: Add the section**

Render the section inside DocumentationScreen with filters for all owners and stages, and with progress counts for overall and each role.

- [ ] **Step 3: Add responsive styles**

Use existing tokens, compact task cards, readable metadata, and one-column mobile layout.

- [ ] **Step 4: Run focused tests**

Run `npm test -- --run src/screens/DocumentationScreen.test.jsx`.
Expected: all checklist and existing documentation tests pass.

### Task 3: Verify production output

**Files:**
- No source changes.

- [ ] **Step 1: Build the app**

Run `npm run build` and confirm Vite exits with code 0.

- [ ] **Step 2: Review the diff**

Run `git diff --check` and confirm no whitespace errors; verify only checklist documentation/page files changed.

