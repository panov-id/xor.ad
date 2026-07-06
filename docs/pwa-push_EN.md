# Spec: PWA shell + Web Push (waitlist → notification → "soon")

Status: spec. Code is a separate step.

## Idea

A face's landing (`sosed.place` / `neighbro.place`) is upgraded into a **PWA** with a single "soon" screen — the beginning of the app itself. A person leaves their email on the waitlist → opts into notifications → gets a **Web Push** "you're on the list" immediately, and a launch broadcast "we're live" later. The push opens the installed PWA on the "soon" screen.

## PWA shell (pattern from noisen)

Reuse `noisen-app`'s proven approach:

- `manifest.json` — name/icons/`display: standalone`/`start_url: /`, brand theme (Soviet for sosed, European for neighbro).
- `sw.js` — service worker with a versioned cache `<face>-<BUILD>`: `install` (precache + `skipWaiting`), `activate` (purge old caches + `clients.claim`), `fetch` (stale-while-revalidate, GET only).
- Registration: `navigator.serviceWorker.register('./sw.js')` + reload on `controllerchange`.
- The deploy injects `__BUILD__` (git hash) into `sw.js` and writes `version.json` — the page polls it and offers to update (like noisen's `deploy-cdn.sh`).
- Icons 192/512 + maskable + svg.

The "soon" screen, initially, is the current landing content (pitch + waitlist form + use cases), now PWA-installable.

## Web Push (we add this ourselves; noisen has none)

### Keys
- A VAPID pair **per face** (sosed and neighbro use different keys, revocable independently). The face's public key ships to the frontend (in `config.js`); the private key is an Edge Function secret (`VAPID_PRIVATE_SOSED` / `VAPID_PRIVATE_NEIGHBRO`).

### Subscribe flow (on waitlist submit)
1. The form writes the email to `waitlist` as it does now.
2. On success: `Notification.requestPermission()`.
3. If granted: `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <face VAPID public> })`.
4. Store the subscription in `push_subscriptions` (via the `api.*` proxy, anon insert by RLS). **Anonymous** — no email. Dedupe by the unique `endpoint`. Store `lang` = `navigator.language` (2 letters) to pick the push language.

### Sending
- Edge Function `send-push`:
  - **immediate** — right after subscribing, sends "you're on the list" to that endpoint, in the subscription's language;
  - **broadcast** — to subscriptions, triggered from the admin panel.
  - Uses web-push with the **matching face's** VAPID private key; prunes dead subscriptions (410/404).

### Broadcast (admin panel)
- The admin picks a **predefined message by key** (e.g. `launch`) — the system sends each recipient in **their language** automatically (from `lang`, fallback EN).
- **Face filter**: sosed / neighbro / both.
- Before sending, a confirmation with the recipient count; afterwards, a sent/failed counter.

### Push languages (15)
Ship the push copy (2 short strings per message) in 15 languages up front; the language comes from the subscription's `lang`, fallback EN. Set (Europe + CIS + big global):
`en, ru, es, fr, de, it, pt, pl, uk, nl, tr, el, ar, zh, ja`.
The landing UI stays at 6 languages — expanded separately.

### Service worker handling
- `self.addEventListener('push', ...)` → `showNotification(title, { body, icon, data:{url} })`.
- `self.addEventListener('notificationclick', ...)` → open/focus the PWA at `start_url` (the "soon" screen).

## Data (migration)

```
push_subscriptions:
  id uuid pk
  endpoint text unique           -- dedupe key
  p256dh text, auth text         -- subscription keys
  source text                    -- sosed.place / neighbro.place (for VAPID + filter)
  lang text                      -- navigator.language (2 letters), for push language
  created_at timestamptz
  RLS: anon insert only (like waitlist); read/broadcast via service_role in the Edge Function
```
No email in the table — the subscription is anonymous.

## Limitations (important)

- **iOS Safari**: Web Push only works if the PWA is **added to the home screen** (A2HS). In a normal Safari tab pushes won't arrive — show an "add to home screen" hint.
- **Permission** is requested only after an explicit action (waitlist submit), never on load.
- **Realtime is not involved here** — push is a separate mechanic (Supabase sockets are for the app feed later).

## Decided

- VAPID — a pair per face.
- Subscription is anonymous (dedupe by `endpoint`), store `lang`.
- 15 push languages, auto by `lang`, fallback EN.
- Broadcast: predefined message by key → localized to the subscription's language; face filter; confirmation + counter.

## To pin down at implementation

- The 2 message texts (`waitlist_confirmed`, `launch`) in 15 languages — write during coding.
- The iOS "add to home screen" hint — copy/appearance.
