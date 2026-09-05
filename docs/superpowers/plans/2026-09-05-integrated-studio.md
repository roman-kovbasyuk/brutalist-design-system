# Integrated Banner Studio implementation plan

## Outcome and design

Deliver the complete existing eight-step campaign flow on the committed ui-v2 visual system (source 358ccfd), backed by real Fastify/PostgreSQL services. Keep three primary sidebar items: Campaigns, Templates, Design system, plus conversation-like campaign history. Use English. User authorized autonomous design, implementation, integration, animated templates, and workflow testing without questions.

Use v2 neutral canvas, black outlines, compact corners, sky-blue action color, existing type and controls. The first viewport provides sidebar navigation, campaign title/status, a compact step rail, and one focused working stage. Small screens use an accessible dismissible sidebar and a scrollable step rail. Keep reduced motion, keyboard access, cancellation, explicit saves, meaningful errors, and server-confirmed mutations.

## Module A — API integration and runnable local backend

- [ ] Implement `src/studio/api.js`: `createStudioApi({getToken, fetchImpl, baseUrl})`; request(method,path,{body,revision,idempotencyKey,signal}), getSession, listCampaigns, createCampaign, getWorkspace, patchCampaign, generate(campaignId,step,input,key), getJob, selectCopy, selectDirection, listTemplates, saveComposition, createVersion, getReview, review(versionId,action,input,revision,key), deliver, getDelivery, getAssetBlob, downloadDelivery.
- [ ] Add authenticated GET `/api/v1/campaigns/:campaignId/workspace` returning `{campaign, copies, directions, composition, versions, jobs, delivery}` from persisted records with existing authorization. No credentials, storage object keys, or raw prompts beyond authorized campaign content.
- [ ] Add explicit loopback-only local demo launcher backed by dedicated `banner_studio_demo` database and real services, mock generation, in-memory assets, seeded marketer/designer/admin identities and real templates. No production auth bypass. Local session headers are accepted only by this separate launcher; production continues Firebase authentication.
- [ ] Test API requests, revisions, idempotency, error handling, read model auth, and full real-HTTP workflow with two actors.

## Module B — Three animated templates

- [ ] Build `src/studio/AnimatedBanner.jsx`, `src/studio/banner-templates.css`, and `shared/studioTemplates.js`: Editorial split, Product spotlight, Bold announcement, each with headline/body/CTA/image and purposeful shape motion, replay/pause and reduced-motion support.
- [ ] Export `studioTemplates` as manifest array compatible with server renderer. Every ratio maps usable slots; reuse installed licensed font registry. Templates render actual approved PNG packages; animated previews are clearly labeled if exported delivery is static.
- [ ] Test manifest validation and rendering, content escaping, all ratio sizes, and motion controls.

## Module C — Frontend

- [ ] Root owns `src/studio/StudioApp.jsx`, stage components, `studio.css`, routing and Firebase browser authentication. Consume Module A API and Module B preview.
- [ ] Add all eight working stages, real role-aware review actions, persisted campaign selection in URL, loading/empty/error states, cancellation, safe retry and conflict recovery.
- [ ] Reuse ui-v2 design-system view and tokens. Templates are selectable into composition; backend validation messages are visible; downloads use authenticated blobs.

## Module D — Verification and handoff

- [ ] Run focused integration and UI tests, full relevant suite, build, production verifier/smoke.
- [ ] Exercise local HTTP app through marketer → designer → marketer workflow; verify reload persistence, review gates, download integrity, responsive layout at 1440px and mobile, keyboard navigation and reduced motion.
- [ ] Independent review of integration and rendered UI; fix material findings and record remaining cloud authentication blocker accurately.
- [ ] Bring completed Task19 cloud tooling commits into integration branch. Leave original dirty ui-v2 checkout intact and provide running integrated preview with module commits and test evidence.
