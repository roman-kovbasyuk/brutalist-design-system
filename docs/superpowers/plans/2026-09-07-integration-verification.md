# Integrated campaign verification — 7 September 2026

The six-module implementation and scoped final fixes are independently reviewed and tested. Full physical-browser acceptance remains open; this is not a deployment or release certification.

## Verified

| Check | Result |
| --- | --- |
| Full unit/integration suite | 136 files, 1,340 tests passed; exit 0; 69.01 seconds |
| Application and documentation build | Passed; existing VitePress large-chunk advisory |
| Production artifact/configuration checks | 41 SPA assets and 80 docs assets verified; container configuration verified, not a running container |
| Default isolated workflow | Delivered a 40,784-byte ZIP; hash `265418feaf7fa9fcc51acff0f9c61efb10e3d37b282c91104af0044911865aca`; own resources cleaned |
| Production fixture exclusion | Checked playground markers absent from all 26 SPA JavaScript files |
| Final independent review | Two P2 production findings repaired; scoped re-review accepted all four production/coverage/documentation items with no new breakage |

Commands: `TEST_DATABASE_URL=postgresql:///banner_studio_test npm run test:run`, `npm run build`, `npm run verify:production`, and `TEST_DATABASE_URL=postgresql:///banner_studio_test npm run test:workflow`.

The tests exercise Brief → Copy → Visuals → Banners → Review → Distribute through real frontend commands, API routes, services and isolated PostgreSQL. Generation is mocked. Connected UI/HTTP tests additionally exercise designer feedback, pointer and keyboard reopening, independent approval, second-version delivery and downloaded ZIP identity. Only missing jsdom layout/download facilities are substituted in those connected tests.

Final regressions cover used versus unused secondary batch sources, invalidation and rebuilding, immutable historical snapshots, fresh analysis after campaign duplication, and a real Copy-card approval making exactly one approval request and one workspace refresh. No extra generation follows approval.

## Architecture and UX

- Six stable module frames with named commands and narrow inputs. Same-campaign refreshes preserve local drafts; source keys and server revisions protect stale submissions.
- Development-only fixture playground for each module; direct/near-viewport activation keeps activated editors mounted. Preview and template routes retain lazy import boundaries.
- Canonical app design-system controls and tokens remain separate from banner brand styling. Visuals has one owner for transient/persisted error feedback; mobile timeline collapses before scrolling to its target.
- Exact-version review, independent designer/approver permissions and approved-only distribution remain authoritative on the server. No new external publishing, notification or approval workflow was introduced.

## Remaining verification limits

Physical-browser QA reached immutable review and designer feedback. Later clicks stopped activating controls, including a fresh fixture-only selector. Full browser reopen/approval/delivery, comprehensive 2252/1440/390 responsive/keyboard/reload checks and real load timings remain unverified. Partial 1440/390 checks showed no horizontal page overflow. This is not a proven application defect and is not converted into a browser pass by the connected tests.

Real providers, cloud storage/authentication, running-container deployment, video generation and external publishing are outside this local mock-backed verification. Figma handoff remains manual PNG import plus link/checklist. Standalone combobox extraction remains deferred; the routed catalog has its scoped positioning rule.

No user campaign or demo configuration was changed during integration QA. Only owned synthetic schemas/assets were removed. No push, merge or deployment was performed.

## Ruling retained

Current `DESIGN.md` typography and approved Copy cards supersede historical table/default-heading values in the original architecture task. This preserves the completed module owners' work. If that interpretation is wrong, the cost is a visual/default-view adjustment; it does not change the workflow or data contracts.
