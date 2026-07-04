# Panel — Admin/Moderation Panel for xor.ad

## Purpose

An internal interface for the team: visibility into and control over reports, bans, and user quotas across both faces (sosed.place, neighbro.place). This is the operational surface of the shared backend, separate from the user-facing frontends.

## Functions

- View reports on messages and users.
- Ban a user (by UID).
- View and manually adjust a user's posting quota.
- View support tickets (see the "Support" step in the README) — tickets from Supabase with an email/webhook notification.

## Logic

- The panel runs on top of the shared backend (Supabase) — the same data the frontends see, but with moderator/admin permissions.
- One backend, one panel for both faces, with a per-face filter (sosed.place/neighbro.place) where needed (e.g., for the differing LGBT-content policy — see the Moderation section in the README).

## Open questions

- The panel's own technology/framework is not defined yet.
- The access role model (who exactly can ban/adjust quotas) is not defined yet.
- How the team authenticates into the panel (a separate login, Supabase Auth with roles) is not defined yet.
