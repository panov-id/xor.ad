# Panel 05.11.2026: edits of steps 1-4

lens coverage: 10 of 10 files. Files: `app/src/shell/App.tsx`, `app/src/shell/telegram.ts`, `app/public/tg-boot.js`, `app/public/telegram-web-app.js`, `app/index.html`, `scripts/flow/telegram-shell.mjs` (security, verifier); `app/src/screens/tables/Tables.tsx`, `app/tokens/nd4-kit.css`, `scripts/design/nd4-extract.py`, tests of steps 1 and 3 (verifier). The rest of the tree: `PANEL_2026-11-05_screens110_EN.md`.

| Level | Where | Finding | Status |
|---|---|---|---|
| important | `app/public/tg-boot.js` | The shell stayed off after a reload | VERIFIED by Playwright; fixed, test seen red on a break |
| medium | `app/public/telegram-web-app.js:7-19` | Telegram's script keeps launch data in the tab's `sessionStorage`; app code does not read it | Code read; decision: keep, the reload relies on it |
| minor | `app/public/tg-boot.js`, `app/vite.config.ts:90` | A link with a fragment can turn the script on; only the header stops framing, not checked on prod | Code read |
