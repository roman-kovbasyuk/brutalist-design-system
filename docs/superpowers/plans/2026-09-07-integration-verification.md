# Integrated campaign verification — 7 September 2026

The six-module implementation and scoped final fixes are independently reviewed and tested. Local mock-backed physical-browser acceptance is complete, including a feedback round and version 2 download. This is not a deployment or real-provider release certification.

## Verified

| Check | Result |
| --- | --- |
| Full unit/integration suite | 136 files, 1,340 tests passed; exit 0; fresh browser-closeout run 70.17 seconds |
| Application and documentation build | Passed; existing VitePress large-chunk advisory |
| Production artifact/configuration checks | 41 SPA assets and 80 docs assets verified; container configuration verified, not a running container |
| Default isolated workflow | Fresh closeout run delivered a 40,806-byte ZIP; hash `426c569ece11d23108ccbb9a5f32e192ec6ea0e00fefed7e33a3567096cddde8`; own resources cleaned |
| Production fixture exclusion | Checked playground markers absent from all 26 SPA JavaScript files |
| Final independent review | Two P2 production findings repaired; scoped re-review accepted all four production/coverage/documentation items with no new breakage |
| Physical-browser workflow | Notes-only Brief → five Copy/three prompts → explicit linked image → Banners → Review v1 → designer feedback → reopen → two-format v2 → designer checks → independent approval → build and download |
| Downloaded version 2 | 73,326-byte ZIP; campaign and version IDs match; archive integrity and manifest verified; SHA-256 `259388ae8c49c006ce3f504bd84ab57f9132c2db70f4521e41e4ec2d7acafe93` |
| Responsive and keyboard | All six modules inspected at 2252, 1440 and 390px; no horizontal page overflow; timeline, preview focus return, tab arrow navigation, mobile drawer and reload verified |
| Final UI cleanup | Visuals count/action gap: 0px → 12px, wraps with 12px vertical gap at 390px; standalone playground now uses canonical app control scope, retry target 27.7px → 48px |

Commands: `TEST_DATABASE_URL=postgresql:///banner_studio_test npm run test:run`, `npm run build`, `npm run verify:production`, and `TEST_DATABASE_URL=postgresql:///banner_studio_test npm run test:workflow`.

The tests exercise Brief → Copy → Visuals → Banners → Review → Distribute through real frontend commands, API routes, services and isolated PostgreSQL. Generation is mocked. Connected UI/HTTP tests additionally exercise designer feedback, pointer and keyboard reopening, independent approval, second-version delivery and downloaded ZIP identity. Only missing jsdom layout/download facilities are substituted in those connected tests.

Final regressions cover used versus unused secondary batch sources, invalidation and rebuilding, immutable historical snapshots, fresh analysis after campaign duplication, and a real Copy-card approval making exactly one approval request and one workspace refresh. No extra generation follows approval.

## Architecture and UX

- Six stable module frames with named commands and narrow inputs. Same-campaign refreshes preserve local drafts; source keys and server revisions protect stale submissions.
- Development-only fixture playground for each module; direct/near-viewport activation keeps activated editors mounted. Preview and template routes retain lazy import boundaries.
- Canonical app design-system controls and tokens remain separate from banner brand styling. Visuals has one owner for transient/persisted error feedback; mobile timeline collapses before scrolling to its target.
- Exact-version review, independent designer/approver permissions and approved-only distribution remain authoritative on the server. No new external publishing, notification or approval workflow was introduced.

## Requirement audit

| Requirement | Authoritative evidence |
| --- | --- |
| Exactly six stable modules and direct access | `moduleContracts.js`, lazy `moduleRegistry.js`, `CampaignPage.jsx`; all six headings and navigation targets exercised in the browser |
| Independent functionality and narrow I/O | Six command factories/views, `useCampaignModule`, real-module harness/playground tests; fixture retry records `preparePrompts({retry:true})` without live API use |
| Compatible internal changes leave page intact | Uniform port and registry; module tests render independently of shell; `ModuleHost.test.jsx` contains render failure locally |
| Actual dependent contracts remain safe | `campaignRuntimeFlow.integration.test.js`: secondary used/unused batch sources, rebuilding, immutable history and fresh-source duplication |
| Refresh/error does not destroy drafts | `campaignRuntime.test.js`, `moduleLoading.test.jsx`, coordinator and connected page tests: retained input identity, dirty ownership, stable mounted sibling, stale-input rejection |
| URL compatibility and permission guards | Semantic navigation and explicit legacy-step mapping tests; live keyboard links update the matching query/hash; locked modules do not run commands |
| Review gates and second-version feedback loop | Real browser campaign `1184f89c-c467-4508-8d87-c14df2131aeb`; v2 `8d3911c0-c290-45d8-b583-50c33d63d69a`; designer cannot approve own checks, marketer approval recorded in ZIP manifest |
| Exact approved-only distribution | Browser-downloaded ZIP contains portrait 1080×1350 and square 1080×1080 plus manifests; CLI and connected UI/HTTP tests verify authorization, hashes and idempotency |
| App DS/sidebar separate from banner brands | Shared controls/frames, existing three-menu sidebar and distinct template manifests; desktop/mobile screenshot inspection and atomic contract suite |
| Loading/debugging and recorded measurements | DEV-only playground, fixture parity/exclusion checks, sticky near-viewport activation and no-observer tests; before/after build and controlled request/mount evidence in `2026-09-07-module-loading-measurements.md` |
| No expansion into unapproved features | Existing service/auth boundaries retained; mock generation only; design-only Approval/Pageful proposals not implemented |

Browser checks included keyboard Enter navigation through every module, Banners ArrowRight tab switching, Copy preview opening and Escape focus restoration, mobile timeline collapse before scrolling, mobile drawer Escape focus return, and reload of delivered version 2. Fixture Visuals failure displayed one alert; keyboard retry and reconciliation produced the expected recorded actions. The download-event observer timed out, but the actual file appeared in Downloads with this exact campaign/version and matching approval timestamp; file inspection, not the event observer, proves download success.

The final two UI fixes were confirmed with failing then passing computed-layout assertions in the browser. The 3-file focused playground/atomic/Visuals run passed all 35 tests after the playground scope change. No new business logic was changed.

## Verification limits

Browser controls intermittently stalled after demo-role switches; saved state was preserved and the same campaign resumed to completion. This was not reproduced as an application defect. Production network waterfalls and browser speed gains are not certified: loading evidence is explicitly build-byte and controlled mount/request evidence, not a timing claim. The mock provider's striped image and synthetic text are not production creative-quality evidence.

Real providers, cloud storage/authentication, running-container deployment, video generation and external publishing are outside this local mock-backed verification. Figma handoff remains manual PNG import plus link/checklist. Standalone combobox extraction remains deferred; the routed catalog has its scoped positioning rule.

No user campaign or demo configuration was changed during integration QA. Owned browser fixture PID 13618 exited through its cleanup handler; its exact schema count is zero and temporary asset directory is absent. QA tabs were closed and viewport reset. The verified browser ZIP is retained in Downloads. No push, merge or deployment was performed.

## Ruling retained

Current `DESIGN.md` typography and approved Copy cards supersede historical table/default-heading values in the original architecture task. This preserves the completed module owners' work. If that interpretation is wrong, the cost is a visual/default-view adjustment; it does not change the workflow or data contracts.
