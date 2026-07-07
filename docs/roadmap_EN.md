# Roadmap — checklist

Status as of 7 July 2026. `[x]` done, `[~]` partial, `[ ]` ahead.

## 0. Done (foundation)
- [x] Business logic and screen descriptions (neighbro + sosed).
- [x] Neighbro landing (dark/gold, 6-language i18n, waitlist, PWA, icons, config.js).
- [x] Interactive **app prototype** (single-file): splash `by PSYTICAN`, age-gate onboarding with consent, 3-column workspace with collapsible rails, live feed (refresh/auto), plus/minus swipe, chat with liked phrases, profile popup (name/age/age-filter/language/appearance/documents), 11 accents, light/dark.
- [x] Prototype spec `docs/app-prototype-spec_RU/EN.md`.
- [x] **Terms & Conditions** `neighbro.place/legal/terms_RU/EN.md` (operator PSYTICAN & PEJEDED, Cyprus, 13+).
- [x] Deploy infra (3 envs dev/UAT/prod), local Supabase+nginx, tests (E2E/visual).

## 1. Update the neighbro landing (next)
- [x] Decide: **light/dark** button — next to the language switcher.
- [x] Decide: logo = **accent** cycle, a subset of 5 (gold/crimson/teal/azure/violet).
- [x] Landing theme system: color tokenization, `[data-mode="light"]`, `[data-theme]`, theme-color.
- [x] Auto-detection (before paint, no splash flash): **language** from the browser; **light/dark** from `prefers-color-scheme`; **random accent each session** (different from last) — until the user picks a color/language/mode themselves (then their choice sticks).
- [x] Feed preview to the new mechanics: **people + plus, no distance**.
- [x] **by PSYTICAN** credit in the footer.
- [x] Embed **live app mockups** in device frames (phone + wide frame), using the landing fonts; recolor with the theme.
- [~] Redraw in the **brutalist canon** (tokens/accents/light-dark done; full redesign ahead).
- [x] **Feature copy**: "Why it feels different" section (by area / join-skip / why you matched / rule-free games), localized in 6 languages. Say/Match/Fade story kept.
- [x] **HTML `legal.html`** (Terms/Privacy tabs, EN/RU, markdown rendering, brutalist style, inherits theme) + localized footer links.
- [x] Checks: `overflow=0` (desktop/mobile), i18n of new strings, **E2E 6/6 passed** (waitlist sosed+neighbro).
- [x] Splash loader on the landing (like the prototype): main-color circle, house logo, `NEIGHBRO` / `by PSYTICAN`.
- [x] Align the mockups section (balanced centered composition: wide frame left, phone right).

## 2. Legal / compliance
- [x] **Privacy Policy** `neighbro.place/legal/privacy_RU/EN.md` (GDPR-style; served copies in `landing/legal/`).
- [x] **Removed the ARC number** from all documents, the prototype, and memory.
- [x] **Conduct rules**: ban harassment/bullying/shaming/anti-social behavior; ban selling goods/services — promotion only via the paid ad block. In **Terms §8** and **Community Guidelines**; **Rules** tab in legal.html + footer link (6 languages).
- [x] Reconciled `legal/` duplicates: kept `terms_/privacy_/community-guidelines_`; deleted old `terms-of-service_/privacy-policy_`.
- [ ] Set up `support@neighbro.place` mailbox.
- [ ] Legal review of the Terms (13+ together with offline meetings is sensitive).
- [ ] Screen/page to view accepted documents (already in the app profile).

## 3. App screens (next)
- [ ] **Say** screen (post): ≤128 chars, "how many of us", location blur radius.
- [ ] **Match moment** (mutual plus → "matched" animation → chat opens).
- [ ] **Set location** screen (map/area search instead of the placeholder).
- [ ] **Rule-free games** (dominoes/checkers/chess, request-based start, realtime).
- [ ] **Session freeze** (self-lockout, server-side deadline).
- [ ] Support button, invites and rewards.

## 4. App i18n
- [ ] Full app-string translation (like the landing i18n), 6+ languages; the prototype has the selector only.
- [ ] Push-notification languages (see `docs/pwa-push`).

## 5. Sosed (mirroring)
- [ ] Port the updates to **sosed.place** (red accent, Soviet aesthetic; no LGBT features — by decision).
- [ ] Sync the READMEs of all three repos (project rule).

## 6. Backend / data / deploy
- [ ] Real tables/RLS for messages, likes, chats, profile, age filter, ephemerality (TTL/fade).
- [ ] Realtime (websockets via the api proxy) for chat and games.
- [ ] Web Push (VAPID per face, anonymous subscriptions).
- [ ] PayPal payments → internal balance (stickers/ads).
- [x] **dev + UAT deployed** (neighbro landing + panel; Supabase `vrkqnfonmaixuvfqsfzt`; Bunny zones + api proxy with Origin Host Header/WebSockets/cache=0; panov.id DNS; GitHub secrets). prod later. sosed provisioned only, not deployed.

## Next session (deploy follow-ups)
- [ ] **Panel:** SMTP in Supabase Auth (magic-link) + bootstrap admin `deploy/bootstrap-admin-cloud.sh` for dev/uat (sign-in doesn't work without SMTP yet).
- [ ] Delete the test waitlist row `deploy-check-1783441254@example.com` (or add `SUPABASE_SERVICE_ROLE_KEY` to `.env.deploy` and I'll clean it).
- [ ] Verify uat api proxy (insert) and realtime over WebSocket (as on dev).
- [ ] Decide on **sosed**: deploy the face or hold.
- [ ] **prod** (once uat is accepted): `run-wizard.sh prod` + prod DNS — real domains `neighbro.place`/`sosed.place`/`xor.panov.id` (DNS at their registrar, not only panov.id) + Bunny SSL/proxy.
- [ ] Settle the branch flow (day-branches vs `dev`/`main`) — everything is on `day4` now, deploys come from `dev`/`main`.
- [ ] Continue product: app screens (Say/match/Set location/games), tables/RLS, Web Push, PayPal (sections 3–6).

## Open questions
- Accent set on the landing (all 11 or a subset).
- The real brand display font (Unbounded on the landing vs system in the prototype).
- Minimum age (13+ now; a lawyer may insist on 16+).
