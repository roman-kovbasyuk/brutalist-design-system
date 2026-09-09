# Brutalist Design System

This repository is now a **design-system-only workspace**.

It keeps only the UI foundations and component blocks in `src/`:

- `src/components/design-system/` (atoms / molecules / organisms / templates / examples)
- `src/components/ui/` (shared UI primitives used by examples)
- `src/screens/` (design-system shell and catalog view)
- `src/styles/` and `src/lib/` utilities used by the design system

Everything else from the legacy product app has been removed.

## Getting started

```bash
npm install
npm run dev
```

Use this URL for the running app:

- `http://127.0.0.1:5177/design-system`

## Verification

- `npm run build`
- `npm run test:run`

If you want to run this as a reusable design-system package in the future,
keep the design system screen as the only route and add your consumer app
on top as a separate entrypoint.
