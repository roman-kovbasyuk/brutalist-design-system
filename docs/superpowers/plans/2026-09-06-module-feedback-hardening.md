# Module feedback and mobile navigation hardening

## Scope

Preserve the six-module chain, current appearance and canonical design-system controls. Fix observed integration rough edges only: repeated Visuals error announcements and mobile timeline navigation before its expanded layout collapses. Banners overflow/validation is separately owned by the Banners task; do not edit those files.

## Task 1 — focused regression-first fixes

- Inspect ModuleHost, module-owned errors/progress, CampaignTimeline and the actual page scroll handler.
- Add failing tests proving one visible error per failed Visuals prompt operation with retry still available; check other modules retain their error feedback.
- Give shared loading feedback the canonical AsyncStatus only where it does not duplicate module-owned progress. Avoid removing meaningful detailed progress.
- Add a failing mobile-timeline ordering test: collapse must be committed before navigation measures/scrolls the target. Keep keyboard activation and disabled-step behavior.
- Implement the smallest scoped fixes using existing DS components; preserve drafts, callbacks, input keys and module isolation.
- Run focused tests; independent review before acceptance. No commits, index changes or full suite while the parent coordinates the shared worktree.

Allowed production scope: ModuleHost, CampaignTimeline, and (only if needed for one error owner) VisualsModule. Tests may be added next to these. No style redesign, new dependencies or backend edits.

## Acceptance

- One actionable error for one failed operation, recovery still works.
- No duplicate generic/detailed loading announcement for one running operation.
- Expanded mobile navigation collapses before the existing scroll callback; desktop behavior remains intact.
- Focused regression tests green; browser confirmation at 390 and 1440 widths. Parent owns final full-suite/build and commit.
