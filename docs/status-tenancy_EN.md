# Tenancy: what is done and where we stand

A snapshot as of 2026-07-27, covering three repositories: `xor.ad` (relay +
panel), `sosed.place` and `neighbro.place` (landings).

## The short answer

Multi-tenancy is written, reviewed and **fully deployed to dev** — the node, the
keys, both landings. Uat and prod are not ready for it: they run `v0.3.2` nodes
without tenancy, and deploying the landings there would break the signup form.
Data written before tenancy has not been migrated in any real environment.

## What was done

### Relay

The brand stopped being a label and became a data boundary:

- a public request's tenant is decided by its **key** (`x-api-key`), never by the
  body — `lib/tenant.ts`;
- every route reaches storage through a scope that cannot name another tenant's
  prefix — `lib/scoped_storage.ts`, with the rule held by
  `test/imports.test.ts`;
- the brand registry moved into storage (the `BRANDS` env stays as the seed), so
  onboarding a tenant is a write rather than a redeploy;
- `brand` now travels in the access subject, the operator record, the session
  claims and the audit entry; the `tenant_admin` role was added;
- the pre-tenancy layout is the platform's scope, so nothing disappears from the
  panel while the migration is pending;
- the audit trail stays one journal but is **filtered on read inside
  `readLogPage`**, together with its counts and histogram;
- keyless requests still work behind `REQUIRE_API_KEY` and are logged once per
  hour per (brand, origin) rather than once per request.

### Panel

The identity carries the brand: the header says whose operator this is, the
brand switcher appears only for the platform, and a tenant is not offered the
platform role the relay would refuse anyway. A server-log page was added, along
with an "unattributed" scope — error reports that arrived without a usable key.

### Tooling

`create_publishable_key.ts`, `migrate_tenants.ts` (three passes: plan →
`--apply` → `--delete`), and seven local `verify-*` scripts including the new
`verify-unattributed-local.sh`.

### Review

The whole change set was reviewed (`docs/tenancy-review_EN.md` / `_RU.md`):
11 findings, 9 closed in code. The ones that mattered:

1. **The audit trail leaked across tenants** — `tenant_admin` read the entire
   platform journal. Closed with a filter and two tests.
2. **Duplicate welcome emails** in the window between deploy and `--apply` —
   closed with a transitional dedup fallback into the root.
3. **`migrate_tenants --delete` deleted while printing "nothing was written"** —
   found by running the stand, then fixed.

### Deployment

| Item | State |
|---|---|
| `day15` → `main` | fast-forwarded in all three repos |
| Image `relay-node:sha-e090c2f` | built and signed |
| dev node (box n1) | rolled onto the new image |
| staging and prod nodes | **`v0.3.2`, no tenancy** |
| Landings on dev | deployed, keys present in `config.js` |
| Landings on uat/prod | not deployed |
| Six publishable keys | minted (sosed/neighbro × dev/staging/prod) |
| GitHub secrets | `RELAY_PUBLISHABLE_KEY` in every environment of both landings |

CI was fixed along the way: the relay workflow still ran `deno test --allow-env`
and type-checked `main.ts` alone, so **no image with tenancy had ever built**;
the integration test looked for the lead under the pre-tenancy path.

### Verified on the live dev stand

- preflight with `x-api-key` → `204`, header present in the allow-list;
- each landing's `config.js` serves its own brand's key;
- a signup with the sosed key and a body claiming neighbro landed in
  `tenants/sosed/`;
- the sosed key used from neighbro's site → **403** (Origin allowlist);
- signups from both landings went to their own tenants.

## Where we stand

Ready for the next step, with three things outstanding.

1. **Pre-tenancy data is unmigrated in every real environment.** Dev has seven
   waitlist objects in the root. The platform sees them, a tenant does not. While
   `REQUIRE_API_KEY` is off the dedup also looks in the root, so no duplicate
   emails go out; that fallback disappears with the flag, so the migration must
   happen **before** it.
2. **Uat and prod run nodes without tenancy.** The order is not optional: node
   first, landing second. The reverse breaks the form at the preflight, because
   an old node does not allow `x-api-key`.
3. **`REQUIRE_API_KEY` is off everywhere** — a keyless request is still assigned
   a brand by host, and an unknown host becomes the first brand in the list.

Smaller items of the same kind: `inventory.toml` is gitignored, so dev's raised
image tag lives only on the machine that rolled it; the UAT panel deploy did not
fire from the merge into `main`, so the panel there is the old build.

## What is next

1. Run `migrate_tenants` on dev: plan → `--apply` → check the panel →
   `--delete`.
2. Roll the staging node (box n1, that environment's tag), then deploy the
   landings to uat.
3. The same for prod, as a separate decision, with `--confirm-prod`.
4. Turn `REQUIRE_API_KEY=true` on per environment, guided by the
   `relay_keyless_requests_total` counter and the server logs.
5. From the review's deferred list: the panel pages for keys and brands (the
   permissions exist, the UI does not), self-service tenant registration, and
   quotas — the last two wait on the open question of moving state out of object
   storage into a database.
