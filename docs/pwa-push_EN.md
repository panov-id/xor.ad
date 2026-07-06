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
- A VAPID key pair (public/private). Public key ships to the frontend (in `config.js`); private key is an Edge Function secret.

### Subscribe flow (on waitlist submit)
1. The form writes the email to `waitlist` as it does now.
2. On success: `Notification.requestPermission()`.
3. If granted: `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <VAPID public> })`.
4. Store the subscription (endpoint + keys) in a `push_subscriptions` table (via the same `api.*` proxy, anon insert by RLS).

### Sending
- Edge Function `send-push`:
  - **immediate** — right after subscribing, sends "you're on the list" to that one endpoint;
  - **broadcast** — to all of a face's subscriptions (at launch), triggered from an admin-panel button.
  - Uses the web-push library with the VAPID private key; prunes dead subscriptions (410/404).

### Service worker handling
- `self.addEventListener('push', ...)` → `showNotification(title, { body, icon, data:{url} })`.
- `self.addEventListener('notificationclick', ...)` → open/focus the PWA at `start_url` (the "soon" screen).

## Data (migration)

```
push_subscriptions:
  id uuid pk
  endpoint text unique
  p256dh text, auth text        -- subscription keys
  source text                    -- sosed.place / neighbro.place
  created_at timestamptz
  RLS: anon insert only (like waitlist); read/broadcast via service_role in the Edge Function
```

## Limitations (important)

- **iOS Safari**: Web Push only works if the PWA is **added to the home screen** (A2HS). In a normal Safari tab pushes won't arrive — show an "add to home screen" hint.
- **Permission** is requested only after an explicit action (waitlist submit), never on load.
- **Realtime is not involved here** — push is a separate mechanic (Supabase sockets are for the app feed later).

## Open questions

- Push copy (immediate/broadcast) in 6 languages (reuse the landing i18n).
- Whether to link a subscription to the email (dedupe), or keep it anonymous.
- Admin-panel broadcast button: confirmation + sent count.
- VAPID keys: one pair per face or shared.
