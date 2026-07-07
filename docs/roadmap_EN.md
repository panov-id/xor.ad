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
- [ ] Decide: where the **light/dark** button lives on the landing (next to language) — the landing has no profile popup.
- [ ] Decide: logo = **accent** cycle (11 or fewer?) on the landing.
- [ ] Embed **live app mockups** in device frames (wide + mobile), using the landing's real fonts (Unbounded/Golos/JetBrains).
- [ ] Redraw the landing in the prototype's **brutalist canon** (concrete, hard borders/shadows, mono labels).
- [ ] Update **feature copy** to the new mechanics: plus/minus swipe, liked phrases, ephemerality, "by area, not meters", profile + age filter, rule-free games.
- [ ] **by PSYTICAN** credit in the footer + links to **Terms** and **Privacy**.
- [ ] Verify: `overflow=0` from 320px, i18n on all new strings, waitlist/PWA intact, tests green.

## 2. Legal / compliance
- [ ] **Privacy Policy** `neighbro.place/legal/privacy_RU/EN.md` (Terms already reference it; required under GDPR).
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
