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
- [x] **A9. The image tag lived outside history** — 2026-07-29, by splitting
      the file. Un-ignoring `inventory.toml` whole was not an option: this is a
      public repository, commit `8002c46` ("remove concrete server/egress IP
      addresses from the public repo") took addresses out of it deliberately, and
      the inventory holds four boxes' `ssh_host` and three environments' IP
      allowlists.

      So the file is in two. `relay/wizard/environments.toml` is **tracked**: an
      environment's composition, `image_tag` above all, so "which build is on
      dev" is answered by history rather than by the machine that rolled it.
      `inventory.toml` stays ignored and keeps what a public repository must not
      carry. The wizard reads both and merges, local winning, so a local
      experiment still needs no edit to a tracked file.
- [x] **A10. The UAT panel** — closed itself: the deploy from the merge into
      `main` did run, just later than I looked. Verified 2026-07-27 in the
      `uat.xor.panov.id` bundle — it carries the server-log page, the
      `tenant_admin` role and the `unattributed` scope.

- [ ] **A11. day16's tail reached dev, not main.** On 2026-07-29 `dev` was
      fast-forwarded to `6785bd1`, so the quotas (`6bf6f9e`), the key's limit in
      the panel (`945d246`), the relay typecheck in CI (`52a8582`) and day17's
      work all shipped to the **dev environment**. `origin/main` still sits at
      `4734392` — the middle of day16 — and uat and prod follow it. So **B5 is
      built and running on dev, but still not live**. A `dev` → `main` merge
      closes this, not code.
- [x] **A12. The `dev` branch is back in the path** — 2026-07-29. It sat at
      `7d1c2cc` (the day13 era), 32 commits behind, while `main` was
      fast-forwarded straight onto day-branch commits — it holds no merge
      commits at all. `dev` was fast-forwarded to `6785bd1` (day17's tip): the
      histories had not diverged, so it took no merge and lost nothing. From
      here on, the `dayN` → `dev` → `main` rule in `deployment_EN.md` applies.

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
- [x] **B3. Tenant onboarding — by invitation, not registration.** Rejected
      2026-07-29: there will be no self-service registration. A brand is a data
      boundary, not a line on a form, and an open page would mean a stranger
      creating their own namespace, keys and panel access in one click, with the
      platform finding out afterwards.

      Instead: the platform creates the brand, then an operator inside it, and
      the node emails an invitation. The invitation is the same one-time token
      as an ordinary sign-in link but lives **seven days** rather than fifteen
      minutes — a letter is read the next morning. Sending it again is
      `POST /admin/panel-users/:email/invite` and a button on the operator's
      row, under the same visibility rules.

      A gap was closed on the way: the panel's mail sender did not check for
      `MAIL_TRANSPORT=none` and would reach for Resend with an empty key. Dead
      code went too — the panel kept state for an invite link it never showed.
- [x] **B4. Exercise a tenant sign-in for real** — 2026-07-29, on the stand.
      `scripts/verify-tenant-login-local.sh` had been written and never run. The
      operator walks the whole path — letter, link, session — and the panel sees
      them as `tenant_admin` of `sosed`. The walls hold: own leads, keys and page
      views 200; server logs, the brand registry and another brand 403; an
      attempt to grant themselves `admin` 403; a key requested "for neighbro" is
      minted for `sosed`.

      **It found a bug the tests could not.** Minting a key answered 500 on the
      `api_keys.brand → brands.key` foreign key. The cause is a contradiction
      inside `001_control_state.sql`: a comment twenty lines above the constraint
      says a brand may live in the `BRANDS` variable alone, while the constraint
      demands a row. Both cannot be true. Dropped in
      `003_api_keys_brand_fk.sql`; the code-level check was already there and
      knows both sources (`brandByKey`).

      The tests never saw it and could not: they run without a database, on file
      storage, where the `INSERT` branch is not taken at all. This is only
      catchable on a stand — which is what the item existed for.
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
- [ ] **B7. Check whether the foreign key reached production.** The `B4` bug
      hits brands with no row in `brands` — which is exactly "the platform's own
      faces", the ones the schema says stay on the env seed. If production has no
      rows for `sosed` and `neighbro`, minting a key through the panel failed
      there the same way and nobody had tried: the live landing keys were minted
      before control state moved into Postgres. One `GET /admin/brands` against
      production answers it — a brand marked `environment` with no row means it
      was affected. The cure is the same `003`, arriving with the next image.
- [x] **B6. Secret (server-to-server) keys** — the second key type from
      section 1 of `api-platform_*`, together with the public `/v1`. The code
      arrived in `d87a721` but the item was never ticked; verified on the stand
      and closed on 2026-07-30.

      A key is minted with scopes, and the secret is **shown once** and never
      readable back — the listing returns the key without it. `/v1` identifies
      the caller by the secret, and repeating a request answers the same and
      writes nothing twice (`idempotent-replay: true`, one lead at the tenant).
      The scope is the limit: a wrong secret and a keyless call get 401, a tenant
      asking for `logs.server.read` gets 403, a revoked key gets 401.
      Checked by `scripts/verify-secret-keys-local.sh`.

## C. Tenancy: review leftovers

Items 9 and 10 of `tenancy-review_EN.md` needed no code but still stand as
arguments.

- [x] **C1. The platform's `/admin/waitlist` fan-out** — 2026-07-29. The route
      read **every** lead across every brand on every visit to the page: 29 leads
      go unnoticed, 29,000 are 29,000 storage reads for one page load.

      It now follows the discipline the log pages already do: list the metadata
      (one call per scope, no bodies), select the window, read only what is
      shown. `limit` (200 by default, 500 at most) and a `before` cursor arrived
      with it, and the headers carry both the total and the matched count.

      The response shape did not change — an array plus `x-total-count` — so the
      panel and its tests were left alone.

      **The trade:** ordering is now by the object's storage timestamp rather
      than the record's `created_at`, because the latter cannot be known without
      reading the object, which is the cost being removed. They agree for
      anything the node wrote; leads copied by the tenancy migration carry the
      migration's time and therefore cluster. The same trade is already made, and
      written down, for the logs.
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
- [x] **D6. A real 404 page — accepted as it is.** Settled 2026-07-29:
      won't-fix. Bunny's `ErrorPageCustomCode` applies to origin errors, not to a
      404 from a storage zone. The page exists, is served at `/404.html`, and the
      status code is right; what is lost is the look of a stranger's placeholder
      on a mistyped address. An origin instead of storage would fix it and add a
      moving part where there are currently only files — dearer than the gain.
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
- [x] **Db2. They do** — settled 2026-07-29 and built the same day.
      `POST /v1/pageview` under the `pageviews.write` scope. It is worth exposing
      precisely because of what the counter refuses to record: no address, no
      user agent, nothing that outlives the request — so a tenant owes their
      visitors no consent banner for it, and that is the entire offer.

      No idempotency here, unlike the waitlist: a repeated view is a view, and
      collapsing two identical reports would make the counter lie in the one
      direction it exists to measure.
- [x] **Db3. Daily aggregates** — 2026-07-29, with `Eb4`. The object per view
      stayed but stopped being where the numbers come from: the count lives in
      `pageview_daily`, and the object only carries the detail, for 14 days.

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
- [x] **Eb4. The queue and daily aggregates** — 2026-07-29, together with `Db3`.

      **The count.** `POST /pageview` now writes an increment to
      `pageview_daily` (brand · day · path · lang) as well as the object.
      Batched every 10 seconds, like quotas: a page view is a request a visitor
      is waiting on, and the database must not be on its path. Increments are
      added, never assigned, so two nodes flushing at once sum.

      **Retention.** Objects live 14 days instead of 90. The window no longer
      decides whether the numbers survive — it is now the length of time the
      detail the aggregate cannot hold is worth reading: referrer, viewport,
      time of day.

      **The queue.** `lib/jobs.ts` — a worker inside the node: claiming through
      `FOR UPDATE SKIP LOCKED`, a `locked_until` lease (a node that dies does not
      take the job with it), retries that back off, and exhausted attempts that
      leave the row with its `last_error` rather than deleting it. The prune job
      re-arms itself for tomorrow, so the schedule lives in the same table as the
      work. Without `DATABASE_URL` none of it starts.

      **What the plan did not include.** The panel's `total` counts objects, not
      views — after the first prune it would have shown traffic collapsing by
      two thirds. So the response now carries `lifetime` from the aggregate and
      the panel says both: "36 stored · 36 all time". And for the two numbers to
      agree on an environment that has been running, there is
      `tools/backfill_pageview_daily.ts`, which folds the existing objects into
      rows. It rebuilds whole days rather than adding to them, so a second run
      converges instead of doubling. **Run it on dev before objects start
      expiring.**

      Verified by `scripts/verify-pageview-aggregate-local.sh` against a real
      Postgres: increments adding up, the count surviving a prune, one of two
      workers winning a job, a failed job deferred. Unit tests cannot cover this
      — they run on file storage, where these branches are never taken.

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

## F. Porting neighbro → sosed (original list) — checked 2026-07-29

The nine items from `sosed.place/docs/PENDING_FROM_NEIGHBRO_EN.md`. All closed,
none ticked: the section above declared the port finished while this list stayed
unmarked, so the tracker showed nine pieces of work that did not exist. Checked
against the code rather than the document:

| Item | Where |
|---|---|
| F1 self-hosted fonts, Google CDN gone | `landing/fonts.css`, `landing/fonts/*.woff2` |
| F2 CSP | `index.html`, `legal.html` |
| F3 `:focus-visible`, `role="status"`, `prefers-reduced-motion` | `index.html` |
| F4 service worker + `controllerchange` | `landing/sw.js` |
| F5 the `safeUrl` sanitiser | `legal.html` |
| F6 `--muted-2` contrast | the palette in `index.html` |
| F7 splash holds once per tab | the `ss-splash` key |
| F9 dead translation keys | `find-dead-keys.mjs` |

**F8 (`subscribePush`) does not apply:** sosed has no push at all, so there was
nothing to carry over — as the section above already says.

## H. The Supabase leftovers are gone — 2026-07-29

The project was decommissioned on 2026-07-22, but the scaffolding stayed and
went on looking functional. Removed:

- [x] **H1. Dead files.** `docker-compose.functions.yml`,
      `scripts/setup-supabase.sh`, `reload-functions.sh`, `apply-migrations.sh`,
      `bootstrap-admin.sh`, `scaffold-panel.sh` (it generated the panel from the
      `refine-supabase` preset), `test-last-admin-guard.sh` (it exercised a SQL
      trigger inside the `supabase-db` container; the guard lives in the relay),
      the one-shot migration scripts `migrate_waitlist.py` and
      `seed_panel_users.py` (they read through `api.supabase.com` and can no
      longer run), and the on-disk `supabase/` directory.
- [x] **H2. The landing E2E moved onto the relay.** The check read the lead from
      a Supabase `waitlist` table that no longer exists — it would have been
      confirming emptiness. It now reads through `GET /admin/waitlist`. It also
      turned out half the suite was written against neighbro's markup: sosed has
      neither `form.waitlist-form` nor `data-status-for`. The selectors are per
      face now, and the suite accounts for the remembered-signup behaviour
      (`ss-wl-done` / `nb-wl-done`). 14 of 14.
- [x] **H3. The gateway is alive again.** `nginx.conf` proxied to `kong:8000`, a
      Supabase container. It now proxies the public routes to the relay stand,
      and `docker-compose.gateway.yml` no longer depends on someone else's stack.
- [x] **H4. The panel E2E moved onto the relay.** The three RLS specs are gone:
      there is no such layer. The rest stood on the same helpers — sign-in through
      Supabase Auth, seeding through the service key. Sign-in now writes the
      session token to `localStorage` exactly as `/auth/callback` does, and
      seeding goes through `POST /admin/panel-users` and the public
      `POST /waitlist`. 21 of 21.
- [x] **H5. Loose ends.** `@supabase/supabase-js` dropped from both test suites;
      `github-secrets.example.json` rewritten around the relay's keys; the
      Custom-SMTP-in-Supabase-Auth step removed from `setup-panov-id-email.sh`;
      the panel's dev fallback pointed at `localhost:8080`, the gateway, which
      does not serve `/admin` — corrected to the stand on `62080`.
- [x] **H6. The Supabase stack is off the machine** — 2026-07-29. Eleven
      containers and the `xorad_default` network removed, `supabase/` and
      `functions/` deleted. The 2026-07-22 backup is intact:
      `~/Projects/panov-id/supabase-backup-2026-07-22`. It also explained **why**
      the stack shared a network with the gateway: it was started as
      `docker compose -f supabase/docker-compose.yml -f docker-compose.gateway.yml`
      from the repository root, and compose names the project after the first
      file's directory — `xorad`.
- [x] **H7. sosed's form status on failure** — 2026-07-29. The landing changed
      the text but not the class, so the one moment a form has to be unmistakable
      looked like every other. An `--err` token was added to four palettes and a
      `.status.err` rule; the colour is not the accent — the accent is random per
      load and terracotta on some themes. Contrast measured: 7.17 and 6.74 on the
      dark backgrounds, 5.52 and 6.08 on the light ones, against a 4.5 bar. The
      E2E now checks both faces the same way.

## G. Deliberately deferred

From `review-checklist_EN.md`. Not forgotten, not in progress either.

- [x] **G1. Panel unit tests** — 2026-07-29. vitest arrived (`npm test`,
      `scripts/run-panel-unit-tests.sh`, all in Docker) with 10 checks over the
      pure logic: the page permission map, deny-by-default for unmapped actions,
      the session header on the fetch client, resource-name to route.

      **The hole was bigger than the item: the panel had no CI at all.** Types
      and the build ran for the first time inside `_deploy.yml` — during a
      rollout. `.github/workflows/panel.yml` now runs `npm ci`, the unit tests
      and `tsc --noEmit` on push and pull request, scoped to `panel/**` and the
      relay's access core.

      **And it found the drift it exists for:** the relay gained
      `waitlist.write` today and the panel's copy of the catalogue did not, so
      the secret-key page could not have offered the one scope the permission was
      added for. Fixed, with a test that reads the relay's file and compares the
      two lists string for string.
- [ ] **G2. A single variable font in the panel.**
- [ ] **G3. i18n for the decorative mockups.**
- [ ] **G4. Rate-limiting anonymous inserts.** "Supabase Cloud / edge layer" is
      stale — that layer is gone. Today it is either the relay's quotas
      (`lib/quota.ts` already counts per key and can refuse) or Bunny Shield in
      front of the node. The difference matters: a quota knows whose key it is
      but counts a request already accepted; Shield cuts before the node but by
      address, not by tenant. Decide when abuse appears, not before.
- [ ] **G5. `manifest lang`** — marked won't-fix.
