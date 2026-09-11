# Panel — Admin/Moderation Panel for xor.ad

> **Note: describes the previous stack.** Supabase is no longer used — not its
> Postgres, not its Auth, not its Edge Functions. Today: a pool of our own VPS
> nodes, magic-link sign-in (a signed session issued by the relay itself), data in
> Bunny Storage, control state in a Postgres beside the node.
> Current: `relay/ARCHITECTURE_EN.md`, `state-decision_EN.md`, `open-work_EN.md`.

## Purpose

An internal interface for the team: visibility into and control over the waitlist, Article 16 notices, and per-key quotas across both faces (sosed.place, neighbro.place). This is the operational surface of the shared backend, separate from the user-facing frontends. The panel is built to grow: the MVP covers the waitlist, authentication, Article 16 notices, per-key quotas and panel user management; support tickets and the sticker catalog follow later. **Bans are named nowhere in the code — no route, no column, no permission (2026-08-23); either they get built or they leave this line.**

## Sources (design)

- [Dashboard Design in 2026: Do's and Don'ts](https://think.design/blog/dashboard-design-in-2026-dos-and-donts/)
- [Top Admin Dashboard Design Ideas for 2026](https://www.fanruan.com/en/blog/top-admin-dashboard-design-ideas-inspiration)
- [60+ Best Dashboards, admin panels & analytics — Muzli](https://muz.li/inspiration/dashboard-inspiration/)

Key takeaways: minimalism and fewer metrics per screen, dark theme by default, critical data top-left, unified card/table styling, status is never encoded by color alone (pair with an icon/label), mobile-first.

## Stack

- **[Refine](https://refine.dev/)** — a React framework for admin panels. It came
  from the first version and has earned its place: the panel grew from four
  screens to nine.
- **Our own node (relay), not Supabase.** The panel talks to the same Deno node
  as the storefronts and uses its authorisation and its permissions
  (`relay/node/src/access/`). The panel has no backend of its own.
- Lives in `xor.ad/panel/` as a separate application inside the gateway
  repository.

**Supabase was removed from this document on 2026-08-10.** It left the stack back
in July, yet the spec kept describing its Auth, its Edge Functions and its RLS —
three mechanisms that do not exist in this codebase.

## Addresses

The panel is a `BrowserRouter` application served from a storage zone: an address
such as `/auth/callback?token=…`, where every magic-link points, has to exist as a
file. Bunny's `Custom404FilePath` does return the application for such a path, but
**under a 404** — measured on 2026-08-25 across all three environments, which means
monitoring sees a panel that is down, `fetch` with an `res.ok` check refuses, and
the browser is handed an error page that happens to contain an application.

So the deploy writes a copy of `index.html` at the path of every declared route
(`deploy/spa-route-files.py`, the list read out of `panel/src/App.tsx`): a declared
address answers **200**, while an undeclared one — a mistyped asset name, a route
that was removed — still answers **404**. `Rewrite404To200` is deliberately not
used: it would have made a 200 out of what genuinely is not there.

## Authorisation

Passwordless, magic-link, entirely on our own node
(`relay/node/src/lib/auth.ts`):

- **Signing in yourself** — a link to a confirmed address, alive for **15
  minutes**, extinguished on first use.
- **An invitation** — a link alive for **7 days**, also single-use, issued by
  whoever holds `panel_users.write`.
- **The session** — 7 days, in a cookie.

Half the secret stays in the requesting browser, so a letter that fell into the
wrong hands grants no entry by itself. The answer to a link request is always the
same — `204` — and never says whether such an address exists.

## Roles

Four, in a flat list with no inheritance — `relay/node/src/access/roles.ts` — and
that is the only place where "what may this role do" is written:

| Role | What it may do |
|---|---|
| `admin` | everything, including permissions added later (`*`) |
| `moderator` | waitlist, panel users (read), the client / audit / pageview logs — **but not the node's server logs** — **and Article 16 notices: read and decide** |
| `viewer` | the waitlist only |
| `tenant_admin` | everything inside their own brand: panel users, keys, logs. Deliberately not `*` |

Permissions are checked **in the node's code** (`lib/access_guard.ts`), not by
row-level protection in the database: there is no RLS anywhere in this codebase.
The permission dictionaries of the panel and the node match line for line, and a
test holds them there (`panel/src/access/access.test.ts`).

## Screens

| Screen | What it does |
|---|---|
| Sign-in | email → magic link |
| Waitlist | requests from both storefronts |
| Article 16 notices | the queue, examination, a decision with its reasons |
| Page views | our own counter, without IP or user agent |
| Brands | the registry of faces: name, sender, palette |
| Publishable keys | storefront keys and their allowed origins |
| Secret keys | server-side keys, **including the daily quota** |
| Logs | the panel audit log and client errors |
| Panel users | the list and the invitation |

**There is no moderation threshold in the panel either, and it is configurable —
found 2026-08-27.** The storefront mechanics declare the share and the floor of
the report threshold configurable ("5% of the audience, but not fewer than
three"), and the spec declares the model's operating point configurable too: it
is set by a false-block budget and lives as a node parameter (§8.14). Neither is
in the panel: a key's daily quota can be edited, moderation cannot. **Decided
2026-08-27: for now they are deploy-time constants** (`route-to-code_EN.md`,
decision 2). Building a screen for a number nothing can validate — there are no
live reports yet — is work done blind. The price is named: the threshold cannot
be turned on the day the feed goes wrong, that needs a release. The screen comes
back with the first live reports, and with it a permission and an audit entry:
who moved the threshold and when is a decision about other people's speech, and
it has to be visible.

**There is no bans screen, and no ban mechanism exists** — no route, no column.
An earlier version of this document promised "ban by UID"; what the product has
instead is hiding by complaints, blocking between people (`chat_EN.md` §8.9) and
the Article 16 decision.

## Visual style

A **hybrid**, as settled in `panel-refactor_EN.md`: a calm base for tables, brutalism in the accents. Hard 2px borders, un-blurred 4/4 shadows and Unbounded for headings — but a **6px radius**, not sharp corners, and not the landing pages' look (`panel/src/App.css`). The panel's own accent is neutral, since it is shared by both faces. A record's source is marked by a **neutral** badge: colour in the panel is spent on warnings and refusals, not on brands.

## Open questions

- ~~The exact neutral accent colour~~ — settled: `#3355dd` light / `#7d9bff` dark (`panel/src/App.css`), and it passes the contrast counter.
- The UI for support tickets and the sticker catalogue is not designed yet — it
  will be added as the panel grows.

Closed along the way: the mail sender is **Resend** (`docs/vendors-dpa_EN.md`),
and invitations go through it too; **the quota UI is built** — the daily quota is
edited on the secret keys screen.
