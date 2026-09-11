# Design system releases

## v0.1.0 — local v2 artifact

The local-only `brutalist-design-system` artifact exposes portable Basics, Components and UI Blocks with a stylesheet entry. It is private and has not been published. Verification covers TypeScript, component behavior, production builds, artifact declarations/CSS, and a real npm tarball installation in a fresh consumer. That consumer typechecks, builds, and checks the installed tab/panel runtime contract.

The reference catalog remains a compatibility surface. The public workbench is a grouped gallery with isolated local interactions; drafts reset when leaving a family and are not persisted or serialized into URLs. Unused details/options/context-export infrastructure has been removed. There is no supported generated-code panel or Storybook integration.

Sampled browser and keyboard checks are required alongside automated tests. These are not a claim of complete accessibility conformance; see [validation](validation.md) for the evidence and remaining coverage limits.
