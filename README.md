# xor.ad

xor.ad is the brand-neutral gateway that sits in front of everything. All frontends — sosed.place, neighbro.place, and any future faces — talk to one shared backend through it. The name is deliberate: XOR ("one or the other") reflects the routing role, while staying detached from any single brand so the core can outlive any rebrand.

## What this actually is

A place for talking to the people around you, right now, and then letting it go. No permanent profile, no feed you scroll back through for years, no follower count. You post something, people nearby see it, maybe you end up chatting — and a few hours later it's gone. Ephemeral by design, not by limitation.

## The faces

- **sosed.place** — Russian-speaking audience, Soviet-flavored visual identity.
- **neighbro.place** — English-speaking audience, European-leaning tone and visuals.
- **xor.ad** — the platform underneath both. One backend, one database, one shared pool of users and feed — sosed.place and neighbro.place are different skins over the same data, not isolated audiences. Moderation policy can still differ per face where needed (see Moderation below). New faces for new audiences plug into the same gateway.

## The alpha experience

1. **Open the app.** A name animation plays alongside a small live infographic — real numbers off the platform (people online nearby, messages in the last hour, that kind of pulse-check).
2. **Location.** The app can detect your position; you can also set it yourself. A map lets you drag a slider to pick the radius you care about.
3. **Register.** You can pick a free-form display name — optional, no real-name requirement — and enter your birth year, then hit enter. No email, no password. Behind the scenes the server generates an encrypted random UID tied to your birth year, your name, and a few unique-enough browser fingerprint parameters — so it can still recognize you even if you wipe every cache. The registration is scoped to that specific browser: it's not a cross-device account, so a different browser or a private window is a fresh identity, and there's no recovery or sync between them. Your birth year also drives an age filter on the feed: a slider lets you widen or narrow the age range of neighbors you see. If you're 18 or older, the slider moves smoothly across any range, but people under 18 are never shown to you, no matter how you set it. If you're under 18, the slider is available too, but its maximum stays narrow — never wide enough to bring adults into view.
4. **The feed.** Short messages from people nearby, newest at the bottom like a chat, not a stacked timeline. The AI detects each message's language; by default about 95% of what you see is in your own language and 5% is in other languages spoken in your region — both shares configurable via environment variable. Styled to feel alive and a little playful — closer to Pure than to a corporate wall of posts.
5. **Post something.** Tap "add," write up to 128 characters, optionally add your city/country and how many of you there are, hit send. Sending a post runs through Cloudflare Turnstile (a mostly invisible, low-friction captcha) and an IP rate limit via Bunny Shield, on top of the content check described in Moderation. Everyone starts with a quota of 5 posts; if people report you, that quota drops.
6. **It disappears.** Messages live for 4 hours 20 minutes by default, then they're gone. The lifetime is configurable, not hardcoded.
7. **Likes → chat.** Like something in the feed. If someone likes one of yours back, you're offered a private chat with them.
8. **Chat.** Short back-and-forth messages. The history of that conversation exists only between the two of you — nowhere else.
9. **Support.** A support button is always reachable from the app. A message sent through it lands in a Supabase table, and a notification (email/webhook) fires so the team knows a new ticket came in — there's no automated handling beyond that.
10. **Optional: share a social link.** You can attach any freeform handle or link (Telegram, Instagram, whatever) from your account and choose to share it — as a way to keep the connection alive past the chat, and as a light trust signal ("this is a real person"). Nothing is validated or restricted to a fixed platform list, and sharing it is a per-instance choice you make each time, not a default-on setting. Tapping a shared link shows a warning first — you're about to leave sosed.place / neighbro.place for an external site — before it opens.

## Design

Black and white, high contrast, on purpose. Users can dial the contrast up or down themselves, and switch between light and dark themes. No decoration for decoration's sake.

## Privacy

Sensitive data lives on the device, not on the server. Concretely: chat history is stored in the browser's IndexedDB, encrypted client-side with the Web Crypto API before it's written — there's no magic "secure" browser storage, so the app does its own encryption rather than relying on one. What reaches the backend is kept to a minimum: enough to route messages and enforce limits, nothing more. Chat history exists only for the two people in that conversation. The browser-fingerprint-backed UID exists for one reason: to stop someone from dodging a report-based quota drop by simply clearing their cache — it's an abuse guard, not a tracking feature, and it only ever recognizes the same browser, not the same person across browsers or devices.

## Moderation

Every message — in the feed or in a private chat — is checked by Google's Perspective API before it's allowed to go out; messages that fail the check simply aren't published or sent. On top of that, everyone starts with a quota of 5 posts; if other users report or block you, that quota drops.

The AI also reads for tone beyond toxicity: it flags messages with sexual subtext and messages that are LGBT-related, and it rejects harassment, drug-related content, and sex-work solicitation outright. The general bar: content should stay within the norms of a calm, peaceful society.

- **Harassment, drugs, sex services.** Rejected outright — these messages are never published or sent, in the feed or in chat.
- **Sexual subtext.** Flagged messages are completely invisible by default. To see them, you opt in: accept a dedicated consent agreement and provide an email address (stored as given, not verified) — only then do such messages appear in your feed.
- **LGBT-related content.** On neighbro.place, flagged messages are shown in the feed like any other message by default. Blocking one hides it from your own feed only, not globally. Liking one keeps it visible to you regardless — both are personal, not shared, signals. On sosed.place, such messages are filtered out of the feed entirely.

## Architecture (alpha)

- **Frontend:** React, browser-based web app — no native app for the alpha.
- **Backend:** Supabase end to end — Postgres, Auth, Realtime, and Storage, with business logic (quotas, age filter, moderation orchestration) living in Supabase Edge Functions. No separate backend service to run or deploy.
- **Gateway:** xor.ad is the shared custom domain every frontend talks to — the single public entry point in front of the Supabase project.
- **Language detection:** a local language-detection library runs inside the Edge Functions — no external API call, no per-message cost.
- **Content moderation:** Google's Perspective API for toxicity, plus a low-cost LLM call per message for tone classification (sexual subtext, LGBT-related topic) — see Moderation above.
- **Anti-abuse on posting:** Cloudflare Turnstile as the captcha layer, and Bunny Shield for IP-based rate limiting — both scoped to the feed post action, not chat.
- **Client-side storage:** chat history is kept in the browser's IndexedDB, encrypted with the Web Crypto API before being written.
- **Local development:** everything runs in Docker — each service in its own container.
- **Deployment:** frontend served via Bunny CDN; backend runs on Supabase's managed infrastructure.
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

The core idea stays ephemeral — this isn't meant to become another permanent-profile social network. What grows from here: more faces for more regions and languages, richer in-chat experience, native apps once the web alpha proves the concept works, and an internal balance. The balance would be funded by real money (PayPal, on both faces) as well as internal mechanics like bonuses and referrals — inviting someone rewards both the inviter and the invitee once the invitee joins through that link — and spendable on boosting — paying to promote your own message so it stands out in the feed. Details still open.
