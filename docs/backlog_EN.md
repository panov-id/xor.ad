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

## Rule-free shared games

In a chat/match — a shared visual board for two: **dominoes, checkers, chess**. The twist: **no built-in rules** — the engine just draws the board and lets you move/place pieces freely; the players make up and honor the rules themselves. It's an ice-breaker and a "shared moment," not a competition.

Sketch:
- The shared board syncs in real time (Supabase Realtime, websockets — through the api proxy).
- Set: dominoes, checkers/chess (same "just drag the pieces" mechanic), easy to add new boards.
- No move validation, score, or winner — only board state + dragging.
- Lives inside the chat/match; disappears with it (ephemeral).
- **Start/switch is request-based**: a "propose a game" button in the chat → pick a board (dominoes/checkers/chess) → the other person gets a request → they accept → the board opens for both. Switching games is the same request. With no rules, agreeing to the switch is the only "mechanic."

Open questions: reset/reshuffle the board; who can move whose pieces (both — yes, since there are no rules); piece sets/themes per brand; whether dominoes needs a simple "dice roll"/shuffle.
