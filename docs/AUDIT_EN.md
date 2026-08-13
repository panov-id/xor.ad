# Audit: four independent passes over the code

Date: 12 August 2026. Branch: `day29`.

Four passes ran in parallel and could not see each other's work. The levels were
**specification versus code**, **security and threat model**, **deployment and
operations**, and **plain code correctness**. None of them was allowed to change
anything.

Where a finding was brought back independently by two or three passes, it is
marked. Those are the sturdier ones: they are visible from more than one side.

**What was actually run.** Only the correctness pass ran code: `deno test` in
thirteen configurations, `deno check`, `deno lint`, and the header builder
against the real `panel/dist` — all inside throwaway containers with the
repository mounted read-only. The other three read code and git metadata.
**Nothing was exercised live:** the Bunny API was not touched, no node was
queried, and no policy was ever opened in a browser. B6 and the whole of section
C are derived from the schema, not from an observed failure.

**Confirmed** means the path was traced through the code to its end, or the
result came from a run. **Suspected** means the conclusion depends on a value in
production, or on a file the pass never saw.

---

## A. Breaks the panel deploy

Fresh code that has never run: `deploy/panel-security-headers.mjs`,
`deploy/apply-edge-headers.py`, and the edits to `deploy/deploy-panel-ci.sh` and
`.github/workflows/_deploy.yml`.

### A1. `deploy/__pycache__/` is not ignored — confirmed

Left behind by a syntax check. There is no pattern for it in `.gitignore`, so it
lands in the commit on `git add deploy/`.

### A2. No `curl` checks its response code — confirmed (deploy + security)

`deploy/deploy-panel-ci.sh:43-47,65-66` and `deploy-landing.sh:153-157,250-251`
in both storefronts. No `-f`, no `-w '%{http_code}'`. Without `--fail`, `curl`
returns 0 on 401, 403, 500 and 507, so `set -euo pipefail` buys nothing here.

An expired `BUNNY_STORAGE_API_KEY` produces `→ /index.html`, `cache purged.`,
`Panel deployed.` and a green run while the zone is unchanged. The panel has it
worse: `deploy/bunny-panel-spa-fallback.sh:19` sets
`Custom404FilePath: /index.html`, so a half-uploaded `/assets/*.js` comes back as
HTML with a 200 — the browser reports a MIME error, the panel shows a blank
screen, and the deploy log says nothing.

The same on the purge: policy applied, cache not purged (401), log says
`cache purged.` The edge then serves old files under the new policy, the hashes
do not match, the panel does not load, and the deploy is green.

### A3. An empty `BUNNY_API_KEY` silently disables the policy — confirmed (deploy + security)

`deploy-panel-ci.sh:54`, `deploy-landing.sh:185`. In GitHub Actions an undefined
secret expands to an empty string, not an error. The `else` branch writes one
line to stderr among hundreds of `→ /path` lines and returns 0.

Then `PURGE_KEY="${BUNNY_API_KEY:-$BUNNY_STORAGE_API_KEY}"`
(`deploy-panel-ci.sh:23`) substitutes the storage key, which does not authorise
`POST /pullzone/{id}/purgeCache`, and A2 swallows the 401. The result: a panel
with no headers, a cache that was not purged, and a successful status.

The contrast inside one file is telling: a missing `VITE_RELAY_API_URL` kills the
deploy through `: "${VITE_RELAY_API_URL:?}"`; a missing policy does not.

### A4. The rule is matched by description prefix — confirmed (three passes)

`deploy/apply-edge-headers.py:73-77` uses `.startswith("security headers")`. The
neighbouring scripts in the same directory compare the description by exact
equality: `bunny-seo-index-redirect.sh:70`, `bunny-config-cache-rule.sh:64-65`.

Four consequences, all reachable:

* Two rules with that prefix — `break` takes the first in the API's order (which
  is not guaranteed), and the second keeps setting its own header. With two
  `Content-Security-Policy` headers the browser applies the **intersection**, so
  the panel breaks the more, the older the second rule is. The script prints
  `updated` regardless.
* Somebody renames the description in the Bunny interface — no match, and
  `addOrUpdate` creates a second rule. The only signal is the word `created`
  instead of `updated`.
* A hand-made rule described as `security headers (temporary)` is silently
  overwritten.
* `EdgeRules` missing from the response yields `[]`, so every deploy adds a copy.

### A5. `GET` is not wrapped while `POST` is — confirmed (deploy + correctness)

`apply-edge-headers.py:73` sits outside `try`, while the `POST` on `:81` is
wrapped and produces a legible message. A 401, 403, 429 or 5xx gives a raw
traceback with no mention of the zone — and kills the deploy exactly between the
upload and the purge.

In the same file: `.get("EdgeRules", [])` protects against a missing key but not
against `"EdgeRules": null`, which gives `for item in None`.
`urllib.error.URLError` (DNS, timeout) is caught nowhere.
`json.loads(payload)["headers"]` (`:55`) raises `KeyError` instead of saying what
went wrong.

### A6. The panel never prints `counted` — confirmed (deploy + correctness)

`panel-security-headers.mjs:102-111` computes `pages`, `inline_scripts`,
`inline_styles`, `style_attributes` and `relay`. `apply-edge-headers.py:55` reads
only `["headers"]` and throws `counted` away. The landings print it —
`deploy-landing.sh:198`.

A run where the regular expression stopped finding the inline script and
`inline_scripts` is 0 looks exactly like a correct one in the deploy log:
`script-src 'self'` ships, applies successfully, and the panel dies. This is the
very failure mode the file was written for.

### A7. Style-attribute hashes without `'unsafe-hashes'` — confirmed

`panel-security-headers.mjs:84`. Under CSP Level 3 a hash applies to a `style`
attribute only when `'unsafe-hashes'` is present in the directive. The landing
version accounts for this (`landing/security-headers.mjs:103`); the panel one
does not.

Harmless today: `panel/dist` has zero attributes. But the first `style="…"` gives
a script that reports `style_attributes: 1`, emits a hash the browser ignores,
and leaves the attribute blocked. As written it is code that can only lie: either
add `'unsafe-hashes'`, or stop collecting attributes at all.

### A8. The relay address is never validated — confirmed

`panel-security-headers.mjs:86` interpolates `connect-src 'self' ${relay}` with
no `new URL()` and no comparison against an origin. A value carrying a path
(`https://relay.example/v1`) works for the application —
`panel/src/providers/api.ts:16` concatenates the path onto the string — but in
CSP a source with a path and no trailing slash matches that exact path, so every
request to `/v1/admin/...` would be blocked.

Separately, a value containing a space and a `;` would append its own directives
to the header. The source is a GitHub secret and therefore trusted, so this is
not exploitable; but the string reaches an HTTP header without a single check.

### A9. Neither policy carries `report-to` — confirmed

The whole construction rests on a claim from the comments — that anything the
regular expressions miss "shows up as a console violation on the very first check
after a deploy" — which is to say, on a person opening the console. Meanwhile the
policy is computed at deploy time and drifts by construction. A receiver already
exists: `POST /client-error`. This is the cheapest improvement on the list: it
turns a silent breakage into telemetry.

---

## B. Production security

### B1. Environment files are written to the node without `chmod` — confirmed

`relay/wizard/wizard.py:378-380`:

```python
def _write_remote(sftp, path: str, content: str) -> None:
    with sftp.file(path, "w") as fh:
        fh.write(content)
```

The files take the remote umask, usually 0644. This method writes
`compose/<env>.env` (carrying `SESSION_SECRET`, `RESEND_KEYS` and
`POSTGRES_PASSWORD` — `wizard.py:471-476`), `caddy.env` (`BUNNY_API_KEY`,
`ORIGIN_TOKEN`) and `backup.env`.

The same script knows better elsewhere: `wizard.py:407` sets `chmod 600` on
`authorized_keys` and `:410` sets `chmod 440` on the sudoers file. The
environment files were simply missed. Any local account on the node can read
`prod.env`.

### B2. One `SESSION_SECRET` across every environment, and no session revocation — confirmed in code

`wizard.py:140` writes the same value into `dev.env`, `staging.env` and
`prod.env`. `relay/node/src/lib/auth.ts:104-119` builds the user entirely from
claims and never reads the `panel_users` row. `Claims` (`jwt.ts:29-35`) is `sub`,
`role`, `brand`, `exp` — no `iss`, no `aud`, no environment name.

Three consequences:

1. A token minted by the dev node verifies on prod byte for byte, and dev is the
   environment with the weaker access.
2. `SESSION_TTL_S = 7 * 24 * 3600` (`auth.ts:31`), no `jti`, no lookup. A removed
   or demoted operator keeps full access for seven days. The comment at
   `auth.ts:87-91` acknowledges this effect for a brand change but not for
   removal.
3. Compromising the secret yields a platform administrator: `brand: null` in
   `admin.ts:74-76,135-141` means an operator who sees every tenant.

Whether prod is actually deployed from the same `secrets.env` is **suspected** —
one comparison of values settles it.

### B3. `deploy/.env.deploy` is mode 0664 — confirmed

Nine live keys: `GITHUB_TOKEN`, `BUNNY_API_KEY`, `NAMECHEAP_API_KEY`, three
`RESEND_*` and three `IMPROVMX_*`. It is not tracked (`.gitignore:9`) and the
history is clean. The neighbouring `relay/wizard/secrets.env` is done right, at
0600. `BUNNY_API_KEY` is duplicated verbatim across both files: one rotation, two
places.

### B4. Keys are passed as command-line arguments — confirmed

`apply-edge-headers.py:50` and its call site `deploy-panel-ci.sh:58`; likewise
`bunny-api-cutover.sh:27`, `bunny-api-origin-token.sh:28` (where the argument is
`ORIGIN_TOKEN`), `bunny-api-zone.sh:25`, `bunny-config-cache-rule.sh:30`,
`bunny-seo-index-redirect.sh:27` and both `deploy-landing.sh:192-193`.

Visible in `ps` to any local user, and first in line to land in a traceback. The
right technique is already used in the same file: `HEADERS_JSON` travels through
the environment.

### B5. The Origin allowlist is not an authorisation boundary — confirmed

`relay/node/src/lib/api_key.ts:82-90`. The file's header claims a stolen key is
useless from another site. Outside a browser, `Origin` is an ordinary request
header, and the publishable key sits in every landing's `config.js` by design.

What turns this from noise in analytics into a denial of service:

* `/pageview` has no per-address limit at all — among `routes/*.ts` only
  `report.ts`, `waitlist.ts` and `v1.ts` import `rate_limit`.
* The daily quota is a single `EVENTS` counter per key, shared by every public
  route (`lib/quota.ts:23,50,97-124`). Exhausting it through `/pageview` makes
  the victim's `/waitlist` answer `429` until midnight UTC: another brand's
  sign-up form stops accepting people.
* The same key writes leads into another tenant's storage, sending a welcome
  letter from the victim's domain and Resend account (`waitlist.ts:127-133`), and
  files Article 16 notices into their queue with an arbitrary `notifier_email`
  that their moderator then writes to.

The comment at `tenant.ts:99-107` describes exactly this scenario but applies the
conclusion only to native keys.

### B6. The DSA snapshot is taken by client-supplied id with no tenant filter — confirmed, latent

`lib/dsa_snapshot.ts:62-87` runs `SELECT ${columns} FROM ${table} WHERE id = $1`
where `targetId` comes straight from the public body (`routes/report.ts:103`),
and the result is stored on the notice under the reporter's brand.

With tenant A's key (or via B5), send `/report` with `target_kind:
"feed_message"` and a `target_id` belonging to tenant B: `text`, `created_at` and
`author_identity` are copied into A's notice, where the `brand` filter already
points at A.

It does not fire today: `tableExists()` returns `not_accessible` while
`feed_messages` and `offers` do not exist. **The boundary opens silently on the
day they are created** — so this is to be fixed before, not after. The comment at
`:63-65` records "found by id, not by tenant" as a deliberate decision.

While there, `kind in SNAPSHOTTABLE` (`:76`) is worth replacing with
`Object.hasOwn`: `"constructor" in SNAPSHOTTABLE` is true, and today that is
unreachable only thanks to `KINDS` in `report.ts:20`.

---

## C. The node

### C1. `dsa_statements.brand NOT NULL` was left behind — confirmed from the schema

`db/007_dsa_notice_unattributed.sql` dropped the constraint only on
`dsa_notices.brand`; `dsa_statements.brand text NOT NULL` (`db/005:63`) was never
touched. `routes/dsa.ts:157-165` inserts `notice.brand` into it.

An unattributed notice can only be decided by a platform operator
(`dsa.ts:130`), and that single path leads straight into the defect: the insert
throws, no statement is created, `decided_at` stays empty, the reporter hears
nothing, and the response is a 500. The type `NoticeRow.brand: string`
(`dsa.ts:24`) lies about a nullable column, so `deno check` stays quiet.

**The word `upheld` appears in no file under `test/`.** The entire upheld path —
statement insert, letter to the author, `delivered_at` — is exercised by nothing.

### C2. The double decision is closed only for the sequential case — confirmed

`dsa.ts:133` reads `decided_at`; `dsa.ts:186-189` writes without
`AND decided_at IS NULL`. Two simultaneous POSTs both pass the guard, both insert
a statement, both send a pair of letters, and the second `UPDATE` silently
replaces the first decision. The comment at `dsa.ts:112-113` claims this is
fixed.

Adjacent: the chain INSERT → letter → `UPDATE delivered_at` → `UPDATE
dsa_notices` is not in a transaction. A failure after the first step leaves a
statement attached to an undecided notice.

### C3. The reporter's answer knows two outcomes out of four — confirmed

`docs/dsa/SPEC_EN.md` requires the answer to say: removed, left up, the content
was already gone, or it was not accessible. `dsa.ts:284` accepts only
`upheld|rejected`, `db/006_dsa_snapshot_state.sql` narrowed `status` to four
values without `gone`/`not_accessible`, the letter (`mailer.ts:207-215`) knows
two phrasings, and `snapshot_state` never reaches the reporter at all.

So a report about an expired message answers "we did not agree with your report"
rather than "the content was already gone" — precisely the lie the comment in
`dsa_snapshot.ts:16` was written against.

### C4. In-memory maps are never pruned — confirmed

`lib/tenant.ts:20` — `keylessNoticedAt` is keyed by `${brand}|${origin}` and
never drops an entry. With `require_api_key = false`, cycling the `Origin` header
creates a new entry and, since `last = 0`, a new `warn` line on **every**
request; `warn` is copied into storage (`shouldPersist`). The comment at `:14-18`
promises one line per caller per hour.

`lib/quota.ts:26,28` — `pending` and `totals` are keyed with the date, and
yesterday's cells are never removed.

### C5. `mailer.ts:253` — `targetKind` is unused — confirmed by `deno lint`

`whatWasRestricted` tells content apart purely by the row's field names
(`row.text` versus `row.offer_text`, `row.created_at` versus `row.published_at`)
and ignores its first argument.

The consequence for the tests: in `test/statement_of_reasons.test.ts` the cases
at lines 15 and 28 differ only by that ignored argument. Worse, the offer fixture
at `:31` passes `created_at`, which a real offer snapshot does not contain —
`SNAPSHOTTABLE.offer.columns` (`dsa_snapshot.ts:49`) is
`id, offer_text, discount_value, conditions, published_at, venue_id`. The
`published_at` branch, the only one that runs in production, is covered by
nothing, and the test is green on data the production path never produces.

### C6. Smaller ones — confirmed

* `status = 'in_review'` is unreachable: the value exists in the schema and the
  queue filters on it (`dsa.ts:219`), but no route ever sets it.
* `api_key.ts:155-166` — the database branch of `revokePublishableKey` does not
  call `invalidatePublishableKeys()`, unlike the file branch at `:173`. If the
  database blinks, `findPublishableKey` falls through to the cache and can return
  a key that was revoked, for `CACHE_TTL_MS`. In the same statement `RETURNING`
  omits `quota_events_per_day` and `client_type`.
* `v1.ts:14` — dead import of `readJson`.
* `dsa_snapshot.ts:76` — an unknown target kind gets `received` ("no copy was
  needed") instead of `not_accessible` ("the surface is not built"). Correct for
  `other` today; adding a fifth kind to `KINDS` without a row in `SNAPSHOTTABLE`
  starts lying silently.
* `report.ts:143` — `rows[0]?.id ?? null` on an empty array yields a receipt with
  `id: null` and a `202 {ok: true}`. Unlikely for `INSERT … RETURNING`, so
  **suspected**.
* `report.ts:103` — `text(body.target_id, 200)` truncates the identifier
  silently. A truncated id will not be found, so the notice is marked
  `target_gone` ("it expired") rather than "they sent rubbish" — exactly the
  distinction the whole of `dsa_snapshot.ts` protects.

---

## D. Specification and legal texts

### D1. The published storefront documents contradict each other — confirmed

`landing/legal/community-guidelines_{RU,EN}.md:15/17` in all three storefronts:
a message that fails the check "is not sent — not to the feed and not to a chat",
and its author is told.

`landing/legal/privacy_EN.md:56`, on the same documents page: chats are not
checked and cannot be opened.

`docs/chat_EN.md` states that the chat is not moderated and calls it the
project's position. §8.8 cites the privacy policy as its grounds — while the
community guidelines, served beside it, promise the opposite.

### D2. `chat/relay.ts` describes a cancelled product — confirmed

`relay/node/src/chat/relay.ts:1-9` is a stub whose header describes passing
messages through AI moderation in plaintext, rests privacy on storing nothing,
and declares end-to-end encryption an incompatible alternative living in
`docs/chat-decentralized-ideas_{RU,EN}.md`.

`chat_EN.md` §8.13 adopted end-to-end encryption as a decision and says outright
that it became possible exactly when the chat stopped being moderated. The stub
is the brief for step 5 of the build order, and it points down the cancelled
branch.

### D3. Code the specification never sanctioned — confirmed

* `GET /v1/me` (`routes/v1.ts:206-218`) returns `{id, brand, name, scopes}` for a
  secret key. Searching `v1/me` across every `*.md` in the three repositories
  finds nothing; `docs/api-platform_EN.md:19` lists three routes.
* Body fields on `/report`: `brand`, `lang`, `source` (`report.ts:33-35,99,166`),
  while `dsa/SPEC_EN.md` says there are no free-form fields left. `brand` no
  longer decides anything either (`tenant.ts:1-3`) and is sent into the void.
* Length limits that appear in no document: `REASON_MAX = 4000`
  (`report.ts:24`), reporter name and `target_id` at 200 each (`:89,103`),
  `facts` at 4000 and `ground_text` at 2000 (`dsa.ts:289,330`), `source` at 120,
  `lang` at 8. Truncation is silent, so an Article 16(2)(a) statement of grounds
  can be cut without telling the reporter.
* The snapshot shape `{table, captured_at, row}` (`dsa_snapshot.ts:103`) is wider
  than the specification describes, and the panel already renders it as is.
* `dsa_statements.brand` is absent from the entity listing in `dsa/SPEC_EN.md`.

### D4. The specification asserts things about the code that are untrue — confirmed

* `chat_EN.md` says feed moderation before publication is "already built". The
  per-address rate limit exists and the queue exists as a mechanism, but exactly
  three job kinds are registered and all three are housekeeping
  (`lib/scheduled.ts:15-22`). There is no `POST /feed`, no `visible_at`, no
  classifier.
* `chat_EN.md` describes `relayUpgrade()` in the present tense; in fact
  `src/chat/relay.ts:15-17` returns 501. `docs/api-platform_EN.md:22` puts it
  correctly.
* The specification names a migration `005_chat.sql`; that name is taken by
  `005_dsa_notices.sql`. The number should be 009 or higher.
* `dsa/SPEC_EN.md` and `chat_EN.md` require the statement of reasons to be shown
  in the application when the author has no contact address. In the code
  `sendStatementOfReasons` returns quietly for a non-address, `delivered_at` is
  never set, and no "show on next sign-in" queue exists — not even a marker. The
  obligation is quietly lost rather than deferred.

### D5. The specification contradicts itself — confirmed

* What encrypts the local history: §8.10 says "the same secret that signs
  requests (§8.2)"; §8.2 replaced that secret with a key pair; §8.6 defines the
  key as `HKDF(local ‖ the node's share)` derived from the PIN. Three answers to
  one question. The 12 August 2026 edit went through §8.2 and did not go through
  §8.10 or §11.
* The §8.5 flow writes `ephemeral_public_key` into `match_participants`, where
  the `CREATE TABLE` has no such column. The same in both languages.

---

## E. Tests and tooling

### E1. `deno task test` is red — confirmed by running it

`relay/node/deno.json` defines `"test": "deno test --allow-env"`. Running exactly
that task: **67 passed, 6 failed**. It lacks the
`--allow-read/--allow-write/--allow-net` that `tenancy.test.ts` needs, and it
pulls in `database.test.ts`, which throws `DATABASE_URL is not set` and takes the
runner down with it.

CI (`.github/workflows/relay.yml:59,67,111`) and `scripts/run-relay-tests.sh` do
it correctly. But the task in `deno.json` is what the next reader will run.

### E2. Tests leak into each other through `Deno.env` — confirmed by running it

A full `deno test` without `--ignore`: **93 passed, 6 failed**.
`test/unit.test.ts:30` expects `neighbro` and gets `alpha` — the
`Deno.env.set("BRANDS", …)` from `tenancy.test.ts:52` reaches `config.ts` before
`unit.test.ts` reads it. Three `welcome:` tests then fail with a `TypeError` in
`lib/welcome.ts:232`, which looks like a bug in the welcome code.

CI works around this with `--ignore=test/tenancy.test.ts`. That is a workaround,
not isolation: any new file that sets an environment variable before `config.ts`
is imported will break its neighbours the same way. Separately,
`welcome.ts:232` does not survive an unknown brand — `LOCAL_BRAND_NAMES[B.key]`
throws when `B` is undefined.

### E3. `deno lint` is not run in CI — confirmed by running it

Three problems: `mailer.ts:253` (C5), `v1.ts:14` (dead import), and
`smtp.ts:28` (`no-control-regex`, a false positive here — the character class is
deliberate).

### E4. Tests that cannot fail — confirmed by reading

| Location | Why it is decorative |
|---|---|
| `test/prune_objects.test.ts:31` | `assert(collection.because.length > 20)` passes for any sentence over twenty characters and ties the retention period to nothing |
| `test/prune_objects.test.ts:7-27` | A mirror of the `COLLECTIONS` constant. The comment promises the periods the policy states, but no document is read — change the number in both places and both stay green while the document lies |
| `test/statement_of_reasons.test.ts:28` | Differs from its neighbour only by the ignored argument (C5), on data the production path never produces |
| `test/statement_of_reasons.test.ts:75` | `assert(!html.startsWith("<p>"))` is true of any letter beginning with anything else |
| `test/statement_of_reasons.test.ts:144,161` | `const { config } = await import(...)` — `config` is already imported statically at `:13`; a dead line shadowing the outer name |
| `test/log_sink.test.ts:8` | An exact mirror of a three-line function |
| `test/imports.test.ts:34` | The guard is evaded three ways: `source.match()` without the `g` flag looks only at the first `storage.ts` import in a file; `.trim().split(/\s+/).pop()` on `put as write` yields `write`, which is not in `DATA_FUNCTIONS`, so an aliased import passes straight through; `import * as storage` and `await import()` are not covered at all |

For balance, the real ones: `test/log_reader.test.ts` (edge cases of
`bucketize`), `test/rate_limit.test.ts` (the arithmetic was traced; it would
fail), `test/report_never_refused.test.ts`, `test/tenancy.test.ts`,
`test/dsa_snapshot_columns.test.ts` (it reads the specification rather than a
copy of it), and `test/database.test.ts:616-627`.

One caveat on the last: `dsa_snapshot_columns.test.ts` reads only the `_EN`
files, so it cannot catch a divergence between the Russian and English versions
of those blocks.

### E5. `deploy-uat.yml` is idempotent in one repository out of three — confirmed

`sosed.place/.github/workflows/deploy-uat.yml:32-35` guards against an existing
tag; `neighbro.place/...:32-33` and `xor.ad/...:40-41` do not. The tag is
determined by date and sha, so any re-run on the same day fails with
`fatal: tag already exists`, the `release` job goes red, and everything depending
on it is skipped. A re-run of UAT can therefore never repair a failed deploy in
two repositories out of three.

### E6. `wizard.py:543` migrates with `check=False` — confirmed

The next line unconditionally runs `docker compose pull && up -d`. A new
environment's database is not created on an already-running box:
`init-databases.sql` (`wizard.py:508-512`) is executed by the Postgres image only
when an empty volume is initialised. The migration fails with
`database "relay_staging" does not exist`, `check=False` swallows it, the node
comes up, and `_verify_health` answers `ok ✓` — because `lib/db.ts:25-27` treats
the database as optional. Green deploy, environment without a schema, discovered
on the first attempt to mint a key.

### E7. There is no way to roll the policy back — confirmed

`grep -rn "edgerules"` gives four hits, all `addOrUpdate`. No rule `DELETE`, no
way to set `"Enabled": false` (`apply-edge-headers.py:63` hardcodes `True`), and
no "deploy without the policy" flag.

Rolling back by code works: deploying an older tag recomputes the headers from
the older `dist` and overwrites the same rule. But if the policy is broken in
every version — a defect in the builder rather than in the markup — the only path
is to disable the rule by hand in the Bunny interface, and the next deploy
recreates it. The workaround of removing `BUNNY_API_KEY` also breaks the purge
(A3).

---

## Checked and found sound

This section is worth as much as the list above: it removes alarms rather than
adding them.

**The node.** There is no SQL injection: the two interpolations are
`dsa_snapshot.ts:85` (`columns`/`table` from a constant selected by a `kind`
validated against `KINDS`) and `dsa.ts:70` (literal conditions assembled beside
their own `$n`), and values are always bound; a table or column name never comes
from the caller. No insecure direct object access was found anywhere except B6:
`dsa.ts:130-132`, `admin.ts:139-141,616,633`, `visible()` at `:650,757,804,844`
and the prefixes in `scoped_storage.ts:21-32` were all checked, and a `brand` in
the body is ignored — `admin.ts:474-478` and `:573-577` overwrite it from the
session. Error responses do not leak: the catch-all at `main.ts:73-76` returns
`{ error: "internal" }`, SQL text goes to the log but not to the response, and an
unknown, revoked or malformed key all answer alike; membership is not disclosed.
There is no log injection — `lib/log.ts` uses `JSON.stringify` over a fixed field
set, and no key, authorisation header or request body is ever logged. JWT
algorithm confusion is impossible: `jwt.ts:44-54` never reads the JOSE header and
verifies with an unconditional HMAC-SHA256, and `authed` fails closed on an empty
secret.

**Secrets.** None are in git in any of the three repositories, and none ever
were: a pickaxe search over `ghp_`, `re_`, `AKIA`, JWT and Bunny UUID shapes
returns nothing in tracked files. Seven commits containing `eyJ…` are public
Supabase demo tokens (`"iss": "supabase-demo"`) from Supabase's own
documentation, removed along with Supabase in `2a6be03`. No history rewrite is
needed. Build artefacts carry no secrets: the panel reads only
`VITE_RELAY_API_URL` and `import.meta.env.DEV`, and the storefronts' `config.js`
holds the API address, the deliberately public key, the analytics id and the
legal revision. The workflows are clean — no `set -x`, no echoed secret, no write
into `$GITHUB_ENV`.

**The panel's strict policy is achievable.** `panel/dist/index.html` has zero
`<style>` elements and zero `style` attributes; `panel/src` has zero
`dangerouslySetInnerHTML` and zero `innerHTML`. The only runtime use of styles is
`log-explorer/index.tsx:351`, `style={{ height: … }}`, which React applies
through the CSSOM — which CSP does not govern. The single `createElement("style")`
in the bundle is React 19's internal path for `<style precedence>` and the
application never reaches it. `@refinedev/devtools` is tree-shaken away
(`App.tsx:214`), and `eval`, `new Function` and `WebAssembly` do not appear at
all.

Hence a correction to the comment at `panel-security-headers.mjs:76-81`: a strict
`style-src` catches `<style>` and `style=` in markup, but does not protect
against styles a script applies through the CSSOM.

**The regular expressions fail in the right direction.** All four patterns were
run over the real pages: `panel/dist/index.html` — 1 of 1 inline scripts (the
external one with `src=` correctly excluded); `neighbro/index.html` — 4 of 4
(`type="application/ld+json"` correctly skipped); the remaining pages likewise
with no misses. There are no misses today and, more importantly, a miss fails
closed: a skipped script gets no hash, the browser blocks it, the page is dead
and visibly so. The opposite direction — an extra hash — only ever permits a
fixed first-party string, from which no injection follows.

Future breaking points, all fail-closed: `type='module'` in single quotes (safe —
the script is hashed anyway), `type="importmap"` (dropped and then blocked, since
import maps obey `script-src`), `</script >` with a space (welds two blocks into
one hash), `style='…'` without double quotes, and a `<script>` inside an HTML
comment. Deliberately outside the policy: `onclick` and friends would need
`'unsafe-hashes'` in `script-src`, which is absent, so they silently do nothing;
`javascript:` URLs are blocked; `<base>` is bounded by `base-uri 'self'`; a
`srcdoc` iframe inherits the parent policy; workers and `blob:`/`data:` scripts
fall under `default-src 'self'`; `wasm-unsafe-eval` is not needed.

**The deploy ordering is correct.** Upload → policy → purge is the same in all
three scripts, and the stated reason — that the policy is applied before the
purge so the first request after it already gets the policy matching those
bytes — is true. `HEADERS_JSON="$(…)"` under `set -e` behaves as intended: it is
a plain assignment with no prefix, so the substitution's status propagates and
`process.exit(1)` on an empty `VITE_RELAY_API_URL` really does kill the deploy.
Secrets reach the steps that need them; no variable referenced by a script is
left unpassed by its workflow. Nothing deploys from a day branch.

**Migrations.** All eight files are self-contained: literal table and column
names, no reference to an application constant. Re-application is safe —
`IF NOT EXISTS` throughout, `DROP CONSTRAINT IF EXISTS` before every `ADD`, and
the data migration in `006` is idempotent by construction. The dependency order
is correct. CI (`relay.yml:106-108`) brings up a clean `postgres:16-alpine` and
runs `tools/migrate_db.ts` — the same tool the wizard uses.

**The Russian and English specifications do not diverge on any fact a programmer
would act on.** This was not eyeballed: every code block was extracted from
`chat_RU.md` and `chat_EN.md` and compared, and the differences are confined to
the language of the comments. Numeric constants were checked point by point and
agree: 256 characters, 20 minutes / 1 hour / 4:20, the ±5 minute signature
window, the age bands, the limits, 10 km, 1.5 GB, 8 KB. The offer constant tables
are identical, the DSA entities match, and the §8.2 edit landed identically in
both.

**Sanctioned despite looking suspicious:** `client_type: native` and the removal
of the daily quota for a native key (`db/008`, `tenant.ts:102-108`) are described
in `docs/depth-client_EN.md:163,168`. The `/report` limits — 10 per hour and 40
per day (`rate_limit.ts:165-168`) — match the specification literally. The quota
is neither checked nor spent on `/report`, exactly as the specification requires.

---

## What was left unverified

* **Nothing was exercised live.** No policy was opened in a browser, the Bunny
  API was not queried, no node was touched. For the panel this matters: the
  strict `style-src` is judged achievable by reading the code, not by observing
  it.
* `test/database.test.ts` — 848 lines never ran; a live Postgres is required. For
  C1 that means a conclusion drawn from the schema rather than an observed
  failure.
* `apply-edge-headers.py` has never run against the Bunny API. The claims in its
  docstring (`ActionType 5`, `ExtraActions`) match the inline version in
  `deploy-landing.sh`, which has worked in production.
* `landing/security-headers.mjs` was not run against a staged directory — there
  is no staged directory.
* `neighbro.place/prototype/` was compared against its specification only in
  places.
* The value of `VITE_RELAY_API_URL` in the secrets was never compared with what
  ends up in the policy — the A8 check used a value supplied by hand.
