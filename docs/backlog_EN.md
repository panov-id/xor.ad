# Idea backlog (for later)

Short notes for later — not in current work, kept so they aren't lost.

## Session freeze (self-lockout)

In the app: a "freeze" button — the user bars themselves from entering for a while (e.g. 20 minutes) so they don't get stuck doom-scrolling. While frozen, sign-in is blocked.

Sketch:
- The user picks a duration (presets: 20 min / 1 hour / …).
- Until the timer expires, the app won't open the feed/chat — it shows a "frozen, MM:SS left" screen.
- **Against bypass**: store the deadline server-side (tied to the browser UID), not just in localStorage — otherwise clearing the cache lifts the block. Note a private window = a new identity (see the registration model), so this is soft self-control, not a hard barrier.
- Configurable presets/max via env, like the other tunables.

Open questions: can the freeze be lifted early; freeze per face or across all of xor; behavior on expiry (open immediately / notify).
