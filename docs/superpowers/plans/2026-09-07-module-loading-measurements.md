# Module loading evidence

## Baseline before near-viewport activation / developer playground

Measured from this shared worktree on 2026-09-07, after Banners preflight repair and before remaining architecture Task 11. This is a build snapshot, not a browser speed claim.

Command: `npm run build` — app and documentation build passed. Existing VitePress large-chunk advisory remains.

- SPA entry: `index-D_r0BbM5.js`, **350,573 bytes**, **107,628 gzip bytes** using Node `gzipSync` defaults (use the same method for comparison; Vite's printed compression number uses different settings).
- 22 SPA JavaScript chunks emitted.
- Entry's direct static JS imports: `jsx-runtime-CBYkxpZ6.js`, `AppButton-H3GTVgFo.js`.
- Separate chunks emitted for all six modules: Brief, Copy, Visuals, Banners, Review, Distribute.
- Current ModuleHost activates content immediately when visitable (Copy/Visuals also mount without visit access). Lazy file splitting therefore does not by itself establish deferred offscreen module loading.
- Source inspection: CopyPreview already uses a lazy AnimatedBanner import, but `StudioApp → TemplateLibrary → AnimatedBanner` is eager. This path can defeat the Copy preview boundary. Task 11 should split the template-library route before attributing any preview loading savings to Copy's existing dynamic import.

## Comparison checklist (status detailed below)

- Same fixture and viewport: loaded module content/initial chunk graph before and after near-viewport activation.
- Copy action HTTP request counts; distinguish session/templates/workspace/mutation requests.
- Module mount/render counters and title-only refresh draft retention.
- Expensive preview/export import boundaries in actual output, not just source declarations.
- Record measured outcomes and limitations in team module documentation; do not claim unmeasured timing gains.

## After activation and preview boundary (2026-09-07 00:39 local)

Parent `npm run build`: application and docs passed. Same Node `gzipSync` method:

| Build metric | Baseline | After |
| --- | ---: | ---: |
| SPA entry bytes | 350,573 | 346,790 |
| SPA entry gzip bytes | 107,628 | 106,263 |
| Emitted SPA JS files | 22 | 26 |

After entry: `index-CzvsLTkp.js`. Direct static imports remain JSX runtime and AppButton. `TemplateLibrary-hg33qN2F.js` and `AnimatedBanner-CikTOUYE.js` are now separate chunks. Built Copy module imports AnimatedBanner dynamically; Banners and the lazily loaded template route statically import it inside their own chunks. The entry's preload dependency table mentions these files, which is not itself an eager import.

No checked playground/fixture markers occur in any of the 26 SPA JavaScript files. Normal production startup still requires configured authentication; local demo-role access is not exposed in the production app.

### Controlled module instrumentation

Same `copy-ready` fixture and direct Copy target, with manually fired IntersectionObserver callbacks in jsdom (no layout engine):

- Before: six headings; Brief, Copy and Visuals each mounted/rendered once.
- After, before intersection callbacks: six headings; only direct Copy mounted/rendered once.
- Activating Visuals by callback mounts it once and preserves it afterward.
- Activating Brief, editing a draft, then refreshing only the title retains the same input node/value and dirty flag; one workspace read.
- The actual Copy card **Approve** interaction, mounted through the coordinator/runtime with a controlled API, starts after one separately counted initial workspace read. The click invokes exactly one approve mutation and one authoritative workspace refresh, with no legacy select, delete, generation, upload or direction-selection mutation.
- The separately labelled legacy Copy selection command invokes one select mutation and one workspace refresh, with no generation or other Copy mutation.

These are controlled component/runtime policy and API-boundary counts, not a browser network waterfall or timing measurement. Short initial frames and the 400px near-viewport margin can activate several modules in a real viewport. Browser automation stopped activating controls even in the fixture-only playground; therefore actual initial loaded-chunk counts and physical browser timings are not certified. No page-speed improvement is claimed from these byte or mount changes.

## Final browser closeout

Physical-browser workflow and responsive/keyboard acceptance subsequently completed; see [integration verification](2026-09-07-integration-verification.md). No new speed or network-waterfall claim is made. After the final spacing-only CSS change, production entry is `index-NckjzIya.js`: 346,790 bytes / 106,272 same-method gzip bytes; 26 JS files; no checked playground/fixture markers. The DEV-only playground style-scope fix remains excluded from production.
