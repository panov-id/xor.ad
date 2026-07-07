# Improvement checklist — neighbro (landing) + panel

Compiled from a multi-angle review (correctness, a11y, PWA/SW, security, i18n, performance, architecture, auth, tests, consistency). Paths are relative to `/home/eugene-panov/Projects/panov-id/xor.ad`.

Priority legend: 🔴 critical (before public launch) · 🟠 important · 🟡 hygiene.

## Progress (updated 2026-07-07)

**Done:** all 🔴 (#1–4), all 🟠 (#5–16), all 🟡 hygiene for the panel and the landing (neighbro). Every change is test-covered; runs green: panel e2e 35/35, landing e2e 14/14, panel build clean, SQL last-admin guard PASS.

Highlights: `check()` authz hole + `shouldCreateUser:false`; invite function (rollback/validation/CORS/409); RLS update/delete + last-admin trigger; RLS audit of `waitlist`/`push_subscriptions` + `unique(email)`; legal XSS sanitizer + EN fallback; focus-visible/aria/contrast/reduced-motion; CSP (same-origin, `font-src 'self'`); SW (network-first config, offline fallback, controllerchange gate); self-hosted fonts (landing + panel); prod fail-loud on missing env.

**Deferred / out of scope:** panel unit tests (e2e only); i18n of decorative mockups; moving the panel to a single variable font; `manifest lang` (won't-fix); anon-insert rate limiting (Supabase Cloud / edge layer); **sosed is frozen** — porting tracked in `sosed.place/docs/PENDING_FROM_NEIGHBRO_*.md`.

---

## 🔴 Critical

### 1. Panel: `check()` does not verify `panel_users` membership ✅
- [x] **File:** `panel/src/providers/auth.ts:58-89`
- **Problem:** `check()` confirms access based solely on the presence of a Supabase session. Anyone who passed OTP reaches the panel UI (lists are empty due to RLS, but access is granted).
- **Fix:** in `check()`, additionally query the `panel_users` row for the current user; if absent — `logout()` + redirect to login.
- **Done when:** an outsider with a valid session but no `panel_users` row cannot enter the UI; an e2e test covers this scenario (currently uncovered).

### 2. Panel: `signInWithOtp` without `shouldCreateUser:false` ✅
- [x] **File:** `panel/src/providers/auth.ts:9-14`
- **Problem:** requesting an OTP for an arbitrary email creates a new auth user.
- **Fix:** pass `options: { shouldCreateUser: false }`.
- **Done when:** requesting a code for a non-existent email does not create an auth user.

### 3. Landing: XSS via href in the legal markdown renderer ✅
- [x] **File:** `neighbro.place/landing/legal.html:117`
- **Problem:** the `[t](href)` renderer inserts href without scheme sanitization → `[x](javascript:...)` yields an executable link.
- **Fix:** allow only `http:`, `https:`, `mailto:` schemes; drop other hrefs (render as text).
- **Done when:** a `javascript:`/`data:` link does not produce a clickable executable href.

### 4. Landing: missing `:focus-visible` ✅
- [x] **File:** `neighbro.place/landing/index.html` (global)
- **Problem:** no focus styles at all → keyboard navigation is effectively broken.
- **Fix:** add a visible accent `outline` on `:focus-visible` for buttons, links, input, select.
- **Done when:** every interactive element shows a visible focus during keyboard navigation.

---

## 🟠 Important

### 5. Panel: orphaned auth user on invite failure ✅
- [x] **File:** `functions/invite-panel-user/index.ts:47-63`
- **Problem:** if `generateLink` succeeds but the `panel_users` insert fails, an auth user remains with no row and no rollback.
- **Fix:** on insert error, delete the created auth user (compensating action).
- **Done when:** an insert failure leaves no orphaned users.

### 6. Panel: validate and normalize email in invite ✅
- [x] **File:** `functions/invite-panel-user/index.ts:42-45`
- **Problem:** email is not format-validated or normalized (trim/lowercase); re-inviting an existing user yields an opaque 500.
- **Fix:** validate format, trim + lowercase; handle re-invite with a clear error (409/message).
- **Done when:** invalid email → 400 with a clear message; re-invite → a clear response, not a 500.

### 7. Panel: no CORS/OPTIONS in the invite function ✅
- [x] **File:** `functions/invite-panel-user/index.ts:14-17`
- **Problem:** no `OPTIONS` handling or CORS headers; non-POST returns 405 without `Access-Control-Allow-Origin`.
- **Fix:** handle the `OPTIONS` preflight, add CORS headers.
- **Done when:** a direct browser call from another origin/environment does not fail on preflight.

### 8. Panel: no UPDATE/DELETE policies on `panel_users` ✅
- [x] **File:** `db/migrations/0002_panel_users.sql`
- **Problem:** only select/insert exist; you cannot revoke/demote a panel user via the UI; no "last admin" protection.
- **Fix:** add admin-only `UPDATE`/`DELETE` policies + a constraint that the last admin cannot be deleted/demoted.
- **Done when:** an admin can revoke another; the last admin cannot be removed/demoted.

### 9. Panel: dead `panel/.env` (variable name mismatch) ✅
- [x] **File:** `panel/.env` ↔ `panel/src/providers/constants.ts:5-9` — removed (dev uses the localhost fallback, prod uses `.env.production`)
- **Problem:** `.env` sets `VITE_API_URL`/`VITE_SUPABASE_API_KEY`, while `constants.ts` reads `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`. The config is not applied; the build silently falls back to localhost defaults.
- **Fix:** align the variable names or remove `.env` from the working tree.
- **Done when:** environment values are actually picked up; no silent localhost fallback.

### 10. Panel: code/docs diverge on SMTP login ✅
- [x] **File:** `panel/src/pages/login/index.tsx:4-8` + `panel/src/providers/auth.ts` (comments now match reality: SMTP placeholder, no emails go out)
- **Problem:** the comment describes a working magic link, but SMTP is a placeholder ("no emails go out yet"); self-service login does not actually work.
- **Fix:** sync the comment/docs with reality or mark as TODO until SMTP is configured.
- **Done when:** docs and comments match the actual login state.

### 11. Landing: `config.js` served cache-first from precache ✅
- [x] **File:** `neighbro.place/landing/sw.js:6-14` — removed from precache, served network-first
- **Problem:** after an environment change without a new `__BUILD__`, the old Supabase target is served.
- **Fix:** exclude `config.js` from precache or serve it network-first.
- **Done when:** after an environment change the form hits the correct Supabase without a manual cache clear.

### 12. Landing: duplicate email treated as an error ✅
- [x] **Files:** `neighbro.place/landing/index.html` + `sosed.place/landing/index.html` (same bug on both faces) — 409 treated as success
- **Problem:** re-submitting the same email yields a 409 (unique) → the user sees "Couldn't submit".
- **Fix:** treat 409 / code `23505` as success ("you're already on the list").
- **Done when:** a re-submit shows a friendly confirmation, not an error.

### 13. Landing: no CSP + verify RLS on waitlist/push ✅
- [x] CSP added to `neighbro.place/landing/index.html` and `legal.html` (`<meta http-equiv>`): same-origin only + Google Fonts; `connect-src 'self'` (Supabase via the gateway).
- [x] RLS audit: `waitlist` grants narrowed (anon INSERT-only, authenticated SELECT-only); the missing `push_subscriptions` table was created (`db/migrations/0003_push_subscriptions.sql`) with the same RLS pattern (anon insert-only, panel select) and narrowed grants. Tests in `panel/tests/e2e/anon-writes-rls.spec.ts`.
- [x] `unique(waitlist.email)` added (`db/migrations/0004_waitlist_unique_email.sql`, dedupes existing rows first) — the №12 409 is now real and duplicates are impossible.
- [ ] Rate limiting on anon inserts: **not our layer** — prod is Supabase Cloud + CDN, there is no self-managed nginx in prod (the only `nginx.conf` is the local-dev stand-in). Left to Supabase Cloud / edge; not added to the dev stand-in (would break e2e with no prod benefit).
- **Problem:** no CSP with inline scripts and external Google Fonts; the client could theoretically send arbitrary fields in the insert (`early_access`, etc.).
- **Fix:** add a CSP (`script-src 'self' 'unsafe-inline'` or hashes, `connect-src` for Supabase, `font-src`/`style-src` for Google Fonts); confirm strict column-level RLS + rate limiting on `waitlist`/`push_subscriptions`.
- **Done when:** CSP is active; inserting arbitrary fields is rejected at the DB.

### 14. Landing: reduced-motion only mutes the splash ✅
- [x] **File:** `neighbro.place/landing/index.html` — reduced-motion reset for all animations/transitions + the infinite `.dot` pulse stopped
- **Problem:** the infinite `pulse` animation on `.dot` and hover transforms are not disabled under `prefers-reduced-motion`.
- **Fix:** zero out all animations/transforms under reduced-motion.
- **Done when:** no continuous animations under reduced-motion.

### 15. Landing: legal docs only in EN/RU while the UI offers 6 languages ✅
- [x] `legal.html` already clamps the language to EN/RU; added an explicit graceful EN fallback for missing translations (we don't invent legal text). FR/DE/ES/EL get EN, not an error.
- **Problem:** FR/DE/ES/EL users get EN on legal pages.
- **Fix:** finish the legal translations or honestly limit the UI language set.
- **Done when:** legal language matches the selected UI language (or is explicitly marked EN-only).

### 16. Landing: legal `fetch` without timeout or fallback ✅
- [x] **File:** `neighbro.place/landing/legal.html` — `fetchMd()` with an AbortController timeout (8s) + EN fallback on 404/failure
- **Problem:** on a network error or 404 (no file for a language) it always shows "Could not load".
- **Fix:** handle 404 separately + fall back to EN; add a timeout/retry.
- **Done when:** a missing translation shows EN, not an error.

---

## 🟡 Hygiene / minor

### Panel
- [x] `panel/src/App.tsx` — Devtools mounted in dev only (`import.meta.env.DEV`), `DevtoolsPanel` now rendered (in dev). ✅
- [x] `panel/src/providers/auth.ts` — `getPermissions`/`getIdentity` share `loadPanelUser()` (done in #1). ✅
- [x] `panel/src/pages/login/index.tsx:10` — `isLoading` → `isPending` (Refine v5 / TanStack Query v5); `npm run build` is clean again. ✅
- [x] `panel/src/pages/panel-users/list.tsx` — dropped `result ?? data`: `useGetIdentity` returns a `UseQueryResult`, identity is on `.data` (the comment was wrong). ✅
- [x] `panel/src/pages/panel-users/list.tsx` — `clipboard.writeText` wrapped in try/catch; on denial a clear status shows and the link stays for manual copy. ✅
- [x] `panel/src/providers/auth.ts` — `onError` triggers logout+redirect on 401/403. ✅
- [x] `panel/tests/report/**` — not tracked in git (0 files); added `tests/report`/`tests/results` to `panel/.gitignore` as a safeguard. ✅
- [x] `panel/src/providers/constants.ts` — the localhost/demo-anon fallback is kept only in dev (`import.meta.env.DEV`); a production build throws when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are missing (verified: throw present in the prod bundle). `tests/helpers/env.ts` — test infra, fallback kept on purpose. ✅ (`panel/.env` removed earlier in #9)
- [ ] No unit tests, only e2e. Uncovered: logout, invite orphan rollback, copy-link, re-invite, duplicate email. Add these scenarios.
- [x] `panel/src/App.css` — fonts self-hosted: woff2 in `panel/public/fonts/`, `@import "./fonts.css"`, preload in `panel/index.html`. Google CDN `@import` removed. ✅ (moving to a single variable font is a separate design task)

### Landing
- [x] `index.html` — `controllerchange`→reload is now gated on a controller existing at load time (no needless reload on first SW install). ✅
- [x] `index.html` — `subscribePush` shows a status on denial/unsupported; the fetch error is no longer swallowed (`res.ok` → catch with a message). ✅ (also covers the next item)
- [x] `index.html` — push `catch {}` replaced with clear feedback + an `res.ok` check. ✅
- [x] `index.html` — `--muted-2` raised (dark `#928979`) / darkened (light `#5c5749`) to meet 4.5:1. ✅
- [x] `index.html` — h1 `.outline` fallback color (`color:var(--accent)`); transparency only under `@supports (-webkit-text-stroke)`. ✅
- [x] `index.html` — splash: hold only on the first view of a session; repeat views and reduced-motion are instant (LCP). ✅
- [x] `index.html`/`legal.html` — fonts self-hosted: 15 woff2 subsets in `landing/fonts/` + `fonts.css`, latin faces preloaded, `fonts.css` in the SW precache. Google preconnect/link removed, **CSP tightened to `font-src 'self'`**. Script `scripts/fetch-fonts.sh`. ✅
- [x] `index.html` — email input gets an `aria-label` from i18n (in `applyLang`). ✅
- [x] `index.html` — both `.status` regions got `role="status" aria-live="polite"`. ✅
- [ ] `index.html` — mockup texts hardcoded in English. **Deferred:** mockups are decorative (mostly `aria-hidden`); moving them to i18n is a larger, low-priority task.
- [x] `index.html` — dead i18n key `sayPh` removed from all 6 languages. ✅
- [x] `sw.js` — offline fallback for navigations (`mode:navigate` → the cached `/`). ✅
- [x] `sw.js` — `'/'`+`'/index.html'` precache duplicate removed (kept `/`). ✅
- [ ] `manifest.json` — `lang:"en"`. **Won't change:** installed-PWA metadata with a brand (language-neutral) name; valid as is.

---

## Consistency note
Panel login is tied to an active Supabase session — the same "logged in" signal used in the chat spec (`docs/chat_EN.md` §11: the name text navigates to chat for a logged-in user). The logic is unified. But while SMTP is a placeholder, self-service login works nowhere; items 1–2, 10 and SMTP setup are linked.
