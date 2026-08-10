# Panel — Admin/Moderation Panel for xor.ad

> **Note: describes the previous stack.** Supabase is no longer used — not its
> Postgres, not its Auth, not its Edge Functions. Today: a pool of our own VPS
> nodes, magic-link sign-in (a signed session issued by the relay itself), data in
> Bunny Storage, control state in a Postgres beside the node.
> Current: `relay/ARCHITECTURE_EN.md`, `state-decision_EN.md`, `open-work_EN.md`.

## Purpose

An internal interface for the team: visibility into and control over the waitlist, reports, bans, and user quotas across both faces (sosed.place, neighbro.place). This is the operational surface of the shared backend, separate from the user-facing frontends. The panel is built to grow: the MVP covers the waitlist, authentication, reports/bans, and panel user management; quotas, support tickets, and the sticker catalog follow later.

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
| `moderator` | waitlist, logs, **and Article 16 notices: read and decide** |
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

**There is no bans screen, and no ban mechanism exists** — no route, no column.
An earlier version of this document promised "ban by UID"; what the product has
instead is hiding by complaints, blocking between people (`chat_EN.md` §8.9) and
the Article 16 decision.

## Visual style

The same neo-brutalism as the landing pages (hard borders, sharp corners, un-blurred shadows, Unbounded for headings) — but the panel's own accent color is neutral, since it's shared by both faces. Red (sosed.place) and gold/bronze (neighbro.place) are used sparingly — as badges/stripes on data rows to visually distinguish a record's source — rather than as the interface's overall accent.

## Open questions

- The exact neutral accent colour for the panel is not finalised.
- The UI for support tickets and the sticker catalogue is not designed yet — it
  will be added as the panel grows.

Closed along the way: the mail sender is **Resend** (`docs/vendors-dpa_EN.md`),
and invitations go through it too; **the quota UI is built** — the daily quota is
edited on the secret keys screen.
