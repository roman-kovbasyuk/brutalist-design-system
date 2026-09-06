---
version: 1
slug: "src-studio-campaign-modules-brief-briefmodule-jsx"
primary_target: "src/studio/campaign/modules/brief/BriefModule.jsx"
related_targets: ["src/studio/campaign/modules/brief/BriefView.jsx", "src/studio/campaign/modules/brief/brief.css", "src/components/design-system/molecules/InlineText.jsx", "src/components/design-system/molecules/FactGrid.jsx", "src/components/design-system/molecules/AsyncStatus.jsx", "src/components/design-system/atoms/UpdatedText.jsx", "src/studio/StudioApp.jsx"]
---

# Brief Surface Record

## Overview

Brief is an Operate surface at the start of the six-module campaign workflow. The user submits campaign context, reviews its analyzed summary and details, edits individual values, or requests a refinement. This surface inherits [DESIGN.md](../../DESIGN.md) and the existing light application identity. It establishes no new global tokens or visual rules.

## Colors

Existing semantic tokens supply the white fact cells, black text and rules, and cyan audience emphasis. Secondary copy uses the incumbent text roles. Color emphasizes Audience within the labelled grid; the label remains readable independently of color.

## Typography

The existing Avenir-family stack applies throughout. The summary uses the H4 size token (20px) with a reading line height of 1.5 and a maximum width of 70ch. Facts use body text (16px) with smaller labels (14px). Campaign title typography remains owned by the application shell.

## Layout

The analyzed state follows **summary → facts → refinement composer**, with optional analysis warnings between facts and the composer. The facts preserve source order: Audience, Objective, Channels, Formats. The grid uses two equal columns above a container width of 480px and one column at or below 480px. This responds to the fact grid's own available width, not the browser viewport. Long values wrap within each cell.

Existing 24px spacing separates the main sections and pads fact cells; labels have an 8px bottom gap. Product CSS composes shared components and sizes the summary and composer. The initial input state uses PromptComposer with attachments and Analyze brief; the analyzed state places the refinement composer after the saved facts.

## Elevation & Depth

The fact grid is flat, separated by black 1px rules. Controls inherit the established shared button treatments; the Brief surface adds no elevation vocabulary.

## Shapes

Fact cells form one rectangular grid. Inline editing uses the existing 4px input radius. The enclosing workflow frame and composer retain their shared shapes.

## Components

InlineText displays editable values as text-first buttons and opens a labelled textarea with Save and Cancel. It captures the source key when editing begins, retains the draft on failure, and shows a notice when the saved source changes. Enter saves, Shift+Enter adds a line, and Escape cancels outside a save. Read-only values remain visible. The module owns schema validation, permissions, persistence, and dependent artifact semantics.

FactGrid owns the semantic definition list and responsive layout. AsyncStatus supplies indeterminate stage text in a status region. PromptComposer supplies the initial brief and later refinement entry. The caller owns requests, errors, busy state, and meaningful progress wording; no simulated percentages are shown.

UpdatedText and useTextUpdate acknowledge a saved campaign title change in the shell. They do not animate the initial value or a switch to a different campaign identity. The acknowledgement lasts 200ms; its CSS animation is removed for reduced motion. These APIs and their consumers are recorded in the [library README](../../src/components/design-system/README.md) and [catalog](../../src/components/design-system/examples/library-catalog.js).

## Do's and Don'ts

- Do preserve summary, fact, and refinement reading order on narrow screens.
- Do keep editing and async behavior in shared components and campaign rules in the module.
- Do preserve text drafts when requests fail and display actionable errors beside the affected input.
- Don't promote the cyan Audience cell or Brief composition into a global rule for unrelated surfaces.

## Review Evidence

The finish reviewer disposition is **ship**. Captured review artifacts include [desktop full page](../review/brief/desktop.png), [desktop viewport](../review/brief/desktop-viewport.png), [mobile full page](../review/brief/mobile.png), [mobile viewport](../review/brief/mobile-viewport.png), [user-width full page](../review/brief/user-2252.png), and [user-width viewport](../review/brief/user-2252-viewport.png). These record visual review; functional recovery verification is tracked separately by the implementation task.
