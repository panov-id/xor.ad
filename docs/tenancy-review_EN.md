# Relay tenancy review (2026-07-26)

A review of the uncommitted multi-tenancy work: `scoped_storage`, `tenant`,
`api_key`, `brand_registry`, the changes to `routes/admin.ts`, `waitlist.ts`,
`client_error.ts`, and the panel. Ordered by severity, not by file.

**Status as of 2026-07-26:** items 1–8 and 11 are closed within the same
uncommitted change set; 9 and 10 remain arguments for the state-store decision
and need no code. Verified with `run-relay-tests.sh` (30 + 7 tests),
`typecheck-panel.sh`, and the local stand — the three-pass migration, the keys,
the server logs, and the new `verify-unattributed-local.sh`.

Overall: the tenant boundary lives in one layer, and the rule that nothing
bypasses it is held by a test (`test/imports.test.ts`) rather than by convention.
The migration is split into three passes, each safe to repeat. What follows is
what should be closed before the commit.

---

## 🔴 1. The audit trail leaks across tenants

`tenant_admin` holds `logs.audit.read`, and the route serves the whole
platform-wide journal unfiltered — the comment promises a filter, the code has
none:

```ts
// routes/admin.ts — before
const page = await readLogPage<Record<string, unknown>>(
  scopedForBrand(null), // one platform-wide trail, filtered per reader  ← the promise
  auditDir(), window, HISTOGRAM_BUCKETS,
);
```

Tenant `alpha` reads who `beta` invited into the panel, and when.
`test/tenancy.test.ts` does not cover this route at all.

**Fix.** Filter inside `readLogPage`, not after it: filtering outside would leave
`total`, `matched` and the histogram describing the full collection — the counts
would keep reporting someone else's activity.

```ts
// routes/admin.ts — after
const page = await readLogPage<Record<string, unknown>>(
  scopedForBrand(null),
  auditDir(),
  window,
  HISTOGRAM_BUCKETS,
  // A tenant reads its own slice of the shared trail; the platform reads all.
  access.user.brand === null
    ? undefined
    : (record) => record.actor_brand === access.user.brand,
);
```

The cost: a filtered read must read objects (whether a record belongs is only
visible inside it), so it takes its own path with a scan cap.

---

## 🟠 2. The window between deploy and `--apply`: duplicate welcome emails

Dedup looks for the key inside the tenant, while pre-migration records sit in the
root:

```ts
// routes/waitlist.ts
const store = scopedForBrand(brand.key);
const key = `waitlist/${config.envName}/${await sha256hex(email)}.json`;
if (await store.exists(key)) { … }   // tenants/sosed/waitlist/… — empty until the migration
```

Between the deploy and `migrate_tenants --apply`, anyone who already signed up
and submits the form again gets a second welcome email and a second record.

**Fix** — a transitional fallback behind the same flag as keyless requests:

```ts
// Transitional: a lead written before the migration still lives in the root.
const seenBefore = await store.exists(key) ||
  (!config.requireApiKey && await scopedForBrand(null).exists(key));
```

---

## 🟠 3. A public route writes a storage object per keyless request

`log("warn", …)` in `tenant.ts` is copied into storage (`lib/log.ts` persists
warn/error). While `REQUIRE_API_KEY` is off, any bot hitting `/client-error`
creates an object per request: storage cost, plus a server-log page buried under
identical lines.

**Fix** — log the transition, not the request: one line per (brand, origin) per
hour, the rest a counter.

---

## 🟡 4. Key lookup is a storage round-trip per public request

`findPublishableKey` always reads the object. An invalid key means a read miss
per attempt, so probing is paid for in storage traffic. Keys are immutable apart
from revocation, which invites the same TTL the brand registry uses, negative
results included. The price: revocation lands within a minute.

---

## 🟡 5. A brand key becomes a path segment unchecked

```ts
const at = brand ? `tenants/${brand}/` : "";   // scoped_storage.ts
```

Today keys come from env and from our own hands. Section 0 of `api-platform_*`
promises self-service tenant registration — on that day `key: "../.."` becomes a
door into someone else's data. Closed by validating the key's shape at registry
ingestion:

```ts
const BRAND_KEY = /^[a-z0-9][a-z0-9-]{1,31}$/;
```

---

## 🟡 6. `/client-error` argues with the logger

The route is built on "never argue with a logger" (`if (!body) return json({ ok:
true })`), yet it now returns 401/403 on a bad key. A landing with a stale key
stops reporting errors and cannot report that fact — the channel for saying so is
this route.

**Fix.** Answer `200 { ok: true }` and file the unattributed record under the
platform's `client-errors/unattributed/<env>/`: whose key broke becomes visible
in the panel instead of as silence.

---

## Smaller

7. **`brand` in the JWT** — moving an operator to another brand only takes effect
   on the next token. The right trade-off, but it should be written down.
8. **`GET /admin/brands` is called by `LogExplorer` for everyone** — for a tenant
   that is a routine 403 on every log page. Decide by `identity.brand` instead.
9. **`/admin/waitlist` for the platform** — a fan-out across every brand plus the
   root, with a `list` and a `get` per record. One more argument for moving state
   (open question 1 in `api-platform_*`).
10. **The `resolveBrand` fallback returns `config.brands[0]`** — an unknown host
    silently becomes sosed. An argument for turning `REQUIRE_API_KEY` on early.

---

## 🟠 11. `migrate_tenants --delete` deleted while reporting "nothing was written"

Found by running the stand, not by reading: `--delete` without `--apply` does
remove the originals (that is the third pass, by design), yet it prints
`== summary (plan only, deleting)` and closes with
`nothing was written — re-run with --apply`. The very run that removed data
reports having touched none.

```ts
// before
console.log(`\n== summary (${apply ? "applied" : "plan only"}${remove ? ", deleting" : ""})`);
if (!apply) console.log("\nnothing was written — re-run with --apply");

// after
const pass = remove ? (apply ? "applied, deleting" : "deleting") : apply ? "applied" : "plan only";
console.log(`\n== summary (${pass})`);
if (!apply && !remove) console.log("\nnothing was written — re-run with --apply");
if (!apply && remove) {
  console.log("\ncopies were not made in this run; originals with a copy were removed");
}
```

The deletion itself is safe — an original goes only after its copy reads back —
the wording was not.

---

## Order of work

Close 1–3 before the commit: that is behaviour, not refactoring. 4–6 fit in the
same commit; they are small. Then `scripts/run-relay-tests.sh` and the local
verifications, and only then commit.

Separately: open question 1 (where state moves) is effectively answered by the
code itself — TTL caches, a `list` per request, no atomic counter for quotas, no
filterable journal. Going further without a database costs more than moving now,
while the data is small.
