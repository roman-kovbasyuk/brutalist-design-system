# Visuals module

Owns visual methods, batch progress, images, uploads and prompt copying. The page only composes the module and navigation. It uses the actor/campaign-scoped runtime and existing durable generation jobs; no image-generation effect runs on mount or input changes.

## Contract

Input: analyzed brief, current copy options with stable IDs and effective approval, existing directions, current Banners selection. Outputs: append-only direction batches, campaign-wide or copy-linked scope, saved copy snapshot, optional static asset and latest per-card job status. Stale cards remain readable as **Source changed**; generation and Banners selection require current input.

Commands:

- `generate('campaign' | 'selected_copy', {onProgress})`: prepare exactly three campaign-wide prompts or one per approved copy, then generate their images sequentially from that explicit click. Progress callback reports real prompt/image counts.
- `image(directionId)`: generate/retry one current missing image.
- `generateAll({onProgress})`: fill eligible missing images only; excludes ready, blocked, pending and unknown cards.
- `upload(target, file)`: target `{mode:'campaign'}`, `{mode:'selected_copy',copyId}` or `{directionId}`. The server validates bytes and stores an immutable private asset. Replacement swaps the reference only after success; old bytes remain and any selected composition becomes stale.
- `select(directionId)`: bridge a ready asset to Banners. A copy-linked image also selects its exact copy without removing other approvals.

Known failed image jobs can retry individually. Unknown transport/provider outcomes stop the batch; refresh/reconcile the original job before another paid request. Successful siblings are not repeated. Closing the browser may leave prompts without images; reopening does not auto-spend, and the explicit bulk action completes them.

## Storage and integration

Migrations `025_visual_assets.sql` and `026_visual_upload_provenance.sql` store scope, batch, copy association and upload provenance. Existing pre-provenance direct uploads remain historical/stale rather than being assigned fabricated source history.

`POST /api/v1/campaigns/:id/visual-uploads` requires editor authorization, quoted `If-Match` and `Idempotency-Key`. Accepts static PNG/JPEG/WebP, at most 5MB and 4096×4096. A durable orphan intent fences uncertain storage writes; uploads never create paid generation jobs. Pure uploads have no generated prompt. Banners/review validates the original brief/analysis, copy association, selected image reference, stored bytes and source hash for both generated and uploaded assets.

UI composes shared `ActionCard`, `EmptyState`, `TextAction`, `SelectMenu`, `MediaWorkflowCard` and `AppButton`. Media columns stack below 720px **card** width. Video remains a placeholder; this change does not add video generation.

## Independent verification

```sh
npm test -- --run src/studio/campaign/modules/visuals server/repositories/visuals.integration.test.js server/services/visualContext.test.js server/services/visualUploadService.integration.test.js server/services/visualsVersion.integration.test.js server/routes/visuals.test.js
```

Tests cover immediate manual batches, approvals, exact copy linkage, partial failure, unknown/retry fencing, no mount generation, clipboard, upload identity and filename boundaries. Real-database cases continue through Banners and immutable review, including legacy approvals and a final two-copy batch. Isolated Visuals tests use private schemas; do not run the existing whole-repository public-schema tests concurrently across tasks.

Browser checks use the local mock provider and bundled sample image. Live Gemini requests and production deployment are not part of this verification.
