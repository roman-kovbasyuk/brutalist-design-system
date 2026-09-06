---
version: 1
slug: "src-studio-campaign-modules-visuals-visualsview-jsx"
primary_target: "src/studio/campaign/modules/visuals/VisualsView.jsx"
related_targets: ["src/studio/campaign/modules/visuals/visuals.css","src/components/design-system/atoms/TextAction.jsx","src/components/design-system/atoms/text-action.css","src/components/design-system/organisms/MediaWorkflowCard.jsx","src/components/design-system/organisms/media-workflow-card.css"]
---

# Visuals Surface Record

## Overview

Visuals is an Operate surface within the six-module campaign workflow. A marketer creates or uploads images for approved copy options or for the whole campaign, compares results, and selects an image for Banners. This narrow extension inherits the current application identity in [DESIGN.md](../../DESIGN.md): Avenir-family typography, cyan actions, black rules, small corners, and quiet surfaces around creative content. It introduces no visual world, global rules, or tokens; root DESIGN.md and the shared design sidecar retain their authority.

The implemented wording connects Copy approval to Visuals selection: “Approved copy options are selected for this method,” with “Approve options in Copy to select them for visuals” when none are approved. Linked-card labels and the upload chooser use each option’s position in the current full Copy list, preserving its visible option number; missing historical options read “Earlier option.” See [view](../../src/studio/campaign/modules/visuals/VisualsView.jsx) and [selection model](../../src/studio/campaign/modules/visuals/visualsModel.js).

## Layout

Two shared ActionCards present selected-copy generation and three campaign-wide visuals, followed by progress, eligible missing-image actions, and result cards. [Module CSS](../../src/studio/campaign/modules/visuals/visuals.css) stacks the methods by default and places them side by side at a module container width of 640px.

Each result has three ordered areas: **Prompt → Static visual → Video**. [MediaWorkflowCard CSS](../../src/components/design-system/organisms/media-workflow-card.css) stacks them below 720px card width and uses three equal columns at or above that width, preserving reading order. Borders change from horizontal to vertical separators. Text wraps, actions wrap, and image previews use a square container with `object-fit: contain`.

Spacing, typography, surfaces, borders, and corners consume existing semantic `--v2-*` roles from [foundation tokens](../../src/components/design-system/foundations/tokens.css). Product CSS composes and sizes the shared components.

## Components

The view composes AppButton, ActionCard, EmptyState, SelectMenu, TextAction, and MediaWorkflowCard, with AssetImage for stored images. TextAction supplies the quiet compact upload and prompt-copy actions; MediaWorkflowCard supplies the labelled article, contextual heading, selected outline, and ordered sections. Their reusable APIs remain in [component contracts](../../docs/design-system/components.md); module behavior and integration remain in the [Visuals README](../../src/studio/campaign/modules/visuals/README.md).

Upload failures appear as an alert beside the initiating method or image action. Prompt copying provides local status feedback and a manual-copy fallback. Historical cards remain readable with “Source changed” and saved-input guidance; stale images cannot be selected for Banners. Generated-image failures expose retry, uncertain outcomes request a state check, and blocked outcomes offer upload guidance. Video is the explicit “No video yet” placeholder.

## Review Evidence

Captured with local mock content: [desktop](../review/visuals-desktop.png), [mobile methods](../review/visuals-mobile.png), [mobile card](../review/visuals-mobile-card.png), and [mobile media/upload feedback](../review/visuals-mobile-media.png). The final UI review reported all three material issues resolved: approval/selection terminology, current option identity, and local upload feedback. Independent width checks reported no horizontal overflow.

Final verification passed the full test suite and production/docs builds. Browser verification saved an uploaded visual into a valid one-format Banners layout. Live-provider behavior was not tested, and the mock images and copy are verification content, not art direction.
