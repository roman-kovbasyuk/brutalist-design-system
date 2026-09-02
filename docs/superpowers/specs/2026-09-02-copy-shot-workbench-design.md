# Copy and Shot Workbench Design

## Goal

Replace the sparse Copy stage with a compact workspace where a marketer can review campaign copy and understand five AI-created shot directions before generating assets.

## Approved direction

The stage uses the existing calm SaaS visual system and an Operate-mode, two-column layout. Campaign interpretation and editable copy form one left-hand work area. Five numbered shot prompts form the primary right-hand work area. On narrow screens, the copy area precedes the shot list in the same DOM and focus order.

## Shot prompt model

`generatePromptIdeas(strategy)` returns exactly five deterministic prompts. Every prompt exposes a `hero`, an `action`, a short shot title, and the full provider prompt. The generated sentence uses the campaign's art direction and leaves room for banner copy.

The five directions cover distinct, practical campaign moments: arrival portrait, tram journey, café exchange, grocery interaction, and an evening call after class.

## Highlight semantics

Hero and action are visually distinct and explicitly named in a legend. Hero uses the existing yellow AI-marker language; action uses a cool indigo marker. Each prompt also receives accessible text that identifies both values, so color is never the only signal.

## Interaction and states

Headline, body, and CTA remain editable. Shot rows receive a restrained hover/focus response without changing their content. The existing Back and Generate visuals actions remain unchanged. Stage 3 consumes the same prompt objects and retains static-generation behavior.

## Responsive behavior

The workbench is two columns on wide screens and a single column below 1080px. Prompt rows preserve their number, title, sentence, and metadata without horizontal scrolling. Controls retain 44px minimum targets.

## Verification

Domain tests verify five prompts and their hero/action fields. UI tests verify that Copy renders five shot prompts and labelled hero/action highlights. The complete Vitest suite, production build, and Impeccable detector must pass.

## Video cost dialog repair

The bulk video warning remains a centered modal, but its content must use the full available width. The warning icon and copy sit in a dedicated header row; the estimate table and actions span the dialog below it. At narrow widths the actions stack without clipping. A dedicated content class prevents broad direct-child selectors from accidentally turning the entire body into the header grid.
