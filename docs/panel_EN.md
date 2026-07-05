# Panel — Admin/Moderation Panel for xor.ad

## Purpose

An internal interface for the team: visibility into and control over the waitlist, reports, bans, and user quotas across both faces (sosed.place, neighbro.place). This is the operational surface of the shared backend, separate from the user-facing frontends. The panel is built to grow: the MVP covers the waitlist, authentication, reports/bans, and panel user management; quotas, support tickets, and the sticker catalog follow later.

## Sources (design)

- [Dashboard Design in 2026: Do's and Don'ts](https://think.design/blog/dashboard-design-in-2026-dos-and-donts/)
- [Top Admin Dashboard Design Ideas for 2026](https://www.fanruan.com/en/blog/top-admin-dashboard-design-ideas-inspiration)
- [60+ Best Dashboards, admin panels & analytics — Muzli](https://muz.li/inspiration/dashboard-inspiration/)

Key takeaways: minimalism and fewer metrics per screen, dark theme by default, critical data top-left, unified card/table styling, status is never encoded by color alone (pair with an icon/label), mobile-first.

## Stack

- **[Refine](https://refine.dev/)** — a React framework for admin panels: a ready-made data provider and auth provider for Supabase, a growing plugin ecosystem — fits the fact that this panel will keep growing.
- **Supabase** — the same shared backend the app uses (Postgres + Auth + Realtime), no separate backend for the panel.
- Lives at `xor.ad/panel/` as a separate app within the gateway's repository.

## Authentication

Passwordless, but two different mechanisms for two different situations — deliberately not merged into one, because doing that for self-service login would be a security hole (see below):

- **Self-service sign-in** (an existing panel user) — a real **Supabase Auth Magic Link** by email: the link is emailed, and only whoever controls that inbox can use it. That's the only thing that actually proves "it's you" without a password. Requires a real SMTP provider — currently a placeholder in `.env`, no emails go out yet (see `scripts/setup-supabase.sh`).
- **Inviting a new user** — an admin calls the `invite-panel-user` Edge Function, which creates a link via the Admin API and returns it in the response; the admin copies it and sends it to the invitee through whatever channel they trust (Telegram, a DM, etc.).

Important: an earlier version of this had self-service login also just handing the link back in an HTTP response for whatever email was typed in — with no check that the requester actually controlled that email. That effectively disabled authentication entirely (anyone who knew someone's email could sign in as them). That Edge Function (`request-login-link`) was removed. It's fine for invites, because the admin is the trust anchor there and picks the delivery channel themselves; self-service login has no such anchor — only real delivery to an owned inbox works.

## Roles

- **admin** — full access, including adding new panel users (admin or moderator).
- **moderator** — restricted rights: can see the waitlist/reports/bans, but can't add new panel users.

The role is stored in Postgres (a panel users table) and enforced through Supabase RLS policies — i.e., access is restricted at the database level, not just in the UI.

## MVP screens

1. **Sign-in** — email field → magic link.
2. **Waitlist** — list of landing-page signups (email, source face, date). Both faces in one table.
3. **Reports and bans** — view reports on messages/users, ban by UID.
4. **Panel users** — list of admins/moderators, a form to invite a new panel user by email (admin-only).

Quotas, support tickets, and the sticker catalog are the next stage, not part of this MVP.

## Visual style

The same neo-brutalism as the landing pages (hard borders, sharp corners, un-blurred shadows, Unbounded for headings) — but the panel's own accent color is neutral, since it's shared by both faces. Red (sosed.place) and gold/bronze (neighbro.place) are used sparingly — as badges/stripes on data rows to visually distinguish a record's source — rather than as the interface's overall accent.

## Open questions

- The exact SMTP provider for the magic link is not chosen yet.
- The exact neutral accent color for the panel is not finalized.
- The UI for managing quotas, support tickets, and the sticker catalog is not designed yet — will be added as the panel grows.
