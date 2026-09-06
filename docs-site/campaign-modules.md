# Campaign modules

## What owns what

The page controls layout, navigation and the sidebar. Each module owns its editor and actions. A shared runtime refreshes server data; the workflow coordinator connects actions that cross module boundaries. The backend remains responsible for permissions, revisions and immutable files.

| Module | Receives | Main actions | Produces |
| --- | --- | --- | --- |
| Brief | Saved brief and analysis | Submit, extract a file, refine | Saved source, structured summary and facts |
| Copy | Current brief and analysis | Generate, approve, remove | Copy options and approvals |
| Visuals | Brief, analysis and approved Copy | Prepare prompts, generate, upload, select | Images linked to their source and selected visual |
| Banners | Approved Copy, ready Visuals and versioned templates | Select designs/sizes, save batch, prepare review | Validated design × size batch and review receipt |
| Review | Saved composition, current immutable version and history | Create version, mark ready, request changes, approve, reopen | Version-specific review decisions |
| Distribute | Exact approved version | Build, download | PNG package and identifying manifest |

## Work on one module

Production sources are in `src/studio/campaign/modules/<module>/`. Each module receives a small `port`: its input, access state, operation, named actions, asset reads and navigation. It must not import the full API client or receive the whole workspace.

`testing/ModuleHarness.jsx` renders one real module with deterministic scenarios and recorded actions. Run its tests without opening or modifying a campaign:

```sh
npm test -- --run src/studio/campaign/testing/ModuleHarness.test.jsx
npm test -- --run src/studio/campaign/modules/copy
npm test -- --run src/studio/campaign
```

Start the development server and open `/mvp/dev/modules/brief?scenario=draft`. Replace `brief` with `copy`, `visuals`, `banners`, `review` or `distribute`. The playground uses the real module views, serialized fixture records and recorded mock commands—never live campaigns.

Use its Module, Scenario, Role and Operation state controls to inspect access, pending work, failures and retry behavior. Diagnostics show input keys and action/job/request identifiers. The event log records command arguments, dirty changes and navigation. Commands do not persist a new scenario; choose another fixture state to inspect the next stage.

Scenarios: `draft`, `copy-ready`, `visuals-ready`, `composed`, `in-review`, `changes-requested`, `ready`, `approved`, `delivered`. To update snapshots after changing the Node fixture factory, run `node scripts/generate-module-playground-fixtures.mjs`, then run the fixture parity and playground tests. Generated fixture images/downloads are test placeholders, not deliverables.

The route is development-only and dynamically imported. Production builds exclude its fixture records. Controlled tests verify near-viewport activation, persistent drafts and one approval request plus one workspace refresh from the Copy card. Build measurements show separate module and preview chunks; they do not establish a browser speed improvement.

## Keep drafts and source checks intact

- Keep editor state inside its module. Do not remount a module when campaign revision changes.
- Capture the input key when a draft starts. Submit that captured key, not a newly refreshed one.
- If upstream content changes, keep the draft and explain the conflict. Do not silently replace or rebase it.
- A title-only update must not invalidate creative content or reset another module's draft.
- Refresh through the runtime. Keep session/template reads out of individual Copy actions.
- Retrying an uncertain idempotent action must retain its original identity. Do not start duplicate image work merely because a response was lost.

## Check neighboring contracts

When a module's internal implementation changes without changing its contract, the page should not need edits. When inputs or outputs change, test every consumer—not only the next visible step.

For example, changing approved Copy can affect Visuals, Banners validation and review provenance. An immutable Review version must retain its original source content even after newer drafts exist.

Banners `saveBatch` returns a `reviewInputKey` receipt. Pass that receipt to `prepareReview`, including retries. This prevents a different refreshed composition from replacing the selection the user verified. Validation identifies a design, size and field that cannot render; it does not silently shorten copy.

## Review and distribution gates

A designer records the Figma link and required checks for the exact version. An authorized approver approves that version; the designer cannot approve their own ready decision. Changes require reopening and a new review version. Historical versions and their history remain unchanged.

Distribution packages only the approved current version. PNGs, manifest and ZIP hashes must match that version. A draft refresh must never replace the approved content being downloaded.

## Integration verification

```sh
npm test -- --run server/services/campaignRuntimeFlow.integration.test.js
npm test -- --run src/studio/ConnectedStudio.review.integration.test.jsx
TEST_DATABASE_URL=postgresql:///banner_studio_test npm run test:workflow
npm run build
npm run verify:production
```

The HTTP tests use real routes, services, PostgreSQL and frontend commands with isolated schemas, mock generation and private test assets. They cover the full workflow, feedback and second-version delivery, stale source rejection, lost-response recovery, banner overflow validation and fresh analysis after duplication. Used secondary batch sources invalidate saved banners; unused changes preserve them. Historical review snapshots remain unchanged.

The connected UI test exercises designer feedback, pointer/keyboard reopening, independent approval and the exact delivered ZIP through the real API. This uses jsdom, not a physical browser. Physical-browser QA reached designer feedback before automation stopped activating controls, including fixture-only controls. Full physical-browser approval/delivery and the comprehensive responsive check remain pending. These checks also do not certify paid providers, cloud storage, Firebase login or external publishing.

The default `test:workflow` launcher uses a unique schema in the local test database, temporary asset files and mock generation. It removes only its own resources when finished. It rejects the known demo database and remote database hosts. Explicit `STUDIO_TEST_BASE_URL` mode creates records at that target and is not the safe default—do not point it at a user's demo or production campaigns.
