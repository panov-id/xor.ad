# Spec: the storefront PWA shell (Web Push cancelled)

> **Note: describes the previous stack.** Supabase is no longer used — not its
> Postgres, not its Auth, not its Edge Functions. Today: a pool of our own VPS
> nodes, magic-link sign-in (a signed session issued by the relay itself), data in
> Bunny Storage, control state in a Postgres beside the node.
> Current: `relay/ARCHITECTURE_EN.md`, `state-decision_EN.md`, `open-work_EN.md`.

## Status

This document described two unrelated things, and their fates differ:

| Part | State |
|---|---|
| **The PWA shell** — manifest, the cache in `sw.js`, `version.json`, icons | built and working, described below |
| **Web Push** — VAPID, subscriptions, broadcast | **cancelled 2026-08-07**, not to be implemented |

## Why Web Push was cancelled

The reason is the one recorded in the chat spec (`chat_EN.md` §8.12), and the
decision is taken **for the whole platform** — the application, the storefronts
and the terminal client. What is recorded here is only its consequence for the
storefronts.

Briefly: a push is impossible without an intermediary — a service worker plus
somebody else's delivery service (Google, Mozilla, Apple). Even when the payload
is opaque, that intermediary receives a durable subscription identifier tied to a
person's browser, and the **rhythm** — when exactly something reaches them and
how often. A product whose own server does not keep the correspondence cannot
hand its metadata to a third party for convenience.

Worth saying separately: **the transport described here died before the decision
did.** The broadcast was built on Supabase Edge Functions, and Supabase is out of
the project (see the note above). What is being cancelled is a plan, not a
working mechanism.

## What replaces the launch call

The pushes had exactly one benefit visible to a person: telling those who left a
request that we have opened. It is replaced without loss, because the
replacement is already built:

```
was:    waitlist → push subscription → "we're live" broadcast
                                       through somebody else's push service

now:    waitlist → email (Resend, DKIM verified on panov.id) →
                                       a "we're live" letter
```

The email already works, is already described in the Article 30 register and in
the sub-processor list, and — more to the point — **a person leaves it
themselves, deliberately**, unlike a subscription that attaches itself to a
browser silently, in one tap, and then lives at somebody else's service.

So the cancellation takes away no capability; it removes a second channel that
duplicated the first and cost more — in keys, a table, a sub-processor and a
dependency on Apple's and Google's policies.

## The PWA shell stays

It has nothing to do with pushes and carries on:

- `manifest.json` — name, icons, `display: standalone`, `start_url: /`, a theme
  per brand.
- `sw.js` — **cache only**: a versioned `<face>-<BUILD>`, `install` (precache +
  `skipWaiting`), `activate` (old caches cleared + `clients.claim`), `fetch`
  (stale-while-revalidate for GET only).
- Registration via `navigator.serviceWorker.register('./sw.js')` + a reload on
  `controllerchange`.
- The deploy injects `__BUILD__` (the git hash) into `sw.js` and writes
  `version.json` — the page polls it and offers to update.
- Icons 192/512 + maskable + svg.

The "soon" screen is the landing's current content (pitch, waitlist form, cases),
only installable.

There are **no** `push` or `notificationclick` handlers in `sw.js` — they have
been removed.

## Dropped from the plan

- A VAPID pair per storefront, the public key in the frontend, the private one in
  secrets.
- The `push_subscriptions` table and its RLS.
- The `send-push` function: `immediate` ("you're on the list") and `broadcast`
  ("we're live").
- The broadcast screen in the panel: message selection by key, a storefront
  filter, confirmation with the recipient count, a sent counter.
- Push texts in 15 languages and language selection by the subscription's `lang`.
- The "add to home screen" hint for iOS — it existed only because Web Push works
  there for an installed PWA alone.

## Removed from the code

- `neighbro.place/landing/index.html` — `subscribePush()`, the
  `CFG.vapidPublicKey` branch, the `[data-notify]` block.
- `sosed.place/landing/sw.js` and `neighbro.place/landing/sw.js` — the `push`
  listener and `showNotification`.
- `sosed.place/landing/config.js` and `neighbro.place/landing/config.js` — the
  `vapidPublicKey` field.

`sosed.place` had no subscription block in its landing at all — the storefronts
had diverged earlier, and that is tidied up along the way.

There were no live subscribers: `vapidPublicKey` was empty on both storefronts
(the button was hidden), no subscription endpoint ever appeared on the node, and
there is no such table in the node's schema. There was nothing to delete but
dormant code.

## Open

- Whether to keep `sw.js` at all, given that its only job is the offline cache.
  For now yes: it also carries the update mechanism through `version.json`.
- The "we're live" letter — text and languages. That used to be 15 push
  languages; the set is now decided by the languages of the emails, not of the
  subscriptions.
