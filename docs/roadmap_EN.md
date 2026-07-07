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
- [x] Landing theme system: color tokenization, `[data-mode="light"]`, `[data-theme]`, `nb-accent`/`nb-mode` persistence, theme-color.
- [x] Feed preview to the new mechanics: **people + plus, no distance**.
- [x] **by PSYTICAN** credit in the footer.
- [x] Embed **live app mockups** in device frames (phone + wide frame), using the landing fonts; recolor with the theme.
- [~] Redraw in the **brutalist canon** (tokens/accents/light-dark done; full redesign ahead).
- [x] **Feature copy**: "Why it feels different" section (by area / join-skip / why you matched / rule-free games), localized in 6 languages. Say/Match/Fade story kept.
- [x] **HTML `legal.html`** (Terms/Privacy tabs, EN/RU, markdown rendering, brutalist style, inherits theme) + localized footer links.
- [~] Verify: `overflow=0` (✓ desktop/mobile), i18n of new strings, waitlist/PWA, run tests.

## 2. Legal / compliance
- [x] **Privacy Policy** `neighbro.place/legal/privacy_RU/EN.md` (GDPR-style; served copies in `landing/legal/`).
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
- [ ] Roll updates through dev → UAT → prod.

## Open questions
- Accent set on the landing (all 11 or a subset).
- The real brand display font (Unbounded on the landing vs system in the prototype).
- Minimum age (13+ now; a lawyer may insist on 16+).
