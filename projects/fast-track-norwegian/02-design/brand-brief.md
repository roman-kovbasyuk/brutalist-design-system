# Brand Brief — Lingu / Fast-Track Norwegian

Source: client-supplied Figma banner set (file `0cskZimr4ZevIRiPUaQ8I3`, section "FTO 15 off"),
imported read-only via the `figma` skill on 2026-07-16. Assets frozen locally under
`projects/fast-track-norwegian/.media/` (see `.media/index.md` for provenance).

This brief is the **universal, self-sufficient design system** for Lingu's Fast-Track Norwegian
creatives — built to be extended later (new campaigns, new promo copy, new formats) without
re-deriving the fundamentals below.

## Identity

- **Client / account:** Lingu — product: Fast-Track Norwegian (language course)
- **Primary color:** `#3A42FF` (royal blue — dominant brand hue, background gradient start, label-pill fill ~`#3B42EA`)
- **Secondary color:** `#A5A8FF` (light periwinkle tint — gradient end / soft variant)
- **Accent color:** `#111AFA` (deep blue — used as the reversed-gradient variant across banner alternates; treat as the "high emphasis" end of the same hue, not a separate hue)
- **Background color:** linear gradient `#3A42FF → #A5A8FF` (135°-style diagonal, light-to-dark or dark-to-light depending on banner variant — both directions appear in the source, pick one per composition and stay consistent within it)
- **Glass/overlay tint:** `#0209BD` at ~24% opacity — translucent dark-blue panel used behind the promo-code block (frosted-glass UI chrome)
- **Text color:** `#FFFFFF` (on brand-blue backgrounds); `#060B13` (near-black, used only for text/icons sitting on the white CTA button)
- **Primary typeface (+ fallback):** Inter, 700 (headlines) / 500 (body/support copy), fallback `system-ui, sans-serif`
- **Display/UI typeface (+ fallback):** Plus Jakarta Sans, 600 (CTA/button/price text) / 400 (labels like "with code"), fallback `system-ui, sans-serif`
- **Decorative/accent typeface:** "Sweet Sucker Punch" (script) — used ONLY for the oversized "15%" watermark numeral behind the headline; opacity-gradient fill (37%→100% white), not for body copy. Treat as an occasional flourish, not a system font.
- **Logo file(s):** `.media/images/image_001.png` — the brand spark mark (4-point star, blue→teal→white gradient), used inside a rounded blue pill alongside the "Fast-Track Norwegian" wordmark (set in Inter 700). `.media/images/image_006.svg` — a secondary small glyph/icon lockup (monochrome white vector, ~66×27) used near supporting text lines; treat as a decorative flourish icon, not the primary mark.

## UI chrome geometry (reusable across every creative)

- **Label/lockup pill:** solid `#3B42EA`, corner radius ≈17px at 1200-wide scale (scales proportionally) — houses logo mark + wordmark
- **Promo/code panel:** `#0209BD` at 24% opacity, corner radius ≈34px — glass-morphism block housing "15% off" / "with code" / CTA button
- **CTA button:** solid white fill, 1px stroke `#060B13` at 15% opacity, fully pill-rounded (radius ≈26px), dark text/icon (`#060B13`), flanked by narrow left/right chevron icons
- Consistent radius language across all chrome = **fully rounded pill shapes**, never sharp corners — this is a core signature, keep it in every new element

## Voice

- **3-5 adjectives:** direct, encouraging, conversational, a little cheeky, confidence-building
- **We sound like** a friendly local who roots for you the moment you try, **not** a classroom textbook or a corporate SaaS ad
- **Words/phrases to avoid:** anything that reads like a grammar-drill ("master the subjunctive"); the brand voice sells *real-life payoff* ("understand the cashier", "talk to your neighbour"), not curriculum features
- **Copy pattern observed:** every headline is a concrete, embarrassing-relatable social moment ("Finally understand what the cashier just said", "Be brave. Start a conversation on the bus", "Tell your neighbour your opinion", "Say what everyone's thinking") — first-person payoff framing, not feature bullets

## Constraints

- **Platforms/aspect ratios needed (confirmed present in source):** 1200×628 (FB/LinkedIn link card), 1200×1200 (square/IG feed), 1080×1920 (Stories/Reels/TikTok — this is our animate-stage target format)
- **Bilingual requirement:** every creative exists in English + Norwegian (Norsk) with near-identical layout — keep both locales in mind when building the HyperFrames composition (copy swap, not layout rebuild)
- **Mandatory elements:** logo pill always visible; promo code block ("15% off" + "with code" + CTA button) always present and legible; brand gradient background always present (photography sits on top of it, never replaces it)
- **Anything to avoid:** sharp/squared UI chrome (breaks the pill-radius signature); introducing a second brand hue outside the blue family; body copy in the script/display font (readability)

## Notes from research (competitive reference — @duolingo, NOT a visual reference)

- **Top-performing hook style for this account (Duolingo):** parody/meme-remix formats and visual/audio recognition-driven hooks outperform dialogue-driven hooks; average hook length ~4.9s
- **Structural formula:** hook (0–5s) → intro/key visual gag → optional mid-video rehook (35% of top reels) → CTA at ~20s mark; brand-collab ads use a fuller hook→intro→key→objection→cta funnel with stats as proof — this maps well onto Fast-Track Norwegian's existing "relatable moment → 15% off code → CTA button" banner structure
- **Anything unusual about this account's audience/niche:** language-learning audiences respond strongly to embarrassment/social-payoff scenarios over feature/curriculum messaging — reinforces the Fast-Track Norwegian banner copy pattern above; low-production "reaction image + caption" formats are a viable cheap variant worth keeping in mind for future creative, separate from this branded push

## Extension notes (future work, not required now)

- Only one promo mechanic (15% off + code) has been extracted so far; the system should accept new offers/codes without changing chrome
- Only 2 of the 7-vector icon groups and 2 of the ~7 "numbered" stock photos were pulled as representative samples — the full photo library in the Figma file can be imported later per new scene needs via `hyperframes figma asset`
- Two source layers (`dispersion glass` overlay, `Norway Flag` photo) exist in the file but are currently toggled invisible in the reference frames inspected — confirm with the client whether these are intentionally turned off or should be reactivated for the video before relying on them
