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
- [x] **B7. It did not — checked 2026-08-17.** `GET /admin/brands` on all
      three environments: both `sosed` and `neighbro` come back `registry`, so
      the row in `brands` exists everywhere — the foreign key is satisfiable
      and minting through the panel does not fail. Corroborated by the three
      publishable keys production holds, for both brands, dated 26–28 July.
      Checked by reading, not by minting: a live key issued to prove a point
      would outlive the point.

      What it used to say — “Check whether the foreign key reached production”:

      The `B4` bug
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
- [x] **D3. Live checks — closed 2026-08-18, both halves measured.**

      **No request to a Google domain before consent.** Both production
      storefronts were driven in a browser, five pages each: `/`, `/ru/`,
      `/legal.html`, `/rules.html`, `/report.html`. **Every** network request was
      recorded, not the console. Out of 5–16 requests per page, Google's share was
      **zero** everywhere.

      **The half without which the first means nothing.** "Zero requests to
      Google" is equally true on a site with no analytics id, on a page that
      failed to load, and with a probe watching the wrong thing. So the same run
      carries a positive control: press "accept" and check the requests **do**
      appear. They did on both —
      `googletagmanager.com/gtag/js?id=G-K7EP39DDK9` and `…G-WWHXHZ5QWQ`. The
      check can go red, which is what makes its green worth anything.

      The ids are configured in production (`config.js` on both storefronts),
      which is why production is where this had to be measured: on dev and uat
      `analyticsId` is empty and `gtag.js` would not load regardless of consent.

      **Clarified along the way.** `legal.html`, `rules.html` and `report.html`
      show no consent banner — and should not: those pages carry no analytics code
      at all (`consentAccept`, `loadAnalytics`, `googletagmanager` — zero matches).
      Nothing there can fire before consent or after it; that is a property, not a
      gap.

      **The first half was closed 2026-08-14** after the production deploy: six
      pages, zero CSP violations.

      The probe now lives in the repository — `scripts/check-consent-gate.sh` and
      `testing/consent-gate.mjs` — to be run after every production deploy of a
      storefront. Exercised by breaking it: a copy was given consent up front, so
      analytics loaded before any click — two failures, exit 1, with both
      `gtag.js` and the `google-analytics.com/g/collect` request named in the
      output.
- [x] **D4. Sitemap submitted to Search Console** — 2026-07-27, both domains
      (`https://sosed.place/sitemap.xml` and
      `https://neighbro.place/sitemap.xml`). They are Domain properties, so the
      full URL is required. www was not submitted: the zones redirect it to the
      apex, so it would only duplicate.
- [x] **D5. The Bing Webmaster Tools account — accepted as it is.** Settled
      2026-08-25: won't-fix. The account is not what indexing needs, only what
      reporting on it needs: IndexNow works without it and works now — the key is
      in the deploy, it pings on every one, and the key file answers 200 on both
      storefronts (checked 2026-08-25). Bing verification is absent and will not
      appear by itself: `/BingSiteAuth.xml` is 404 on both, no `msvalidate` tag is
      in the markup, and only a person can open the account. The item is closed
      not as done but as not worth the step; if the reports are wanted, it reopens.
- [x] **D6. A real 404 page — accepted as it is.** Settled 2026-07-29:
      won't-fix. Bunny's `ErrorPageCustomCode` applies to origin errors, not to a
      404 from a storage zone. The page exists, is served at `/404.html`, and the
      status code is right; what is lost is the look of a stranger's placeholder
      on a mistyped address. An origin instead of storage would fix it and add a
      moving part where there are currently only files — dearer than the gain.
- [x] **D7. A social image per language — closed 2026-08-19, and on the way it
      turned out not to be about the image.** The item said "the pipeline draws one
      for the whole site; it only starts to matter with translated typography". The
      typography for half the languages turned out not to exist.

      **The tagline was already translated** — it sits in the storefront's own
      dictionary under `eyebrow`, in all 10 languages for neighbro and 17 for
      sosed, and the generator takes the caption as an argument.

      **The fonts were the gap.** Both storefronts have three faces of their own and
      none covers Georgian; sosed adds Armenian to that. So the Georgian page had
      been drawn in whatever the reader's device happened to have, and the image
      baked in whatever the render container happened to have — not reproducible.
      sosed was worse: its template set the caption in a **system** monospace, with
      no face of ours at all, so its production image could never be reproduced. In
      my container it came out in a Chinese WenQuanYi.

      **Done:**
      - `Noto Sans Georgian` (41 KB) in both storefronts and `Noto Sans Armenian`
        (26 KB) in sosed — one file each, their own unicode-range only, added as
        fallbacks to the stacks: 39 in neighbro, 21 + 21 in sosed;
      - sosed's image template moved from the system monospace to `JetBrains Mono`
        with those two behind it;
      - `og/render-all.mjs` + `og/docker/run-all.sh` in both: one image per
        language, captions read **from the same dictionary** the pages are built
        from, so editing a translation cannot leave a stale picture behind;
      - `build-pages.mjs` gives every language page its own `og:image`,
        `og:image:secure_url` and `twitter:image`.

      **Verified by asking the browser, not by measuring a width.**
      `CSS.getPlatformFontsForNode` names the font a node was drawn with, and the
      guard inside the generator uses the same call: a stranger in the caption is a
      non-zero exit — "fix the fonts, not the render".

      The result: **10 images** for neighbro and **17** for sosed, every one in a
      face of ours. The Georgian page was checked on real elements — `h1`, a
      paragraph and a mono line — with Noto Sans Georgian on the Georgian letters
      and the brand faces on the Latin ones.

      **Three method errors, each caught by the next check:** measuring before the
      unicode subset had loaded (six confident false negatives), measuring the
      wrong font (the caption is mono; I was testing the display face), and
      declaring Georgian under the brand families' own names — which looks tidier
      and **does not work**, because Chromium settles the weight inside a family
      before it checks who covers the character. Only a fallback family in the
      stack works.

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

- [x] **J4. Art. 16 notice mechanism — closed 2026-08-10.** Both remaining
      sub-items were done on 2026-08-09 and recorded in `dsa/CHECKLIST_EN.md`;
      this list never heard about it.

      **The earlier wording**, "built; what remains is a live check and
      Art. 14(6)": "No interface yet" is out of date: verified 2026-08-09 against
      the live sites and the code.

      **Present and working:** the tables, the public `POST /report` (answers both
      through the CDN on production and on staging; an incomplete notice is refused
      before anything is stored), the snapshot with its three states, the receipt,
      the yearly sweep, the `report.html` form on both storefronts (200), a footer
      link on both, the examination screen `panel/src/pages/dsa-notices`, the routes
      in `routes/dsa.ts`, both letter templates in `lib/mailer.ts`, and the
      `dsa_notices.read` / `dsa_notices.decide` permissions.

      **Remaining:**
      - [x] **an end-to-end check on staging** — passed 2026-08-09, the test row
        deleted (`dsa/CHECKLIST_EN.md`, "Verification"). Earlier text: — a real notice, the receipt, the
        panel queue, a decision, both letters (Art. 16(5) and 17(3)), then delete
        the test record. The chain has never been walked whole;
      - [x] **notice of a new revision of the documents, Art. 14(6)** — done
        2026-08-09: a bar on the storefronts, the revision derived from the
        documents' own `Last updated`, and the deploy gated on a check. Earlier
        text: — the one
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
- [x] **J12. Bunny's sub-processors — checked 2026-08-19, still no names.**
      The change notified on 2026-08-05 took effect today. At
      `bunny.net/gdpr/sub-processors/` there are **the same six** (Zendesk, Slack,
      Google Workspace, MailChannels, OpenAI, Atlassian): no new name, no update
      date, no mark of a new entry. `bunny.net/gdpr/` dates nothing either. There
      is nothing to put in the register — and not for want of looking.

      **Decision: treated as closed.** We are not asking for the names and not
      setting a date for another check — the question returns with Bunny's next
      notification. Objecting is out of time: the §3.2 window shut around
      2026-08-10 and was let pass on purpose; the contract does not oblige Bunny to
      name sub-processors on request, and they keep the public list as they see
      fit. A request would at best return names we have already accepted, and would
      change no decision of ours.

      **The price is named and stays on the record:** we consented to two parties
      we were never told the names of, and the cross-border grounds rest on the
      letter's phrase about "account data", which there is nothing to verify
      against. This is not a question settled on the merits — it is one we decided
      not to spend a move on.

      Recorded in `vendors-dpa_{RU,EN}.md` (the Bunny row) and
      `legal-archive/bunny-dpa_{RU,EN}.md` ("The check on the day it took
      effect").

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
- [x] **G2. Panel fonts — closed 2026-08-17, though not by the work that was
      written down.** "Collapse to two variable files" rested on a false premise:
      the files are **already variable**, all fifteen of them. They are cut per
      unicode subset, and merging them is the wrong move — a Latin-only page would
      then carry the Cyrillic glyphs. The figure "27 files" was inflated too: you
      only reach 27 by counting the build directory as well.

      **Measurement found the real defect.** `fonts.css` declared Inter at 400 and
      500 only, both pointing at the same file. The stylesheet asks for 600 and
      700, and the browser, finding no such face, **faked the boldness** by
      smearing the 500 glyphs. Measured in a browser: 500, 600, 700 and 900 all
      came out at one width, 627px — semibold and bold in the panel were
      indistinguishable from each other. Unbounded's 600 was being served by its
      700 the same way.

      Reading cannot catch this: the declarations looked deliberate.

      **Done:**
      - `panel/src/fonts.css` — one declaration per family per subset, 29 → 12,
        the weight declared as a range. The ranges are measured in a browser
        (Inter is distinct at every step from 100; Unbounded's 100 and 200 are
        identical) and **agree with what Google itself declares** — independent
        corroboration.
      - the file is no longer hand-written: it is regenerated by
        `scripts/fetch-fonts.sh` and carries that command in its header. The exact
        request had been recorded nowhere, so the file could not be reproduced.
      - `scripts/fetch-fonts.sh` — refuses when Google returns several
        declarations pointing at one file, which means the URL listed discrete
        weights of a variable font. The check runs **before** anything is
        downloaded. Exercised: against a `wght@400;500` URL the script stops
        without fetching a single file and without writing the CSS.
      - `panel/tests/check-font-weights.mjs` — the guard: renders the weights the
        stylesheet asks for in a real browser and fails when two of them measure
        the same width. The list of weights is read from `App.css` rather than
        hardcoded. Exercised by breaking it: 6 collisions, exit 1, with the
        measurements and the complaints on one stream so a CI log does not
        interleave them.
      - wired into `panel.yml`: chromium alone, installed on that step alone, so
        the rest of the job stays browser-free. The local door to the same file is
        `scripts/check-panel-font-weights.sh` (Docker, nothing on the host). The CI
        path was rehearsed in a container — `npm install` in `panel/tests`, run
        from there with no panel path set — and came out green. The
        browser-install line itself was not rehearsed locally; the first CI run
        proves that one.

      The panel builds, and the built CSS holds 12 declarations: 7 × `100 900`
      (Inter) and 5 × `200 900` (Unbounded). **Not deployed to any environment.**

      The storefronts were checked while we were here: 39 declarations over 15
      files, but the weights declared are exactly the ones the markup asks for
      (Golos 400/500/600, Unbounded 600/800/900) — no faked boldness, only
      redundancy. Left alone.
- [x] **G3. The mockups left the build — closed 2026-08-18. The question was the wrong one.**
      The item asked whether to translate five decorative SVGs in `panel/public`.
      Taking it apart showed there was nothing to translate, because they should
      not have been published at all.

      **What they actually are.** Not interface decoration but working design
      documents: `app-screens.svg` is **eleven screens of the unbuilt chat**, drawn
      off `docs/chat_EN.md` with references to §8.2 and §8.3; `kit-full.svg` is a
      component inventory marked `● built` / `○ drawn`; `reference-behaviour.svg`
      is a study of somebody else's code. **No file of code references them.**

      **And all of them sat on the production panel.** Vite copies `public/` into
      `dist/` verbatim, so five SVGs and the `app-screens.html` wrapper were served
      from `https://xor.panov.id/<name>.svg` — checked with `curl`, all `200`,
      236 KB. No keys and no secrets are in them, but publishing the design of an
      unbuilt product was not a decision anybody made.

      **Done:**
      - `git mv` into `panel/design/` — outside `public/`, therefore outside the
        build. Three font files went with them (Golos Text, JetBrains Mono), used
        by `app-screens.svg` alone and never declared in `fonts.css`;
      - `scripts/render-design-mockup.sh` + `scripts/render-design-mockup.mjs` keep
        the rendering: a browser in Docker, `panel/design` served at the root, and
        `/fonts/` answered from its own faces first and the panel's second. The
        failure is visible: a face that does not resolve marks the mockup `✗` and
        exits non-zero;
      - the captions inside the mockups and the references in
        `design-system_{RU,EN}.md` now point at the new path.

      **Verified:** all five render at their true geometry with the fonts
      resolving (the `button-states` sheet was looked at whole — Unbounded in the
      headings, Inter in the body, mono in the annotations). The panel was rebuilt
      from scratch: **no** SVG in `dist`, 12 font files instead of 15, 1000 KB.

      **Not done, and worth knowing:** the mockups are **still live** in
      production — they go with the next panel deploy and its cache purge.
- [x] **G4. Public `/waitlist` protection — closed 2026-08-17.** The chain is
      complete: the per-address limit in the node, the honeypot, the
      `X-Origin-Token` lock in Caddy, the hostname moved onto the zone and, last,
      Shield in observation mode. Checked today from the network side:
      `api.relay.panov.id` answers with `server: BunnyCDN-CY1-1191` and
      `via: 1.1 Caddy`, so production traffic really does pass through the edge,
      and the prod storefront points at that very hostname.

      **The first paragraph below has gone stale** — it said Shield was not in
      front of the node and no CDN tier could help. It is now. The rest is kept as
      written: it is the history of the decision, and it holds two mistakes worth
      remembering.

      What is left to decide lives in **G11**, deadline included.

      Checked
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
      - [x] **turn on Shield Basic — done 2026-08-16.** Shield is attached to
        `xorad-api-prod` and to the three storefront zones as well
        (`neighbro-prod`, `sosed-prod`, `panel-prod`), all in observation mode:
        `wafExecutionMode = 0`, so the rules only write to the log and block
        nothing. Learning Mode runs to 2026-08-21. State is read back by
        `deploy/shield_state.py` — the script that exposed that a Bunny `202`
        carrying refusal-shaped prose had in fact applied the change.

        What it used to say:
      - [x] **was: confirmed 2026-08-09 that it is OFF.** The
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

      **State as of 2026-08-05 — history; everything below has since been done,
      the DNS move included.** The `xorad-api-prod` pull zone is created and
      verified (`deploy/bunny-api-zone.sh`; `/health` answers 200 through the CDN),
      and **DNS is deliberately not switched**. The order from here is strict:
      first the lock on the origin (`X-Origin-Token` in Caddy plus a firewall
      allowlist of Bunny edge addresses), then trusting `X-Real-IP` only with a
      valid token, then the per-IP limit and the honeypot, and only then repoint
      `api.relay.panov.id` at the zone and turn Shield Basic on. Switching earlier
      leaves the node reachable around the CDN.
- [x] **G11. The Shield mode was decided 2026-09-01.** The answer came out
      different for different zones, because the zones are different: one answer
      for all four was the very mistake six weeks were spent avoiding.

      **Blocking since 2026-09-01 — `sosed-prod` and `neighbro-prod`.** Each
      serves one self-contained file: the page makes no request to its own
      origin at all, and the sign-up form goes to `api.relay.panov.id`, another
      zone. Checked after the switch: `/`, `/robots.txt` and `/sitemap.xml` come
      back byte for byte as before (199,976 and 140,188 for the two landings),
      and a 404 stays Bunny's ordinary one, not a Shield page.

      **Blocking since 2026-09-03 — `panel-prod`.** It was switched on
      2026-09-01 and rolled back within the hour: `/assets/index-*.js` answered
      `403` with the Shield page (`errorcode: 112`), even though the origin had
      served the file (`cdn-requestpullcode: 200`). CSS, fonts and `index.html`
      itself passed — it was exactly the bundle that was cut, which made the
      panel under blocking a blank page. G12 found the culprit: rule `952100`
      (Java Source Code Leakage) firing on minified JavaScript. It sits in this
      zone's `wafLogOnlyRules`, written in the same write as the mode: flipping
      the mode first would blank the panel for as long as a second write takes.
      Checked after the switch on 2026-09-03 — `/`, `/login`, `/dsa-notices`,
      `/brands`, `/waitlist` and both assets answer `200`, the assets with
      `cdn-cache: MISS`, which is a real pass through the WAF.

      **Blocking since 2026-09-03 — `xorad-api-prod`.** The zone carries `POST
      /report` and the panel's own API calls, and G13 settled it by measurement
      rather than by reading a log: under blocking `POST /report` answers `422`
      from the node, `POST /auth/request-link` `204`, `GET /health` `200`, with
      a control carrying an injection answering `403`. The zone has no
      exclusions.

      **The caveat was tested the same day and turned out to be a hole.** On
      2026-09-03 sixteen realistic notice bodies went through the blocking zone.
      Thirteen passed — links, quotes, apostrophes, HTML tags, markdown, the
      words `union`/`select` in an ordinary sentence, 3310 characters of
      Cyrillic, a body at the 4000 limit, emoji with RTL marks, newlines.
      **Three were cut:** one quoting `<script>alert(1)</script>`, one naming
      the path `../../uploads/2026/09/scan.pdf`, and one carrying a
      `data:…;base64,` URI. A notice that quotes what it complains about — and a
      report of XSS or of someone's scan is exactly that — was being refused.

      Rules do not fix it. The bisection named `944152` (Log4shell), `930110`
      (Path Traversal) and `941170` (XSS Attribute Injection), and excluding all
      three changed nothing: each body is caught by several rules at once,
      because a quotation of an attack is indistinguishable from an attack.
      Bunny offers no way around it on this plan: `customWafRulesLimit` is 0,
      there are no per-route exceptions, and all five WAF profiles are CMS or
      hosting profiles carrying XSS and SQLi detection.

      **So the intake moved instead of the rules.** On 2026-09-03 the zone
      `xorad-report-prod` was created with the host `report.relay.panov.id` on
      the same origin `p1-prod.relay.panov.id`, with no Shield; both edge rules
      (`X-Origin-Token`, `X-Client-IP`) were copied from the api zone, without
      which the origin does not trust the request. Checked live: `/health`
      through the new host answers `200`, a preflight with `Origin:
      https://sosed.place` answers `204`, and the three cut bodies reach the
      node through the new host while the old one still answers `403`. The rest
      of the API stays behind the WAF.

      **What that did not check either.** On the new host the bodies reached the
      node with `429` — the daily `/report` limit had been spent on the
      measurements — so the full path "a notice is accepted and stored" has not
      been walked through the new host. The panel was checked signed out: a
      signed-in session's API calls go to the zone behind the WAF and were not
      tried against real data.

      The switch is `deploy/shield_mode.py`: without `--apply` it prints the
      plan, it refuses `xorad-api-prod` without an explicit `--include-api` and
      refuses a zone that is still learning, and after writing it re-reads the
      state — a `200` on a `PATCH` whose body the API quietly ignored looks
      exactly like a switch that happened. The write shape was measured on
      2026-09-01: `PATCH /shield/shield-zone`, body `{"shieldZoneId": N,
      "shieldZone": {"wafExecutionMode": M}}`; a flat body is refused with
      `model_validation_error.shieldzone`.

      **History of the deadline.** The move from 2026-08-21 to 2026-09-01 was a
      decision, not forgetting: learning ended 2026-08-21, the log was not read
      that day, and until 2026-09-01 all four zones knowingly lived in log-only —
      the opposite error is dearer, and blocking switched on blind takes out the
      Article 16 intake first. Learning cannot be extended from here: Bunny's API
      offers neither the log nor an extension — re-checked 2026-09-01 by
      enumerating twenty-three endpoints across three namespaces, all `404`.
- [x] **G12. The rule was found on 2026-09-03 — `952100`, and not in the
      dashboard.** The note saying "the id lives in the log, and the log lives
      in the dashboard, so this is a person's step" was half right. The log is
      indeed absent from the API: re-checked on 2026-09-03 with a sweep of its
      own, thirteen candidate event-log paths, all `404`. But the API does serve
      the rule catalogue — `GET /shield/waf/rules`, `200` — and the catalogue
      has a **RESPONSE** section: rules that read the response body, 55 of them
      against 205 on the request. That section explains the measurement that
      looked strange: the origin served the file (`cdn-requestpullcode: 200`)
      and Bunny still answered `403`, because what was inspected was the
      response, not the request — which is why the CSS and `index.html` passed
      while the minified bundle was cut.

      The id was cornered instead of read: a set of candidates goes into
      `wafLogOnlyRules`, the bundle is requested, and the answer says whether
      the culprit is inside that set. Seven rounds narrowed 55 to one. It is
      **`952100 — Java Source Code Leakage`**: a Java source-leak heuristic
      firing on minified JavaScript. Confirmed live on 2026-09-03 — with
      `wafExecutionMode: 1` and `wafLogOnlyRules: ["952100"]` the panel is
      served whole: `/`, `/assets/index-44Ca_wX_.css` and
      `/assets/index-DgdjqIRF.js` all `200`, all `cdn-cache: MISS`. After the
      measurement the zone was put back to watching (`0`, `[]`): the id is
      found, switching blocking on is a separate decision, and it has not been
      taken.

      **The cache nearly forged the answer.** The first run announced that the
      `403` does not reproduce — with `cdn-cache: HIT`. The edge was serving a
      stored copy the WAF never looked at, and the query string is not part of
      the cache key, so a parameter could not get past it. A cached answer is
      now not counted as a verdict at all, and each probe purges the URL first
      via `POST /purge`. What caught the substitution was the positive control —
      the step that demands to see the `403` first and refuses to search in
      green.
- [x] **G13. Settled by measurement on 2026-09-03: blocking cuts neither the
      Article 16 intake nor panel sign-in.** The item was written as reading a
      log, and the log is not readable — re-checked 2026-09-03. After G12 it does
      not need to be: the question closes with the same trick, a short announced
      window of blocking and three requests instead of a read.

      Measured at `wafExecutionMode: 1`: `POST /report` passed (`422` from the
      node, not `403`), `POST /auth/request-link` passed (`204`). Outside the
      window both answer the same, and the zone was restored to `0` with an
      empty `wafLogOnlyRules`.

      **The conclusion rests on the control, not on the green.** The third
      request was `/report` carrying an obvious injection string in its reason:
      under blocking it answered `403`, outside it `422`. Without that, "nothing
      was cut" would have meant only that the WAF was not looking — and it was.

      The boundary, said plainly: one body was tested, realistic in shape and
      length. A genuine notice may carry links, markup or quotes, and about
      those this measurement says nothing.

      `requestBodyLoggingEnabled: false` drops out of the framing: it would have
      obstructed reading the log, and what we read is the response. Turning body
      logging on is still unnecessary, and its price is unchanged: Bunny would
      store the bodies of illegal-content notices — a new processor and a row in
      the Article 30 register.

      **This item took its price from production.** The first run sent the
      control with `target_kind: "other"` — a real kind — and the node accepted
      it as a real notice: `202`, row `6c815400-d6e9-407e-bfe7-aaef2e55b463` in
      `dsa_notices`, with an injection string in its reason field. The safety
      argument was right — the kind is checked before the database is touched —
      and the code contradicted it. Fixed: the control now carries a
      non-existent kind, confirmed by a `422`. The row was closed by deciding it
      in the panel on 2026-09-03 — rejected on the `/dsa-notices` screen, not
      deleted: the trace of an Article 16 obligation is not something to tidy
      away. That closure is recorded on a person's word, not machine-checked:
      the session held no key with `dsa_notices.read`.
- [x] **G5. `manifest lang` — won't-fix, closed 2026-08-10.** The decision was
      taken long ago; the checkbox stayed open and counted as work for months. An
      installed PWA's metadata carries a brand name, whose language does not
      change.
- [ ] **G6. Message length limit — enforcement on the node.** The decision of
      2026-08-07 was impossible in the shape it was written: the node sees
      **ciphertext** and counts no 256 characters in it, exactly or approximately,
      while the spec promised a check on characters in §8.6 and in both flow
      diagrams — even though its own acceptance checklist demanded bytes. Made one
      on 2026-08-25: the node checks `max_ciphertext_bytes` — **2048 bytes**,
      calculated from the worst case (256 emoji characters → 1024 bytes of UTF-8 →
      1052 with nonce and tag → 1404 in base64, 46% of headroom) — and
      `max_message_length` = **256** stays the counter in the client. The feed
      stays at **128**; that is a different limit and the two should not be merged.
      **Nothing can close it yet:** checked 2026-08-25 against
      `api.relay.panov.id` — `GET /chat` answers **501** "chat relay not enabled on
      this node yet", there is no feed route (**404**), `/health` is 200. The item
      closes on a measurement made by a request that bypasses the client, once the
      node has chat code.
- [x] **G7. Storefront privacy policies — closed 2026-08-10.** Filed 2026-08-07 as
      two gaps; on inspection the first no longer existed and the second was closed
      by a decision rather than by work.

      **"Two sources of truth have diverged" was out of date.** `legal/*.md` in both
      storefronts are no longer copies but pointers: "the text in force lives in
      `landing/legal/`, a legal text must not have two sources". The source is
      `landing/legal/`, and that is where the real texts sit (privacy 10 KB, terms
      15 KB). The item described a state that was gone by the time it was re-read.

      **"Only the English version is published" — the decision is that it stays.**
      The storefront speaks six languages and the community guidelines are
      translated into more than ten, so the question was put directly. The answer: a
      translated legal text is a second edition, and on the day one of them is
      edited they start saying different things — quietly, and where being wrong is
      expensive. Whoever needs it in their own language can translate it. The
      decision is recorded in the pointer files themselves, so that in six months it
      is not mistaken for a forgotten translation.
- [x] **G8. Push fully cancelled — 2026-08-07.** The decision: notifications about
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
- [ ] **G9. The native client key — two of five sub-items done 2026-08-12, three
      waiting for their occasion.**

      **Done:**
      - [x] **`client_type` (`browser` | `native`)** — migration `008`, the field
        on the key, on minting, in the listing, in the panel form and in the tool
        (`--native`). The decision now lives in the data: "nativeness" used to be
        read out of an empty Origin list, and a browser key saved without origins
        looked exactly the same. A native key given origins is refused — in the
        API and in the tool — because that is a contradiction rather than a
        detail;
      - [x] **the per-key daily quota does not apply to `native` and is not
        spent.** The key is shared by every copy of the client: a per-key counter
        would let one script lock everybody else out within a minute.

      **Verified against a real database** (`test/database.test.ts`): a native key
      mints without origins and is refused with them; a browser key with a limit
      of 1 hits 429 on its second request while a native key with the same limit
      passes four in a row. Broke `isNative` — the test went red — and restored.

      **Waiting for its occasion, which is not an excuse:**
      - [ ] **per-identity limits** — there are no `identities` and no sessions in
        the code yet (J19). There is nothing for a per-identity limit to hang on
        today; it arrives with the identity and not before;
      - [ ] **the `depth` brand and its first `native` key** — there is no `depth`
        image yet, so there is nothing to publish. The key is one command on the
        day there is;
      - [ ] **rotation by overlap** — the mechanism exists already: a brand may
        hold any number of live keys, and revocation stamps rather than deletes.
        What is missing is not code but an announced window and a procedure, and
        writing those before the first image exists would mean inventing the
        window out of nothing.

      **What must not be done:** a `brand` column on `identities` or
      `feed_messages`. The feed is shared across faces — §8 of the chat spec,
      second principle.
- [x] **G10. Terms for client authors — written 2026-08-10.** They live in
      `CLIENT_TERMS.md` at the repository root, next to the README, where whoever
      came for the image will find them.

      What went in: what the node guarantees (rights, limits, moderation before
      publication, age bands) and what it does not (counters, showing the Terms,
      erasing local history — those are on the client's author); the author's
      duties — show the Terms and the Article 16 path, do not collect our people's
      data, **do not hold other people's identity keys centrally**, do not pass your
      client off as ours; the client key as the only enforcement mechanism — we
      issue it and we can revoke it.

      **No DPA and no hosting of other people's networks** — recorded there with the
      reason: there is no service to cover, and hosting a separate world would put a
      brand boundary back into the feed and make us a processor for someone else's
      operator.

      **English only**, like the other published legal texts (the decision is in G7).

      **Dependency:** the document describes a client key that does not exist in the
      node's code — see G9. Until it does, there is nothing to revoke.

      Not done: links to `CLIENT_TERMS.md` from both storefronts' READMEs and from
      the image's description in the registry — those go up on the day the image is
      published.
## M. Found in August — not deferred, in hand

Items J13–J21 and D8 physically sat inside "G. Deliberately deferred" and were
therefore counted as deliberate deferral. This section was created on 2026-08-10
so that fresh findings do not read as a decision not to do them.

**J8 is missing.** The number is skipped and there is no trace of it in the
document; J2 was withdrawn deliberately and explained inside J3, while nothing is
said about J8 anywhere. Not reconstructing it — recording it so the gap is not
mistaken for a loss.

- [x] **M3. The deploy never deleted anything, and the storefronts served our own
      tooling — closed 2026-08-18.** Two quiet holes, found because of a third
      task: the mockups were taken out of the build, the deploy went green, and
      the mockups stayed on the site.

      **The first hole: upload without delete.** The deploy scripts uploaded every
      file and removed none, so whatever had once been published stayed published.
      The `panel-dev` zone held 44 files against a build of 16: sixteen superseded
      bundles, six mockups and three fonts — **7.86 MB**. Purging is beside the
      point; the objects are in storage, not in the cache. The consequence is
      wider than mockups: a file removed for any reason, a legal one included,
      would have kept being served.

      **The second hole: the storefronts published their own checks.** On
      production `neighbro.place` and `sosed.place`, `check-contrast.mjs`,
      `check-legal-consistency.mjs`, `find-dead-keys.mjs`, `verify-seo.mjs` and
      `test-security-headers.sh` all answered `200`. Not secrets, but nobody
      decided to publish the list of headers we expect or the rules we check. The
      cause: the exclusions lived in **two places**, and the half that was a
      hand-written list of five names had drifted while the directory grew to ten.

      **Done:**
      - `deploy/prune-storage-zone.py` — a prune with three guards: nothing happens
        without `--apply`; a plan covering more than half the zone stops; and
        **nothing referenced by the zone's own `index.html` is ever deleted**;
      - wired into the panel deploy and both landing deploys, right after the
        upload — the one place where the directory compared is the directory just
        uploaded — and only when every file landed;
      - the storefronts' exclusions now sit in one block, and the tooling half is a
        rule ("no `.mjs`, no `.sh`") rather than a list: a rule does not go stale
        when a file is added;
      - the landings' upload loop learned to read HTTP statuses. A zone rejecting
        every byte used to finish green. The panel deploy was fixed for this long
        ago; the landings were not.

      **Two mistakes of my own, both costly and both now written into the code:**

      1. **Broke the dev panel.** Ran the prune against a locally built dist while
         the zone held a CI build; the hashes differ, so the live bundle looked
         stale and went. The panel was blank until the deploy was re-run. Hence
         the third guard, tested by repeating that exact command.
      2. **Broke the UAT deploy.** Made the prune's exit code fatal, and it runs
         **after** the upload — so when the guard honestly refused to delete 60% of
         the zone, the deploy stopped without recomputing the headers or purging
         the cache. The most conservative outcome became the worst one. A refusal
         is now a loud warning and the deploy carries on: extra files are untidy, a
         policy that does not match the bundle is a blank screen.

      **Verified on all three environments.** Panel zones: 44 → 16, 40 → 16,
      38 → 16. Storefronts: tooling `404` everywhere, pages `200` and rendering.
      The production panel was opened in a browser — no errors, no policy
      violations, `Inter 500/600/700 → 627/633/640px`. Before pruning production
      the build was **reproduced locally down to the bundle name**
      (`index-DgdjqIRF.js`) to prove it was the deployed one.

      Bunny's `FilesStored` statistic lags and still showed the old numbers after
      the files were gone; counting means walking the listing.

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
- [x] **J15. `acknowledged` became a fact rather than an intention — 2026-08-11.**
      The field returned `Boolean(email)` — "an address was supplied" — under a
      name that reads as "the Article 16(4) confirmation was sent". The database
      was worse: `acknowledged_at` was set **unconditionally on insert**, so every
      notice claimed a discharged duty, including those with no address at all.

      Both now state the fact, and `sendNoticeReceipt` returns whether a letter
      left instead of `void` — a node with mail switched off returned silently and
      would have produced the same untruth by another route. An empty
      `acknowledged_at` beside a real address reads as an outstanding duty:
      nothing retries the send, so those rows must stay visible. Verified against
      a real database; the test went red on the old insert.
- [x] **J16. The Article 17(3) statement of reasons — closed 2026-08-11 as
      already done.** All three gaps were closed on 2026-08-09–2026-08-10 while the
      letters were being given a common shape, and this list never heard about
      it. Verified in the code rather than from memory:

      - **scope and duration** — `lib/mailer.ts`: "It applies everywhere the
        Service is available, and it is not time-limited", with a comment saying
        it becomes a form field the day either can differ;
      - **which content was restricted** — `whatWasRestricted()` quotes the
        snapshot, and where there is none it tells "expired" from "we never
        looked" instead of passing one off as the other;
      - **two descriptions of appeal** — reconciled. Compared by parsing the file
        rather than by eye: both strings match **word for word**, including "We
        do not operate a formal internal appeals body", which the author's letter
        had lacked.

      Nothing was changed: the item described a state that no longer exists.
- [x] **J17. The form speaks about chat separately — 2026-08-11.** Choosing "in a
      chat" reveals a warning: a conversation is stored nowhere, us included, so
      the quote has to be pasted from your own device and will be the only copy.

      A permanent notice would be wrong: a warning shown to everyone about a case
      that applies to one kind in four stops being read. Verified in a browser on
      both storefronts — hidden, shown, hidden again — and broken on purpose to
      check the assertion catches it.
- [x] **J24. A simple entry — decided 2026-08-18: the paper code left registration.**
      Entry is now name and age → PIN → the feed. The code is asked for when the
      **first chat opens**, on the same "copy it down and type two groups back"
      screen, and it cannot be skipped: nothing can be written in the chat until it
      is confirmed.

      **Why it moved.** It wrote the insurance before there was anything to insure:
      on the first minute there are no chats and no messages, a name and an age are
      retyped in ten seconds, and only nameless counters were at stake. For that we
      asked for the one act in the physical world anywhere in the entry flow, and
      it stood before the person had seen the product.

      **Why after the chat opens rather than before.** A gate "before the chat"
      would land on the consent screen, which already carries the notice and the
      span choice, with the match timer above it — `least()` of both phrases, a few
      minutes in the worst case. A first match with three minutes on the clock and a
      request to copy sixteen characters would end in "later" or in a lost match.

      **The PIN stayed at registration, and the terminal settled that.** In the web
      the keys are non-extractable `CryptoKey` objects and the vault key is only
      needed for history that does not exist yet — so in a browser the PIN could
      have been deferred. But `depth` writes its key file immediately and encrypts
      it with that same vault key: deferring would leave keys in the clear on disk.
      The faces must not diverge — §13 puts the terminal first.

      **The price is named and stated in the UI:** between registration and the
      first chat a person lives without insurance, and losing the device then loses
      the identity along with the counters and the published phrases. That is one
      line on the registration screen, not a footnote.

      Diagram 1 in `chat-flows_EN.md` is redrawn; the invented "PIN → code" order
      went away with the code itself.

- [x] **J25. The chat spec's own open questions — listed so they are not lost.**
      The list was assembled on 2026-08-31 in `docs/facts/open.tsv`; the two
      remaining questions are kept there as `moderation.model` and
      `moderation.queue.throughput`.
      They live in the spec but are invisible from this checklist, and they have to
      be settled before any code: which moderation model — **a measurement, not an
      argument** (§8.14) — and the moderation queue's throughput (§8.3).

      **One of them closed 2026-08-19 — the signature algorithm.** Measured in
      three engines rather than read from documentation: today's Chromium 151,
      Firefox 153 and WebKit 26.5 do Ed25519 in full, `wrapKey` included. But
      **Chromium 136 and older cannot do it at all** (the boundary lies between 136
      and 138, roughly May 2025), and somebody on such a device would not sign a
      single request — a locked door rather than a degradation. **ECDSA P-256** was
      chosen: it passed everywhere, including the engines without Ed25519. The spec
      and the diagrams are rewritten, and the probe is kept —
      `scripts/check-webcrypto-support.sh` with `testing/webcrypto-support.mjs` —
      so the question can be revisited by measuring when that tail dies out.

      **Another closed 2026-08-20 — the last frame of expiry.** Only the person who
      was looking sees a headstone: a chat open on screen shows "chat expired" and a
      "close" button, while a row in the list disappears silently. The content is
      erased immediately in both cases, and the headstone does not return to the
      list — otherwise the trace outlives the thing that was supposed to vanish.
      Written into `chat_EN.md` §5 together with the reason for the difference:
      taking the screen away from someone mid-message without a word is
      indistinguishable from a crash or a ban.

      **And a third, the same day — sub-sections on the tabs.** There will be none:
      exactly two tabs, `Chats` and `Matches`, with "fading" left as a state of the
      row. A "Fading" section could only be filled by moving a chat there on a
      timer — the other person would drop out of sight in the very minute when the
      least time is left — and it would force the inbox counters to be split three
      ways. Written into `chat_EN.md` §3.

      **And a fourth, the same day — the unchecked-name window is gone.** Closed by
      moving the moment of the check rather than the order of the steps: the name
      goes into the queue **at the first publication**, when the queue already
      exists, and is checked on every change after that. Before the first post
      there is nothing to check — the name is visible to nobody: the feed never
      reveals an author (§8.11), and another person's eye reaches the name only
      from the first match. A rejected name does not cancel the post, and its owner
      is asked to fix it; **while the name stands rejected, no match opens** — a
      consequence of §8.11, the last point at which it can still be withheld.

      **From the same decision — the name is frozen while posts or chats are
      live.** It can be changed only on a clean slate. The consequence is written
      into §4 and §8.2: the system message "they now call themselves…" no longer
      exists, because there is nothing to change while a chat is open. Age still
      changes, and still only upwards. The retired wording went into
      `docs/retired-terms.txt` so it cannot creep back; the check was broken
      against it and repaired — the rule catches.

      **And a fifth, the same day — the set of chat spans.** Three stay: 20
      minutes, 1 hour, 4:20; there will be no fourth, neither below nor above.
      Anything shorter than 20 minutes breaks the silence counter it comes with —
      at `min(20 minutes, span / 3)` a five-minute chat would start counting down
      after 1 minute 40 seconds, and since the smaller of the two applies, one
      cautious pick would close the conversation for both. Anything longer than
      4:20 outlives its own reason: that is exactly how long a phrase lives in the
      feed. Written into §5.

      **Two questions remain in J25, and both wait on the queue rather than on a
      decision:** which moderation model (§8.14 — "a measurement, not an argument",
      and the spec itself says to run it on the day the queue appears) and that
      queue's throughput (§8.3). The bench is ready — `relay/moderation-bench`.

- [ ] **J19. The identity model has been rewritten in the spec and does not exist
      in code.** Decided 2026-08-10: one live session per identity, a mandatory
      paper recovery code, a mandatory six-digit PIN, and half the vault key held
      by the node (`chat_EN.md` §8.2).

      Not a line of it is built — `identities` and `sessions` are not in the
      database either, the chat still lives entirely in the spec. This item exists
      not as a task for tomorrow but so that the gap between "the spec describes
      it" and "there is no code" is written down.

      **What will have to be built when its turn comes:**

      - `identities` with `recovery_auth_hash` and `recovery_wrapped_key` — **with
        no attempt counter**: the column was dropped 2026-08-18 because it could
        barely ever fire (one wrong character breaks the lookup half, the node
        finds no identity, and there is nothing to decrement). The recovery
        endpoint counts instead: per address plus a global miss counter;
      - `sessions` with `frozen_at` and a **partial unique index** — that index,
        not a check in code, is what holds the one-session rule;
      - somewhere to hold the ephemeral halves during a **chat key reissue**: at
        consent that is `match_participants.ephemeral_public_key`, and a reissue
        has no such place (`chat_EN.md` §8.13, decided 2026-08-18);
      - `vault_shares`: the PIN verified **on the node** before the share is
        released, with the counter there too. Hand the share out unverified and the
        whole scheme collapses — an attacker takes it once and brute-forces six
        digits offline;
      - the transfer confirmation screen with context: what the device called
        itself, same network or not, when. An address comparison, no geo database;
      - cleanup of shares whose session has been unseen for a year, and that period
        stated in the retention policy.

      **Extended 2026-08-18, when the recovery mechanic was taken apart to the
      end.** Written down: the paper code's entropy (sixteen Crockford base32
      characters, salt `xor.ad/recovery/v1`, 80 bits) — only an example string
      stood there before, and the alphabet would have been chosen by whoever wrote
      the code first; issuing a **new** code on recovery while killing the old one;
      and a **chat key reissue** after a device change — one mechanism for a
      transfer and a recovery, signed with the long-term key and accepted by the
      other side. Until then both cases left a chat listed as live and mute.

      **What to test once it is built** (§14 of the spec): ten wrong PINs really do
      burn the share and the database then opens with **nothing**; the paper code
      raises the identity on a clean device; without "that's me" no transfer
      happens.

- [x] **J20. The Article 16 spec now matches how the form works — 2026-08-11.**
      The field table marked name and email required "except for §5.1", and §5.1
      promised a separate path in the form. Neither exists, and neither should:
      the fields are optional for everyone, a line beside them addresses reports
      about child abuse, and the node never requires them.

      Written down with the reason: a separate path would have a person label
      their own notice before writing a word, and refusing over a missing name is
      exactly what Art. 16(2)(c) forbids. The price is stated: some notices arrive
      with no return address and there is nobody to answer.
- [x] **J21. Every translation of the rules now carries the precedence clause —
      done 2026-08-11.** 27 files: 10 for neighbro, 17 for sosed.

      The clause is written **in the language of the document**, with the English
      sentence beside it. Putting it in English alone inside a Kazakh file is
      pointless: the person it is written for cannot read it. The English line
      beside it insures the opposite case — if a local wording turns out clumsy,
      the governing version is still named unambiguously.

      **Verified by rendering rather than by the line existing.** The rules page
      fetches the markdown, so a line in a file proves nothing. Static servers for
      both storefronts inside a container, then Playwright over four languages —
      en, ru, kk, el: both sentences on screen every time.

      **What I cannot vouch for:** the quality of seventeen translations. Russian,
      English, German, French, Spanish, Polish and Ukrainian I stand behind;
      Kazakh, Kyrgyz, Uzbek, Azerbaijani, Armenian, Georgian and Tajik I do not.
      The sentence is short and uniform, but a native speaker should look.
- [x] **J22. An Article 16 notice was refused when the key ran out of quota —
      found and fixed 2026-08-11.** Found by the independent "spec against code"
      pass; fixed the same day.

      **What it was.** `resolveTenant` answered 401 or 429 — unknown key, revoked,
      unexpected origin, daily quota spent — and that refusal sat in
      `routes/report.ts` **before** the content snapshot and **before** the
      `INSERT`. So the notice did not exist: no Article 16(4) acknowledgement went
      out, nothing reached the moderator's queue, and the only trace was a
      Prometheus counter. The same daily quota is spent by `/pageview` and
      `/waitlist`: a storefront passed around in chats would have been enough to
      stop accepting reports of illegal content for the rest of the day.

      The route's own limit (10 an hour per address) sat **earlier** in the code
      and let an honest notifier through — who then hit somebody else's quota.

      **How it was fixed.** `lib/tenant.ts` gained `resolveTenantSoft`: the key
      answers only "through which face", and everything else downgrades the
      request to unattributed. The quota is neither checked nor charged there — an
      obligation is not metered. Migration `007` dropped `NOT NULL` from
      `dsa_notices.brand`, or the loss would simply have moved one step later. The
      pattern was already written next door, in `routes/client_error.ts`.

      **Verified:** `test/report_never_refused.test.ts` — against the old code both
      assertions failed with `401 {"error":"invalid api key"}` and
      `401 {"error":"missing x-api-key"}`; green after the fix, with the whole
      suite at 67/67.

      **While there:** `client_error.ts` moved to the same helper and stopped
      spending the key's quota — a page reporting that it is broken should not
      compete for budget with what it failed to send.

- [x] **M1. The content snapshot selected columns that exist in no schema — found
      and fixed 2026-08-11.**

      `dsa_snapshot.ts` took `body`, `zone`, `identity_id` from the feed and
      `business_profile_id`, `created_at` from offers. None of those names exist:
      the feed spec has `text` and `author_identity`, an offer has `venue_id` and
      `published_at`. `mailer.ts` read `row.body` from it — so the letter to an
      author would have opened with "something you posted" and **never said
      which**.

      **Why it would have failed silently.** `query()` returns `null` both for "no
      database" and for "the query failed", and the table check above had already
      ruled out the first. So a broken `SELECT` returned `received` with an empty
      snapshot — the notice filed as "no copy was needed" and examined against
      nothing. The same class of defect migration `006` was written for. It is now
      `not_accessible`, with an error in the log.

      **What holds it in future.** `test/dsa_snapshot_columns.test.ts` reads
      `docs/chat_EN.md` and `docs/offers/SPEC_EN.md` and checks the column list
      against them — the way the panel's access test reads `App.tsx`. Against the
      old code it failed with "dsa_snapshot copies feed_messages.body, which the
      chat spec does not define", listing what the spec does have.

      **Decided while there:** the area (`lat`, `lon`, `area_radius`) is **not**
      copied into a snapshot. A notice asks whether a text is illegal and the text
      answers; a snapshot is kept for a year, and copying coordinates would keep a
      year of people's locations for nothing.

      **And a gap of my own:** `visible_at`, introduced yesterday with the
      moderation queue, was described in prose but missing from `CREATE TABLE
      feed_messages`. Added, together with `expires_at` counting from it.

- [x] **M2. The Article 16 queue was not bounded by brand — found and fixed
      2026-08-11.**

      `routes/dsa.ts` ran a bare `SELECT ... FROM dsa_notices`, and the decision
      route fetched a row by id alone. Permissions were checked; ownership was
      not. Today's roles do not reach it: `tenant_admin` lacks
      `dsa_notices.read`. They reach it **in one step**: a tenant admin may give
      the `moderator` role to somebody under their own brand
      (`panel/src/pages/panel-users`), and that role carries both read and
      decide. Which means the names and emails of **every** brand's notifiers,
      plus the power to decide their notices.

      **Fixed:** the query gained a condition on the reader's brand, and the
      decision route an ownership check answering `404` (not `403`: whether
      another brand has such a notice is not this brand's business — the rule the
      operator list already follows). Unattributed rows (`brand IS NULL`,
      migration `007`) stay with the platform: the notice arrived without a usable
      key, so which face it concerns is exactly what nobody knows.

      **Verified against a real database** (`test/database.test.ts`, run through
      `scripts/run-relay-database-tests.sh`): before the fix the test failed with
      "a tenant is reading another tenant's notice". After it, 26/26 in that suite
      and 69/69 in the ordinary one.

- [x] **J14. The first administrator of a new environment is now seeded by the
      wizard — done 2026-08-11.**

      `wizard seed-admin --env <env> <address>`, alongside `deploy`. The writing
      is done by **the node, not the wizard** (`tools/seed_admin.ts`, run through
      `docker compose run --rm`): it already knows the storage transport, the
      environment name and how an operator object is keyed. Teaching the wizard
      any of that would have moved the problem — which is exactly what the manual
      workaround was.

      **It seeds only into an empty environment.** One operator existing means a
      refusal with exit code `2`. That is what makes the command safe to keep in
      the image: it is not a way to add an administrator but a way to have a first
      one; the second is added from the panel, where the act is authorised and
      audited.

      A production environment needs `--confirm-prod` but **not** a published
      release, unlike `deploy`: seeding an operator does not change the image, and
      a release gate would mean nothing here.

      **Verified by running it**, not by reading: on file storage in a container
      the command wrote `panel/probe/users/<sha256>.json` holding
      `{email, role: "admin", brand: null, created_at}` — the same shape the panel
      writes. A second run refused with exit code `2` and no second object
      appeared. Not yet run against a live box over SSH: that is the next deploy.

- [x] **J23. The wizard refused production for the wrong reason, and `pool` asked
      nothing at all — fixed 2026-08-11.**

      **First.** `github.is_published_release` reads `GITHUB_TOKEN`, and the
      wizard's `secrets.env` does not carry it (it lives in `deploy/.env.deploy` —
      a different file for a different tool). The repository is private, so an
      unauthenticated request gets a **404**, the function returned `False`, and
      the wizard said: "tag is not a published GitHub Release — publish the
      release first". It sent whoever was deploying to publish something already
      published, at the exact moment of a production deploy.

      Fixed by separating them: "no such release" and "could not check" are
      different outcomes. No token, a rejected token (401/403), GitHub
      unreachable — all `CannotCheck` with the reason, and production stops with
      an honest message. The secret lists in the wizard's help and in
      `inventory.example.toml` are now complete: a partial list is how the token
      went missing in the first place.

      **Second.** `pool` — steering the live DNS record — was the only production
      operation **without** `--confirm-prod`, while `deploy`, which changes less,
      required it. It requires it now. The release gate does not apply: no image
      is involved.

      **Verified by running it:** with no token, "GITHUB_TOKEN is not set…"; with
      a deliberately invalid token (a live call to api.github.com), "GitHub
      rejected the token (401)"; `pool` against a minimal inventory with a public
      box, "pool steers LIVE traffic to … — pass --confirm-prod". Not run with
      --confirm-prod: that is a real DNS cutover.

      **The token was added by a person on 2026-08-11**, and the check was run
      against the live API: the repository is visible (5 published releases), the
      real tags `v2026.8.9-g4c8229c` and `v2026.8.5-gfd6587a` return `True`, and
      the invented `v9999.1.1-gdeadbee` returns `False` rather than an error. All
      three outcomes are now distinct: it exists, it does not, we could not look.

      A `relay/wizard/secrets.env.example` was added too — every name, no values.
      Its absence was the cause: the list lived in a docstring, named half of
      them, and the omitted half held the one without which production refuses
      for the wrong reason.

- [x] **J18. An image is built by its content rather than by the commit — done
      2026-08-11.**

      The "already built?" key was `sha-<commit>`: a new commit has no such tag,
      so a build always ran — even when not a byte of the context had changed.
      `relay/caddy` went 78 commits that way, rebuilt each time for two
      architectures, arm64 under emulation.

      **The key is now the directory's tree hash** — `git rev-parse
      HEAD:relay/<image>`. Nothing had to be invented: git already
      content-addresses a directory, and the hash changes if and only if a byte
      in the context changes. Checked across the last eight commits: `caddy`'s
      hash **never changed**, `node`'s changed exactly when the code did and
      matched twice between neighbouring commits. In a depth-1 clone — which is
      what `actions/checkout` makes — it computes and gives the same values.

      The content check **subsumes** the old one: the same commit is the same
      content. `sha-<commit>` is still applied to every commit, so nothing that
      refers to it breaks.

      **What changes in how an image reads:** a reused image keeps the label of
      the build that made it, so `org.opencontainers.image.revision` names the
      commit that **produced** those bytes. The tags say which commits an image
      serves; the label says which one built it. Written into the workflow so it
      does not look like a mistake.

      **The residual gap is named there too.** `concurrency` is evaluated before
      any step and cannot see a step's output, so the group stays keyed by the
      commit. Two **different** commits with identical context could therefore
      overlap and both build. That is narrower than what it replaced (one commit,
      two digests, now impossible) and needs two dev pushes inside one build
      window.

      **Not verified:** no live Actions run — the change goes out on a branch, and
      the first real measurement is the next deploy. What could be checked
      locally was: the tree hash, its behaviour across history, its availability
      in a shallow clone, and that the YAML still parses.
