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

- [x] **A11. day16's tail reached dev, not main — closed 2026-08-09** by the `dev` → `main` merge; both branches sit at `e4ce220`, and production runs the release cut from it.** On 2026-07-29 `dev` was
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

## J. Legal and mail

From the privacy review of 2026-08-02. Both storefronts' policies already name the
address to write to about data — so the address has to exist.

- [x] **J1. Created — 2026-08-05.** `privacy@sosed.place` and `privacy@neighbro.place`
      created by `deploy/add-privacy-aliases.sh`, forwarding to `ev.panov@gmail.com`.
      DNS, MX and Resend untouched — aliases only. The original task text: `privacy@sosed.place` and
      `privacy@neighbro.place`, forwarding to `ev.panov@gmail.com`. Both domains
      already sit on ImprovMX (`mx1/mx2.improvmx.com`), so this is an alias in the
      service's panel, not a DNS change.

      **Why it is urgent:** the privacy policy of both storefronts is already
      published with that address and promises an answer within a month. Until the
      mailbox exists the document promises a channel that does not — and the GDPR
      clock starts when a request is sent, not when we happen to read it.

- [x] **J3. Forwarding verified — 2026-08-05.** All three addresses came back
      `delivered`: both `privacy@` from `no-reply@panov.id`, and `eugene@panov.id`
      from `hey@sosed.place` — each sent from a different domain so the test never
      runs inside its own. `delivered` means the receiving MX (ImprovMX) took the
      message; the final hop into the personal inbox is confirmed by eye.

      J2 was dropped: `eugene@panov.id` already existed, forwarding to
      `eugene.panov.id@gmail.com`, which is the right destination.

From the legal pass of 2026-08-05. Payments were taken out of the service, offers
were written into the Terms, and the DSA was worked through. Below is what that
pass opened and did not close.

- [ ] **J4. Art. 16 notice mechanism — built; what remains is a live check and
      Art. 14(6).** "No interface yet" is out of date: verified 2026-08-09 against
      the live sites and the code.

      **Present and working:** the tables, the public `POST /report` (answers both
      through the CDN on production and on staging; an incomplete notice is refused
      before anything is stored), the snapshot with its three states, the receipt,
      the yearly sweep, the `report.html` form on both storefronts (200), a footer
      link on both, the examination screen `panel/src/pages/dsa-notices`, the routes
      in `routes/dsa.ts`, both letter templates in `lib/mailer.ts`, and the
      `dsa_notices.read` / `dsa_notices.decide` permissions.

      **Remaining:**
      - [ ] **an end-to-end check on staging** — a real notice, the receipt, the
        panel queue, a decision, both letters (Art. 16(5) and 17(3)), then delete
        the test record. The chain has never been walked whole;
      - [ ] **notice of a new revision of the documents, Art. 14(6)** — the one
        genuinely unbuilt part. The Terms and the Policy promise to be "signposted
        in the Service" themselves. Decided 2026-08-09: a bar on the storefronts
        and a screen on entering the panel, **informing rather than requiring
        acceptance** — Art. 14(6) asks for information, and there is nobody to
        collect consent from: a storefront has no identity, only a browser. The
        version is derived from the documents themselves (`Last updated` in
        `terms_EN.md` and `privacy_EN.md`, the later of the two) rather than kept
        by hand in a fourth place, which would drift on the first edit.

      **This is not hypothetical: the change has already happened.** On 2026-08-07
      the push-notification promises were removed from the Policy and its revision
      date moved — with nothing to announce it.

      File names and detail — [`dsa/CHECKLIST_EN.md`](./dsa/CHECKLIST_EN.md).

- [x] **J5. The point-of-contact languages are named — 2026-08-05.** In both
      storefronts' Terms: English and Greek, answered in the language of the
      request. Greek was taken because Art. 11(3) requires an official language of
      the country of establishment, and the Coordinator's site is in Greek. We
      have no native speaker — incoming mail gets translated; an accepted risk,
      recorded in `dsa/README_EN.md`, §2.

- [x] **J6. New-edition notice — 2026-08-05.** With no mail and no accounts, the
      only honest way is to say it at the door. Both storefronts compare the
      stored edition against the current one and show a bar with an "accept"
      button; a first visit stores the edition silently (use is acceptance,
      `terms §3`). Translated into every locale and verified with Playwright: a
      fresh visitor sees nothing, someone on an older edition sees it in their
      own language, and after accepting it does not come back.

- [x] **J7. Second pass on the translations — 2026-08-05.** Every string the
      assistant wrote was gone through: the donate word, the new-edition bar, the
      offers sentence in the guidelines — across 17 locales in sosed and 10 in
      neighbro.

      Three were fixed, and they were errors rather than taste: `uz` "ianot" →
      **`xayriya`** (a bookish word replaced by the ordinary one), `be` "данат" →
      **`падтрымаць`** (a calque from Russian; Belarusian does not say that), `el`
      "διαβάστε" → **`διάβασε`** (polite plural next to the informal "Θες" — a
      register mismatch).

      **The residual risk stays and will not be removed.** Grammar and register can
      be read; naturalness cannot be checked without a native speaker. If someone
      on `kk`, `ka`, `hy`, `az`, `uz`, `ky`, `tg` ever turns up — show them the
      footer and the guidelines.

- [ ] **J9. Re-check the micro-enterprise status by 2027-08-05.** The lifting of
      DSA Section 3 rests on it. The current record is in `dsa/README_EN.md`, §3.

- [x] **J10. Bunny's two new sub-processors — we do not object. Decided
      2026-08-07.** The notice arrived 2026-08-05, the change takes effect
      2026-08-19, the §3.2 objection window is five days and silence counts as
      consent. We let the window pass **deliberately**.

      There is nothing to object to: the change concerns "personal account data" —
      the operator's account details, not the storefronts' visitors. The data
      subject here is the operator, and blocking a change about one's own data
      serves no purpose. General authorisation of sub-processors with an objection
      window is the ordinary mechanism of Art. 28(2); not objecting breaches
      nothing.

      Accepted as residual risk: the names were never given, "account data" was
      never confirmed in writing, the country is unknown. The analysis and the
      full list of what we accepted are in
      [`legal-archive/bunny-dpa_EN.md`](./legal-archive/bunny-dpa_EN.md), and
      `vendors-dpa_EN.md` marks the two as unnamed.
- [ ] **J12. Re-check Bunny's sub-processor list after 2026-08-19.** Once the
      change takes effect, look at the public page and record the names in
      `vendors-dpa_EN.md`. This is bookkeeping, not an objection — the objection
      window will have expired by then (J10).

      **One thing to watch:** should the new sub-processors sit outside the EEA
      and touch visitor data rather than account data, the cross-border picture
      changes. We accepted it on specific grounds — region `DE`, no replicas,
      chat and feed never go there — and those grounds would need revisiting.

- [x] **J11. The UAT auto-tag builds no image — closed 2026-08-09.** Verified in the registry: both `relay-node` and `relay-caddy` exist under `v2026.8.9-ge4ce220`.** Merging `dev → main` tags the
      commit `v2026.08.05-<sha>`, but no image exists under it: `type=semver` in
      `.github/workflows/relay.yml` only emits a tag for a valid semantic
      version, and `2026.08.05-…` with its leading zero is not one. Checked in the
      registry on 2026-08-05: `v2026.08.05-1480743` → 404, `sha-1480743` → 200.

      **Fixed 2026-08-05.** The auto-tag in `deploy-uat.yml` across all three
      repositories is now `v$(date +%Y.%-m.%-d)-g${GITHUB_SHA::7}` — no leading
      zeros, and a letter in front of the sha. The prefix is not cosmetic: a sha
      of all digits starting with zero would be an invalid numeric pre-release
      identifier and would break the build the same way, once in a thousand
      releases. Checked against the official semver regexp: the old format fails,
      the new one passes, including that edge case.

**The cause ran deeper than the format — 2026-08-05.** No build ever ran
      from the tag: it is pushed inside a workflow with the stock `GITHUB_TOKEN`,
      and GitHub deliberately starts no run for events created with that token.
      The auto-tag therefore **never** built an image, at any format. `v0.9.0` is
      in the registry because a person pushed it by hand.

      **Fixed by a call rather than a token.** `relay.yml` accepts a
      `workflow_call` with a `release_tag` input and labels the image with it
      (`type=raw`, because `type=semver` reads the ref and on a call the ref is
      the branch, not the tag); `deploy-uat.yml` calls it right after creating the
      tag. The build no longer depends on whose token wrote the tag. A long-lived
      PAT in secrets was deliberately not introduced: it expires silently.

      One tail remains: **tags already pushed are not reissued**, so the
      `v2026.08.05-*` ones stay imageless and staging runs `sha-1480743`. The next
      `dev → main` merge produces a tag an image is built for, and from then on
      staging and prod can be pinned to a release as intended.

## K. Chat decisions — 2026-08-07

Taken in one day and linked: each became possible because of the one before it.
Written down here so that nobody has to work it out again in six months.

1. **A chat is not moderated.** The spec moderated one; the privacy policy, the
   Article 30 register and the chat-screen notes all denied it. The documents
   were right: the feed is public, while two people talking by mutual consent is
   not publication. The spec was the straggler and was brought into line.
2. **End-to-end encryption.** It became possible precisely because the chat
   stopped being read: you cannot see text and be blind to it at once. The key
   belongs to **the conversation**, is derived from both sides' ephemeral pairs,
   and dies with the chat.
3. **The browser fingerprint is gone entirely.** It was built from the
   connection, and the connection now arrives from the delivery network: two of
   its four inputs became identical for everyone. It also hit the wrong
   person — the neighbour behind one router — while costing ten seconds to shed.
4. **Sessions in its place.** One identity, several devices, joined by QR, with
   the key travelling in the URL fragment past the server. Revocation is real: a
   revoked session receives no keys for future chats.
5. **Hiding a phrase personally.** The community guidelines promised this in
   public and the design provided nothing. Added in §8.9.
6. **Explicit content is fully prohibited** (a parallel session's decision).
   Screen 11 and the email consent are cancelled, and the screen's spec deleted.

**What follows in terms of dates.** The privacy policy became edition
`2026-08-07`: the fingerprint, the consent for the wider fingerprint and the
consent for explicit content were all removed — three items, every one of them
in the person's favour. The acceptance notice will fire for everyone who
accepted the previous edition.

**What is still open:** the chat itself is unbuilt (not one table from §8),
eight items in §8.14 need measurement, the storefronts carry no security headers
at all, and the secret rotation plan lives in `secret-rotation_EN.md`.

## L. Backups and production data — 2026-08-07

Found during the restore drill on 2026-08-07: a production dump came up in a
throwaway `postgres:16-alpine` with **not one error**, all nine tables and five
migrations intact. The backup itself works — a nightly timer, a fortnight of
retention, cleanup only after a successful upload. But the drill showed two
things nobody had seen before it.

### L1. The waitlist is not in the backup — open

There is no `waitlist` table: signups are written **to Bunny Storage**
(`relay/node/src/routes/waitlist.ts`, the zone from `BUNNY_STORAGE_ZONE`), while
`backup-postgres.sh` copies Postgres only. So the backup covers control state —
keys, brands, quotas, Article 16 notices — and does **not cover the only
accumulated user data** we currently hold.

What to do about it:

- back up the storage as well, as another step of the same nightly timer;
- or move the waitlist into Postgres, where the existing backup already reaches;
- either way — **prove it by restoring**, not by declaring it done.

The other half of the same problem sits beside it: the dumps land in the
`sosed-waitlist-dev` zone together with 269 storefront files. No pull zone
points at it today (verified 2026-08-07), but the protection rests on nobody
attaching one. A dedicated `relay-backups` zone belongs to the same item.

### L2. Test notices in the production register — closed 2026-08-07

`dsa_notices` on production held **five rows** created on 2026-08-05 while
checking the move behind the CDN, the Caddy lock and Shield: "Lock check: a real
report still goes through the front door" and the like. None had been decided;
all had `target_kind = other`. Deleted by explicit id in a single transaction;
the register is empty.

**The rule from here on:** exercise end-to-end paths against **staging**, not
production. The Article 16 register is a document that may one day be shown to a
supervisory authority, and test entries in it would have to be explained. Where
a production check is unavoidable, the row is removed the same hour, not two
days later.

**Residual trace:** the nightly backups for 5–7 August contain those five rows
and will until the fortnight expires, around 2026-08-21. That is expected and
matches the declared retention.

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
- [ ] **G4. Public `/waitlist` protection — the node is the only place.** Checked
      2026-08-05: `/waitlist` has **no protection at all**, and the old wording
      ("either quotas or Bunny Shield in front of the node") is wrong — Shield is
      not in front of the node. All nine Bunny zones serve static files from
      storage (`origin` is empty), the landing calls
      `fetch(API_URL + "/waitlist")` straight into the node behind Caddy on
      Hetzner, and Caddy has no rate limit either. No CDN tier can help here.

      Today's daily quota in `lib/quota.ts` counts **per key**, and every visitor
      shares one key. That is not protection but a lever for denial of service: a
      bot that burns the quota in a minute closes signups for everyone for a day.

      **Done 2026-08-05:**
      - `lib/rate_limit.ts` — a per-address window in the node's memory, separate
        from the key quota. `/waitlist` 5 an hour, `/report` 10 an hour (higher:
        refusing a report of illegal content is refusing a legal obligation).
        Refusal is `429` with `retry-after`; four unit tests in
        `test/rate_limit.test.ts`.
      - `lib/client_ip.ts` — the address comes from `X-Real-IP` **only** with a
        valid `X-Origin-Token`, and otherwise from the connection itself. Without
        that the header is forged and the limit is bypassed by substituting
        someone else's address.
      - a honeypot in both landing forms and in the report form; a filled field
        looks like success and sends nothing. Verified in a browser: zero requests
        to `/waitlist`.
      - `ORIGIN_TOKEN` in the node config, empty by default: a node without one
        never trusts the header, which is correct for dev.

      **Done 2026-08-05 on the prod node:**
      - [x] `ORIGIN_TOKEN` issued to p1-prod (`wizard configure --confirm-prod`);
        `/health` answers after the restart. The secret lives in
        `wizard/secrets.env`, outside the repository, and `wizard.py` puts it into
        the node's env.
      - [x] an edge rule on the `xorad-api-prod` zone adds `X-Origin-Token` to
        every forwarded request (`deploy/bunny-api-origin-token.sh`, read back
        from the API). The condition is "any URL" — Bunny demands at least one.

      **The order as first written was wrong, and it matters.** The Caddy check
      cannot be switched on before the DNS move: traffic reaches the node directly
      today and carries no token, so enforcing would take the prod API down.
      Capability first, then the move, and only then enforcement.

**The 2026-08-05 check found the address header never arrived.** The token
      does (verified on a throwaway zone with an echo origin); `X-Real-IP` does
      not: **Bunny treats that name as its own and silently ignores an edge rule
      writing it**. Variable expansion works fine — the same value under
      `X-Client-IP` arrives every time. The prod zone now carries an `X-Client-IP`
      rule and the node reads that first.

      Found by experiment rather than by reading: the limit was filled to `429`
      down the direct path, and the same request through the CDN still passed —
      different buckets, so the node was seeing the edge address, not the client's.
      **This is exactly why the Caddy token check could not be switched on blind.**

**The same experiment exposed a flaw in the limiter itself — 2026-08-05.**
      The node sits behind Caddy, so the connection address it sees is always the
      proxy's and identical for everyone. The fallback counted by that, which put
      **every visitor in one bucket** — twenty an hour for the whole site, and one
      script closing signups for all of them. Precisely what the limiter was
      written to prevent.

      Fixed: without a token the address comes from `X-Forwarded-For`, which Caddy
      sets itself. It cannot be forged from outside — the node's port is not
      published, so the only peer that can reach it is the proxy beside it.

      **The lock went on 2026-08-05.** Caddy on the prod node lets `api.relay…`
      through only with a valid `X-Origin-Token`, which the edge rule adds; without
      it the answer is `403` and the request never reaches the application.
      Verified: `200` through the CDN, `403` on the same hostname around it, `202`
      for a real `POST /report`.

      The direct `p1-prod.relay.panov.id` door **stays open on purpose**: it is how
      one looks at the node when the CDN is the suspect, and the per-address limit
      applies there just the same. The price is that the CDN can be bypassed by
      another name — which helps only somebody who wants to dodge Shield rather
      than somebody who wants volume.

      **Left, in this order:**
      - [x] **ship an image containing this code to prod — done 2026-08-09.** The
        node was rolled onto release `v2026.8.9-ge4ce220`, the same image exercised
        on staging beforehand. `/health` answers on both hostnames and the limit was
        verified against the live node: `429` from the twentieth request.

        **The wording above was wrong, and that matters more than the deploy.** It
        claimed the node had no limiter. Measurement showed the opposite: the
        protection was running before the deploy. The error was method — the
        threshold was taken as "5 an hour" from older text, while the code says
        `max: 20` plus 60 a day, so a six-attempt probe could never reach it.

        The deploy was still needed, for a different reason: `environments.toml`
        promised `v2026.8.5-gfd6587a` while nobody knew what the box actually ran —
        the wizard had never been run against that tag. Pin and box now agree.

        Two things surfaced on the way: publishing a GitHub Release is the wizard's
        precondition for a public environment and the only approval a production
        deploy has; and recreating the container **resets the rate-limit counters**,
        because the window lives in the node's memory;
      - [x] **repoint `api.relay.panov.id` at the zone — already done, verified
        2026-08-09.** The name resolves to the same address as
        `xorad-api-prod.b-cdn.net`, so traffic goes through the CDN and carries the
        header. The item had stayed open out of inertia.

        The lock was checked along all three paths at once: through the CDN — `200`;
        the same name forced past the CDN (`--resolve` to the box's address) —
        **`403`**; the direct name `p1-prod.relay.panov.id`, left open on purpose —
        `200`. That is what proves the defence refuses a bypass rather than merely
        existing;
      - [x] the `X-Origin-Token` check in Caddy — on since 2026-08-05;
      - [x] **the Bunny-edge firewall — deliberately NOT built, 2026-08-05.**
        The list holds 582 IPv4 and 320 IPv6 addresses: nearly a thousand rules,
        wanting an `ipset` and a refresh daemon. The Caddy lock already refuses
        anything that came around the CDN **before the application sees it**; a
        firewall adds only a TCP-level refusal, which does not save us from a real
        flood — the node's link saturates first, which is what Bunny is in front
        of it for. In exchange we would take on a risk: Bunny's list changes, and a
        stale one means the prod API refusing everything with no bug anywhere.
        Revisit if a flood ever reaches the node;
      - [ ] **turn on Shield Basic — confirmed 2026-08-09 that it is OFF.** The
        `xorad-api-prod` zone (id 6278420) reports `ShieldDDosProtectionEnabled =
        False`. This is the last open step of the chain: the image, the cutover to
        the zone and the Caddy lock are all done and verified.

        Not switched on here: it changes both the plan and the behaviour of a
        production zone, and that is not done in passing. It is done in the
        dashboard, the Bunny Shield tab of the `xorad-api-prod` zone. Take a general profile rather than "WordPress":
        behind this zone is an API with JSON bodies, and a site profile treats
        `POST` as suspicious. Do not leave Learning Mode until a real
        `POST /report` has gone through the zone.

      There will be no external captcha — the decision is recorded in
      `relay/HARDENING_EN.md`. The cost of getting this wrong is concrete:
      `/waitlist` sends mail through Resend, so abuse turns us into a spam source
      and burns the domain's reputation.

      **State as of 2026-08-05.** The `xorad-api-prod` pull zone is created and
      verified (`deploy/bunny-api-zone.sh`; `/health` answers 200 through the CDN),
      and **DNS is deliberately not switched**. The order from here is strict:
      first the lock on the origin (`X-Origin-Token` in Caddy plus a firewall
      allowlist of Bunny edge addresses), then trusting `X-Real-IP` only with a
      valid token, then the per-IP limit and the honeypot, and only then repoint
      `api.relay.panov.id` at the zone and turn Shield Basic on. Switching earlier
      leaves the node reachable around the CDN.
- [ ] **G5. `manifest lang`** — marked won't-fix.
- [ ] **G6. Message length limit — enforcement on the node.** Decided 07.08.2026
      and written into the chat spec (§4, §8.6): `max_message_length` is returned
      when a chat opens, defaults to **256 characters**, and is checked **on the
      node** — anything longer is refused with `error`. The feed stays at **128**;
      that is a different limit and the two should not be merged.
- [ ] **G7. Storefront privacy policies — two gaps.** Found 07.08.2026 while
      removing the push promises.

      - **Only the English version is published.** `landing/legal/` holds
        `privacy_EN.md` and no Russian one — while `community-guidelines` are
        translated into ten languages and the storefront UI speaks six. Someone
        reading the site in Russian gets the main document in a foreign language.
      - **Two sources of truth have diverged.** `legal/privacy_{RU,EN}.md` are
        ~600-byte stubs; `landing/legal/privacy_EN.md` is the real 10 KB text.
        Today's edit had to go into the second, and nothing stops the next one from
        going into the first unnoticed.

      Both need solving together: first name one directory the source, then
      translate. The other order means translating a text that will drift.
- [x] **G8. Push fully cancelled — 07.08.2026.** The decision: notifications about
      new messages and matches exist, but **there is no push anywhere** — no Web
      Push in the browser, no system notifications in the terminal, no `BEL`.

      **The reason is metadata.** A push is impossible without an intermediary: a
      service worker plus somebody else's delivery service (Google, Mozilla,
      Apple), or a system bus in a terminal. Even with an opaque payload that
      intermediary receives a durable subscription identifier and the **rhythm** —
      when exactly somebody spoke to this person and how often. A product whose own
      server does not keep the correspondence cannot hand its metadata to a third
      party for convenience.

      **The cost is named and accepted:** there is nothing to call a person who is
      not in the application. A match that burned out they will not see. The system
      works for someone who comes back on their own, regularly — and should be
      described that way.

      **The processing never ran for a day:** `vapidPublicKey` was empty on both
      storefronts, the button hidden, no subscription endpoint appeared on the node,
      and there is no table in the schema — not one endpoint was ever received.

      **Done:** chat spec §8.12 rewritten (plus §8.14 and §12); `pwa-push_*` split —
      the PWA shell stays, Web Push cancelled; code removed from the storefronts
      (`index.html`, both `sw.js`, both `config.js`) and the `VAPID_PUBLIC_KEY`
      injection from both `deploy-landing.sh`; the activity and the "browser's push
      service" sub-processor removed from the Article 30 register with activities
      renumbered 1–12; three promises removed from both privacy policies; the
      roadmap, `api-platform`, `ARCHITECTURE`, `PROJECT_OVERVIEW`, `00-mechanics`,
      `PENDING_FROM_NEIGHBRO` and the open `backend-*` items cleaned up.

      **Deliberately untouched:** `review-checklist_*` and `relay/MIGRATION_PLAN_*` —
      they record the past (an audit that happened, the state at migration time),
      and rewriting them would lose the trail.

      **The launch call** goes by waitlist email through Resend: it already works,
      it is in the register, and a person leaves it deliberately.

      **None of this exists in the code.** Today the node has neither the check
      nor the parameter: `lib/quota.ts` counts a daily quota per key,
      `lib/rate_limit.ts` a window per address, and nobody looks at length. With
      no chat routes yet the item is not urgent, but it has to land together with
      them rather than after: our client is open — the `depth` image can be
      rebuilt by anyone, the web script edited in the debugger — and a check that
      lives only on the client is not a defence.

      There is a transport behind the limit: 256 UTF-8 characters → ~1.4 KB of
      ciphertext with nonce, tag and base64, and that must fit inside the 8 KB
      `NOTIFY` payload with room to spare (§8.1, §8.13). Raising it is allowed,
      but not blindly.
- [ ] **G9. A key for the native client — none of this is in the node.** Decided
      07.08.2026 along with the `depth` spec (`depth-client_EN.md` §2.5) and the
      second principle in §8 of the chat spec.

      Verified against the code on 07.08.2026:
      - `lib/tenant.ts` — the brand comes from `x-api-key` and from nowhere else;
      - `lib/api_key.ts:72` — `originAllowed()` admits everyone on an empty origin
        list, but such a key cannot be minted: an empty list is refused where the
        environment requires keys (B1);
      - `lib/tenant.ts:66` — the daily quota is counted **per key**;
      - there is no `client_type` field, neither in `api_keys` nor in the panel
        form.

      **To do, in this order:**
      - [ ] a `client_type` field (`browser` | `native`) in `api_keys`, in the
        minting form and in the list. For `native` no origin list is created or
        checked — the decision written into the data rather than inferred from an
        empty list;
      - [ ] forbid a per-key daily quota for `native`: the key is shared by every
        container, and a per-key counter means one script locks `depth` for
        everyone. The same defect as G4 on `/waitlist`, only wider;
      - [ ] per-identity limits on top of the per-address one (`lib/rate_limit.ts`):
        for a native client the address is currently the only thing holding it
        back;
      - [ ] the `depth` brand in the brand registry, and its first `native` key;
      - [ ] rotation by overlap: several keys live at once, the old one fading on
        an announced window. A plain revocation breaks every digest-pinned image,
        including the ones that will never update.

      **What not to do:** a `brand` column in `identities` or `feed_messages`. The
      feed is shared across all faces — §8 of the chat spec, second principle. A
      brand decides texts, emails, where leads land and who sees them in the panel;
      it does not decide who is visible in the feed.
- [ ] **G10. Terms for client authors — before the image is published.** Decided
      07.08.2026. They are needed on the day the `depth` image goes public,
      because an open client plus a documented protocol is an invitation to write
      another one.

      Contents: what the node guarantees and what it does not, a ban on collecting
      our people's data with somebody else's client, the obligation to show the
      terms and the Article 16 path, and the platform's right to cut off a client
      that abuses this. Spelled out in `depth-client_EN.md` §8.3.

      **No DPA is being prepared and hosting other people's networks is not on
      offer** — a decision, not a deferral. To someone who wants their own network
      the answer is: run your own node. The protocol is documented, the client is
      open, the node's sources are in this repository — they are their own
      operator and we are not a party. Hosting someone else's network here would
      mean bringing a brand boundary back into the feed (forbidden by the second
      principle in §8 of the chat spec) and becoming that operator's processor:
      Article 28, sub-processors, data-subject requests, a split of DSA roles.
      Revisit only if concrete demand appears.
- [x] **J13. One commit, two different images. Found and fixed 2026-08-07.**
      Surfaced while verifying J11: under the tag `v2026.8.7-g3fbd1e1` and under
      `sha-3fbd1e1`, `relay-caddy` had **different digests** (`2af974ef…` and
      `599c5d9d…`). `relay-node` matched by luck — its build happened to be
      reproducible, which is why the defect went unnoticed.

      **The cause was a redundant trigger.** `relay.yml` fired on a push to any
      branch, `main` included, while `deploy-uat.yml` also called it through
      `workflow_call` to attach the release tag. A push to `main` therefore
      started two independent runs, each with its own `type=sha`: the second
      overwrote the `sha-…` tag the first had just written, and the release tag
      pointed at the second build — not at the one whose tests had passed.

      Two written rules broke at once: **immutable tags** (the sha was
      overwritten) and **build once, promote the same image** (A2's claim of a
      "byte-identical, already-exercised build" stopped being a guarantee).

      **Fixed** in `relay.yml`: `branches: ["**"]` → `branches-ignore: [main]`. On
      `main` the release path owns the build, one run remains, and the sha and
      release tags land on the same digest. `deploy-uat.yml` was not touched.

      **The path filter was narrowed too:** `!relay/**.md`. A single edit to
      `relay/ARCHITECTURE_RU.md` was starting two multi-arch builds with arm64
      emulation — which is exactly how today's run appeared. The negation pattern
      is **untested on a live run**: the next documentation edit inside `relay/`
      will confirm it — if no build starts, it works.

      **Still open:** a manual `vX.Y.Z` release tag placed by a person on an
      already-built commit still triggers a rebuild through `tags: ["v*"]`. The
      same defect, only rarer. It is fixed either by promoting the digest
      (`docker buildx imagetools create --tag`) or accepted deliberately — not
      decided.

      **A check on 2026-08-07 showed the fix above was incomplete.** On commit
      `e3de4ec`: `relay-node` — release `8a561fe8…` against sha `472661b7…`,
      **different**; `relay-caddy` matched. The opposite of the first case, where
      caddy was the one that differed — so the matches are **luck**, the builds are
      not reproducible, and the rule was holding by chance.

      The cause remained: in the ordinary flow a commit lands on **three** refs —
      `dayN`, `dev`, `main` — and the branch trigger started a build on each.
      Removing `main` removed one of three rather than restoring the rule. The
      commit message of `e3de4ec` ("Build the commit once") claimed more than was
      done.

      **The complete fix lives inside `relay.yml`, not in the triggers**, because
      only there does it cover every path at once, the manual `vX.Y.Z` tag
      included:

      - `concurrency: relay-build-<sha>-<image>` — runs for one commit queue
        instead of racing. Without it two simultaneous runs would both see "no
        image" and both build;
      - an **"already built?"** step — if `sha-<short>` is in the registry, this
        commit was built by an earlier run;
      - if it was, instead of building, **every** tag `metadata-action` would have
        applied (release, branch, sha) is attached to the existing manifest with
        `docker buildx imagetools create`;
      - cosign signing and the Trivy scan run only on a real build: a run that just
        added tags has nothing new to sign — that digest was signed when it was
        first built.

      This also closes the manual release tag recorded as unresolved above.

      **Third iteration, 2026-08-07: the queue created a risk of its own.** The
      first run with `concurrency` showed `relay · day25` as **cancelled**. The
      cause is behaviour I had not accounted for: `cancel-in-progress: false`
      protects the run that is **executing**, not the one that waits. GitHub keeps
      exactly one pending run per group and cancels it when a third arrives.

      Here it was harmless — `dev` was building the image and `day25` would only
      have added a branch tag. But the scenario inverts: **had the pending run been
      the one from `Deploy UAT`, that is what would have been cancelled**, the
      release tag would never have been attached, and `_deploy.yml` would have gone
      on to deploy UAT from a tag with no image. Exactly the breakage J11 cured,
      approached from the other side.

      **The cure is a ceiling of two runs per commit** rather than protecting the
      queue: only refs that get deployed need an image. The condition moved from
      the trigger onto the `build-push` job — an important difference, because
      `branches: [dev]` on the trigger would have disabled the workflow on day
      branches **together with the tests**:

      ```
      push day25   → test ✓  build-push ✗     tests run, no image needed
      push dev     → test ✓  build-push ✓     builds
      push main    → workflow never starts    (branches-ignore)
      Deploy UAT   → call:   build-push ✓     tags dev's image
      tag vX.Y.Z   → test ✓  build-push ✓
      ```

      The call is recognised by `inputs.release_tag`, **not** by the event name: a
      called workflow sees the **caller's** context, so on a call from `deploy-uat`
      `github.event_name` reads `push` and `github.ref` reads `main`. Inputs exist
      only on a call, which makes them the only honest signal.
- [x] **D8. Search Console: three reasons for non-indexing — worked out 2026-08-09.**
      The notice for `neighbro.place`: "page with redirect" — 2, "alternate page
      with proper canonical tag" — 1, "discovered, currently not indexed" — 5.
      Checked against the live site rather than assumed.

      **The first two are evidence the setup works, not that it is broken.** The
      redirects are `https://www.neighbro.place/` and `http://neighbro.place/`,
      both 301 to the canonical address; neither is listed in the sitemap — Google
      found them by itself. The canonical variant is `/index.html`, which answered
      200 while declaring the root as canonical.

      All 12 sitemap URLs answer 200, each declares itself canonical and carries 11
      hreflang alternates. There is no "sitemap says one thing, the page says
      another" anywhere — that alone would have been a real fault.

      **Done:** `deploy/bunny-seo-index-redirect.sh` — an edge rule on both
      production zones, `/index.html` → 301 → `/`. Verified against the live sites.
      The `ActionType=1` action was taken from the working "seo: www to apex" rule
      in the same zone rather than from an assumption about API constants.

      **Deliberately left:** every language's `/xx/index.html` answers 200 too. One
      rule cannot fix them — the redirect target is a literal string, `{{path}}`
      substitutes the whole path, and nothing strips a suffix. Twenty-two rules for
      URLs nothing links to and no sitemap lists is a poor trade; their canonical
      already resolves them correctly.

      **"Discovered, currently not indexed", 5 pages** — not our misconfiguration:
      the console names Google's own systems as the source. The URLs are known, the
      crawl is deferred. Ordinary for a young domain whose pages differ mainly by
      language. Cured by time and distinctness, not by code.
- [ ] **J14. Nothing can create the first panel administrator in a fresh
      environment.** Found 2026-08-09, when signing in to the UAT panel was needed
      for the end-to-end DSA check.

      `panel/staging/users/` was **empty**: not one account, so nobody could sign
      in to the UAT panel and the notice-examination screen there had never been
      reachable. Production has exactly one account, created 2026-07-09.

      **The circle:** `/admin/panel-users` needs a session (`requirePermission` →
      `authed`), a session comes from a magic link, and `requestMagicLink` returns
      silently when the user object is missing (`auth.ts:53`, "invite-only: never
      reveal membership"). There is no environment variable and no wizard command
      for the first administrator.

      **The workaround used:** the object was written to storage directly —
      `panel/<env>/users/<sha256 of the address>.json`, body
      `{"email", "role": "admin", "created_at"}`, mirroring production's. It works,
      but it requires knowing the storage layout: a fresh environment cannot be
      brought up with a working panel by following the documentation.

      **How to close it:** a wizard mode such as `wizard --env staging seed-admin
      <address>` beside `configure`, or a one-shot bootstrap from an environment
      variable. The first is the more honest: the wizard already owns both the
      environment and the storage keys.
- [ ] **J15. The `acknowledged` field in the `POST /report` response misleads.**
      Found 2026-08-09 during the end-to-end check. It is returned as
      `Boolean(email)` — it means "a notifier address was supplied", not
      "the receipt was sent". The letter itself goes out best-effort and its fate
      is never surfaced.

      For our own form the difference does not matter; for somebody else's client
      it is a trap: under Art. 16(4) the confirmation is an obligation, and a field
      with that name reads as a report that it was met. Either rename it to
      something honest (`will_acknowledge`) or return the actual send result.
- [ ] **J16. The Art. 17(3) statement: three gaps, found by the end-to-end check
      on 2026-08-09.** The chain ran whole — notice, receipt, queue, an `upheld`
      decision, both letters delivered. The notifier's identity is **not disclosed**
      to the author, the use of automation is named in both letters, and the ground
      and the redress routes are there. Three things remain.

      **1. No territorial scope and no duration.** Art. 17(3)(a) asks for them
      "where relevant"; the template carries only `What was done: removed.` and the
      panel form has no field at all. While every restriction is global and
      permanent the caveat covers it. The moment one is temporary or regional,
      there is nowhere to say so.

      **2. The author is never told what was restricted.** The letter opens with
      "Something you posted has been restricted" — no quote, no timestamp, no
      reference. The snapshot was taken and sits in `dsa_notices.snapshot`, and
      never reaches the letter. To somebody with several posts in the feed that
      letter says nothing.

      **3. The two letters describe redress differently.** To the notifier: "We do
      not operate a formal internal appeals body". To the author: "reply to this
      email and a person will look again" — without that caveat, which makes it
      read as a promise of a procedure that does not exist. One fact, two
      wordings.

      **None of this blocks launch:** Art. 19 exempts a micro-enterprise from
      Section 3 (internal complaints, out-of-court settlement), and scope and
      duration are qualified as "where relevant". It is the class of detail that
      is cheaper to record now than to discover on the first real complaint.
