# Open work: one consolidated checklist

Assembled 2026-07-27 from three parallel lines of work. Covers `xor.ad` (relay,
panel, infrastructure), `sosed.place` and `neighbro.place` (landings). A living
document — tick items as they close.

Sources: `status-tenancy_EN.md`, `tenancy-review_EN.md`,
`review-checklist_EN.md`, `sosed.place/docs/SEO_AND_ANALYTICS_EN.md`,
`sosed.place/docs/PENDING_FROM_NEIGHBRO_EN.md`,
`neighbro.place/docs/SEO_AND_ANALYTICS_EN.md`.

---

## A. Tenancy: finish the rollout

The order inside this section is not optional: the node always before the
landing, the migration always before the flag.

- [x] **A1. Migrate dev's data** — done 2026-07-27 via the new
      `scripts/migrate-tenants-remote.sh` (the same tool against real storage;
      prod is gated behind `CONFIRM_PROD=yes`). Three passes: plan — 7 leads
      (2 sosed, 5 neighbro); `--apply` — copied without error; `--delete` —
      originals removed once their copies read back. Result: the `waitlist/dev/`
      root is empty, tenants see 4 and 6, the platform sees 10 instead of 17, so
      the double-count is gone. Checked through the panel API, not by eye in the
      panel.
- [x] **A2. Staging node** — done 2026-07-27. Staging takes a release image
      rather than a sha, so the release **v0.4.0** was cut and published first,
      from `e090c2f` — the very commit whose image was already running on dev, so
      staging received a byte-identical, already-exercised build. Then the
      `staging` environment's `image_tag` became `v0.4.0` and
      `wizard --node n1 deploy` rolled it. Smoke: `/health` ok, the preflight
      allows `x-api-key`, the key outranks the body, a key from a foreign origin
      gets 403.
- [x] **A3. Migrate staging's data** — done 2026-07-27. Plan — 4 leads (1 sosed,
      3 neighbro); `--apply` without error; `--delete` once the copies read back.
      Result: the `waitlist/staging/` root is empty, sosed sees 2, neighbro 4,
      the platform 6 instead of 10.
- [x] **A4. Landings to uat** — closed automatically, as it turns out: the
      landings' `deploy-uat.yml` fires on a push to `main` rather than by hand, so
      uat shipped with the merge — the keys on 26.07, the counter on 27.07.
      Verified in both uat domains' `config.js`. The node-before-landing order
      held anyway: staging was already on `v0.4.0`.
- [x] **A5. Prod node** — done 2026-07-27: the same `v0.5.0` release that had
      been running on staging, promoted to box p1 with `--confirm-prod`. Smoke:
      health, a preflight from `sosed.place`, a keyless call (what the live
      landings still did) and a keyed one — both 200.
- [x] **A6. Migrate prod's data** — 27 real leads (25 neighbro, 2 sosed). Before
      the irreversible pass, **all 27** copies were compared with their originals
      by data rather than by bytes: the originals came from the earlier Supabase
      migration (spaces in the JSON), the copies from the node (none), so a byte
      comparison raised a false alarm. Nothing missing, nothing different.
      Result: the root is empty, the platform sees 29 instead of 56.
- [x] **A7. Landings to prod** — 2026-07-27, the same tags uat had been serving
      (`v2026.07.27-d8cbb02` and `-4e17a76`). The live sites serve the key and the
      GA4 id in `config.js`, a `robots.txt` that allows crawling, sitemaps of 19
      and 12 URLs, language pages with `hreflang` and without `noindex`, the
      counter, and the FAQ structured data.
- [ ] **A8. `REQUIRE_API_KEY=true` per environment** — once
      `relay_keyless_requests_total` and the server logs show no keyless callers
      left. It retires the transitional fallbacks: dedup into the root, and
      resolving the brand from the host.
- [ ] **A9. Dev's image tag lives outside history.**
      `relay/wizard/inventory.toml` is gitignored, so the raised tag exists only
      on the machine that rolled it. Decide: record per-environment tags in the
      release doc, or un-ignore the file.
- [x] **A10. The UAT panel** — closed itself: the deploy from the merge into
      `main` did run, just later than I looked. Verified 2026-07-27 in the
      `uat.xor.panov.id` bundle — it carries the server-log page, the
      `tenant_admin` role and the `unattributed` scope.

## B. Tenancy: unfinished functionality

- [ ] **B1. API-key pages in the panel.** The `api_keys.read/write` permissions
      exist; the mint/revoke routes and the UI do not — today it is the CLI and
      the workflow.
- [ ] **B2. Brand pages.** `brands.write` is declared; only `GET /admin/brands`
      exists.
- [ ] **B3. Self-service tenant registration** — section 0 of `api-platform_*`.
      Needs B2; the brand-key shape check is already done.
- [ ] **B4. Exercise a tenant sign-in for real** — the magic link for
      `tenant_admin`, that they cannot see server logs and cannot grant `admin`.
      Covered by tests, never done on a stand.
- [ ] **B5. Per-key quotas and limits** — waits on E1.
- [ ] **B6. Secret (server-to-server) keys** — the second key type from
      section 1 of `api-platform_*`, together with the public `/v1`.

## C. Tenancy: review leftovers

Items 9 and 10 of `tenancy-review_EN.md` needed no code but still stand as
arguments.

- [ ] **C1. The platform's `/admin/waitlist` fan-out** — a `list` and a `get` per
      record across every brand. Fine at hundreds of leads, not beyond.
- [ ] **C2. The `resolveBrand` fallback returns the first brand** — an unknown
      host silently becomes sosed. Goes away with A8.

## D. Search and indexing

The code is done on both landings: per-language pages, reciprocal `hreflang`, a
generated `sitemap.xml`, a `robots.txt` swapped out off production, JSON-LD
(`Organization`/`WebSite`/`FAQPage`), the FAQ, IndexNow, the consent banner, GA4
behind a flag, edge rules (www→apex, short HTML TTL). What remains:

- [x] **D1. `ANALYTICS_ID` (GA4)** — set 2026-07-27 in both repositories'
      `production` environment: `G-WWHXHZ5QWQ` for sosed, `G-K7EP39DDK9` for
      neighbro. dev and uat stay empty, hence no counter and no banner there.
      `SEARCH_CONSOLE_TOKEN` is **not needed**: the domains verify by a DNS TXT
      record rather than a meta tag, so it was deliberately not stored — two
      verification methods would only duplicate each other.
- [x] **D2. Local checks F1–F3** — closed 2026-07-27. `landing/verify-seo.mjs`
      (the same file in both landings) reads a generated site and answers all
      three before any deploy. sosed — 17 languages, 18 alternates per page, a
      19-URL sitemap; neighbro — 10 languages, 11 alternates, 12 URLs. No dead
      links.
- [ ] **D3. Live checks F4–F5** — no request to a Google domain before consent,
      no CSP violations in the console. After the production deploy.
- [x] **D4. Sitemap submitted to Search Console** — 2026-07-27, both domains
      (`https://sosed.place/sitemap.xml` and
      `https://neighbro.place/sitemap.xml`). They are Domain properties, so the
      full URL is required. www was not submitted: the zones redirect it to the
      apex, so it would only duplicate.
- [ ] **D5. Register in Bing Webmaster Tools** — a manual step; IndexNow does not
      need it, but it brings reports.
- [ ] **D6. A real 404 page** — blocked by Bunny: `ErrorPageCustomCode` applies
      to origin errors, not to a 404 from storage. The page exists and is served
      at `/404.html`, and the status code is correct. Either accept it, or run an
      origin instead of storage.
- [ ] **D7. A per-language OG image** — the pipeline draws one for the whole
      site; it only starts to matter with translated typography.

## D-bis. Our own page counter

Built 2026-07-27 and deployed everywhere, production included: `POST /pageview` on the relay, a
"Page views" page in the panel, reporting from both landings. It counts everyone
because it needs no consent — the record carries no address, no user agent and no
identifier.

- [x] **Db1. Retention.** `tools/prune_pageviews.ts` +
      `scripts/prune-pageviews-remote.sh`: a 90-day window by default, selection
      from listing metadata (the objects are never read — a prune must not cost
      what the traffic it cleans up after did), plan by default, deletion only
      with `--apply`, a window under 7 days refused, prod behind
      `CONFIRM_PROD=yes`. Verified on the stand: the aged view went, the fresh one
      stayed. Run by hand monthly until E1 is decided.
- [ ] **Db2. Do tenants get `/pageview`** as part of the public API — this decides
      whether the route is documented outward in `api-platform_*`.
- [ ] **Db3. Daily aggregates** instead of an object per view — waits on E1; until
      then retention holds the volume.

## E. Open decisions

- [ ] **E1. Where state moves** — Postgres/Supabase, Redis beside the pool, an
      external queue. It blocks quotas, a pool-wide rate limit, the job table and
      a filterable journal. The code already shows the symptoms: TTL caches, a
      `list` per request, no atomic counter.
- [ ] **E2. Does the node stay interchangeable.** If yes, the worker and queue
      live apart from it; if no, the node becomes a stateful service and the
      pool's deployment model changes.

## F. Porting neighbro → sosed

`sosed.place/docs/PENDING_FROM_NEIGHBRO_EN.md`. The freeze on the sosed landing
was lifted on 2026-07-22, but the document is still written as if it held —
reword it at the first port. Open items:

- [ ] **F1. Self-hosted fonts** (woff2 + `fonts.css` + preload), drop the Google
      CDN.
- [ ] **F2. CSP `<meta http-equiv>`** in `index.html` / `legal.html`.
- [ ] **F3. Accessibility:** `:focus-visible` on interactive elements,
      `:focus-within` on the form; `aria-label` on the input, `role="status"` on
      the status line; `prefers-reduced-motion` with a full animation reset.
- [ ] **F4. Service worker:** gate `controllerchange`→reload, offline fallback
      for navigations, `config.js` network-first.
- [ ] **F5. A `safeUrl` sanitiser** in the legal renderer (block `javascript:`
      and `data:`), EN fallback, fetch timeout.
- [ ] **F6. `--muted-2` contrast to 4.5:1** and a fallback colour for
      `h1 .outline`.
- [ ] **F7. Splash: hold only on the session's first show.**
- [ ] **F8. `subscribePush`:** feedback on refusal, and check `res.ok`.
- [ ] **F9. Dead i18n keys** — check ours.

## G. Deliberately deferred

From `review-checklist_EN.md`. Not forgotten, not in progress either.

- [ ] **G1. Panel unit tests** — e2e only today.
- [ ] **G2. A single variable font in the panel.**
- [ ] **G3. i18n for the decorative mockups.**
- [ ] **G4. Rate-limiting anonymous inserts** — Supabase Cloud / edge layer.
- [ ] **G5. `manifest lang`** — marked won't-fix.
