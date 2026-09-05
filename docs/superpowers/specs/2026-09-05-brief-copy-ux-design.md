# Brief and copy UX refinement

Preserve the approved Banner Studio visual system, sidebar, and eight-step flow.

## Brief

Use the design-system AI composer: one campaign description, attachments, and one primary action. Remove name, product, audience, goal, offer, language, model, and effort controls. Infer intent and language from the supplied context through the existing analysis/copy provider. A short source-derived title identifies the saved campaign; it is not an extra input. Keep original text editable. Existing structured briefs remain readable and usable.

Accept TXT, Markdown, text PDFs, and DOCX up to 5 MB per attachment. Extract text through the authenticated API, display removable attachment chips, and persist the combined text in the brief. Reject empty, unsupported, oversized, or unreadable files explicitly. Do not silently truncate. Image-only PDFs need a clear paste-text fallback; OCR is outside scope. Total brief limit is 20,000 characters. Uploaded content is campaign data, never executable instructions.

## Copy

Generate exactly five distinct options per new set. Each has headline, short text, CTA, and optional tag (discount or deadline only when supported by the brief). Retain the existing `offer` wire field for the tag to avoid rewriting stored campaigns. Use compact banner-friendly limits: headline 80, body 160, CTA 24, tag 40.

Table is the default comparison view; Cards and Banners show the same candidates and selection. Five banner previews visualize the five copy options, without making five paid image-generation requests or bypassing the existing AI-assets step. Clearly label previews before the campaign image is selected. Selection stays identical across views, with keyboard-accessible controls and horizontal table scrolling on small screens.

## Banner tag

An optional editable tag flows from copy into the template, animated preview, saved composition, static PNG, and offline HTML draft. Empty tags draw nothing. Keep existing template versions available for immutable historical deliveries; introduce a new version for tag support.

## Verification

Tests cover text-only/file-only brief submission, error preservation, role locks, five-option generation, table/cards/banner selection, optional-tag rendering and exports, and backward-compatible stored campaigns. Verify desktop/mobile in the local preview. Live paid AI and cloud deployment remain outside this refinement's verification.
