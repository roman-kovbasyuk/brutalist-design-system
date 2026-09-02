# Lingu Studio SaaS Workflow Redesign

## Objective

Turn the local Lingu Studio prototype into a credible creative-production SaaS demo. The product must make AI generation, asset selection, banner configuration, designer review, marketer approval, delivery, and campaign history understandable without introducing cloud dependencies.

## Product model

Lingu Studio has two primary contexts:

1. **Dashboard** — portfolio-level production metrics and campaign history.
2. **Campaign workspace** — one controlled seven-stage production flow.

Templates and Design system remain reference destinations. Dashboard is the default destination; a new or historical campaign opens the Campaign workspace.

## Visual direction

The interface is a modern operating surface rather than an editorial showcase.

- White canvas and white content surfaces.
- Very light neutral navigation and toolbar layers.
- Restrained indigo for primary actions, focus, and active selection.
- Yellow only for AI text highlighting, cost attention, and the in-review state.
- Green only for approved and delivered states.
- Fixed, compact SaaS type scale: 13–15 px operational copy, 28–40 px page headings.
- Comparable structured data uses tables and description rows rather than metadata-card grids.
- Prompt, image, video, and banner collections remain visual galleries.

## Motion language

Motion explains state and affordance.

- Screen and tab changes crossfade with a 6–10 px rise over 180–220 ms.
- Buttons move their trailing icon 2–3 px on hover.
- Interactive cards rise 2 px and strengthen their border/shadow on hover.
- Hover actions fade and rise over media, and remain keyboard-accessible through focus-within.
- Selected items receive an animated outline and check indicator.
- Yellow review surfaces softly wash in when a campaign enters review.
- The brief-processing transition advances through named states and a determinate progress bar.
- `prefers-reduced-motion` removes movement and preserves every state change.

## Navigation

Primary destinations:

- Dashboard
- Campaign
- Templates
- Design system

The shell shows the local demo state and current user identity. Mobile collapses navigation to an accessible icon row with 44 px targets.

## Dashboard

The Dashboard includes a compact metric strip:

- Total banners created
- Total reviews
- GenAI production cost
- Static-to-video ratio

A campaign history table follows with columns for date, lifecycle status, AI-generated campaign name, banner count, total generations, static visual count, video count, and production cost. Rows expose an Open action that enters the campaign workspace. The table scrolls horizontally on narrow screens rather than turning every cell into a card.

## Campaign workflow

### 1. Brief

The marketer enters one free-form campaign idea. Submitting begins a local deterministic generation job.

### Processing transition

An intermediate screen appears between Brief and Copy. It advances through:

1. Analyzing the brief with AI
2. Identifying audience and offer
3. Creating copy for banners
4. Developing visual directions
5. Preparing image and video prompts

The progress bar is determinate. On completion, the campaign strategy and five prompt ideas exist.

### 2. Copy

Audience, objective, and offer are shown as description-table rows. Headline, body copy, and CTA remain editable. Editing copy invalidates downstream selection and approval.

### 3. AI assets

The workspace has three tabs.

#### Prompts

Five prompt cards are created during brief analysis. Each has a title, prompt copy, highlighted subject, highlighted action, estimated static-image cost, and a **Generate static visual** action.

#### Static visuals

Generated static visuals appear in a grid. Every visual supports selection and exposes **Generate video from this image** on hover and keyboard focus. A bulk **Generate videos for all images** action opens a cost-warning dialog with image count, unit cost, and total estimate.

#### Videos

Generated videos appear in a grid and retain their relationship to the source static visual. Video generation is locally simulated but updates campaign counts and cost.

At least one static visual is required before Banner preview.

### 4. Banner preview

This stage consolidates template selection and draft-master inspection.

Toolbar filters:

- Format: All, Horizontal, Vertical, Square
- Platform: All, SMM Static, Google Ads, Video Reels
- Media: Static / Video, visible when videos exist

Banner candidates are derived from the current copy, generated assets, template library, formats, and platform. Users can select multiple banners for Figma assembly. Opening a banner displays a large preview, size characteristics, source media, and independent motion presets for text, image, and CTA. Preset changes animate the preview.

At least one banner must be selected before review preparation.

### 5. Prepare for review

Selected banner thumbnails and a review table show exactly what will be sent: banner, dimensions, platform, media type, and motion. Banners backed by video receive a bright video indicator.

The primary action is **Send to Figma for review**. After sending:

- the stage enters a yellow In review state;
- the Figma link is highlighted;
- the marketer sees “You will be notified by email and Slack”;
- the campaign review status is persisted locally;
- a separate designer review endpoint becomes available.

### 6. Approval

The marketer initially sees a waiting state. The separate route `/review/:campaignId` represents the designer endpoint and lets the designer mark the package **Ready for approval**. The marketer screen observes the persisted change and switches to **Banners are ready for approval**. Selecting **Confirm review** records the marketer’s name and unlocks Delivery.

Review lifecycle:

`draft → in-review → ready-for-approval → approved`

### 7. Delivery

Delivery retains the responsive banner previews and exposes **Download assets** and **Download manifest**. Its production summary includes designer review, marketer approver name, format count, video count, total asset count, and total simulated production cost.

## Local-first simulation

No image, video, Figma, email, Slack, or rendering API is called. Local deterministic jobs model the product states. Review state is stored in `localStorage` so the marketer workspace and designer endpoint can synchronize across tabs. Every simulated boundary is labeled honestly.

## Accessibility

- Semantic tabs, tables, dialogs, navigation, and progress elements.
- `aria-current`, `aria-selected`, `aria-pressed`, and live status announcements.
- Hover-only controls also appear on `focus-within` and remain keyboard-operable.
- Touch targets are at least 44 px on mobile.
- Color never carries state without text or an icon.
- Reduced-motion users receive immediate, non-animated transitions.

## Acceptance criteria

- Dashboard is the default page and includes all requested metrics and history columns.
- Brief submission visibly passes through named progress states before Copy.
- Prompt, Static visuals, and Videos tabs support the specified generation actions.
- Bulk video generation requires a cost-confirmation dialog.
- Banner preview filters, multi-selection, detail preview, and motion presets work.
- Review preparation shows thumbnails and table rows for every selected banner.
- Designer and marketer review states are distinct and persisted.
- Delivery reports formats, videos, assets, cost, designer review, and marketer approval.
- The interface is white, restrained, responsive, animated, and usable with reduced motion.
- Existing template and design-system reference surfaces remain available.

