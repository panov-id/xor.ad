# xor.ad

xor.ad is the brand-neutral gateway that sits in front of everything. All frontends — sosed.place, neighbro.place, and any future faces — talk to one shared backend through it. The name is deliberate: XOR ("one or the other") reflects the routing role, while staying detached from any single brand so the core can outlive any rebrand.

## What this actually is

A place for talking to the people around you, right now, and then letting it go. No permanent profile, no feed you scroll back through for years, no follower count. You post something, people nearby see it, maybe you end up chatting — and a few hours later it's gone. Ephemeral by design, not by limitation.

## The faces

- **sosed.place** — Russian-speaking audience, Soviet-flavored visual identity.
- **neighbro.place** — English-speaking audience, British-leaning tone and visuals.
- **xor.ad** — the platform underneath both. One backend, one database, one shared pool of users and feed — sosed.place and neighbro.place are different skins over the same data, not isolated audiences. Moderation policy can still differ per face where needed (see Moderation below). New faces for new audiences plug into the same gateway.

## The alpha experience

1. **Open the app.** A name animation plays alongside a small live infographic — real numbers off the platform (people online nearby, messages in the last hour, that kind of pulse-check).
2. **Location.** The app can detect your position; you can also set it yourself. A map lets you drag a slider to pick the radius you care about.
3. **Register.** You can pick a free-form display name — optional, no real-name requirement — and enter your birth year, then hit enter. No email, no password. Behind the scenes the server generates an encrypted random UID tied to your birth year and a few unique-enough browser/device parameters, so it can still recognize you even if you wipe every cache. Your birth year also drives an age filter on the feed: a slider lets you widen or narrow the age range of neighbors you see. If you're 18 or older, the slider moves smoothly across any range, but people under 18 are never shown to you, no matter how you set it. If you're under 18, the slider is available too, but its maximum stays narrow — never wide enough to bring adults into view.
4. **The feed.** Short messages from people nearby, newest at the bottom like a chat, not a stacked timeline. The AI detects each message's language; by default about 95% of what you see is in your own language and 5% is in other languages spoken in your region — both shares configurable via environment variable. Styled to feel alive and a little playful — closer to Pure than to a corporate wall of posts.
5. **Post something.** Tap "add," write up to 128 characters, optionally add your city/country and how many of you there are, hit send. Everyone starts with a quota of 5 posts; if people report you, that quota drops.
6. **It disappears.** Messages live for 4 hours 20 minutes by default, then they're gone. The lifetime is configurable, not hardcoded.
7. **Likes → chat.** Like something in the feed. If someone likes one of yours back, you're offered a private chat with them.
8. **Chat.** Short back-and-forth messages. The history of that conversation exists only between the two of you — nowhere else.
9. **Optional: share a social link.** You can attach any freeform handle or link (Telegram, Instagram, whatever) from your account and choose to share it — as a way to keep the connection alive past the chat, and as a light trust signal ("this is a real person"). Nothing is validated or restricted to a fixed platform list, and sharing it is a per-instance choice you make each time, not a default-on setting. Tapping a shared link shows a warning first — you're about to leave sosed.place / neighbro.place for an external site — before it opens.

## Design

Black and white, high contrast, on purpose. Users can dial the contrast up or down themselves, and switch between light and dark themes. No decoration for decoration's sake.

## Privacy

Sensitive data lives on the device, in the browser's secure storage — not on the server. What reaches the backend is kept to a minimum: enough to route messages and enforce limits, nothing more. Chat history exists only for the two people in that conversation. The device-fingerprint-backed UID exists for one reason: to stop someone from dodging a report-based quota drop by simply clearing their cache — it's an abuse guard, not a tracking feature.

## Moderation

Every message is checked by Google's Perspective API before it's allowed into the feed — messages that fail the check simply aren't published. On top of that, everyone starts with a quota of 5 posts; if other users report or block you, that quota drops.

The AI also reads for tone beyond toxicity: it flags messages with sexual subtext and messages that are LGBT-related.

- **Sexual subtext.** Flagged messages are completely invisible by default. To see them, you opt in: accept a dedicated consent agreement and provide an email address (stored as given, not verified) — only then do such messages appear in your feed.
- **LGBT-related content.** On neighbro.place, flagged messages are shown in the feed like any other message by default. Blocking one hides it from your own feed only, not globally. Liking one keeps it visible to you regardless — both are personal, not shared, signals. On sosed.place, such messages are filtered out of the feed entirely.

## Architecture (alpha)

- **Frontend:** React, browser-based web app — no native app for the alpha.
- **Backend:** Go service behind xor.ad — the single gateway every frontend talks to; it routes requests into the shared backend.
- **Realtime:** Supabase Realtime for likes, chat delivery, and feed updates.
- **Local development:** everything runs in Docker — each service in its own container.
- **Deployment:** Bunny CDN, using Bunny's managed container and database offerings.
- **Configuration:** every tunable — message character limit, starting post quota, message lifetime, default radius, and so on — is driven by environment variables, so behavior can be adjusted per deployment without touching code.

## Related repositories

The frontend repos for the two faces live next to this one and are symlinked in for quick access:

- [`sosed.place`](./sosed.place)
- [`neighbro.place`](./neighbro.place)

## Beyond the alpha

The core idea stays ephemeral — this isn't meant to become another permanent-profile social network. What grows from here: more faces for more regions and languages, richer in-chat experience, and native apps once the web alpha proves the concept works.
