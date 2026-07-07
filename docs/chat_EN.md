# Chat — specification

Single document for the chat functionality. Consolidates requirements from `app-prototype-spec_EN.md`, `app-ui-notes_EN.md`, `backlog_EN.md`, `roadmap_EN.md`. Status: foundation (implementation in later steps).

## 1. Purpose

Chat is a private **ephemeral** conversation between two people, opened **only after a mutual like** (a match) in the city feed. It is not a messenger: a chat lives for a limited time and disappears together with its context. The goal is a shared "moment" here and now, not a forever correspondence.

Principles:
- **Ephemerality** — a chat has a lifetime; on expiry it fades and disappears.
- **Match context** — you can see what made you match (the liked phrases).
- **Low entry cost** — ice-breaking over "features": short messages, rules-free shared games.

## 2. Match model

Path from feed to an open chat:

1. **Like** — tap the logo button on a feed message (a reaction to a phrase).
2. **Mutual like** — if the other person liked your message → a request appears.
3. **`Requests`** — the "likes you back →" section: mutual likes, chat **not yet open**.
4. **Open chat** — a confirmed match; the chat appears in `Chats`, the lifetime timer starts.

System message on open: `you both liked this — chat is open`.

## 3. Chat list

- Tabs: **`Chats N`** / **`Requests N`** (brutalist blocks, active one has an accent fill).
- **Thread** (`.thread`): letter avatar, name, last-activity time, **last-message preview** (its own line), **timer** `chat open · Nh Nm` (accent, its own line), a `›` chevron as a click-affordance.
- **`Requests`** — "likes you back →" (mutual likes, chat not yet open); the action opens the chat.
- Click a thread → opens the conversation.

## 4. Conversation

- Header: "back" button, name + timer `chat open · Nh Nm` (accent), a 🎲 **"propose a game"** button.
- **Liked phrases (match context):** at the start of the conversation, a `Liked, in order` block — a numbered list of phrases in **like order**, tagged `You liked` / `They liked` with the quote. Shows why you matched.
- **Bubbles:**
  - `them` — left, surface `--ink-2`, offset shadow;
  - `me` — right, accent fill `--gold` + `--gold-ink`;
  - `sys` — centered, mono (system events: chat opened, game proposal);
  - each bubble shows a time (`HH:MM`).
- **Composer** (`.composer`): a `Write a message…` field (`maxlength=240`) + a send button (arrow, accent fill). Submit appends a `me` bubble and scrolls to the bottom.

## 5. Ephemerality

- A chat has a **TTL** (lifetime), shown by the `chat open · Nh Nm` timer.
- As expiry approaches — visual **fading**; on expiry the chat **disappears** with all its content (messages, liked phrases, game board).
- The deadline is stored on the server (tied to the browser identity), not only in localStorage.
- Open questions: does activity extend the TTL; is the lifetime uniform across chats; behavior at the exact expiry moment (hide instantly / show "expired").

## 6. Rules-free shared games

Inside a chat — a shared visual board for two: **dominoes, checkers, chess**. The twist: **no hard-coded rules** — the engine only draws the board and lets players move/place pieces freely; players invent and enforce the rules themselves. It is an ice-breaker, not a competition.

- Start/switch is **request-based**: the 🎲 "propose a game" button → pick a board → the other person gets a request → they accept → the board opens for both. Switching games is the same request.
- No move validation, no score, no winner — only board state + dragging.
- Both players can move pieces (there are no rules).
- The board lives within the chat and **disappears with it** (ephemerality).
- Sync in real time (see §7).

## 7. Realtime

- Message exchange, game-board state, and game requests go through **Supabase Realtime** (websockets) over the **api proxy** (same-origin, via the gateway).
- New messages arrive without a reload; the city feed refreshes separately (`Refresh` / `Auto` ~6s).

## 8. Data model (schema requirements)

Requirements level — no migration here (SQL and RLS are a separate step, see `roadmap` items 50–51).

- **`likes`** — who liked whom/which message; `Requests` are derived from mutual likes.
- **`chats`** — an open chat between two identities; `created_at`, `expires_at` (TTL), state.
- **`messages`** — chat messages: author, text (≤240), time; `me`/`them` is computed per viewer; `sys` for system events.
- **`game_sessions`** — the active board in a chat: type (dominoes/checkers/chess), piece state; lives within the chat.

Requirements:
- **RLS**: access to chat/messages/game — only the two participants.
- **Ephemerality**: TTL at the database level (background cleanup / filter by `expires_at`).
- Realtime enabled for `messages` and `game_sessions`.

## 9. UI states and breakpoints

- **`≥900px`** — three-column workspace: **[Feed] | [Open chats] | [Active chat]** (feed `flex:1`, chats `300px`, active chat `400px`). Columns collapse into vertical rails. Before a chat is picked, the active column shows an empty `Pick a chat` state.
- **`≤899px`** — single column, bottom navigation (`Feed` / `Chats` / `Say` / `Me`); the conversation is a full-screen overlay (`position:fixed`), "back" → list.
- **`≤560px`** — compact header.

## 10. Accessibility / quality

- `:focus-visible` — accent outline; `prefers-reduced-motion` — disables fading/pulsing.
- `overflow = 0` horizontally in every state (list / conversation / game), baseline screen iPhone 12 mini (375px).

## 11. Logo: house and text (shared behavior — landing and app)

The logo has two clickable parts with **different** actions. The rule is identical on the landings (sosed.place / neighbro.place) and in the app.

- **House mark** — changes the theme (as now). On the landing this is the accent-color cycle (button `#logoBtn`); light/dark is a separate ☀/🌙 button. The house behavior does not change.
- **Name text** (`SOSED` / `NEIGHBRO`) — navigates **"home"**, where "home" depends on auth:
  - **logged in** (active Supabase auth session) → the app's **chat window**;
  - **logged out / not registered** → the **landing**.
- **"Logged in" is defined** as an active Supabase auth session. Until login exists there is no session → the name text always goes to the landing.
- Accessibility: the name text is a semantic link/button with an `aria-label`; house and text are distinguishable by focus.

## 12. Open questions

- TTL extension on activity and the maximum chat lifetime.
- Behavior at the expiry moment (hide instantly / show "expired").
- Right-side tabs: only "Chats" or sub-sections (requests / active / match history).
- New-message notifications (push — see `pwa-push_EN.md`).
- Moderation / reporting inside a private chat.
