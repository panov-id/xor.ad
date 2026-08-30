# xor.ad

xor.ad is the brand-neutral gateway that sits in front of everything. All frontends — sosed.place, neighbro.place, and any future faces — talk to one shared backend through it. The name is deliberate: XOR ("one or the other") reflects the routing role, while staying detached from any single brand so the core can outlive any rebrand.

## What this actually is

A place for talking to the people around you, right now, and then letting it go. No permanent profile, no feed you scroll back through for years, no follower count. You post something, people nearby see it, maybe you end up chatting — and a few hours later it's gone. Ephemeral by design, not by limitation.

## The faces

- **sosed.place** — one face, with its own name, tone and visual identity.
- **neighbro.place** — the other face: a different look over the same platform.
- **xor.ad** — the platform underneath both. One backend, one database, one shared pool of users and feed — sosed.place and neighbro.place are different skins over the same data, not isolated audiences. Moderation is one policy for every face. New faces for new audiences plug into the same gateway.

## The alpha experience

1. **Open the app.** A name animation plays alongside a small live infographic — real numbers off the platform (people online nearby, messages in the last hour, that kind of pulse-check).
2. **Location.** The app can detect your position; you can also set it yourself. A map lets you drag a slider to pick the radius you care about.
3. **Register.** You can pick a free-form display name — optional, no real-name requirement — and enter your birth year, then hit enter. No email, no password. Behind the scenes the browser creates a key pair and the server mints an identity identifier; no browser fingerprint is taken. The identity lives in this browser: a different browser or a private window is a fresh identity. A second device can be connected on purpose by scanning a code from the first, and disconnected at any time; without a live device there is no recovery. Your birth year also drives an age filter on the feed: a slider lets you widen or narrow the age range of neighbors you see. If you're 18 or older, the slider moves smoothly across any range, but people under 18 are never shown to you, no matter how you set it. If you're under 18, the slider is available too, but its maximum stays narrow — never wide enough to bring adults into view.
4. **The feed.** Short messages from people nearby, newest at the bottom like a chat, not a stacked timeline. The AI detects each message's language; by default about 95% of what you see is in your own language and 5% is in other languages spoken in your region — both shares configurable via environment variable. Styled to feel alive and a little playful — closer to Pure than to a corporate wall of posts.
5. **Post something.** Tap "add," write up to 128 characters, optionally add your city/country and how many of you there are, hit send. Sending a post runs through an IP rate limit on the node itself, on top of the content check described in Moderation. Everyone starts with a quota of 5 posts; if people report you, that quota drops.
6. **It disappears.** Messages live for 4 hours 20 minutes by default, then they're gone. The lifetime is configurable, not hardcoded.
7. **Likes → chat.** Like something in the feed. If someone likes one of yours back, you're offered a private chat with them.
8. **Chat.** Short back-and-forth messages. The history of that conversation exists only between the two of you — nowhere else.
9. **Support.** A support button is always reachable from the app. A message sent through it lands in the backend store, and a notification (email/webhook) fires so the team knows a new ticket came in — there's no automated handling beyond that.
10. **Optional: share a social link.** You can attach any freeform handle or link (Telegram, Instagram, whatever) from your account and choose to share it — as a way to keep the connection alive past the chat, and as a light trust signal ("this is a real person"). Nothing is validated or restricted to a fixed platform list, and sharing it is a per-instance choice you make each time, not a default-on setting. Tapping a shared link shows a warning first — you're about to leave sosed.place / neighbro.place for an external site — before it opens.

## Design

Black and white, high contrast, on purpose. Users can dial the contrast up or down themselves, and switch between light and dark themes. No decoration for decoration's sake — leaning into a neo-brutalist direction (hard borders, sharp corners, un-blurred shadows), with one accent color per face over the monochrome base: red for sosed.place, warm gold/bronze for neighbro.place. See [`docs/design-system_EN.md`](./docs/design-system_EN.md) for the reasoning and sources.

## Privacy

Sensitive data lives on the device, not on the server. Concretely: chat history is stored in the browser's IndexedDB, encrypted client-side with the Web Crypto API before it's written — there's no magic "secure" browser storage, so the app does its own encryption rather than relying on one. What reaches the backend is kept to a minimum: enough to route messages and enforce limits, nothing more. Chat history exists only for the two people in that conversation. The conversation itself is encrypted **on the devices**: the key is derived by the two of them from ephemeral keys belonging to that one chat and never reaches the server, which carries ciphertext it cannot read. When the chat dies, so does the key. There is no browser fingerprint: it did not survive the move behind the delivery network, and it hit neighbours sharing a router anyway. The quota and the feed are defended by a per-address rate limit and by checking a message before it is published.

## Moderation

Every feed message is checked **on our own node** before it is allowed to go out, and the text never leaves that node. Private chats are not checked at all; a message that fails the check is not published, and its author is told so — a message swallowed in silence leaves someone talking to nobody. On top of that, everyone starts with a quota of 5 posts; if other users report or block you, that quota drops.

The AI also reads for tone beyond toxicity: it rejects harassment, drug-related content, sexual content, and sex-work solicitation outright. It does not classify what a message is about, and it does not label who its author is — no topic and no group is a signal here. The threshold is set on explicit content rather than innuendo, because in a hard-reject design a false positive costs someone an ordinary message. The general bar: content should stay within the norms of a calm, peaceful society.

- **Harassment, drugs, sex services, sexual content.** Rejected outright — these messages are never published or sent, in the feed or in chat.
- **No opt-in, and nothing collected for one.** There is no consent screen and no setting that turns sexual content back on, so no email address is stored to gate it. This is a service for neighbours, not a dating app.

## Architecture (alpha)

- **Frontend:** React, browser-based web app — no native app for the alpha.
- **Backend:** the **relay node pool** — identical Deno nodes behind Caddy (Let's Encrypt TLS), brand-agnostic, serving every face. Today it runs the landing/panel routes (`/waitlist`, `/client-error`, panel control plane) with data in Bunny Storage and email via Resend (one account per brand); the alpha app grows on the same pool. See [`relay/ARCHITECTURE_EN.md`](./relay/ARCHITECTURE_EN.md).
- **Gateway:** xor.ad is the shared custom domain every frontend talks to — per env the forms hit a relay node directly (`n1-dev`/`n1-staging` private, `api.relay.panov.id` public geo record for prod).
- **Language detection:** a local language-detection library runs inside the relay nodes — no external API call, no per-message cost.
- **Content moderation:** classifiers run inside the relay nodes, with no external service — neither Perspective nor a third-party language model; per message for tone classification, which decides whether the message goes out at all — see Moderation above.
- **Anti-abuse on posting:** IP rate limiting and quotas on the node itself — the API does not pass through the CDN, so that is the only place it can be defended; there is no external captcha, and we are not taking on a second processor for one — both scoped to the feed post action, not chat.
- **Client-side storage:** chat history is kept in the browser's IndexedDB, encrypted with the Web Crypto API before being written.
- **Local development:** everything runs in Docker. The relay node runs locally via [`relay/local`](./relay/local) (`docker compose up --build`): storage is a mounted dir, mail goes to Mailpit — nothing leaves your machine. Landing and panel test suites run via the `docker-compose.*-tests.yml` files, both against that stand. The landing suite also needs the gateway (`docker-compose.gateway.yml`), which serves both faces by hostname and proxies their API calls to the node. The vendored Supabase stack is gone — Supabase was decommissioned on 2026-07-22 and its last leftovers removed on 2026-07-29.
- **Deployment:** frontend served via Bunny CDN; backend is the relay node pool on Hetzner (build-once images promoted dev → staging → prod, deployed via `relay/wizard`).
- **Configuration:** every tunable — message character limit, starting post quota, message lifetime, default radius, and so on — is driven by environment variables, so behavior can be adjusted per deployment without touching code.

## Related repositories

The frontend repos for the two faces live next to this one and are symlinked in for quick access:

- [`sosed.place`](./sosed.place)
- [`neighbro.place`](./neighbro.place)

## Legal

Terms of Service, a Privacy Policy, and Community Guidelines exist for each face — kept short and simple rather than exhaustive legal boilerplate. They live in each frontend repo and are reachable from the app; content mirrors the rules already described in this README (Moderation, Privacy) rather than inventing separate rules.

## Admin panel

A separate admin/moderation panel gives the team visibility into reports, bans, and quotas across both faces — it's the operational surface for the shared backend behind xor.ad. See [`docs/panel_EN.md`](./docs/panel_EN.md) for details.

## Beyond the alpha

The core idea stays ephemeral — this isn't meant to become another permanent-profile social network. What grows from here: more faces for more regions and languages, richer in-chat experience, native apps once the web alpha proves the concept works, and decorative stickers **in a conversation and at a table** (a fixed catalog managed from the admin panel; every sticker carries a name — the terminal prints it and a screen reader reads it). There are no payments inside the Service and none are planned: no balance, no internal currency, no credits — stickers are free. The only form of advertising is **neighbourhood offers**: a post by a local business that must carry a discount, published free of charge, with the platform taking no money and no barter (the mechanic lives in [`docs/offers/`](./docs/offers/)). Images and links are possible only in offers; regular messages stay text-only. Infrastructure costs are covered by voluntary donations. Details still open.

## Support

The Service takes no money: offers are published free of charge and there is no internal balance. Voluntary donations cover the infrastructure.

[![PayPal](https://img.shields.io/badge/PayPal-donate-00457C?logo=paypal&logoColor=white)](https://www.paypal.com/donate/?hosted_button_id=5SMKMYYWFHMJC)
