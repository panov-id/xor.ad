# Open work: one consolidated checklist

Assembled 2026-07-27 from three parallel lines of work, updated 2026-07-29.
Covers `xor.ad` (relay, panel, infrastructure), `sosed.place` and
`neighbro.place` (landings). A living document — tick items as they close.

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
- [x] **A8. `REQUIRE_API_KEY=true` in every environment** — 2026-07-28. The flag
      lives per environment in `inventory.toml` (`require_api_key`), because it
      describes how far that environment's landings have rolled out, not the
      image. Verified: keyed 200, keyless 401, and the page counter still answers
      200 while storing nothing.
      **Before turning it on** a gap had to be closed that was not in the plan:
      the fixed edge rule only shortens the cache for copies fetched after it, so
      an earlier visitor still held a keyless `config.js` for up to 30 days and
      their form would have started answering 401. The address is now versioned
      (`config.js?v=<build>`), and since the page itself is cached for minutes,
      the old copy is simply never requested again.
- [ ] **A9. Dev's image tag lives outside history.**
      `relay/wizard/inventory.toml` is gitignored, so the raised tag exists only
      on the machine that rolled it. Decide: record per-environment tags in the
      release doc, or un-ignore the file.
- [x] **A10. The UAT panel** — closed itself: the deploy from the merge into
      `main` did run, just later than I looked. Verified 2026-07-27 in the
      `uat.xor.panov.id` bundle — it carries the server-log page, the
      `tenant_admin` role and the `unattributed` scope.

- [ ] **A11. day16's tail has not shipped.** `origin/main` sits at `4734392` —
      the middle of day16, not its tip. Outside main are `6bf6f9e` (relay
      quotas), `945d246` (the key's limit in the panel) and `52a8582` (the
      relay typecheck in CI). So **B5 is built but not live**: uat and prod
      follow main. A merge closes this, not code.
- [ ] **A12. The `dev` branch fell out of the path.** The rule is `dayN` →
      `dev` → `main` (written down in `deployment_EN.md` on 2026-07-29), but
      `origin/dev` sits at `7d1c2cc` (the day13 era), roughly two dozen commits
      behind, while `main` was fast-forwarded straight onto day-branch commits —
      it holds no merge commits at all. Until `dev` catches up, the dev
      environment shows something other than what ships to uat. Bring `dev` up
      to `main`, then route through it.

## B. Tenancy: unfinished functionality

- [x] **B1. API-key pages** — 2026-07-28. `GET/POST /admin/api-keys` and
      `POST /admin/api-keys/:id/revoke`; the page shows the key in full (it is
      public by design), its origin allowlist and a revoke button. A tenant sees
      and mints only its own — the brand comes from the session, never the body.
      Revoking **stamps** the key rather than deleting it: a key that vanished
      would take with it the answer to "what was this, and when did we stop
      trusting it". An empty allowlist is refused where the environment requires
      keys. Minting lives in `lib/api_key.ts`, and the CLI tool now calls the
      same function — a key issued two ways would eventually be issued two
      shapes.
- [x] **B2. Brand page** — 2026-07-28. `POST /admin/brands` writes to the
      registry; the serving node picks it up at once and the rest within the
      cache TTL, which is what makes onboarding a write rather than a redeploy.
      Env-seeded brands are listed as `environment` and are not editable — an
      override would shadow the seed with a copy that drifts from it.
- [ ] **B3. Self-service tenant registration** — section 0 of `api-platform_*`.
      B2 is done and the key shape is validated; what remains is registration
      from outside the panel.
- [ ] **B4. Exercise a tenant sign-in for real** — the magic link for
      `tenant_admin`, that they cannot see server logs and cannot grant `admin`.
      Covered by tests, never done on a stand.
- [x] **B5. Per-key quotas and limits** — 2026-07-28, once E1 landed. The daily
      allowance lives on the key, the counters in `quota_counters`
      (`db/002_quotas.sql`). A node counts locally and flushes on a ten-second
      timer: an UPDATE per public request would put the database on the path of
      every signup and every page view — exactly the dependency a storage-first
      design avoids. The cost is honest: within one flush interval a key can
      overshoot by an interval's worth of traffic, which is why the smallest
      sensible quota here is a daily one rather than a per-second one.
      Increments are **added**, never assigned, so two nodes flushing at once
      sum instead of overwriting. A check counts the database plus this node's
      unflushed total, so a burst is caught at once. An unreachable database
      does **not** refuse the request: a quota is a business limit, not a safety
      one. The panel edits the limit and shows today's spend. Verified with
      `scripts/verify-quota-local.sh`.
- [ ] **B6. Secret (server-to-server) keys** — the second key type from
      section 1 of `api-platform_*`, together with the public `/v1`.

## C. Tenancy: review leftovers

Items 9 and 10 of `tenancy-review_EN.md` needed no code but still stand as
arguments.

- [ ] **C1. The platform's `/admin/waitlist` fan-out** — a `list` and a `get` per
      record across every brand. Fine at hundreds of leads, not beyond.
- [x] **C2. The `resolveBrand` fallback** is no longer reachable on the public
      routes: with `REQUIRE_API_KEY=true` a keyless request is refused before it.

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

- [x] **E1. Where state moves** — settled 2026-07-28: our own Postgres beside
      the node, for control state only; data stays in object storage. Schema,
      access layer and the move of keys and brands are done, quotas followed
      (B5); the queue and aggregates come next. It reached production the same
      day, with a backup behind it — what was built is in **E-bis**.
      `state-decision_EN.md`.
- [x] **E2. Does the node stay interchangeable** — yes, while an environment has
      one box: the node still holds no state, the database sits beside it. A
      second box in the same environment would split the state silently, so the
      wizard rejects that configuration with an explanation. Revisit when the
      pool actually grows.

## E-bis. Control state: what was built

The E1 decision reached production on 2026-07-28. This section records what was
built; only Eb4 is still open.

- [x] **Eb1. A database beside the node.** Postgres on the same box, for control
      state only — keys and brands moved there first. The node still holds no
      state itself (E2), so it stays interchangeable.
- [x] **Eb2. Migrations ship in the image** and run before the node starts: the
      schema and the code that expects it cannot drift apart, because they
      arrive as one artefact. The wizard waits for the database before
      migrating — otherwise a first deploy raced a container that was up against
      a Postgres that was not yet accepting connections.
- [x] **Eb3. Nightly dumps and a restore drill.** `backup-postgres.sh` lives on
      the box and runs from a systemd timer — a backup that only happens when
      someone remembers is not a backup. `pg_dump --clean --if-exists` (so it
      restores onto a non-empty database), gzip, upload to Bunny Storage, a
      fortnight of retention. A dump under 512 bytes is refused: that size is an
      error message, not a database. Old copies are pruned **after** a
      successful upload, never before. The restore is exercised by
      `scripts/verify-backup-restore.sh` rather than assumed.
- [ ] **Eb4. The queue and daily aggregates** — the next thing worth moving into
      the database; see `Db3`.

## F. Porting neighbro → sosed — closed 2026-07-28

Checked against the code rather than the document: fonts, CSP, the service
worker, the legal sanitiser and muted-colour contrast had all been ported
already; sosed has neither push nor an outlined heading, so there was nothing to
carry over. Done: the form's status lines are announced, the splash holds only on
a tab's first view, and a dead key (`m10`, translated into ten languages for
nothing) was removed from neighbro.

**Beyond the list:** accent button contrast — the accent is random per load, and
4 of 6 themes on sosed (plus 3 of 5 on neighbro, in production) sat at
3.41–3.91:1 against a 4.5 bar. The colours are ~12% deeper with hue and light
text kept. Both landings gained `check-contrast.mjs` and `find-dead-keys.mjs`.

Details in `sosed.place/docs/PENDING_FROM_NEIGHBRO_EN.md`.

## F. Porting neighbro → sosed (original list)

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

## H. The Supabase leftovers are gone — 2026-07-29

The project was decommissioned on 2026-07-22, but the scaffolding around it
stayed and went on looking functional. Removed:

- [x] **H1. Dead files.** `docker-compose.functions.yml`,
      `scripts/setup-supabase.sh`, `reload-functions.sh`, `apply-migrations.sh`,
      `bootstrap-admin.sh`, `scaffold-panel.sh` (it generated the panel from the
      `refine-supabase` preset), `test-last-admin-guard.sh` (it exercised a SQL
      trigger inside the `supabase-db` container; the guard lives in the relay
      and its tests cover it), the one-shot migration scripts
      `migrate_waitlist.py` and `seed_panel_users.py` (they read through
      `api.supabase.com` and can no longer run at all), and the on-disk
      `supabase/` directory.
- [x] **H2. The landing E2E moved onto the relay.** The check read the lead from
      a Supabase `waitlist` table that no longer exists — it would have been
      confirming emptiness. It now reads through `GET /admin/waitlist` with a
      token signed by the stand's secret. It also turned out half the suite was
      written against neighbro's markup: sosed has neither `form.waitlist-form`
      nor `data-status-for`. The selectors are per face now, and the suite
      accounts for the remembered-signup behaviour (`ss-wl-done` /
      `nb-wl-done`) that replaces the form after a success. 14 of 14.
- [x] **H3. The gateway is alive again.** `nginx.conf` proxied to `kong:8000`, a
      Supabase container. It now proxies the public routes to the relay stand,
      and `docker-compose.gateway.yml` no longer depends on someone else's
      stack — it starts on its own.
- [x] **H4. The panel E2E moved onto the relay.** The three RLS specs are gone:
      there is no such layer. The rest stood on the same helpers — sign-in went
      through Supabase Auth, seeding through the service key. Sign-in now writes
      the session token to `localStorage` exactly as `/auth/callback` does, and
      seeding goes through `POST /admin/panel-users` and the public
      `POST /waitlist`. The badge assertions were repaired too: the panel moved
      to a single component where the class carries the tone and the brand or
      role is the text. 21 of 21.
- [x] **H5. Loose ends.** `@supabase/supabase-js` dropped from both test suites;
      `github-secrets.example.json` rewritten around the relay's keys; the
      Custom-SMTP-in-Supabase-Auth step removed from `setup-panov-id-email.sh`
      (the relay sends the mail); the panel's dev fallback pointed at
      `localhost:8080`, the gateway, which does not serve `/admin` — corrected to
      the stand on `8081`.

Still open:

- [x] **H6. The Supabase stack is off the machine** — 2026-07-29. Eleven
      containers and the `xorad_default` network removed, `supabase/` and
      `functions/` deleted. Nothing was lost: the 2026-07-22 backup sits in
      `~/Projects/panov-id/supabase-backup-2026-07-22` (waitlist, panel users,
      client errors and push subscriptions, for dev and prod).

      It also explained **why** the stack shared a network with the gateway: it
      was started as `docker compose -f supabase/docker-compose.yml -f
      docker-compose.gateway.yml` from the repository root, and compose names the
      project after the first file's directory — `xorad`. That is where the
      "orphan containers" warnings and the shared network came from. The
      rewritten gateway starts on its own, so it cannot happen again.
- [ ] **H7. sosed's form status has no error class.** On a failed submit
      neighbro marks the status `.err`; sosed only changes the text. The suite
      therefore checks the two faces differently. Making them agree is a change
      to the landing, not to the test.

## G. Deliberately deferred

From `review-checklist_EN.md`. Not forgotten, not in progress either.

- [ ] **G1. Panel unit tests** — e2e only today.
- [ ] **G2. A single variable font in the panel.**
- [ ] **G3. i18n for the decorative mockups.**
- [ ] **G4. Rate-limiting anonymous inserts** — Supabase Cloud / edge layer.
- [ ] **G5. `manifest lang`** — marked won't-fix.
