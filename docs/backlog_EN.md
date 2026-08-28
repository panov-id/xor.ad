# Idea backlog (for later)

Short notes for later — not in current work, kept so they aren't lost.

**Both entries below are closed by decisions and kept as history — edit of
2026-08-28.** The file was not under the retirement registry and spent six weeks
holding descriptions the product has since revised. What replaced them:

- **The freeze** → screen 20 of the storefronts, "Step away" (2026-08-26 and 2026-08-27):
  three spans — 20 minutes, an hour, until morning — with the price of leaving
  counted on the spot before the confirmation, live phrases deleted, the table
  left standing while the person sitting at it gets up. The server side is §8.2 of
  the chat spec: `frozen_at` and a `NOTIFY session_frozen` that cuts the session's
  sockets.
- **The games** → §6 of the chat spec and screen 18: a game is described by
  **seven primitives**, not by names. The note below names games and promises "no
  built-in rules" — [retired] wording, retired on 2026-08-26 precisely because
  describing games by name makes every new one a separate application.

## Session freeze (self-lockout)

In the app: a "freeze" button — the user bars themselves from entering for a while (e.g. 20 minutes) so they don't get stuck doom-scrolling. While frozen, sign-in is blocked.

Sketch:
- The user picks a duration (presets: 20 min / 1 hour / …).
- Until the timer expires, the app won't open the feed/chat — it shows a "frozen, MM:SS left" screen.
- **Against bypass**: store the deadline server-side (tied to the browser UID), not just in localStorage — otherwise clearing the cache lifts the block. Note a private window = a new identity (see the registration model), so this is soft self-control, not a hard barrier.
- Configurable presets/max via env, like the other tunables.

Open questions: can the freeze be lifted early; freeze per face or across all of xor; behavior on expiry (open immediately / notify).

## Rule-free shared games

In a chat/match — a shared visual board for two: **dominoes, checkers, chess**. The twist: [retired] **no built-in rules** — the engine just draws the board and lets you move/place pieces freely; the players make up and honor the rules themselves. It's an ice-breaker and a "shared moment," not a competition.

Sketch:
- The shared board syncs in real time (websockets through the relay node).
- Set: dominoes, checkers/chess (same "just drag the pieces" mechanic), easy to add new boards.
- No move validation, score, or winner — only board state + dragging.
- Lives inside the chat/match; disappears with it (ephemeral).
- **Start/switch is request-based**: a "propose a game" button in the chat → pick a board (dominoes/checkers/chess) → the other person gets a request → they accept → the board opens for both. Switching games is the same request. With no rules, agreeing to the switch is the only "mechanic."

Open questions: reset/reshuffle the board; who can move whose pieces (both — yes, since there are no rules); piece sets/themes per brand; whether dominoes needs a simple "dice roll"/shuffle.
