# Chat — specification

Single document for the chat functionality. Consolidates requirements from `app-prototype-spec_EN.md`, `app-ui-notes_EN.md`, `backlog_EN.md`, `roadmap_EN.md`. Status: foundation (implementation in later steps).

## 1. Purpose

Chat is a private **ephemeral** conversation between two people, opened **only after a mutual like** (a match) in the city feed. It is not a messenger: a chat lives for a limited time and disappears together with its context. The goal is a shared "moment" here and now, not a forever correspondence.

Principles:
- **Ephemerality** — a chat has a lifetime; on expiry it fades and disappears.
- **Match context** — you can see what made you match (the liked phrases).
- **Low entry cost** — ice-breaking over "features": short messages, rules-free shared games.

## 2. Match model

Path from feed to an open chat (data model — §8.5):

1. **Like** — tap the logo button on a feed phrase.
2. **Mutual like** — if that person once liked your phrase and **both phrases are still alive in the feed** → a match appears. An expired phrase produces no more matches.
3. **"Offers"** — the match card: the peer's phrase, its mode (`alone` / `company` / `party`), name and age, **the remainders of both phrases** — the match dies with the first. The chat is **not open yet**. (Edited 2026-09-14: this said `Matches` and a single `match expires · Nh Nm` timer [retired] — screens 6 and 7 of the storefronts decided otherwise on 2026-08-27–28.)
4. **Double consent** — **both** press "open chat". Once one does, the other sees "waiting for you". This is also where each picks the chat's lifetime (§5).
5. **Open chat** — it appears in "Conversations" and the sliding timer starts.

A match lives until the first of the two phrases dies. If both did not press in time, the match disappears and there was no chat.

System message on open: `you both liked this — chat is open`.

Liking again when a chat with that person is already open creates **no new match** — the phrase arrives straight into the chat as an `extra_like` card (§8.7).

## 3. Chat list

- Tabs: **"Offers N"** / **"Conversations"** — a counter only on offers, a dot for a new conversation on conversations (screen 7 of the storefronts, decided 2026-08-27; edited 2026-09-14: this said `Chats N` / `Matches N` [retired]).
- **No sub-sections — decided 2026-08-20.** There are exactly two tabs. "Fading" is not a section but a state of the row: the timer and the fading are already described in §5 and visible in the thread itself. A "Fading" section could only be filled by moving a chat there on a timer, which means the other person would drop out of sight in the very minute when the least time is left; on top of that the inbox counters (§8.12) would have to be split three ways. The list does not grow by construction — chats live for minutes and hours, not months.
- **Thread** (`.thread`): letter avatar, name, last-activity time, **last-message preview** (its own line), **timer** (accent, its own line), a `›` chevron as a click-affordance.
- **"Offers"** — match cards: phrase + mode + name and age, the remainders of both phrases, an "open chat" button; after your own press, "waiting for you" (edited 2026-09-14: this said `Matches` and "a timer to expiry" [retired]).
- Click a thread → opens the conversation.
- The counter and the dot on the tabs *are* the inbox (§8.12): matches awaiting a decision and new conversations are derived from state, and there is no separate notifications screen. **There is no "unread"** — it would mean the node knows who opened a conversation when (screen 7).

## 4. Conversation

- Header: "back" button, name and age + timer (accent; the disappearance counter only appears past the silence threshold, §5), a 🎲 **"propose a game"** button.
- **Liked phrases (match context):** at the start of the conversation, a `Liked, in order` block — a numbered list of phrases in **like order**, tagged `You liked` / `They liked` with the quote. Shows why you matched.
- **Bubbles:**
  - `them` — left, surface `--ink-2`, offset shadow;
  - `me` — right, accent fill `--gold` + `--gold-ink`;
  - `sys` — centered, mono (system events: chat opened, game proposal, the peer changing their age; the name is frozen while a chat is open — §8.2);
  - `extra_like` — centered, a card with the quote and a number matching the one in `Liked, in order` (§8.7);
  - each bubble shows a time (`HH:MM`).
- **Composer** (`.composer`): a `Write a message…` field + a send button (arrow, accent fill). Submit appends a `me` bubble and scrolls to the bottom. The length limit **comes from the server**, 256 characters by default; the client draws the counter but does not decide it (§8.6).

## 5. Ephemerality

- A chat's TTL is **sliding**: it lives no longer than the chosen span **after the last activity**. Activity means a delivered message or a move in a game.
- **Each person picks their span inside the conversation itself, and it is their own — settled 2026-08-26, reversing the pick at consent.** Four values: **10 minutes, 30 minutes, an hour** or **"while we're talking"** (the same 4:20). The handle sits in the conversation header and changes at any time (in the terminal, an item of the conversation's menu, `depth-client_EN.md` §4.7). The count runs from **your own last message**, not from theirs: Petya sets ten minutes, Kolya an hour; Petya stays silent for ten minutes and the conversation disappears **for Petya**. Your own remainder is always visible; the other side's setting and remainder are not. **Since 2026-09-10 that covers the moment of the "ended" mark as well:** the line used to appear the instant their span ran out, and the time of their last message is on your screen — the difference names their setting, and there are only four. The mark is now placed by **your own attempt**: the client learns the conversation is over when you open it or try to write, and draws the line then. The cost is accepted: the list does not tell a live conversation from a dead one until you look into it, which is the same trade the headstone (§1) already makes. Asking for a span before a person has seen who they are talking to demands a decision before there are grounds for one.
- **The silence counter** appears in the **last quarter of your own span** and counts down to the conversation's disappearance. Any message or move of yours resets it. A fraction rather than fixed minutes: a quarter of an hour for an hour-long conversation, two and a half minutes for a ten-minute one. The old `min(20 minutes, span / 3)` rule is retired along with the pick at consent — on a ten-minute span it lit the counter after 3 minutes 20 seconds, leaving two thirds of the conversation's life in a countdown.
- As expiry approaches — visual **fading**; on expiry the conversation **disappears for whoever's span ran out**, with all its content (messages, liked phrases, game board). For the other it remains, but it stops **being a conversation**: nothing can be written into it, and one line says so — otherwise an expired span is indistinguishable from taking offence.
- **The last frame — decided 2026-08-20: only the person who was looking sees a headstone.** A chat open on screen at that moment shows "chat expired" and a "close" button. A chat that was sitting in the list disappears from it silently. The content is erased immediately in both cases — the words stand over emptiness, not over a saved conversation. The difference is not politeness: taking the screen away without a word from someone mid-message is indistinguishable from a crash or a ban, while nobody has a list row under their hands at that instant. The headstone lives until it is closed and **does not return** to the list — otherwise someone who stayed away for a day comes back to a column of "there was a chat with this person here", a trace outliving the thing that was supposed to vanish (§1).
- The span is stored **per participant**, the last-activity time per conversation; the conversation itself lives only in browsers (§8.8), and the client sweeps it via `POST /chats/alive` (§8.10). Hence a consequence for that endpoint: it answers **differently to the two participants of one conversation**, and that is the design rather than a fault (§8.10).
- The **feed** has its own span — a phrase lives **4 hours 20 minutes**; a **match** has its own — until the first of the two phrases dies. Three different timers for three different reasons.
- **The set of spans is four, settled 2026-08-26:** 10 minutes, 30 minutes, an hour, "while we're talking". The previous three (20 minutes, 1 hour, 4:20) stood from 2026-08-20 and rested on two arguments that no longer exist. First: anything shorter than 20 minutes breaks the `min(20 minutes, span / 3)` counter — that counter is now a quarter of the span, and ten minutes give a calm 2:30. Second, [retired]: "since the smaller of the two applies, one cautious pick would close the conversation for both" — there is no smaller of the two any more; each side governs only its own, and one person's caution closes nothing for anyone else. The ceiling stands for the old reason: **"while we're talking" is 4:20**, exactly as long as a phrase lives in the feed, and a conversation about it should not hang around longer than what started it. Free entry is not considered: it turns a choice between four words into a setting with numbers.

## 6. Shared games with minimal rules

Inside a chat — a shared visual board for two, and beside it a table for company (§6.1).

**Minimal rules are introduced — decided 2026-09-09, overriding "no hard-coded rules" of 2026-08-26.** The earlier decision read: the engine only draws the field and lets players move pieces, and the players invent and enforce the rules themselves. It held for two weeks and was overturned by one argument that outweighed the rest: **watching the rules by hand is work, and putting it on somebody who came to play is wrong.** The product stays an excuse to start talking rather than a competition, but it owes the players help in running the game.

**What was overturned is kept here verbatim, so the decision reads together with what it replaced** [retired]: "no hard-coded rules — the engine only draws the field and lets players move pieces freely; players invent and enforce the rules themselves".

**A game is still described by primitives (2026-08-26), and now a class also has rules.** The primitives have not gone anywhere — they describe what a game is made of; the rules describe what is allowed in it. There are eight primitives:

| Primitive | What it is |
|---|---|
| **Field** | a grid N×M, a grid of points, or a free table with no cells |
| **Pieces** | a set with two sides and, where needed, ownership |
| **Stock** | what is not yet placed: empty in draughts, the whole pile in dominoes, infinite in go |
| **Hand** | the private part of the stock, visible only to its owner |
| **Operations** | take, place, rotate, flip — and nothing else |
| **Randomness** | shuffling a deck and rolling dice |
| **Physics** | a flick with momentum and rebounds — only where a game cannot exist without it |
| **Text input** | a word somebody guesses that another will see |

**The scope of the rules differs by class of board (2026-09-09).** There is deliberately no single set: where a rule is cheap and unambiguous the engine checks everything; where it is expensive or contested it checks only turn order, the end of a round and the score. Three classes of seven get full checking, and the heaviest do not drag a chess engine in behind them.

| Class | Seats | What the engine checks | What is left to the people |
|---|---|---|---|
| **Free table** (dominoes) | **2–4** | whose turn (since 2026-09-14); a tile may only join a matching end; end of round; score **by the pips left in hand** | nothing |
| **Dot grid** (dots) | **2** | whose turn (since 2026-09-14); the edge is free; a closed area is counted; score **by closed areas** | nothing |
| **Deck and hand** (durak, uno) | **2–6** | whose turn, that the card came from a hand, end of the deal, score **by deals won** | what beats what — there are too many variants |
| **Square grid** (draughts, chess) | **2** | whose turn, the square is not held by your own piece, end of round by agreement, score **by rounds won** | whether the move itself is legal |
| **Dice** (backgammon) | **2** | whose turn, the roll is honest, score **by rounds won** | how to move what was rolled, gammons and backgammons |
| **Physics** (flick game) | **2–4** | whose turn, score **by pieces knocked off** | everything else — a flick ends where it ends |
| **Text** (hangman) | **2** | whose turn (since 2026-09-14); the letter is not repeated, the word is guessed, score **by words guessed** | nothing |

**The number of seats belongs to the set, not to the class, and the table gives the
bounds (recorded 2026-09-10).** The application rule of 2026-09-10 — "those unopposed
sit down in the order they applied, while seats last" (§6.1) — leaned on that number,
and there was nowhere to take it from: the class table had no such column, and the
rule was unimplementable as written. The range here is the class's ceiling; a
particular set names its own within it: chess is always two, dominoes happens both
with two and with four, and that is chosen when the board is put down.

**A point means something different in each class — decided 2026-09-10.** There is no single "one point per round": dominoes count the pips left in hand, dots count closed areas, the flick game counts pieces knocked off, and a product score that disagreed with what the players say out loud would be worse than no score at all. The price: seven counting rules in code instead of one.
**What the engine still does not count are gammons and backgammons:** that is a layer above counting rounds, and every group has its own.

**The price is named and it is real: the behaviour is uneven.** In dominoes the engine stops your hand, in chess it says nothing, and a person cannot know in advance where they will be corrected. This is accepted deliberately — even behaviour is reached either by having no rules at all (overturned above) or by a chess engine inside every board, which is exactly the "separate application per game" §6 walked away from on 2026-08-26.

**A "see the basic rules" button — decided 2026-09-09.** Every class has a short text: what we are playing, what the product checks, what is left to agreement. It opens over the board without interrupting the game. Without it "minimal rules" would be a guessing game — a person would hit a refusal from the engine and not know where it came from.

**The play is shown in the conversation — decided 2026-09-09.** Every move becomes a
line: "Anya placed a tile on e4", "Petya flicked". These words used to exist **for
the screen reader only** (screen 18, 2026-08-29) — now everybody sees them, for
three reasons at once.

First: **a spectator at a table sees the board but could not tell what had
happened** — the position changes silently, and an opponent's move is
indistinguishable from a slip. Second: **somebody returning to a table starts from
nothing** and catches up through the lines of moves. Third: **the announcement is
already written** — the vocabulary of coordinates per class of board was made for
accessibility, and there is no need to invent it twice.

**At a table a move is a `table_lines` row of kind `move`.** The moderation queue
does not apply to it: the text is assembled by the engine from the class of board
and a coordinate, and there is nothing to check. It is cut off by `joined_at` like
any other: somebody who sat down does not see the moves made before they arrived.

**In a pair a move is a system line in the conversation**, and it is **not
encrypted**, unlike the messages beside it: it is part of the game state, and that
is open to the node from this day on. The difference is visible to a person and has
to be said on the screen: your words are closed, your moves are not.

**Moves and game state are not encrypted — decided 2026-09-09.** Only whoever sees the board can check the rules, and until that day nobody saw it but the two of them: the state was encrypted with the conversation key (§8.13). The **board, and only the board**, is now outside end-to-end encryption.

**The conversation stays encrypted.** The node comes to know what two people are playing and how — and still does not know what they are saying. That is the whole price, and it has to be stated precisely rather than as "encryption was dropped": §8.13 continues to hold for messages and stickers. **The secret word is out from under it — clarified 2026-09-12:** it sits in `state`, the engine checks "guessed" against it and the moderation queue reads it, so the node sees it. The earlier wording kept the word on the encrypted list [retired], and that had been untrue since the day the word started going through the queue.

What the node now sees in a pair: the class of board, the position, whose turn, the score. What that means for a person: **what they are playing and with whom is no longer private from the platform**, and the screen says so plainly, next to what is already written about shuffling a deck (which the node saw anyway — there is no honest randomness otherwise).

**Where the state lives: in a game cache for a pair, in the database at a table (2026-09-09, clarified 2026-09-10).** At a table everything is public by construction: the table already sits in the database with its `last_move_at`, and `table_games` sits beside it.

For a pair the game was to be held in the node's memory alone — and that did not survive its first check: **the node became the judge, and a judge without the position cannot judge.** Restarting the node happens on every deploy, and "the game is lost" on every deploy is not a price but a fault. The position cannot be taken from a client: a client can be forged, and that is what the rules were introduced against.

**So the position is written to a game cache, and the word "cache" has to be explained rather than hidden behind.** Technically it is a row in the same database — otherwise it would not survive a restart of the process. What sets it apart is not the place but three promises, and they are checkable:

- **it lives no longer than the conversation** — it goes with it, on the same span (§5);
- **it holds only the position, whose turn and the score** — not one reply, not one word of the conversation; encryption came off the board, not off the messages;
- **it is swept** along with everything else temporary, rather than lying there until somebody deletes it by hand.

Calling this "we store nothing" would be untrue. The truth is: **we store the position of a game while the conversation lasts, and store nothing of what was said.**

**The score lives as long as the conversation or the table does — decided 2026-09-09.** It accumulates between games: five games played, 3:2 is shown. It goes out with the conversation (on its span from §5) or with the table (on silence). Nothing outlives that: no history of wins, no mark on an identity — §1 promises no trace is left, and the score is no exception. **The price is accepted:** a competition appears inside one conversation, and it can become a reason not to leave. A short one — exactly until the conversation ends.

Adding a game means describing a field, a set of pieces **and the rules of the class**. The first two are data, the third is code, and that is the cost of today's decision.

**The classes and what falls into them:**

| Class | Games | Needed beyond the four operations |
|---|---|---|
| Grid board | draughts, chess, giveaway, corners, big-board noughts and crosses | nothing |
| Free table | dominoes | nothing |
| Grid of points | dots | drawing along edges |
| Deck and hand | durak, poker, uno | shuffling, a private hand, a discard pile |
| Dice | backgammon | a roll |
| Physics | flick-draughts | deterministic simulation |
| Text | hangman | entering a word and checking it |

**The node shuffles and rolls — and in those games it sees the layout (2026-08-26).** The decision is deliberate and stated out loud. **The caveat was rewritten on 2026-09-10:** it used to read "it is the one exception to §8.13: a board without randomness is synchronised encrypted and opaque to the node, while a deck and dice are not". Since 2026-09-09 the board is not encrypted at all, so shuffling stopped being an exception — it became a particular case of what the node sees anyway. What still sets it apart is different: in the other games the node **watches**, and here it also **decides** — it shuffles and rolls. The reason is plain: fair randomness has to belong to somebody, and if a player's client shuffles, it technically sees the others' cards and can stack the deck. Between "a neighbour cheats" and "the node knows what was dealt", the second was chosen — all the more easily because these games have no winner anyway.

**A private hand is dealt encrypted to its player**: each sees their own, the others see backs. The node, as above, knows both the deal and its contents.

**Physics is synchronised by a shared seed.** A flick is not "place a piece in a cell" but a simulation, and without a shared seed the result diverges: one player's piece is in the pocket, the other's is still on the board.

**A guessed word goes through the moderation queue**, like a phrase (§8.3): another person will see it, and everything published is checked before it is shown. A refusal means "guess another one".

**Six shared buttons sit above any class:** **play again**, pass or hand over the
turn, **put it back**, **resign**, **offer a draw** and **congratulate the winner**
(the last four were added or rewritten on 2026-09-09). They belong to no particular
board and live in the common frame.

**A game, a round and a move are three different things, and must not be confused
(2026-09-09).** A move is one piece moved. A round is a deal or a hand inside a
game; in dominoes and cards there are many of them in a row, and they run without
asking the people anything. A game is what starts with "play again" and ends when
the people agree it has. **The line-up is confirmed per game, not per round:**
otherwise dominoes would turn into a questionnaire.

**"Play again" asks what to play — the same game or another one (2026-09-09).**
These used to be two buttons, "play again" and "suggest another game", doing the
same thing in the same second: the game ended and the people are deciding whether
to go on and with what. Now there is one button with the choice inside it; the
same game comes first, because that is what is wanted most often. The proposal
stays a proposal: **whoever agrees, plays**.

**There are three ways to answer a proposal, not two (2026-09-09):** agree, finish,
or **propose your own** — another board instead of the one named. A counter-proposal
passes the ball back, and the exchange can run as many rounds as it likes: this is a
conversation about what to play, not a vote. "Finish" is said separately from
"propose your own" on purpose — otherwise declining one game would be
indistinguishable from declining to play at all, and a person would have to explain
in words what a button should be saying.

**The line-up for the next game is confirmed — decided 2026-09-09.** Once "play
again" is pressed, everyone who was playing and everyone whose application was
accepted gets a confirmation: **30 seconds** to say "I am here". Whoever does
not confirm is not thrown out of the table — they **become a spectator**
(`playing_from` is cleared again) and can return to the game by applying, like
anybody else.

This is the only way to learn who is present without introducing a presence
indicator: the product shows nowhere who is at their screen, and it does not show
it here either. **The others see a count without names:** "2 of 4 confirmed" and a
countdown. A list of who has confirmed, by name, would be exactly the indicator
that was rejected on this screen on 2026-09-04 after a review.

**In a pair the count is not shown at all — decided 2026-09-10.** Without names it
is impersonal only at three and above: at two, "1 of 2 confirmed" is a binary
answer about a named person, "my opponent is at their screen right now" — exactly
the presence indicator the product promised not to introduce, and repeated every
game at that. At two there is a button and a countdown, and the other side's
confirmation shows only as a result: the game started, or it did not. The cost is
named: thirty seconds of silence in a pair read as a freeze, and screen 19 has to
draw that.

Thirty seconds are **chosen, not measured**, and that is said plainly: it is enough
for somebody with the phone in their hand and not enough for somebody who put it
down — and the second is what needs filtering out. The number lives in
`docs/facts/limits.tsv` (`table.confirm.window`).

**"Resign", "draw" and "congratulate the winner" are statements by players, not
verdicts of the engine.** The
engine watches turn order, the end of a round and the score (the class table above),
but does not judge the outcome of a game: it neither awards a win nor checks that a
position is drawn. Edited 2026-09-14: this said "the engine knows no rules and must
not" [retired]. "I resign" is a unilateral announcement — whoever presses it says
so out loud, and for the people the game is over. "Draw" is a proposal accepted by
agreement, like "play again". **"Congratulate the winner" is an addressed
gesture:** whoever presses it picks who they are congratulating, and a line about
it appears at the table. The winner is decided by the people, not the engine, and
anyone can be congratulated — including somebody the others think did not win.
**No result of a game is recorded anywhere**: no history of games, no mark on an
identity — none of those exist by construction (§1), and adding them for two buttons
would be adding a competition where the game exists as an excuse to start talking.
**The engine does keep the round score** — in the game cache for a pair, in
`table_scores` at a table (edited 2026-09-14: this said "there is no score" [retired]).

**Three of them are proposals rather than actions (2026-08-29).** "Play again" (renamed 2026-09-09)
and "put it back" send a request to the others and fire **once everyone agrees**;
none of them is unilateral, for the same reason there is no table owner. What follows:

- **the board does not go out by itself.** The engine sees the end of a round,
  but the outcome of a game is the people's, and the engine does not close the board
  on it (edited 2026-09-14: this said "the engine knows no rules, so it cannot know
  when a game ended" [retired]). **In a
  pair the board stays up even after a refusal to play again — clarified
  2026-09-09:** it lives inside the conversation and goes out with it (§8.13),
  not with the outcome of a game. This used to say "once everyone has declined,
  the board closes", which in a pair meant one "not again" took the board away
  from both. **At a table there is nothing to close for a different reason:**
  whoever declines stays as a spectator, and the table goes out on silence;
- **in a pair, one person leaving ends the game**, because there is nobody to
  wait for;
- **at a table the last person left waits** for someone to sit down (§6.1);
- **behind "put it back" the engine keeps exactly one previous snapshot**, in
  memory, under the same key and past the database. There is no move history and
  there will not be: it would outlive the board, and the board is transient
  state.

**The board is operable from a keyboard too (2026-08-29).** The grammar is taken
from the terminal client, where it existed from the start: select, take-and-put,
rotate, flip. The other person's move is **announced in words** — "put a piece on
e4" rather than "made a move": the vocabulary of coordinates belongs to each
class, a free table announces adjacency instead of coordinates, and the "physics"
class has no coordinate at all.

- Start/switch is **request-based**: the 🎲 "propose a game" button → pick a board → the other person gets a request → they accept → the board opens for both. Switching games is the same request.
- The engine checks what the class table above lists for the class and keeps the score; it does not decide a winner. [retired] This said "no move validation, no score, no winner — only board state + dragging" — the description from before 2026-09-09 (edited 2026-09-14).
- **Whoever's turn it is moves: the engine holds turn order in every class (decided 2026-09-14).** There is no "take turns" toggle any more — since 2026-09-09 it had contradicted the class table, where the engine already checked whose turn it was. The highlight on the piece the other person is dragging stays: two people must not tug at one piece blindly. [retired] This said "both players can move pieces (there are no rules). Turn-taking is an agreement, not a rule (2026-08-26)… wiring turns into the engine is not allowed".

### 6.1. Tables: playing as a group (2026-08-26)

The board for two lives inside a chat. A group game **does not fit** inside one: `pair_key` is unique per pair (§8.5) and the chat key is derived for two (§8.13) — a third participant would mean different cryptography and a key reissue on every departure. So a table is **a thing of its own beside the feed**, not a group chat, and private talk between two stays as it was.

- **Visible in the feed** to those whose viewing circle overlaps the table's zone — by the same rules as a phrase (§8.3).
- **A table name — optional, up to 24 graphemes, through the moderation queue — the owner's decision of 2026-09-17.** The table enters the feed at once and nameless; the name sits in `name_pending` until the queue's verdict (mechanics §5) and moves into `name` when accepted, or stays refused with the reason to the author (a `name_verdict` frame with `table`). A refused name does not close the table: it lives without one.
- **A table is liked without sitting down — the owner's decision of 2026-09-17.** `table_likes` (below, next to `likes`); a table's `like_count` is public like a phrase's (§8.4); who liked never goes out. A table like makes neither a match nor an offer to talk — it is a bookmark: the table leaves this person's feed for screen 25 "My likes" (`GET /likes`), from where they sit down at it.
- **Anyone within the radius may join**, with no invitation and no application; there is no hard cap on numbers.
- **A table takes no posting quota and is itself unlimited — decided 2026-08-30.** Not one of the four slots, no per-identity count of tables, no share of the feed: a table is a meeting place, not an utterance. The price is accepted and recorded: the only brake against feeds filling with tables is the sliding silence span, and if that is not enough, a limiter will have to be built separately.
- **Stickers work at a table as they do in a conversation, but the node sees them (2026-08-30).** The catalogue and the names are the same (screen 16 on the storefronts); the difference is that a table has no end-to-end encryption, so the sticker's identifier is as visible to the node as the lines and the board. This is said to the person on screen rather than left as a consequence for them to derive.
- **It lives from its last move — on one span shared by everyone (clarified 2026-08-27).** The TTL slides, and a move or a line from any sitter pushes it alike. This is a **difference from a conversation**, where since 2026-08-26 each side has its own count: there two people are involved, and each one's silence is their own business; at a table the company changes, and a per-person count would mean the table exists in different states for those sitting at it, with the board drifting apart. The cost is accepted: one active player keeps the table alive for everybody, including those who have not moved in a while.
- **A table with one sitter is a normal state.** It is visible in the feed, people can pull up a chair, and that person is precisely waiting for company; it disappears on the same shared silence span. Closing it the moment the last guest stands up would take the table away from whoever set it up and is waiting for the first.
- **A table is not encrypted, and that is a consequence rather than an omission.** The conversation key is derived for two and does not apply here (above), while speech at a table is public and goes through the moderation queue — there is nothing to check in ciphertext. So **the node sees both the board and the lines**, as it sees the feed. The end-to-end encryption of §8.13 is about a conversation between two; a table is outside it, and a person has to be told plainly, because they will carry the expectation over from a conversation.
- **Talk at a table is public** and goes through the moderation queue like a phrase. The justification for an unchecked conversation — "talk between two is not publication" — does not hold at a table full of strangers. The cost is named: a 2.8 second median per reply is more noticeable here than in the feed.
- **Whoever joins gets no history**: the board arrives as it stands, the replies from the moment they sat down. The same rule as moving an identity (§8.2), and it also removes the question of moderating retroactively.
- **Bands — everyone with everyone**: a person may join only if they are inside every sitter's band and all of them are inside theirs. The same rule as for a pair (§8.2), applied to all at once.
- **A table's own band is its current sitters', and it is recomputed. Decided 2026-09-08.** The feed shows a table to whoever would pass "everyone with everyone" against the people sitting at it now; somebody joins or leaves and the table's band is a different one. Taking it from whoever started the table (`created_by`) was simpler and wrong on the substance: a table has no owner — its own schema says so — and a band inherited from someone long gone describes nobody at the table. Dropping bands for tables altogether was rejected outright: a teenager would then see a table in the feed and be turned away at the seat, which is a refusal in place of an absence. **The price is accepted and it is real:** a table can vanish from somebody's feed mid-game because a person sat down. It does not touch those already at the table — the rule works on retrieval, not on seating, and lifts nobody out of a chair. **A table with nobody at it has no band and is not shown at all:** everyone may stand up (`table_seats.left_at`) while the table itself lives on for up to an hour by `last_move_at`, until the sweeper takes it. An empty table is not an invitation, it is something about to disappear; showing it to everyone would bring back the rejected "no bands" option through the back door, since the first to sit could be anyone and the second anyone else.

**The table's schema — established 2026-08-31.** Until that day a table existed as
paragraphs: no table, no columns, no zone, although it stands in the same feed as
a phrase and since 2026-08-28 its lines have a notice target under Article 16. A
review panel named this the first gap; screen 19 cannot be drawn without it.

```sql
CREATE TABLE tables (
  id               uuid PRIMARY KEY,
  brand            text NOT NULL,                             -- attribution ONLY, as on a phrase
  game             text NOT NULL,                             -- board class: grid | free | dots | deck | dice | physics | word
  set              text NOT NULL,                             -- the set within the class, chosen when the board is put down (§6), `set` in the API
  seats            smallint NOT NULL CHECK (seats BETWEEN 2 AND 6),  -- the set's number of seats, chosen when the board is put down (§6), added 2026-09-16 (panel, DATA-19)
  name             text CHECK (octet_length(name) <= 256),    -- the table's name, accepted by the queue; the node counts the 24-grapheme limit (2026-09-17)
  name_pending     text CHECK (octet_length(name_pending) <= 256),  -- a name awaiting the verdict; accepted moves into name, refused is cleared with the reason to the author
  like_count       integer NOT NULL DEFAULT 0,                -- the public like count, as on a phrase (2026-09-17)
  lat              double precision NOT NULL,                 -- the zone's centre, as on a phrase
  lon              double precision NOT NULL,
  area_radius      integer NOT NULL CHECK (area_radius IN (100, 300, 1000, 3000, 10000)),  -- the phrase's steps: a table is published by the same rule
  created_by       uuid REFERENCES identities(id) ON DELETE SET NULL,  -- not part of any response; a table has no owner
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_move_at     timestamptz NOT NULL DEFAULT now(),        -- the sliding span: a move or a line from anyone seated
  closed_at        timestamptz                                -- everyone left, or everyone declined to play again; set by one procedure `leave_table(identity)` when the last one stands up — all five paths call it: `DELETE /tables/:id/seat`, `POST /tables` (standing up from the previous one), `POST /away`, `POST /blocks` at a table and closing an identity (2026-09-16, DATA-27, DATA-2)
);

CREATE INDEX tables_sliding ON tables (last_move_at) WHERE closed_at IS NULL;

CREATE TABLE table_seats (
  table_id         uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  identity         uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  joined_at        timestamptz NOT NULL DEFAULT now(),        -- lines are shown from here on, and no earlier
  playing_from     timestamptz,                               -- NULL = sitting but not playing: the application is not accepted yet
  left_at          timestamptz,
  -- The seat number is how a person is named outwards: in frames, in the score, in `{table, seat}`
  -- for a block or a removal. The identity never leaves the node (§8.11). The next number
  -- is handed out inside the seating transaction under `SELECT … FROM tables WHERE id = :t FOR UPDATE`,
  -- or two seatings take one number. Someone coming back gets a new number: no trace remains (2026-09-16, DATA-18).
  seat_no          smallint NOT NULL,
  -- Numbers are never reused within a table's life: `max(seat_no) + 1` under the same lock, or the
  -- target of `kick`/`congratulate`/`blocks {table, seat}` would rebind to a new person (2026-09-16, SEC-16).
  -- Coming back is a new row, not `UPDATE left_at = NULL` (2026-09-16, DATA-1); one live row per
  -- identity is held by `table_seats_one_at_a_time`.
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  UNIQUE (table_id, seat_no)
);
-- `leave_table(identity)` is a node transaction, not a database object (2026-09-17, DATA-3): 1) `left_at = now()`
-- on the live row and `NOTIFY seat_left`; 2) the `kick` votes cast by that seat and against it are dropped (they live in the memory of the table's node; `NOTIFY seat_left` carries the event); 3) if the author of the open
-- `pending` left — `pending = NULL`; 4) no live rows left — `tables.closed_at = now()`.

-- One table at a time — decided 2026-09-09. Sitting down at a second table
-- without standing up from the first is refused, and this is the only guard
-- against burying the feed under tables that does not put an identity into the
-- ranking: set up as many as you like, but sit at one, and a table with nobody
-- sitting at it does not appear at all. Without it one person would take the
-- whole quarter of the cards with their own tables, because `created_by` takes no
-- part in the feed and the ranking may not tell them apart by author.
-- It serves lookups by identity as well: table_seats_by_identity [retired] had the
-- same definition and was removed on 2026-09-15 (final panel, DATA-13).
CREATE UNIQUE INDEX table_seats_one_at_a_time ON table_seats (identity) WHERE left_at IS NULL;

CREATE TABLE table_lines (
  id               uuid PRIMARY KEY,
  brand            text NOT NULL,                             -- attribution ONLY: an Article 16 target is found without it (the world is one)
  table_id         uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  author_identity  uuid REFERENCES identities(id) ON DELETE SET NULL,
  text             text CHECK (char_length(text) >= 1 AND octet_length(text) <= 2048),  -- 128 graphemes: node, empty only for a sticker (2026-09-16)
  sticker          text,                                      -- a sticker id from our catalogue, no queue needed (2026-09-16, DATA-20)
  seat_no          smallint NOT NULL,                         -- the author's seat at the moment of the line: after leaving and sitting down again, the old line does not move onto the new person (2026-09-16, DATA-18)
  -- What kind of line this is. `line` is ordinary speech. `application` is the
  -- opening words of somebody asking to play, `refusal` the explanation of
  -- somebody who said no. Both were made ordinary lines rather than an entity of
  -- their own on 2026-09-09: they are visible to everyone at the table, go
  -- through the same moderation queue, fit the same 128 characters and are
  -- reported under the same `table_line` target. A separate addressed entity
  -- would have introduced a message from one stranger to another with no mutual
  -- like — which exists nowhere (§11) — and needed a rate limit and a notice
  -- target of its own.
  -- `move` is a move shown in words ("Anya placed a tile on e4"). The line is
  -- composed by the engine, not by a person, so the "…" menu is not shown on it at
  -- all and it is never the target of an Article 16 notice (docs/dsa/SPEC_EN.md):
  -- there is nothing to report and no author. The moderation queue does not apply
  -- either: there is nothing to check for, the text is assembled from the class of
  -- board and a coordinate. It is visible to everyone at the table and cut off by
  -- `joined_at` like any other — somebody who sat down does not see the moves made
  -- before they arrived, exactly as they do not see the speech.
  kind             text NOT NULL DEFAULT 'line'
                     CHECK (kind IN ('line', 'application', 'refusal', 'move', 'sticker', 'congratulation')),
  -- `sticker` and `congratulation` are published without the queue, like `move`: the catalogue is ours, the congratulation is composed by the engine. Added 2026-09-16 (panel, DATA-20, SEC-5).
  CONSTRAINT table_lines_text_or_sticker CHECK ((kind = 'sticker') = (sticker IS NOT NULL) AND (kind = 'sticker' OR text IS NOT NULL)),
  created_at       timestamptz NOT NULL DEFAULT now(),
  visible_at       timestamptz                                -- NULL = waiting for the queue: speech at a table is public
);

CREATE INDEX table_lines_feed  ON table_lines (table_id, created_at) WHERE visible_at IS NOT NULL;
CREATE INDEX table_lines_queue ON table_lines (created_at) WHERE visible_at IS NULL;
CREATE INDEX table_lines_queue_by_author ON table_lines (author_identity) WHERE visible_at IS NULL;  -- the table hold counts one's own items in checking (2026-09-14)

-- Game state at a table — introduced 2026-09-09 along with the minimal rules.
--
-- In a pair the game sits in the `chat_games` cache (below) — rewritten
-- 2026-09-10, where this used to read "is not written here". At a table the state
-- sits here for a different reason: speech, board and stickers are public by
-- construction, the table is already in the database, and the state sits beside
-- it rather than in a cache with a span.
CREATE TABLE table_games (
  id           uuid PRIMARY KEY,
  table_id     uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  class        text NOT NULL,                        -- grid | free | dots | deck | dice | physics | word
  -- The position, the stock, whose turn it is and the players' hands. jsonb rather
  -- than columns: the seven classes of board hold state of different shapes, and
  -- laying it out in columns would mean seven tables for the sake of one "whose
  -- turn".
  state        jsonb NOT NULL,
  -- The board version: monotonic, grows on every move, pass and undo; a move carries the expected
  -- version, a repeat of the same body at the same `seq` answers the same `board`, a foreign version
  -- gets 409 `stale_seq`. The open proposal and the running confirmation countdown live here, not in
  -- memory, to survive a restart and come back in `GET /tables/:id` (2026-09-16, panel: DATA-24, DATA-25, OPS-12).
  seq          integer NOT NULL DEFAULT 0,
  last_move_hash text,                                -- sha256 of the last move's body: tells a repeat from another move with the same seq
  pending      jsonb,                                -- {kind, id, class, set, answers, until} — a proposal or the confirmation of the line-up
  turn_due     timestamptz,                          -- end of the move window (table.move.window); the auto-pass is placed by the scheduler job `table_autopass` every 30 seconds **and** by any `/tables/:id/*` request after the deadline — overdue deadlines are applied in order, each as its own `seq`; an overdue `pending` is cleared the same way (2026-09-16, OPS-3, OPS-4)
  started_at   timestamptz NOT NULL DEFAULT now(),
  ended_at     timestamptz                           -- the game is over, the table remains
);

-- One game in progress per table. Any number of games in a row, none at the same
-- time: a table has one board, and a second would mean the people sitting there
-- are looking at different places.
CREATE UNIQUE INDEX table_games_current ON table_games (table_id) WHERE ended_at IS NULL;

-- The cache of a game for two — introduced 2026-09-10, when it turned out that a
-- judge without the position cannot judge, and a node restart happens on every
-- deploy.
--
-- This is NOT storage of a conversation: there is not one reply here. Only the
-- position, whose turn and the score. It lives no longer than the conversation, it
-- is swept, and in the Article 30 register it stands as temporary game state rather
-- than as the contents of a conversation.
CREATE TABLE chat_games (
  -- A cascade, not a span: "end it" and the death of the conversation take the
  -- game the same instant, without waiting for `expires_at`. Added 2026-09-10 —
  -- without it a person would be told "the history is gone" while the position
  -- and the hands sat there until the span ran out.
  chat_id      uuid PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  class        text NOT NULL,                         -- grid | free | dots | deck | dice | physics | word
  state        jsonb NOT NULL,                        -- position, stock, whose turn, hands
  score        jsonb NOT NULL DEFAULT '{}'::jsonb,    -- this pair's score, accumulating between games
  seq          integer NOT NULL DEFAULT 0,             -- the board version, as in table_games (2026-09-16, DATA-3)
  last_move_hash text,
  pending      jsonb,                                  -- the open proposal or the line-up confirmation
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- The earlier of the two spans, not "the end of the conversation": each side has
  -- its own span (§5), and the board goes out for both at the first death.
  -- Clarified 2026-09-10 — the previous wording did not say whose end it meant.
  -- Rewritten on every own message or move of either side: SET expires_at =
  -- least(span of A, span of B) — clarified 2026-09-15 after the final panel (DATA-8).
  expires_at   timestamptz NOT NULL
);

CREATE INDEX chat_games_expiry ON chat_games (expires_at);
-- The sweeper: a daily `prune_chat_games` job takes rows with `expires_at < now()`
-- in batches of 5000 and comes back in a minute while a batch comes back full —
-- the same shape as the idempotency sweep (`scheduled.ts`). The row is deleted by
-- the transaction that sets the first `gone_at` (§8.10): the board goes out for
-- both at the first death, and the sweeper is insurance, not the path (2026-09-15).
--
-- Backups live 14 days (the Article 30 register), so a ten-minute conversation's
-- game lives in them for those two weeks. That is a price, not a footnote: saying
-- "lives no longer than the conversation" without it would be untrue.

-- The score lives on the TABLE, not on the game: it accumulates between games and
-- goes out with the table (decided 2026-09-09). A separate table rather than a
-- column in `table_games` for exactly that reason — a game ends, the score
-- continues.
--
-- What goes out is a score by seats at the table, not by identities: `identity`
-- lives here by the same rule as everywhere — present in the database, absent from
-- the API answer (§8).
CREATE TABLE table_scores (
  seat_id      uuid PRIMARY KEY REFERENCES table_seats(id) ON DELETE CASCADE,  -- the table follows from the seat; a separate table_id allowed a score on another table's seat (2026-09-17, DATA-2)  -- the score belongs to the seat, not the identity: whoever leaves does not carry it, whoever returns starts from zero (2026-09-16, SEC-12, DATA-1)
  points       integer NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
```

**What is hidden lives in `state`, and the read cuts it out.** There are three hidden kinds, not one — clarified 2026-09-10, where the rule used to speak only of hands: the **hand** (the private part of the stock), the **undrawn part of the stock** (the boneyard in dominoes, the deck in cards) and the **guessed word** of the `word` class. The rule is general: the read hands over exactly what the primitive declared open, the same for `table_games` and `chat_games`. The node sees
everything — that is accepted and stated plainly for a table — but it may not hand
over somebody else's hand: the "Hand" primitive is defined as the private part of
the stock, visible only to its owner (§6), and a spectator and an opponent are
equally non-owners here. The rule is simple: **your own hand and the backs of the
others go out**, and this is the only place where reading the state depends on who
is asking.

- **The zone and radius are a phrase's**, because a table is seen by the same
  circle-overlap rule. It introduces no geography of its own — and **the same
  rounding applies on the way out**: a cell stepped by `area_radius`, by the
  formula in §8.3. A table is a stronger pseudonym than a phrase, not a weaker
  one: it lives until silence rather than 4:20, it carries no quota at all
  (2026-08-30), and one person may put up any number of tables sharing a centre.
  The exact coordinates stay in the database — the overlap is computed from them.
- **`table_lines.brand` and `tables.brand` are independent, and nothing holds them
  equal — decided 2026-09-08.** It stood open from 2026-08-31 as a suspected
  missing constraint; there should be no constraint there. `brand` on both tables
  is **attribution only**: on a table it is the face it was set up under, on a
  line the face its author arrived under, and those are different questions about
  different people. A neighbour who came through one storefront sits down at a
  table set up through another — the world is one (§8.3), and a table is seen by
  intersecting circles, not by a face. A `CHECK (brand = (SELECT brand FROM tables
  …))` would forbid exactly what shared faces exist for.
  The price is named: **one table's lines may carry different `brand` values**, so
  a report of "how much speech under our face" counts such a table once per
  storefront. That is the right answer — speech did happen under each face — but
  it reads as "lines", not "tables".

- **`created_by` exists and grants nothing.** Moderation and abuse work need it —
  tables carry no limit at all (2026-08-30), and when a limiter is needed there
  will be nothing to count without this column. It is part of no response. The
  price is named: a fresh table usually has one sitter, and that sitter is the
  one who started it — "it never goes out" protects the column, not the inference.
- **`ON DELETE SET NULL`, not `CASCADE` — decided 2026-08-31 by a review panel.**
  §8.2 promises a closed identity a real `DELETE` after 30 days; with no
  behaviour named it would fail on the foreign key, and the irreversible erasure
  screen 12 promises would not happen. `CASCADE` is wrong here: it would take
  away the very line a notice under Article 16 was filed against, while the
  snapshot of it lives a year and points at the row. `SET NULL` erases the person
  and keeps the evidence. **The six older columns were brought under the same rule
  on 2026-09-02, in one pass.** The rule reads: a row that is content or evidence
  loses its author — `SET NULL`; a row that is only about the person goes with
  them — `CASCADE`. Under it `feed_messages.author_identity` becomes nullable and
  takes `SET NULL` (a phrase can be the subject of an Article 16 notice), while
  `likes.liker_identity`, `identity_stats.identity`, `match_participants.identity`,
  `chat_participants.identity` and `hidden_messages.identity` take `CASCADE`: a
  like, a counter, a place in a match, a place in a conversation and a personal
  hidden list mean nothing without the person, and the first two also sit in a
  primary key, where `NULL` is impossible. The price is named: code reading
  `feed_messages` must expect a `NULL` author — a phrase without an author is not
  a fault, it is an erased person. And the delivery queries of §8.3 and §8.5 that
  join `identities` by author must do so with an outer join or filter such authors
  out explicitly: an inner join drops that phrase from the feed silently, and the
  silence will look like a disappearance.
- **`joined_at` *is* the "a newcomer sees nothing from before" rule**: the line
  feed is cut by it rather than by a flag of its own.
- **`visible_at` without `expires_at`**, unlike a phrase: a line at a table has no
  span of its own and goes with the table. The span is single and shared, and it
  lives in `tables.last_move_at`.
- **The span of silence is 60 minutes — the number named on 2026-08-31.** Until
  that day there was only the adjective "sliding", and no sweep could be written
  from it: `last_move_at` exists, and there was nothing to subtract. Sixty is not
  invented but taken from the conversation, where `chat_participants.idle_ttl_minutes`
  stands at `DEFAULT 60`; the difference is that a table's span is one for
  everyone (2026-08-27) rather than each sitter's own. The price is named: a table
  where a move is pondered for over an hour closes under the people at it — and if
  that turns out to be short, the number changes here, not in the code.
- **One statement removes a table**, and both cascades above exist for it:
  `DELETE FROM tables WHERE closed_at IS NOT NULL OR last_move_at < now() -
  interval '60 minutes'`. `closed_at` on its own sweeps nothing — it is a mark,
  not a deletion — and without this statement public speech at a table would sit
  in plaintext forever, while §8.8 promises the opposite for a conversation
  between two. **The sweeper does not exist yet, and neither does the `tables`
  table in the node** — as with identities (§8.2) —
  and that is written down as an open item rather than passed off as done.
- **The order when there is not enough room: phrases first, then tables, then
  offers. Decided 2026-09-10.** The shares are measured against different bases — a
  table against all delivered cards, an offer against the ordinary ones — and with a
  small selection both ceilings do not fit. The offer gives way: §3 of the
  storefront mechanics already calls it a guest in the neighbours' feed, and a table
  a meeting place of the neighbours themselves.
  The limit was computed: **no more than 31.8% of the selection is not a phrase**
  (tables 25%, leaving offers 6.8%). The price is accepted: in a small neighbourhood
  a café may not appear at all, and the venue will have to be told why. The reverse
  order is worse: a table with one person sitting at it that misses the selection
  never gathers company, while an offer waits for the next one.
- **Which tables reach the quarter of the feed — random ones, and the quarter is
  counted after blocks. Decided 2026-09-09.** The share was named on 2026-09-02
  and the selection rule was not, and without it there is nothing to write the
  ranking from.
  **Random rather than by recency of a move:** a table with one person sitting at
  it makes no moves by definition — it is waiting for its first guest — and any
  "liveliest first" order would bury exactly the tables the screen exists for. The
  price is accepted: the selection is not stable between refreshes and a table you
  saw can be lost; the feed refreshes itself anyway, and there is a way back to
  your own table — the line in the feed's header.
  **The quarter is counted against what a person can actually see**, that is,
  after blocks have removed other people's tables. Otherwise whoever blocked
  somebody would see fewer tables than their neighbour — a block would quietly
  punish the person who used it, which the decision of 2026-08-26 ("a block does
  not lower the ceiling") rules out. The price: the selection is computed per
  reader, so a shared per-zone cache will not do.
- **Setting up a table means sitting down at it and standing up from the previous
  one (a consequence, written down 2026-09-10).** A table with nobody sitting at it
  does not reach the feed, so setting one up has to seat its author, or they would
  put up something invisible. And the unique index `table_seats_one_at_a_time` will
  not let them stay at the previous table either: the same button lifts them from
  it. The composer screen has to say so **before** the tap — nobody should leave
  somebody else's game silently by pressing "set up".
  Whoever sets it up is playing from the first second (`playing_from` is set): they
  are alone at the table, and there is nobody to ask.
- **Sitting at a table and playing at it are different things, decided
  2026-09-09.** Someone who sits down gets **the chat and the board**, but not a
  turn: to play, they apply for the next round. A game in progress is not
  interrupted by somebody arriving, and that is the whole argument — otherwise
  "sit down" would mean stepping into another people's game halfway through. The
  distinction is held by `playing_from` in `table_seats`: `NULL` means sitting and
  talking, a timestamp means playing from that moment.
  **A spectator sees the whole board except the hands.** Nothing new is needed for
  that: the "Hand" primitive is already defined as the private part of the stock,
  visible only to its owner (§6), and a spectator is simply one more non-owner. So
  they cannot whisper somebody's cards to a partner — nobody but the holder sees
  them.
- **The application is opening words, the refusal is an explanation, and both are
  ordinary lines.** They are visible to everyone at the table, go through the same
  moderation queue, fit the same 128 characters and are reported under the same
  `table_line` target (`docs/dsa/SPEC_EN.md`). Deliberately so: an addressed
  application "to the players only" would have introduced a message from one
  stranger to another **with no mutual like** — a channel that exists nowhere
  (§8.11) — and needed a rate limit and a notice target of its own. The price is
  accepted and it is unpleasant: a public "we are not taking you, because…" is
  read by everyone sitting there, and that stings more than a private no.
- **One application per game — decided 2026-09-10.** Refused: the next application can be made for the next game, not straight away. No separate number or timer is introduced for this — the game itself is the boundary, the same moment as the line-up confirmation. Without a limit an application would be a channel for persistence **with a compulsory answer**: it is a public line, and a refusal demands a written explanation, so somebody refused could demand one as many times in a row as they liked.
  The price is accepted: in a long game — dominoes runs round after round — the wait is long, and the person sits as a spectator throughout.
- **The players decide, and a "no" without words is not cast.** Those whose
  `playing_from` is set vote; spectators do not decide who gets in. The refuse
  button stays inactive while the explanation field is empty: a refusal with no
  reason is not accepted, exactly as a moderation refusal without a statement of
  reasons is not (§5 of the storefront mechanics).
  **The deadline is the start of the next round, not a timer.** The application is
  made "for the next round" and is settled by it: whoever has not objected by then
  did not object. The product does not add a fourth timer beside the phrase, the
  conversation and the table, and "the round" is the one moment the players notice
  anyway.
  **An application is only made for a free seat — decided on the evening of
  2026-09-10.** The button is inactive while there are no seats, and says why: "no
  seats, wait for the game to end". It used to be available always, and a table for
  two with twenty hopefuls collected twenty public lines through the moderation queue
  — the conversation at the table drowned in applications, and those playing were
  left to write eighteen explanations or to stay silent. The cost is accepted and it
  is honest: **whoever taps at the right moment sits down**, not whoever waited
  longest. There is no queue as an entity — introducing one would promise a number, a
  deadline and a fairness that a table of neighbours does not have.
  **Silence lets in by the number of seats, not everybody — decided 2026-09-10.**
  The rule used to mean that anyone unopposed was taken: consent cost nothing, an
  objection cost a public explanation, and a person got in because nobody noticed
  them. As it stands now: a game has its own number of seats (chess two, dominoes
  up to four), and at the start of the round those unopposed sit down **in the
  order they applied**, while seats last. Whoever does not fit stays an applicant
  for the next round rather than a refused one — a refusal is still words only,
  and only from someone playing.
- **Players fall below the set's minimum — the game ends at once (the owner's decision of 2026-09-18).** A player stood up, was removed or stepped away, and fewer players remain than the set needs (one at a two-seat set) — `table_games.ended_at` is set in the same transaction with no result, the table lives, the one left sees "game over" and "play again" (a new game once the set is full again). Otherwise the one left would wait fifteen minutes for three auto-passes of an empty chair (UX panel 2026-09-18, UX-P-3).
- **A move has a deadline, and a missed move is a pass: decided 2026-09-10.** Since
  2026-09-09 the engine checks the turn order, which means the game stops on
  whoever is not there: left, shown out, or simply put the phone down — the others
  wait until the table itself dies. As it stands now: **five minutes per move**,
  then an automatic pass, and **three passes in a row make a spectator** — the same
  as an unconfirmed roster. The five minutes are **chosen, not measured**
  (`table.move.window` in `limits.tsv`), and chosen at the upper bound: that is how
  long a person may think in chess without being absent. The cost is named: in a
  slow game a pass will land on someone who was thinking, and the game is the worse
  for it — but it does not stop.
- **Being shown out is not being locked out — decided 2026-09-08.** The schema
  stays as it is: `table_seats` has `left_at`, no trace of an eviction, and coming
  back is a new `table_seats` row with a new `seat_no` (2026-09-16, DATA-1; this said `UPDATE ... SET left_at = NULL, joined_at = now(), playing_from = NULL` [retired])
  (clarified 2026-09-15 after the final panel, DATA-9: `joined_at` is what hides
  history from whoever sits down, and a return without resetting it showed every
  line and move made while they were away). A "this person may not return"
  column is deliberately not added — that is a trace about a person, and §1
  promises no trace is left; the table itself outlives neither party for long, it
  ends at silence.
  What guards against an insistent return is already there, and guards harder
  than it looks: **a table with the blocked person is not shown** (§8.9; since 2026-09-14 a block separates at the seat, this said "hides the table entirely" [retired]), and the block check
  is **symmetric** — one row in either direction is enough. So one person at the
  table suffices: they block, and the table disappears not only for them but
  **for the person shown out**, who then has nowhere to come back to. What locks
  the door is not a "may not return" list but the ordinary block, built for
  something else and working here without a single new column.
  The price is accepted and stated plainly: **until somebody blocks, the person
  shown out returns with the same gesture, as often as they like.** Between the
  eviction and the block there is a gap, and in it an eviction is a request to
  leave rather than a lock.
- **The board for two is not in the schema — rewritten 2026-09-10.** This used to
  read "the board is not in the schema: state is transient, encrypted under the
  conversation key where there is one". Both halves went stale in a single day: on
  2026-09-09 the board stopped being encrypted, and the table gained `table_games`
  and `table_scores`. As it stands: **in a pair** the state is transient, in the
  node's memory and in the `chat_games` cache with the conversation's span; **at a table** it
  sits in the database beside the table, because everything there is public by
  construction (§6.1).

- **The first round at a fresh table is opened by a "start the game" button — the owner's decision of 2026-09-18.** `POST /tables` creates the table and an empty game (`table_games` with no moves); the one who set it plays alone, those who sit down apply. "Start the game" for a player is the same `rematch` proposal (`POST /tables/:id/proposals {kind: rematch}`); before the first game it needs no finished one: the accepted applicants pass the 30-second "I'm here" window and sit down to play. Without the button nothing started the game — a dead end the UX panel found on 2026-09-18.
- **The majority of the players (spectators do not decide — 2026-09-16, SEC-24; at least two votes: with one player there is no removal, with two both are needed — the owner's decision of 2026-09-18) can ask someone to leave.** Nobody holds sole power over a table, including whoever started it: the neighbour who set up the board does not become its owner.
- **A block separates at the seat, it does not tear a game apart — rewritten 2026-09-10.** A table with a blocked person at it is still not shown, but sitting down is refused **both ways**: neither the blocked person into a table where the blocker sits, nor the other way round. This used to read "one person can hide someone else's game from another simply by joining it" — and the cost was larger than that: by joining a game in progress, an outsider cut it off mid-move for whoever was playing, and the others at the table lost a player for no reason.
  **This rule has no instant recomputation — decided 2026-09-10.** A block is
  symmetric and can be toggled any number of times, and a table would appear and
  disappear with it at once — so "block, look, unblock" answers whether a named
  person is at a table **right now**, and in which area. The unique index of one
  table at a time (§6.1) makes the answer unambiguous, while the product shows
  nowhere who is at their screen. As it stands now: **the set of visible tables is
  computed when the feed is opened and holds until the next opening**, rather than
  being recomputed on every change of a block. The cost is accepted and it is
  unpleasant: whoever lifts a block will not see the table straight away — not until
  the feed refreshes — and that has to be said to them in a line, not left looking
  like a fault.
  **A block during a game: whoever blocks leaves the table, and the game goes on for the others (decided 2026-09-14).** Before the button a person is told plainly: you will leave the table, and the game will go on without you. Their move becomes a pass on `table.move.window`, like anyone absent: the seat stays empty until the game ends, three such passes do not make them a spectator — they are no longer at this table, and cannot come back to it while the blocked person is there (clarified 2026-09-14 after the review panel: "leaves" and "passes" read as a contradiction). That puts the cost on whoever made the decision, not on the person it was made about, and not on four bystanders. [retired] This said "the only case where a table is torn apart… the game will end" — and that was exactly what landed on the bystanders: the game was cut off for everyone seated.
- The board lives within the chat and **disappears with it** (ephemerality).
- Sync in real time (see §7).

## 7. Realtime

- Messages, game-board state and table events arrive through **our own WebSocket** on the relay node (`src/chat/relay.ts`), over the **api proxy** (same-origin, via the gateway). Not Supabase — see §8.1. **A person's actions — a move, an application, a game offer, the hangman word — travel as signed requests, not frames; decided 2026-09-16** (`protocol_EN.md` §4.4, §4.6–4.7). [retired] This said "game requests go through our own WebSocket".
- New messages arrive without a reload; the city feed refreshes separately (`Refresh` / `Auto` ~6s).
- **The socket is authorised by a ticket, not by the request signature — decided 2026-08-21 from the review.** Measured on a live Chromium 151: a browser `new WebSocket()` sets no arbitrary headers at all — not one of `x-identity-sign`, `x-identity-session`, `x-identity-time` reaches the node — and cookies are abolished in this design (§8.2). So the socket had no authentication whatsoever, while the whole chat hangs on it. The order is: a signed `POST /chats/:id/ticket` returns a one-shot, short-lived ticket; the client passes it in `Sec-WebSocket-Protocol` (not in the query string — that is not signed and stays in logs); the node exchanges the ticket for a socket bound to the session and burns it.
- **Freezing a session tears down its sockets.** The signature is checked on an HTTP request, while a socket lives on by itself once checked, so "loses access immediately, including the delivery subscription" (§8.2) meant "until the TCP connection drops" without a separate signal. `NOTIFY session_frozen, '<session_id>'` in the same transaction that sets `frozen_at`; the node closes its sockets for that session.

## 8. Data model

Requirements level — schema as sketches; implementation is a separate step (migration `relay/node/db/018_chat.sql`, applied by `tools/migrate_db.ts` — 001–010, 012–017 and 020–021 are taken; 011 is held for step 1's identity, and 018–019 for the chat and whatever arrives with it. The reservation of 015–017 for the session, the share and the acceptances was lifted on 2026-09-08: those numbers went to DSA records, and keeping a reservation already broken means believing the document instead of the directory; the runner sorts by name).

**Core principle: no user identifier ever leaves the server.** A client knows exactly two kinds of UUID — a feed phrase id and a chat id. Who wrote a phrase, who liked it, who is in a chat with whom, how many chats someone has — all of it stays inside the database and never appears in an API response.

**Second principle: a brand is a face, not a boundary of visibility.** `identities` has no `brand` column and never will, while `feed_messages` does have one and must — but it is not a boundary of visibility. There is one world, divided only by geography and the age band.

This is a decision, not an oversight. A neighbourhood network split by which website you arrived from stops being a neighbourhood network: two people on the same street must see each other whether they came through one storefront, the other, or the terminal. And for a face whose own storefront is only just starting, the shared feed is the only thing standing between a person and an empty screen.

A brand still decides a great deal — just not this:

| A brand decides | A brand does not decide |
|---|---|
| texts, emails, styling, the legal entity | who is visible in the feed |
| where waitlist leads land (`scoped_storage`) | who a match is possible with |
| who sees them in the panel | who ends up in a chat |
| attribution: which face a person came through | — |

Technically the brand comes from the API key and from nowhere else (`lib/tenant.ts`), while a person is identified by their own signature (§8.2). These are different questions and must not be conflated: the key answers "which face", the signature "which person".

### 8.1. Stack

Our own node, not Supabase: Deno + our own Postgres (`relay/node/src/lib/db.ts`, driver `jsr:@db/postgres`).

- **Realtime** — our own WebSocket: `relayUpgrade()` in `src/chat/relay.ts` will terminate the room by `chat_id` and fan the ciphertext out. Not built: the route exists and answers 501, so the surface is reserved and nothing pretends to serve it. No table subscriptions: the database holds only the undelivered (§8.8), never history.

**Which node it is must not matter.** If a room lives in one node's memory, both participants have to land on that same node — stickiness on the balancer — and losing the node tears down every conversation on it. Instead the nodes talk over a bus on the Postgres we already run:

```
peer A ──ws── node 1 ──┐
                       ├── NOTIFY chat_<id>, payload  →  LISTEN on every node
peer B ──ws── node 2 ──┘        ↓
                          node 2 finds B's socket locally and delivers
```

`LISTEN` / `NOTIFY` fits unusually well here: it is **transit** delivery to whoever is live. The 8 KB payload limit covers a 256-character message many times over. If the recipient is on no node at all, the message is not lost: the node puts it into `pending_deliveries` and hands it over when they come back (§8.8) — **decided 2026-09-11, refined 2026-09-12**. The sender is not told: the node's answer is "accepted", and it has no other answer.

What it buys: any participant can connect to any node, no stickiness is needed, and a node failure takes down only its own sockets — reconnecting to a neighbour resumes the same chat. Zero new dependencies: Postgres is already there, Redis is not needed.

The limit to remember: the bus works within one database. The node pool in 8.1 assumes a shared Postgres; geographically separate independent databases would need something else — but that is a conversation for `chat-decentralized-ideas_EN.md`, not for v1.

**Two nodes per environment do not exist today, and that is checked in code rather than remembered (2026-08-21).** `relay/wizard/wizard.py` carries `assert_one_box_per_database` — the deploy **refuses** to bring up a second box for an environment that has a database, because each box gets its own Postgres and the state would drift apart in silence. So the picture above describes an architecture with nowhere to exist, while the acceptance criteria in §14 demand that very picture be shown. While that holds, the truth is:

- **v1: one node per environment.** The room lives on it, and no stickiness is required for the same reason no choice is required: there is one node. `NOTIFY` is still needed — it connects handlers inside the node rather than nodes to each other, and it survives a worker restart.
- **The pool is a precondition, not a consequence.** Before §14 can check "reconnecting to a neighbour", the environment needs a shared networked Postgres (TLS, firewall, a connection budget = pool size × node count) and `assert_one_box_per_database` lifted. That is separate work, and it must not be discovered at step 5.

**So v1 fans out from process memory — decided 2026-09-11.** The `LISTEN`/`NOTIFY`
bus remains the right answer and stays in the specification, but today there is
nothing to build it from: the driver delivers no asynchronous notifications (below),
and a second Postgres client for the sake of one `LISTEN` means a second driver in
the node's build and its own semantics for a dropped subscription — one more decision
nobody has taken.

As it stands now: the room lives in one process's memory, and that is **true by
construction** rather than by luck — `assert_one_box_per_database` in the pool wizard
refuses a second node on the same database. So the in-memory fan-out cannot quietly
drift out of step with reality: the day there are two nodes begins with switching
that check off.

The cost is named plainly and it is large: **that day the delivery layer is rewritten
whole** — accepted deliberately, because the alternative costs a second driver today,
for a node that does not exist yet.

**Today's driver does not deliver asynchronous notifications at all.** The node talks to Postgres through `jsr:@db/postgres@0.19`, which has no `LISTEN/NOTIFY` support implemented. So the bus needs either a different client or a dedicated long-lived connection **outside the pool** — plus a described behaviour on a dropped `LISTEN`: reconnect, and an admission that whatever was delivered during the gap is lost. That, too, is a precondition of step 5 rather than an implementation detail.
- **No RLS needed**: the client never talks to Postgres directly, a handler always sits in between. "Participants only" is a plain check in code.
- **Geo without PostGIS**: circles are computed from `lat`/`lon` + haversine (see 8.3). PostGIS is only needed once arbitrary polygons replace circles.

### 8.2. Identity and sessions

An identity lives **on the device**: `identity_id` and a key pair whose private half signs every request. **The node keeps only the public half** — no secret and no hash of one — so a leaked database does not let anybody impersonate people. Where the keys live depends on the face: in the web it is IndexedDB, in the terminal client `depth` it is a file in the mounted volume. There is no email and no password by construction; the only way back after losing the device is the **paper recovery code**, which the person carries away and which we can neither look up nor reset. It is asked for **at registration** (below: restored there on 2026-08-26).

This used to read "a secret, and the server stores the secret's hash" — a leftover from an earlier design, incompatible with the rest of §8: a public key has no hash, and a shared secret would mean the node can sign as the person. Corrected 2026-08-12, before it reached any code.

**Every client starts as its own identity.** The key is born locally and nothing ties it to any other: the web on a phone, the web on a laptop and `depth` in a container are three different neighbours until the person transfers an identity there. The consequence is accepted deliberately: one person holding two separate identities appears twice in the feed and can like themselves. That is the price of refusing to recognise devices, and it is cheaper than a fingerprint (below).

```sql
CREATE TABLE identities (
  id               uuid PRIMARY KEY,
  name             text NOT NULL CHECK (char_length(name) >= 1 AND octet_length(name) <= 400),  -- 24 graphemes: node
  age              integer NOT NULL CHECK (age >= 13),  -- no upper bound: 2026-08-28
  identity_public_key text NOT NULL,    -- long-lived key: proves the identity (§8.13)
  recovery_auth_hash  text,             -- hash of half the paper code: how the node finds the identity
  recovery_wrapped_key bytea,           -- the long-lived key under the other half; the node cannot open it
                                        -- filled at registration (§8.2, edit of 2026-08-26)
  name_state       text NOT NULL DEFAULT 'accepted' CHECK (name_state IN ('accepted', 'pending', 'rejected')),  -- §8.2
  name_pending     text CHECK ((name_state = 'pending') = (name_pending IS NOT NULL)),  -- the name awaiting the verdict: the previous one stays in force until then (2026-09-16, DATA-22)
  languages        text[] NOT NULL DEFAULT '{}' CHECK (cardinality(languages) <= 3),  -- feed languages, up to three; on the node because the node applies the feed filter (2026-09-16, DATA-22)
  -- stepped_away_at [retired 2026-09-14]: the "stepped away" label lives on the chat participant (chat_participants.away_marked, §8.6)
  filter_age_min   integer,             -- clamped into band(age) on write; any integer inside the band (2026-09-17; moved into CREATE on 2026-09-20)
  filter_age_max   integer,             -- the same; the pair's order is held by the CHECK below, the clamp by the node
  CHECK (filter_age_min IS NULL OR filter_age_max IS NULL OR filter_age_min <= filter_age_max),
  signup_completed_at timestamptz,      -- NULL = the registration never reached the paper code: such an identity passes no membership check and is swept after signup.unfinished.ttl. Added 2026-09-20 after the review panel: the mark was promised by the paragraph below and had no carrier — recovery_auth_hash played the part by accident, and since 2026-09-19 recovery_lookup_id arrives in IdentityCreate, so the row is born with the column filled
  first_pin_grant_at timestamptz,       -- the one-time right to set a first PIN without the old one: left by an approved transfer and by a recovery, spent by POST /vault/init itself with the same UPDATE … WHERE first_pin_grant_at > now() - interval '1 hour' RETURNING (2026-09-20; the term `vault.first_pin.ttl` is an hour, the owner's decision of 2026-09-21: with no term "one-time" meant "for ever, until spent", and a stolen signing key could use the grant six months later). With no carrier the route could not tell a legitimate first PIN from a stolen signing key rewriting auth_hash and burning the owner's share
  stepped_away_until timestamptz,       -- end of the step-away; until then the product does not exist for the person; early return — now(), a past span is cleared by the session's first request
  created_at       timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz          -- NULL = live
);
-- the public recovery endpoint finds an identity by this hash: without an index
-- every miss scans the whole table, and misses are the bulk of that traffic
CREATE UNIQUE INDEX identities_recovery ON identities (recovery_auth_hash)
  WHERE recovery_auth_hash IS NOT NULL AND closed_at IS NULL;
```

**Appearance — one row per face, not columns on the identity (decided 2026-09-15 after the review panel).**

```sql
CREATE TABLE identity_appearance (
  identity  uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  brand     text NOT NULL,         -- the face from the API key, as feed_messages.brand
  theme     text CHECK (theme IN ('light', 'dark', 'system')),      -- NULL = the storefront default
  contrast  text CHECK (contrast IN ('normal', 'raised', 'maximum')),  -- screen 22's three steps by name (2026-09-20: was 'max', while accessibility and the API canon both say 'maximum')
  accent    text CHECK (accent IN ('terra', 'amber', 'turquoise', 'azure', 'violet', 'carmine')),  -- the six accents of the built kit (2026-09-20: 'gold', 'crimson' and 'teal' are names of the category tokens --cat-*, not accents)
  PRIMARY KEY (identity, brand)
);
```

- **Why a row per face.** One identity serves every face, while the storefronts' accent sets differ (storefront screen 22). Columns on `identities` would make a choice on one storefront the look of the other: amber chosen on sosed.place would turn into gold on neighbro.place, and a tap on the house mark there would overwrite it back. The price is accepted: one more table and one more cascade.
- **Never given to other people**; the node reads it only to answer the identity itself. Closing the identity deletes its rows at once, not after 30 days (below).

**What a person accepted is a table of its own, not a column (decided 2026-08-29).**

```sql
CREATE TABLE legal_acceptances (
  id               bigserial PRIMARY KEY,
  identity         uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  document         text NOT NULL CHECK (document IN ('terms', 'privacy', 'guidelines')),
  revision_date    date NOT NULL,        -- the date the document declares about itself
  revision_sha256  text NOT NULL,        -- sha256 of the substance: the file with its date line blanked
  accepted_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX legal_acceptances_latest ON legal_acceptances (identity, document, accepted_at DESC);
```

- **A pair (date, hash), not a version number.** A number is raised by a person,
  and people forget: the guidelines were edited on 2026-08-27 and went on
  declaring themselves the 13 August revision until 2026-08-29. A hash cannot be
  forgotten — it is computed from the very file the person read.
- **The hash is taken with the date line blanked out.** The date lives inside the
  file, so hashing the file whole would make every date edit a text edit, and
  "the date moved while the text did not" would be indistinguishable from a real
  new revision. The substance hash plus the date beside it cover the whole file
  and tell those cases apart.
- **Only the three English originals are hashed.** The clause inside every
  translation says the English version governs; that is what was accepted. The
  price is accepted: someone who read a translation is signed under a text they
  never saw — but that is exactly the legal position the document already takes.
- **A log, not a current value.** An `accepted_legal jsonb` column on
  `identities` would be one table cheaper and would answer only "what is
  accepted now". A dispute asks something else: what was accepted then and when,
  the previous revision included — and only a row per acceptance answers that.
- **What a change costs is stated in the manifest itself.** Each document
  carries `reaccept`, and since 2026-09-15 it is `required` for all three: the
  community guidelines need the checkbox too (decided by the owner after the final
  panel, LAW-14). `required` means the identity **cannot publish or open a chat**
  until it accepts again; the feed still reads; screen 15 marks the document as
  changed. [retired] This said `silent` for the guidelines, with the node writing a
  new row itself: the journal then stated that a person accepted a revision nobody
  had shown them, so the record of acceptance was false by construction.
- **The manifest reaches the node from the storefront**
  (`/legal-manifest.json`, built by the storefront deploy out of
  `deploy/legal-revisions.json`). The node stores no texts and computes no
  hashes: the documents live where the person reads them.

**Three edits in this table, all made 2026-08-21 from the review.** The recovery columns were made nullable back when the code was issued at the first chat: `NOT NULL` made it impossible to create an identity at all. Since 2026-08-26 the code is issued at registration again and they are filled straight away — the nullability is left as it is rather than rewriting the schema for a column that is always populated anyway. The partial unique index is there because this hash is what a public endpoint searches by, and two codes pointing at two rows would have been resolved silently, taking the first. `name_state` is there because the rule "while the name stands rejected, no match opens" needs a state that the schema had nowhere to keep.

- **Name and age** are the only registration data, asked **on the first visit**, before the feed. There is no anonymous browsing: age comes before everything else because it decides what the feed hands out (see "Age bands"). Hence both columns are `NOT NULL` from the start.
- **Name and age can be changed** without losing the identity. A deliberate trade: "registration data" stops being immutable, and nobody has to erase themselves over a typo or a birthday.  **Once a year** the app re-asks: "still 38?" — one line, dismissed with a tap.
- **The name changes only on a clean slate — decided 2026-08-20, narrowed 2026-08-21 from the review.** While the identity has **a live phrase in the feed or an open chat**, the **accepted** name is frozen; once neither remains, it becomes editable again. **The freeze does not extend to a name the queue rejected: that one is always editable.** Without this proviso the rule locked itself — the post passed the check, the name did not, the live phrase made the slate unclean, and the offer to "go and update the name" became impossible for the whole 4:20; the only way out was deleting a post that had passed, which is exactly the price §13 declared unjustified. The freeze protects against **substituting what the other person already accepted**; a rejected name nobody ever saw has nothing to substitute. The reason is that the name is the only thing by which a peer recognises who they agreed to talk to (§8.11: the feed never reveals an author, the name appears only from a match). Swapping it under a live conversation is a way to deceive rather than a convenience, and forbidding it here is cheaper than a system message sent after the fact. None of this touches age: it changes at any time and only upwards (see "Age bands"), because a birthday will not wait for a clean slate.
- **The name is accepted at registration, and every change goes to the queue — the owner's decision of 2026-09-22.** [retired] This said: "The name goes through the same moderation queue as a phrase — at the first publication and on every change (decided 2026-08-20)". The code never did that for a day — registration writes `name_state = accepted` (`identity.ts`), and the owner decided to keep it rather than catch up with the spec. The price is named: the moderator never sees the first name. What holds it instead: the name is visible to nobody before the first match (§8.11), and there is no match without a published phrase (§8.4); a change of name goes to the queue and is accepted with the next phrase (§8.3, 2026-09-22). What follows is the history of the decision of 2026-08-20, as it was: By the first post the queue already exists (§13, step 2), so no "name accepted unchecked" window arises: until that moment the name is visible to nobody, the feed included. **The first publication waits on the name — edit of 2026-08-26, overriding the earlier rule.** What stood here was "a rejected name does not cancel the post, they are checked separately". [retired] Separateness closed the wrong hole: the post reached the feed and was liked while its author's name stayed unchecked — and arrived at the peer with the very first match. Now the phrase reaches the feed only when **both** are accepted; if the name is rejected the phrase waits until it is fixed and then publishes itself. Its `expires_at` counts **from publication**, not from sending, so waiting costs it no life, and while it waits a second one cannot be sent — otherwise waiting would stack a queue around the ceiling. **One verdict for both — the owner's decision of 2026-09-22:** the moderator sees the name beside the phrase (`GET /admin/feed-queue` returns `name` and `name_state`), and `publish` accepts the name in the same call — a waiting one only: `name_pending` becomes `name`, `name_state = accepted`; a rejected name the verdict leaves alone, and the call carries the name the moderator read — changed underneath, the node answers 409 (review panel 2026-09-22) (`lib/feed_verdict.ts`, test "publishing a phrase accepts the name that goes out with it"). There is no separate queue of names. **The name refusal is built (2026-09-22):** `POST /admin/feed-queue/:id/refuse-name` sets `name_state = rejected`, drops `name_pending`, the phrase stays in the queue and the sweeper leaves it until its author sends a new name (`PATCH /identities/me`); `publish` with a rejected name answers 409; a match requires `accepted` on both sides — `pending` does not match either, since `name` still holds the refused one; the profile returns `name_state`.

**A consequence derived from §8.11:** the name becomes visible to another person only from the first match — and a match is now unreachable without a published phrase (§8.4), that is, without an accepted name. The rule "while the name stands rejected no match opens" remains as a second line, but publication now stands first.

**Silence changes nothing.** No answer means carrying on with the old number, in the same band, with no block and no nagging. The reason is simple: the re-ask is **not a check** — lying in it is exactly as easy as at registration — so punishing silence hinders the honest and takes nothing from the dishonest. The price is accepted: near the band boundary there will be people with a stale number, and they will see a slightly narrower feed than their age allows. That is an error towards caution rather than towards the sandbox.
- **A closed identity is deleted after 30 days — decided 2026-08-30 from a review.** Until then "start over" only set `closed_at` and the row stayed for good: name, age, public key, the hash of the paper code, the counters and the record of what was accepted. Screen 12 promises irreversible erasure and the mechanics promise that "delete everything" really deletes everything. **There is no way back inside those thirty days — decided 2026-09-11.** This used to read "a window for someone who pressed it in anger and wants back in with the paper code" [retired], and it contradicted the index above: the code is looked up only where `closed_at IS NULL`, so a closed identity is not found at all. The thirty days are not for the person but for the handling: a notice or a statement of reasons tied to a closed identity has to outlive the press, or there is nothing to execute them against. Closing, in one transaction, nulls `recovery_auth_hash` and `recovery_wrapped_key`, freezes the sessions, burns the shares, clears the queue of the undelivered, deletes the `identity_appearance` rows (added 2026-09-15 after the review panel: the privacy policy promises appearance goes on closing) nulls `support_requests.identity` (added 2026-09-14 after the review panel: screen 14 promised the link breaks on the press, while `ON DELETE SET NULL` would only fire after 30 days), and takes down what is live exactly as the PIN-limit freeze does (added 2026-09-15 after the final panel, DATA-7): phrases, those still being checked too, are deleted with their likes, queued `table_lines` are deleted, table seats get `left_at`, matches go out, `chat_games` rows are deleted, every participant of the identity's conversations gets `gone_at` and those `chats` rows are deleted — otherwise a closed identity would sit at a table for 30 days and its age would keep counting in the table's band: there is nothing to come back to and nothing to come back with. After the term, `DELETE`, and the cascades take the rest. **The sweeper was written on 2026-09-20** — `relay/node/src/lib/identity_sweeper.ts`, as the hourly `sweep_identities` job on the node's queue, carrying all three deadlines in one pass: an abandoned signup after an hour, a year without a session, thirty days after closing. [retired] This used to read "the sweeper does not exist yet, and there is nothing to write it against — the node's schema carries thirteen migrations and `identities` is not among the tables they create": the measurement was true on 2026-09-01 and went stale with migration `022_identity_and_sessions.sql`. **The sweeper does not execute the whole list above, and its own file says so:** phrases with their likes, table seats, matches, `chat_games` and the queue of the undelivered are untouched, because those tables do not exist — each joins the same statement in the step that creates it, and the paragraph above is the checklist for doing so.
- **An identity with no live session for a year is closed, and deleted 30 days later — decided 2026-09-15 by the owner after the final panel (LAW-7).** The node cannot learn that a browser was cleared, so without a term an abandoned identity kept its name, age, counters and record of acceptances forever. When none of its sessions has a `last_seen_at` newer than 365 days, the identity sweeper closes it by the same transaction as "start over", and the 30 days of `identity.deletion.delay` run from there. The term is `identity.inactive.retention` in `docs/facts/limits.tsv`, executor `identity.sweeper`. The price is named: someone who returns after more than a year finds no identity, the paper code included.
- **Starting over** remains a separate action: the old identity gets `closed_at` and everything goes with it, including its long-lived key.

#### The "stepped away" state (2026-08-26)

**Stepping away also removes the likes given — the owner's decision of 2026-09-18:** the same transaction deletes this identity's `likes` and `table_likes` rows with a `like_count` decrement on the phrases and tables; what was liked returns to the feed (§8.4), screen 25 empties. The price is named: bookmarks on tables have to be set again after a break.

A person may leave the place for a span — **20 minutes, an hour, or 4 hours** (2026-09-14: "until morning" [retired] was dropped, it had no end hour; "8 hours" [retired] the same day: longer than any conversation, review panel) — and this is not an interface pause but a state of the account on the node: `stepped_away_until timestamptz` on `identities`. **A phrase awaiting the queue's verdict is deleted along with the published ones (2026-08-30)** — there is no "accepted but held until return" state; **the hour counter behind the step-away prompt is reset by leaving**, because it counts continuous use. The point is not an errand but giving someone caught in the pull a real way out.

- **Table lines waiting for a verdict are deleted** in the same transaction, as on closing an identity: otherwise they would appear at the table after the person has gone (added 2026-09-16, DATA-26).
- **Phrases are deleted** (`DELETE`, not hidden) along with their likes: quota slots free immediately, and whoever returns has nothing to catch up on.
- **Matches are extinguished** exactly as when a phrase expires: this identity's `matches` are closed, and the other party sees a vanished offer with no reason given — someone else's decision is not reported here.
- **Chats are not frozen.** `last_activity_at` does not move and the TTL keeps running: each side has its own count, and one person leaving must not decide for the other. The consequence is stated plainly: a four-hour departure is survived only by a 260-minute conversation, and only if one's own message in it was no more than 20 minutes earlier; an hour — only that one too, twenty minutes — the 60 and 260 ones, and a 30 one if one's own message was under 10 minutes earlier (edited 2026-09-14: "eight hours" [retired] was survived by no conversation — the longest span is 4:20).
- **That session's sockets are closed** the same way as on freezing (§7): a `NOTIFY` inside the transaction, and the node drops its connections. [built differently on 2026-09-23: the freezing channel would close them with 4002, "the identity moved", the wrong word for a step away, so the sockets stay, requests through them get 409, and the other side's lines still reached a room already open — `protocol_EN.md` §4.9. Since 2026-09-24 (the owner's decision) they do not: the node hands nothing to the room of someone away, the lines wait in the delivery queue and come on return: at once on `DELETE /away`, and when the span ends by itself, within two minutes (the job sets itself a minute after its pass ends, and the node's worker looks at the queue once a minute; measured 2026-09-24: 60 and 120 s): the minute job `wake_returned` wakes the held rooms with the same `NOTIFY` as `DELETE /away`, once per time away (`relay/node/src/lib/away_waker.ts`, the `away_wake_due` flag in `db/047`, loop 2026-09-24; was: "with the next line in the conversation or on reconnecting" [retired]). One standing job for the pool's whole database, not one per time away: the job queue holds one standing job per kind (`db/020`), as in `db/043`. **The queue's ceiling — 200 lines and 260 minutes — holds during a time away too, the owner's decision of 2026-09-24:** past 200 the oldest lines are pushed out as they are without a time away; it keeps the node from being flooded, and two hundred lines are enough for a conversation with someone away]
- **A peer in an open chat sees a `stepped_away` label above the input, and the input stays live — edited 2026-09-14.** The label is lifted not by the span but by the returning person's first message or move in that conversation: the node holds it as the boolean `chat_participants.away_marked`: the step-away transaction sets it in all of the leaver's live conversations, and one's own message or move in that conversation clears it (clarified 2026-09-14 after the review panel: comparing `last_own_message_at` with the time of leaving was undefined when there had been no own message, and kept the time of the step-away on the identity indefinitely). The peer gets a single field, `peer_stepped_away` — in the open-chat response and as a socket event; no one else's timestamps go out. The reason is the 2026-09-11 review panel (S18): with three fixed spans, the moment the line vanished gave away which one was chosen. Opening the conversation does not lift it: the node does not know about visits and must not learn. The peer's messages wait in `pending_deliveries` and arrive on connection, if the conversation lives until the return: the queue is wiped at the conversation's first death (§8.8). The price is named: people write to someone who is not there, and the label may hang until the conversation ends if the returning person stays silent in it. (This said "instead of the ability to write" [retired] — on the argument "so nobody spends words on emptiness"; the words are not lost while the conversation lives — they wait for delivery.) This is the one exception to "we do not report someone's presence", allowed because the person declared the state themselves rather than the system inferring it.
- **Stepping away takes the game cache for a pair with it (2026-09-10).** One person
  leaving ends the game (§6), and since 2026-09-10 a game for two has a row in
  `chat_games`. The cascade from `chats` will not take it: stepping away does not
  kill the conversation. So the departure itself removes the row — not the sweeper
  on `expires_at`, or between the end of the game and the end of the span the
  position sits on the node without the game it belonged to.
- **A table is not deleted; whoever leaves stands up from it (2026-08-27).** Phrases go, the table stays: people are sitting at it, and tearing it down would throw out of the game those who have nothing to do with somebody else's break — and would hand the founder a power they do not have (§6.1).
- **Leaving early** takes a confirmation; the frequency of departures is not limited. The node writes `stepped_away_until = now()` and leaves the `away_marked` labels alone — one's own messages clear them (clarified 2026-09-14).

**The time-in-app counter never reaches the node.** It lives in the browser and counts like this: a visible tab plus a touch within the last three minutes. The offer to step away after an hour is the client's decision; the node has no business knowing how long somebody sat there, and no such record belongs beside an identity.

> **The measurement is incomplete (2026-08-26).** `visibilitychange` behaves differently across mobile browsers and there were no devices to check with. Captured in desktop Chromium: a page in a background tab starts at `visibilityState=hidden` with `hasFocus=false` and receives no events until activation — hence the rule that loading a page does not start the count. The `visible ↔ hidden` transitions could not be captured: there was no way to activate the window. Marked as unverified.

**A name goes through the same check as a phrase.** It is published text: the
other person sees it on the match card and in an open chat, so anything forbidden
in a phrase can be said in a name. The check runs the same path and the same
queue — **at the first publication and on every change** (decided 2026-08-20;
this used to read "at registration", but step 1 has no queue yet and the name is
visible to nobody).

There is one difference, and it comes from a name not being disposable: a
rejected name is **not saved**, and the previous one stays in force. For a phrase
a refusal means it does not exist; for a name it means the person stays who they
were.

**The case with no previous name is treated separately (2026-08-21).** On the
first visit the name is accepted unchecked — and it is exactly that name which
goes into the queue with the first phrase. There is nothing to fall back to, so:

- while there is no verdict the name in force is the one that exists, and it
  **still does not go out**: the feed never reveals an author, and another
  person's eye reaches the name only from a match (§8.11);
- if the queue rejected it, the identity is marked "name rejected", no match
  opens, and a **permanent line with the reason and an edit button** stays on
  screen — restricting in silence is not allowed, as promised in §7 of
  `dsa/SPEC_EN.md`;
- a rejected name is editable regardless of live phrases and open chats (above).

**The other person pays too.** While the name stands rejected a mutual like does
not become a match, and whoever liked will never know — likes are never reported
back here. That is accepted deliberately: showing a rejected name on somebody
else's screen is worse than withholding a match — but the cost lands on someone
uninvolved, and staying quiet about it is not an option.

An age needs no such check — it is a number, not text.

**There is no browser fingerprint — by decision, not by omission.** It used to be here: computed on the server from the IP subnet, the connection's TLS fingerprint and the header order, holding up the "one live identity per device" rule and a block that survived a new identity. It was removed for two reasons.

First, it stopped working. Everything it was built from came **from the connection itself** — and the application's traffic goes through the CDN, so what reaches the node is the CDN's connection, not a person's. The TLS fingerprint and header order became identical for everyone arriving through the same edge. Two of four inputs survived.

Second, it misled. The spec itself called it "a barrier, not a guarantee", yet it closed other people's identities and blocked neighbours behind one home NAT: the cost of a mistake fell on the uninvolved, while shedding it took ten seconds of clearing site data. A mechanism that fails to stop the person it aims at, and hits the person it does not, is worse than no mechanism.

What replaces it is **per-address rate limiting**, which exists and runs today; **feed moderation before publication** (§8.3), through a queue — which cuts the text, not the author; and **a chat door that opens only on a mutual like with double consent**. Of those three only the first is built. The queue exists as a mechanism (`lib/jobs.ts`), and the three job kinds registered on it are all housekeeping — there is no `POST /feed`, no `visible_at`, no classifier. This paragraph used to say all of it "already exists", which is the kind of sentence that decides how much time somebody budgets.

#### What exactly a request is signed with

The spec said "signed" without saying with what — which is precisely where an
implementation makes a decision quietly and lives with it for years.

**ECDSA P-256, decided 2026-08-19 on the measurement below.** It works in every
engine, including the ones with no Ed25519 at all.

**Ed25519 stood here, and it lost to a single number.** It is shorter, faster to
verify and has no parameters that can be chosen badly — all of which was true and
still is. But Chromium 136 and older cannot do it at all, and somebody on such a
device cannot sign a **single** request: that is not a degraded experience, it is
a locked door. P-256 has no such door in any engine measured.

The trade is named: longer keys and signatures, and an algorithm with parameters
— a curve and a hash — that must match on both sides and must not change quietly.
Everywhere it is `ECDSA` with `namedCurve: "P-256"` and `hash: "SHA-256"`.

```
signed over   <method>\n<path>\n<sha256 of body>\n<unix time>
headers       x-identity-session   the live session's uuid
              x-identity-time      the same time as in the string
              x-identity-sign      the signature, base64url
window        ±5 minutes
```

**The body enters as a hash rather than whole** — otherwise the signature would
have to be computed over a stream, and a large request would cost twice. The path
enters without its query string for the same reason the page counter drops it:
anything can be in there, and a signature has to be reproducible.

**A window instead of a nonce, and that is a trade.** Five minutes with no state
on the node means whoever intercepts a whole request can replay it inside the
window. A nonce would close that completely but would need shared memory: nodes
are interchangeable (§8.1), each has its own, and a shared one is a database write (for the seven one-shot routes of protocol §2 that write is made after all — the `nonces` table, 2026-09-16, OPS-1)
per request. With ephemerality measured in hours, five minutes of replayability is
cheaper than a permanent write.

**Measured against real browsers — 2026-08-19.** The "check before implementing"
is done: every operation §8.2 and §8.13 need was actually run in each engine,
rather than a name being looked up in documentation.

```
                        Chromium 151   Firefox 153   WebKit 26.5     ← current
Ed25519 generate/sign/verify   ✓             ✓            ✓
Ed25519 export raw / import spki ✓           ✓            ✓
Ed25519 wrapKey                ✓             ✓            ✓
X25519 deriveBits              ✓             ✓            ✓
ECDSA P-256, ECDH P-256        ✓             ✓            ✓
```

`wrapKey` was tested on its own account, not for completeness: without it the
long-term identity key cannot survive a device move (§8.13), so partial Ed25519
support would be no use to us.

**The age boundary was found, and all of it is in Chromium:**

```
Chromium 131  Ed25519 ✗   X25519 ✗
Chromium 136  Ed25519 ✗   X25519 ✓
Chromium 138  Ed25519 ✓   X25519 ✓     ← roughly May 2025
Firefox 132   Ed25519 ✓   X25519 ✓     ← November 2024
WebKit 18.2   Ed25519 ✓   X25519 ✗
```

So **Ed25519 fails on Chromium 136 and older** — the most common engine, whose old
versions live on devices that stopped updating. Firefox and WebKit pose no
problem; WebKit has a boundary of its own on X25519.

**That decided it.** The tail of old Chromium is small — the browser updates
aggressively — but for anyone in it the application does not work at all rather
than working worse. The installed base is not visible from here: the storefronts
have GA4, and the measurement had no access to its data. Deciding by an invisible
share, when the cost of being wrong is a completely locked door, was not worth
doing.

What was measured were Playwright's engine builds, not shipped Chrome and Safari,
and the installed base is not visible from here. What is certain: no Chromium
below 137 will sign a single request.

**One live session per identity.** At any moment an identity exists on one device. Moving to another is not an addition but a **transfer**: the new one comes alive, the previous one freezes.

```sql
CREATE TABLE sessions (
  id              uuid PRIMARY KEY,
  identity        uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  sign_public_key text NOT NULL,       -- request signing; one per device
  wrap_public_key text NOT NULL,       -- chat keys are wrapped to it (§8.13)
  label           text,                -- "Chrome, Android" — what the device called itself
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),  -- written at most once a day (§8.2, 2026-09-15)
  frozen_at       timestamptz,         -- NULL = live; set on transfer, on closing and on the tenth PIN mistake (§8.2)
  frozen_reason   text CHECK (frozen_reason IN ('transfer', 'closed', 'pin_limit')),  -- why it froze; exceptions apply to pin_limit only (2026-09-14)
  CONSTRAINT sessions_frozen_pair CHECK ((frozen_at IS NULL) = (frozen_reason IS NULL))  -- 2026-09-15, final panel
);
CREATE UNIQUE INDEX sessions_one_live ON sessions (identity) WHERE frozen_at IS NULL;  -- named 2026-09-20: an anonymous index refuses a transfer with a message no person can read
CREATE INDEX sessions_identity ON sessions (identity);  -- every session of an identity, frozen ones included: the partial index above serves neither a real DELETE's cascade nor the list of devices (2026-09-20)

-- One-shot actions: the pair (session, nonce) with the first answer, ten minutes (`nonce.ttl`),
-- shared by the pool. Introduced 2026-09-16 (protocol §2, OPS-1/SEC-17), DDL on 2026-09-17 (pass 4).
-- A replay with the same nonce on another route answers 409 `invalid_body`: the nonce is bound to the route.
CREATE TABLE nonces (
  session_id   uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  nonce        bytea NOT NULL CHECK (octet_length(nonce) = 16),
  route        text NOT NULL CHECK (route IN ('POST /tables', 'POST /away', 'POST /support', 'POST /recovery/reissue', 'POST /identities/close', 'POST /vault/pin', 'POST /blocks')),  -- the seven routes of protocol §2 by name: an eighth forces a DDL edit (2026-09-17, DATA-7)
  status       smallint NOT NULL CHECK (status BETWEEN 200 AND 299 OR status = 409),  -- only 2xx and state 409s are kept; 400/401/429 are not written (SEC-4)
  response     jsonb NOT NULL CHECK (octet_length(response::text) <= 1024),  -- 2026-09-20: was pg_column_size, which is STABLE rather than IMMUTABLE and measures the compressed form: a 3009-byte body is refused on insert and reads back from the table as 59 (measured on PostgreSQL 16.13), so the ceiling cannot be re-checked by the expression that states it  -- the body of the first answer only, no headers; a 204 body is 'null'::jsonb (DATA-8)
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, nonce)
);
CREATE INDEX nonces_expiry ON nonces (created_at);  -- swept by nonce.ttl by the same janitor that sweeps conversations
-- A replay is looked up only among rows with `created_at > now() - nonce.ttl` and only after the signature and
-- version checks: an invalid signature answers 401, not the stored answer; sweeping is hygiene, not the deadline (2026-09-17, OPS-2, SEC-2).
```

The partial unique index is the rule itself: the database will not accept a second live session, and no code path can work around it.

**Why one and not several.** The earlier design had many devices and symmetric revocation: any of them could disconnect any other. That had a hole no rule could close. Whoever talked a person out of their linking code could disconnect every device the owner had, leaving nowhere to come back to — and that is indistinguishable from the legitimate case ("was talking from the terminal, moved to the phone, killing the terminal"): to the node both are the same picture, a fresh session ending an old one. A rule like "younger than a day cannot revoke" broke exactly the case we needed, not the attack.

With one session that action does not exist. Transfer is the only mechanism, and it is performed by whoever is holding the device.

The price is stated plainly: **a phone and a laptop do not work at the same time**. There is no reading from two screens; there is only transferring back and forth, and transfers are cheap.

There are four kinds of key, and keeping them apart is the point:

| Key | Whose | For what |
|---|---|---|
| The identity's long-lived key | one per identity, travels with it | proving to a peer that this is the same identity |
| A session's signing key | one per device | signing requests; freezing strikes here |
| A chat key | one per conversation | encrypting the talk; dies with the chat (§8.13) |
| A vault key | one per device, from the PIN and the node's share | encrypting what sits on disk (below) |

Freezing works because the first two are separate: the server stops accepting a frozen session's signature, while the identity travels on with its long-lived key.

**Identity transfer — a code, not a link.** The device that is already signed in shows nine characters; the person types them on the new device. No link and no QR code: the transfer lives entirely inside the clients, there is no page for it and no domain is registered for it.

```
      K7Q - M3F - 2X9        alive for 2 minutes, applied once
```

The alphabet is Crockford base32 without `I`, `L`, `O`, `U`: they get confused with one and zero. Case does not matter and the dashes are optional.

```
device with  code = 9 random characters
the identity material = Argon2id(code, salt "xor.ad/device-link/v1", 64 MB, t=3)
             lookup_id  = material[0..32]    ─► goes to the server
             secret_key = material[32..64]   ─► goes NOWHERE
             POST /sessions/invite {lookup_id, ttl: 120s}
new          the person types the code, the same Argon2id yields the same 64 bytes
device       generates ITS OWN pairs: one for signing, one for wrapping
             POST /sessions/claim {lookup_id, enc_secret(sign_pub, wrap_pub, label)}
first        decrypted the envelope ─► so the code was typed correctly
             shows check = 4 characters of sha256(sign_pub ‖ wrap_pub), as the new one does
             ASKS THE PERSON (below) ─► only after "that's me":
             puts the identity's long-lived key into the reply envelope
             and sets its own frozen_at — the identity has left
node         UPDATE vault_shares SET share_enc = NULL, burned_at = now()
             WHERE session = <previous> — the share burns
node        UPDATE vault_shares SET share_enc = NULL, burned_at = now()
            WHERE session = <previous> — the share burns
```

**Freezing burns the vault share — decided 2026-09-11.** `frozen_at` only put out the
network half: the node stopped accepting the old device's signature. The local half
stayed — `vault_shares` hangs off the session by cascade, and a session is marked
rather than deleted — so the old phone went on decrypting everything it had
accumulated, with its own PIN. Somebody who lost a device and raised their identity
with the paper code believed they had shut the door; the door stayed open.

As it stands now: **any move of an identity burns the previous device's share** —
both recovery by paper code and a voluntary transfer. One rule instead of two is a
deliberate choice: only the person can tell "lost" from "just moving", and they are
asked at exactly the moment they are typing sixteen characters and inventing a new
PIN — the worst moment for a choice with an irreversible outcome.

The cost is named plainly and it is real: **move to a laptop for an evening and come
back, and the history on the phone is dead for good.** The disk is not wiped, the
files are there, but half of the key to them exists nowhere any more. In exchange, "I
lost my phone" really does mean a closed door rather than the appearance of one.

**64 MB and t=3 are measured as of 2026-09-11, not guessed.** Until that day the
numbers sat in the specification four times and had never been checked: WebCrypto
does not do Argon2id — it is WASM, and the existing gate said nothing about it. The
measurement across three engines (`scripts/check-argon2-cost.sh`, probe
`testing/argon2-cost.mjs`): **Chromium 272 ms, Firefox 272 ms, WebKit 296 ms** at
64 MB; at 32 MB, 143, 156 and 150 ms. No tab died for memory.

So 64 MB stays. The caveat is named plainly: **this was a laptop, not a phone** —
there it will take several times longer, and it is still a once-per-sign-in operation
rather than a per-message one. It had to be checked now: the parameters go into the
key derivation of every device, and changing them after launch would void every vault
share and every paper code at once.

**Stretching is not hardening, it is the precondition.** Nine characters are 45 bits: under a plain hash they fall in hours, and the server, which holds `lookup_id`, would derive `secret_key` itself. Argon2id makes each attempt cost about 0.1 s, turning an offline search into hundreds of thousands of years. The online one is closed by the two minutes and by the node's miss limits on `POST /sessions/claim`, the same as recovery's: per address, like the node's other public endpoints, and shared — 50 misses an hour across the node, then a 15-minute pause (`claim.miss.shared`, `claim.miss.pause`; decided 2026-09-15 after the final panel, SEC-4). [retired] This said "**five attempts per invite**, after which it burns": a mistyped code yields another `lookup_id`, no invite is found and there is nothing to decrement — the error §8.2 already corrected for the paper code. The screen has one line: "the code did not fit or has expired".

**What the server sees and does not see.** It sees `lookup_id` and two opaque envelopes — enough to match the two sides, and nothing else. The identity's long-lived key passes through it encrypted.

**Confirmation with context is a required step.** Decrypting the envelope proves the code was typed correctly, and that is enough against a typo. But a typo threatens nobody: the person at risk here is the one who read the code out over the phone, and they make no mistakes. So the old device stops and shows what it knows:

```
  a device is asking to take the identity

  called itself   Chrome, Android
  when            just now
  check           7KQ2 — the same as on the new device?

  Nobody from support will ever ask for this code.

  [ that's me ]                        [ does not match ]
```

Three lines, chosen because none pretends to be more than it is (the check line added 2026-09-15, below; this said "Two lines" [retired]).

**The "network" line was removed — decided 2026-08-29, and the price is named.** [retired] It used to compare the addresses of both sides: "a laptop and a phone at home give one network, a voice on the line a thousand kilometres away gives another". That signal was the **only verifiable one** on this screen: the label is sent by the same side that is asking for the move, and anything can be written in it. Without it the confirmation rests on a pause and a time rather than on data. What goes with it is a false signal — a phone on mobile data next to you also read "different" — and the requirement for the node to compare two devices' addresses.

**"Called itself", not "device".** The label is sent by the other side, is backed by nothing, and can say anything. Presenting it as fact would be lying on the very screen built against deception.

Until "that's me" is pressed, the other side receives nothing. Silence or a closed tab means the code expired in two minutes and no transfer happened.

**A second claim cancels the transfer, and both screens show a check string — decided 2026-09-15 after the final panel (SEC-5).** If a second `POST /sessions/claim` arrives on the same `lookup_id` before "that's me", the node cancels the transfer on both sides: the invite burns, and both devices say the code was typed twice and the transfer did not happen. The new device shows four characters of `sha256(sign_pub ‖ wrap_pub)` of its own pairs, and the old one shows the same four computed from the envelope, beside "that's me". Whoever read the code over a shoulder and typed it first gets a different string, and the owner sees it does not match their screen. The price is named: four characters are a check for the eye, not a proof, and they do not save a person talked into pressing.

What this step does not do: if the person has been talked into pressing it, it will not save them. It provides a pause and a fact — the decision stays with the person.

**The invite is single-use and lives minutes.** Applied or expired, it does nothing.

**In `depth` the code is read from standard input only** — never as a command argument and never as an environment variable: an argument is visible in `ps` to every process on the machine and settles into the shell history, and a variable is shown by `docker inspect`. The transfer screen is drawn in the terminal's alternate buffer and cleared on exit, or those nine characters would stay in the scrollback; the buffer does not keep them out of a multiplexer's log (`depth-client_EN.md` §2.1, experiment 2026-09-14).

**What freezing does.** A frozen device loses node access at once: its signature is accepted nowhere, delivery subscription included, so it receives no new messages **even in the chats that were open on it**. Nor are the keys of new conversations wrapped for it.

What freezing does **not** do is wipe the disk. The local database stays where it is, but nothing can open it any more: the move burns this device's vault share (above, decided 2026-09-11), and bringing the identity back does not bring the history back.

```
laptop is talking ─► transfer to the phone ─► laptop frozen, disk intact
        ...later...
the phone shows a code ─► the laptop wakes with a new share
                          ─► empty windows: the old database opens by no means
```

On the phone the chats are the same and the windows are empty: the new device has no history and no way to get any — messages are not in the database (§8.8), there is nothing to download. That is not a loss but "nothing here yet", and it should be said that way.

An empty window is not the whole of it, though: the old conversations are also **mute** on the new device, because the chat key stayed on the old one. That is fixed by reissuing the key (§8.13), the same way after a transfer and after a recovery.

**The keys of live chats are not rotated on transfer.** Rotation protects against a participant who keeps receiving ciphertext; a frozen one receives none, so there is nobody to rotate against. Written down here so the question does not come back.

The interface says so plainly, not in small print:

> The identity has moved to another device. Here it is frozen: new messages will stop arriving, and the conversations on this device become unreadable for good — even if you bring the identity back here.

**A delayed freeze was considered and rejected.** The idea was to keep the previous device alive for a day and show "you are being disconnected — [that's not me]" on it the whole time. Against identity theft that works, but it breaks the main legitimate case: someone talked from a borrowed laptop, walked away, and the laptop stays live for another day — where whoever sits down at that desk can cancel the disconnection. Leaving means closing the door now. The paper code (below) serves as the insurance instead: being locked out for good is not possible anyway.

**The transfer risk is social, not cryptographic.** Nobody will guess the code; they will ask a person to read it out. Hence the defences — two minutes, one application, the claim miss limits, a second claim cancelling the transfer, confirmation with context and a check string, and the paper code as the owner's last word.

**What became of "a different browser is a different person".** It stands, and now covers every face: **a different device is a different person**, unless the identity was transferred there deliberately. For `depth` it reads the same way: a different volume is a different person.

#### The PIN and local storage

**The name limit is 24 graphemes, and it lives on the node (settled 2026-08-26).** The number came from layout — that is what fits the conversation header and the match card at 375px without an ellipsis — but until this decision it existed only in the storefront, which made it a hint to the author rather than a rule: the client is open, and a ten-thousand-character name reached somebody else's conversation header. Longer is now **refused** rather than silently truncated: the name is the only thing by which a peer recognises who they agreed to talk to (§8.11), and handing a person a stump instead of what they typed substitutes their own name without their knowledge.

Counted in **graphemes**, not bytes and not code points: an emoji with a modifier and a letter with a diacritic are one character to a person, and the limit must match what they see. **The database holds only a wide net — decided 2026-09-15 after the final panel (DATA-6), checked in postgres:16:** `CHECK (char_length(name) >= 1 AND octet_length(name) <= 400)`. `char_length` counts code points, a family emoji is five of them, and a name of five family emoji was refused by `CHECK (char_length(name) BETWEEN 1 AND 24)` [retired] though the node's rule allows it. The same holds for a phrase and a table line: 128 is graphemes counted on the node, and the database holds `octet_length(text) <= 2048`. **But "wide" is not "unreachable", and that was measured on 2026-09-21:** 24 four-person family emoji are 600 bytes and three-person ones 432, so the byte ceiling refuses before the grapheme one and the promise of "24 graphemes" cannot hold for composed sequences. The owner's decision of 2026-09-21 is to state the limit honestly rather than move the schema: the registry, the screen and the node's refusal all say "24 graphemes and no longer than 400 bytes", and the refusal names which of the two was met.

**A PIN is mandatory and asked at registration** — six digits, twice. It does two things at once: it locks an open tab against whoever picks the device up, and it takes part in encrypting everything on disk.

Six digits are a million combinations, and on their own they are not protection: whoever copies the profile brute-forces them at home in minutes. So the vault key **cannot be assembled from the disk alone**: half of it comes from the node.

**An obvious PIN warns but does not lock — settled 2026-08-26.** A short list — repeats (`000000`), runs (`123456`, `654321`) and four-digit birth years inside the six — produces one line, "this PIN is easy to guess", and the "next" button stays live. A ban here would hit exactly the person who barely made it to the end of the single registration screen, and the gain would be smaller than it looks: a million options are no defence with or without the list; the node's share and the ten-attempt counter are. The list lives on the node, because another client will not draw the warning — but even on the node it stays a warning rather than a refusal.

```
device  material = Argon2id(pin, device salt, 64 MB, t=3)
        auth  = material[0..32]   ─► goes to the node
        local = material[32..64]  ─► goes NOWHERE
node    compares sha256(auth) with vault_shares.auth_hash — a constant-time
        comparison, since an early exit would report the length of the
        matching prefix (2026-09-20, while POST /vault/share was built)
        match ─► hands over the share, resets the counter
           no ─► one off the counter
device  vault key = HKDF(local ‖ share)
```

**An unfinished registration lives an hour and goes out by itself — decided
2026-09-10.** The share is only handed over once written (`vault_shares` below), so
by the time the paper code is shown the node already holds `identities`, `sessions`
and `vault_shares`. Someone who closes the tab between the code being shown and
confirmed leaves nothing on the device — and those three rows stay, with nothing to
remove them: the storefront promised "there is no identity" (screen 2), and the
promise was untrue.

The order of the steps does **not** change. Moving the write to the end would
either take the offline out of step 2 (the share comes from the node, so whether
the PIN matched would only be visible from the answer) or have the client generate
the share — and then both halves of the key sit on it at registration time, and the
offline-search argument below stops working exactly when it is needed.

As it stands now: until the code is confirmed the identity is marked unfinished and
**passes no membership check at all** — no feed, no match, no chat. **The mark is
set by `POST /recovery/confirm`** (protocol §4.1, added 2026-09-20): it hands the
node `recovery_wrapped_key`, and handing that cargo over is what confirming the code
means. Nothing earlier can carry the mark — every other call of registration happens
before the code is shown. An **hourly** `prune_unfinished_signups` job beside
`prune_magic_links` (`relay/node/src/lib/scheduled.ts`) removes unmarked rows by
cascade from `identities` after 1 hour (`signup.unfinished.ttl` in
`docs/facts/limits.tsv`). Hourly rather than daily — corrected 2026-09-20 by the
security lens: a daily pass against an hour-long deadline meant the draft row lived
in the database for up to 24 hours instead of one, so one limit was declared and
another enforced. An hour is not
an instant: somebody who went looking for pen and paper has to be able to come back
and finish writing the code down.

The cost is named: for that hour the half-made row does sit in the database, and
"there is no identity" is the truth about what that row **is**, not about it being
absent from the table.

**The node checks the PIN, not the device.** This is the easy thing to get wrong: hand the share to anyone who asks and an attacker takes it once, then brute-forces a million combinations offline, and the whole scheme collapses. Proof of knowing the PIN comes **before** the share is released, and the node keeps the attempt counter.

```sql
CREATE TABLE vault_shares (
  session       uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  auth_hash     text NOT NULL,       -- hash of half the material; the PIN itself is unknown to the node
  share_enc     bytea,               -- 32 random bytes UNDER the node's key; NULL = burned
  attempts_left smallint NOT NULL DEFAULT 10 CHECK (attempts_left >= 0),
  next_attempt_at timestamptz,        -- the node takes no attempt before it: the delay grows after the fifth (2026-09-14)
  locked_at     timestamptz,         -- the tenth mistake: access locked until the paper code, the share kept (2026-09-14)
  burned_at     timestamptz,
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((burned_at IS NULL) = (share_enc IS NOT NULL))
);
```

**The share is stored encrypted under the node's key — decided 2026-08-21 from the review, and it is not a detail.** This used to read `share bytea NOT NULL`, commented "meaningless to the node". They are meaningless only while there is no device. Put a database dump (a backup, an injection, a contractor, a seizure) together with one copied browser profile and `HKDF(Argon2id(pin, device salt) ‖ share)` can be computed offline for each of a million PINs. Neither `auth_hash` nor `attempts_left` takes part: they live on the node, and the node is out of the loop in that scenario. In other words **the whole design collapsed by exactly the route the paragraph above calls inadmissible**, only through a dump rather than through the endpoint.

The key comes from the node's existing mechanism (`relay/node/db/004_secret_keys.sql`) and does not travel in a database dump. Burning a share writes `share_enc = NULL` **and** `burned_at`, not one of the two: otherwise either the bytes stay or the row lies about its own state. There is **one** way to do it — clarified 2026-09-12: a move used to delete the row outright (`DELETE`), which left nowhere to write `burned_at`, while `NOT NULL` on `share_enc` forbade writing `NULL`. Now it is an `UPDATE` everywhere, and a `CHECK` keeps the two from drifting apart. The price is stated plainly: **losing the node's key equals losing every local history at once** — the same price as losing the share table, and it must be handled the same way.

**The PIN is asked for before every irreversible action — decided 2026-09-11.** Moving an identity, changing the PIN and starting over are carried out by the node only with a fresh proof of the PIN — the same `auth` as when the share is handed out, and with the same counter of ten. The proof sits inside the signed body of the request and the client does not keep it after the action: otherwise unlocking the tab once would buy the right to everything until the end of the day. It is not fresh in any cryptographic sense — `auth` is deterministic, the same 32 bytes on every entry of the same PIN, and bound to no request — so against an intermediary who sees it only TLS protects: an `auth` seen once works until the PIN changes (clarified 2026-09-15 after the final panel, SEC-8; this said "derived from the typed PIN afresh for every action… never cached" [retired]). Changing the PIN requires the **old** one and, in a single transaction, rewrites `auth_hash`, `share_enc` and returns the counter to ten.

The counter is decremented in its own short transaction, before the action itself: otherwise rolling back a refused action would roll the attempt back with it, and brute force would come free.

**"Erase conversation history" is not on that list.** History lives only on the device (§8.8), the node has nothing to execute, and a PIN check on the node would be theatre here: whoever holds an unlocked tab can clear the site's data without us. The check stays on the client, and the screen says so.

**With access locked by the PIN limit, all three actions refuse.** That is the price, said out loud: a device locked by the tenth mistake does not move the identity, does not change the PIN and does not start a new identity, because it has nothing left to prove the PIN with. The only way out is the paper code: on the same device recovery lifts `locked_at` and the freeze and returns the counter to ten, and the old PIN opens the history again; a forgotten PIN is replaced by a new one with a new share, and this device's history is lost; on a clean device — a new session, as before (§8.2 below; clarified 2026-09-14, this said "with the share burned… recovery mints a new share" [retired]). Without this rule the hole would be the exact opposite: an unlocked tab holds the signing key in memory, so after ten deliberately wrong entries a stranger with an unlocked tab would get "nothing to check" and walk off with the identity.

**The tenth mistake sets `frozen_at` with the reason `pin_limit` on this device's sessions in the same transaction — decided 2026-09-14 after the review panel (SEC3, SEC-A).** Forbidding the three irreversible actions is not enough: an unlocked tab holds the signing key in memory (this said "in the web the signing key sits outside the share and the tab lock is client-side" [retired], see below), so whoever holds the tab would, after ten deliberately wrong entries, post, write in conversations, report and contact support on the identity's behalf until recovery. The node refuses such a session everywhere except paper-code recovery and a new support request — at most 1 request a day, flagged `from_frozen` for the team, while the identity has no other live session and without reading earlier answers. A device frozen by a move or by closing the identity (`frozen_reason` — `transfer`, `closed`) gets no such exception: otherwise a lost phone would write to support on the identity's behalf after recovery. **In the same transaction the freeze takes down what is live, as a step-away does** (the "stepped away" state below): phrases, those still being checked too, are deleted with their likes, queued table lines are deleted, table seats are freed, matches go out, `chat_games` rows are deleted — otherwise they would stay under the name of an identity that can do nothing about them (clarified 2026-09-14 after the review panel). The price is named: both someone who forgot the PIN and someone whose phone was briefly in other hands can use nothing until the code is entered, and without the code lose the identity on this device; a holder of a stolen signing key locks access remotely but no longer erases the correspondence; while the node is under attack, code entry is closed — the pause renews and has no end (`protocol_EN.md` §8, item 7).

**In the web the private halves are kept only wrapped, as in `depth` — decided 2026-09-15 by the owner after the final panel (SEC-2).** The private halves of the signing and wrapping keys lie in IndexedDB only wrapped (`wrapKey`, AES-KW under a key derived from the vault key). On unlock the tab unwraps them into memory as `extractable: false`; on locking it forgets them. A locked tab holds no socket and accepts no messages until the PIN. [retired] Until this day both halves lay in IndexedDB as bare `CryptoKey` objects and the tab lock was client-side: whoever opened the storefront in the same browser profile could sign requests, take a socket ticket and unwrap new `chat_key_wraps` with the wrapping key — post, like and read every new message without the PIN. **Now the web and `depth` are the same:** in both faces keys at rest are opened by the vault key, the PIN plus the node's share. The price is named: every unlock costs an exchange with the node, and a locked tab learns of new messages only after the PIN.

**The delay between PIN attempts grows after the fifth — decided 2026-09-14 after the review panel (SEC2).** A counter of ten is not enough: without a delay other hands get through it in a minute. Attempts one to five — at once; the sixth after 30 seconds, the seventh after 2 minutes, the eighth after 10 minutes, the ninth after 1 hour, the tenth after 4 hours. The node holds it (`vault_shares.next_attempt_at`), not the client; an attempt before its time is refused and does not spend the counter — a correct one too, or the wait would test the PIN. An attempt is one transaction under `SELECT … FROM vault_shares … FOR UPDATE` (below): without the lock parallel attempts got around the counter. A correct PIN returns the counter to ten and clears the wait. The numbers are in `docs/facts/limits.tsv` (`pin.delay.*`). An honest person who mistyped five times waits half a minute; locking someone else's access takes more than five hours — at the device or remotely, with a stolen signing key, and then the wait locks out the owner's correct PIN too. A wait the person did not cause is a sign that someone else is using their session; storefront screen 12 says so, and the way out is the paper code.

```sql
-- a PIN attempt — one transaction (checked in postgres:16, 2026-09-14)
SELECT auth_hash, attempts_left, next_attempt_at, locked_at
  FROM vault_shares WHERE session = :s FOR UPDATE;
-- locked_at IS NOT NULL → "locked"; next_attempt_at > now() → "too early", a correct PIN too
-- the hash matched:
UPDATE vault_shares SET attempts_left = 10, next_attempt_at = NULL WHERE session = :s;
-- it did not (every SET expression sees the old row):
UPDATE vault_shares
   SET attempts_left   = attempts_left - 1,
       next_attempt_at = now() + CASE attempts_left - 1
           WHEN 5 THEN interval '30 seconds' WHEN 4 THEN interval '2 minutes'
           WHEN 3 THEN interval '10 minutes' WHEN 2 THEN interval '1 hour'
           WHEN 1 THEN interval '4 hours' ELSE interval '0' END,
       locked_at       = CASE WHEN attempts_left - 1 = 0 THEN now() END
 WHERE session = :s;
```

**A share belongs to a device, not to an identity.** Otherwise changing the PIN on a new device would break the previous device's database, and whoever took the identity and set their own PIN would read someone else's old conversations. So each device has its own share, its own PIN and its own counter, and nothing reaches another device's share — including a live session of the same identity.

**The tenth wrong attempt locks access on this device until the paper code, but does not burn the share — decided 2026-09-14 after the review panel (SEC-A).** [retired] This said "burns the share, and that device's conversations are gone for good": with a stolen signing key that let someone erase another person's correspondence without touching the device. Guessing is closed just the same: the node hands nothing out for a locked share. The price is named: ten mistakes no longer erase the history, and whoever counted on that as a self-destruct will not get it. From the seventh attempt the screen says it outright:

> Attempts left: N. After that this device is locked until the paper code.

(N is 3, 2 or 1; edited 2026-09-15 after the review panel: this said "3 attempts left" [retired], while the counter speaks on the eighth and ninth attempts too.)

Two prices are stated plainly. **Without a network the chat does not open at all**: no share, no key, nothing old to read and nothing new to see. And **the node now holds the thing without which people lose their conversations**: losing the share table means everyone loses their history at once, so its backups deserve stricter handling than the rest.

A share lives as long as its session. A session unseen for a year is cleaned up together with its share — otherwise the node accumulates an endless list of dead devices; the period belongs in the retention policy. `last_seen_at` is written at most once a day — `UPDATE sessions SET last_seen_at = now() WHERE id = :s AND last_seen_at < now() - interval '1 day'` — so a request does not turn into a write to the database, and the year is counted to within a day (2026-09-15, final panel DATA-15).

#### The paper recovery code

**Shown exactly once, and mandatory.** With a single live session, losing the device is the end of the identity, and the piece of paper is the only way out; it cannot be made optional.

**It is asked for at registration — restored 2026-08-26, overriding the move of 2026-08-18.** August's argument ran like this: the insurance was written before there was anything to insure; on the first minute a person has no chats and no messages, and a name and an age are retyped in ten seconds. The argument is sound — but it is about property, not about identity, and the cost of being wrong is not symmetric in the two directions.

**What outweighed it.** Someone the explanation failed to convince, who walked away, lost nothing: they come back a day later and carry on where they left off. Someone who lost their device inside the uninsured window comes back **never** — not in a day, not in a year, because they have nothing to present. The first mends itself, the second mends by nothing at all, and keeping open a window with no way out to save one screen at the entrance is not worth it.

**So the whole weight moves onto the explanation.** The screen must answer "what for", not "what is this": there is no email and no password, we cannot look the code up — we do not hold it; lose the device or clear the data, and there is nothing to bring you back with. The word "paper" stands in the first line deliberately: a screenshot lives on the very device that gets lost.

**Shown once as before, confirmation mandatory.** The code is shown a single time and does not let anyone past until two of the four groups are typed back: "next" gets pressed unread, and recovery cannot ask afterwards. A screen that can be skipped is the absence of a code, not its presence.

**This also covers the browser evicting the storage — written down 2026-09-11.** A browser may erase IndexedDB under disk pressure on its own, without asking, and the private half of the key then leaves along with the history — the identity is gone, and the person did nothing they could remember doing. No separate mechanism is needed: the only insurance is the same one, and it is already mandatory. What matters is that the confirmation does not depend on the face — typing two groups back is equally available to a browser and to a terminal — so §13 is not broken here. Asking the platform whether its storage is durable was considered and rejected: `navigator.storage.persist()` exists only in the web, a mount check only in `depth`, and any rule written through them splits into two rules for two faces. Nothing more can be promised: a code written down at registration and lost a year later saves nobody, in either face.

**There is no uninsured window any more.** The earlier text named it plainly and asked for a line on the registration screen; there is nothing left to name — the code is there from the first minute.

**The PIN stays at registration, and the reason is the terminal.** `depth` writes its key file immediately, and that file is encrypted with the same vault key (below); since 2026-09-15 the web too keeps the private halves wrapped under the vault key from the first minute (above). [retired] This said "In the web the keys sit as non-extractable `CryptoKey` objects and the vault key is needed only for local history". Deferring the PIN would mean keys sitting in the clear on disk — exactly what this whole construction refuses. The web and the terminal must not diverge: §13 puts the terminal first and says the face does not influence the protocol.

```
      RTQ4 - 8FMK - 2PZN - XW9D
      → "written down" is confirmed by typing two of the four groups back
```

The same two-halves trick: `Argon2id(code)` yields one half by which the node **finds** the identity, and one half that **wraps the long-lived key**. The node stores the wrapped key and cannot open it.

**The code is born on the device — recorded 2026-08-28.** The spec named the code's composition and both of its halves but said nothing about **who generates it**, and that is not an implementation detail: had the node generated the code, it would have known both halves at the moment of issue and could have unwrapped the long-lived key itself — so the promise one line above would cease to exist. The sixteen characters therefore come from `crypto.getRandomValues` on the device, only the derivatives leave it — the hash half for lookup and the key wrapped by the other — and the node never sees the code itself. Hence the honest "we cannot remind you of it": we do not have it. The same holds for the transfer code: the nine characters are generated by the device handing the identity over.

```
recovery  code typed on a clean device
          ─► the node found the identity, returned the wrapped long-lived key
          ─► the device unwrapped it, created a new session,
             a new PIN and a new share
          ─► THE OLD PAPER CODE IS DEAD, a new one is issued
             and shown once, as at registration
          ─► the previous session is frozen (the one-live rule)
          ─► the chats are there, but the old conversations stay mute
             until the key is reissued (§8.13)
```

**The paper code can only be replaced by presenting the current paper code.** Without that rule, whoever takes an identity issues themselves a new one first and locks the owner out for good — the insurance would vanish exactly when it is needed.

**What the code is made of is written here rather than left to the
implementation.** Sixteen characters of the same alphabet as the transfer code
(Crockford base32 without `I`, `L`, `O`, `U`), the salt `xor.ad/recovery/v1`, the
same Argon2id: 64 MB, `t=3`. That is **80 bits** — even with a million identities
a single hit costs on the order of 10¹⁸ attempts, each a tenth of a second. The
transfer code has its bits counted out loud; here there was only an example
string, so the alphabet and the length would have been chosen by whoever wrote
the code first, and we would never have known.

**The attempt counter has been taken off the identity — corrected 2026-08-18.**
`recovery_attempts_left` lived in the `identities` row and could barely ever
decrement: both halves come out of one Argon2id, so an error in a single
character breaks the **first** half, the node finds no identity, and there is
nothing to decrement. It fired in exactly one case: paper damaged such that the
first half survived and the second did not.

The recovery endpoint counts instead, in two places: **per address**, like the
node's other public endpoints (`lib/rate_limit.ts`), and **globally** — a total
miss counter that throttles on a spike. The second is not against guessing, which
the arithmetic already rules out, but against a flood into a public endpoint.

**The old code dies once the new one is confirmed — clarified 2026-09-10.** This
read "the moment recovery happens", and the moment was never named: between
unwrapping the long key and typing two groups of the new code there is a step, and
a break on it left a live identity **with no safety net at all** — the old sheet
dead, the new one unconfirmed, nothing to raise yourself with next time. Both are
one transaction: the new code becomes valid and the old one goes out together, or
nothing happens. The cost is accepted and named: while a person copies out sixteen
characters both codes are alive, and a photographed old sheet still works in that
window — minutes of it are cheaper than an identity with no way back.

Why it dies at all. It used to stay valid: the
rule "replace only by presenting the current one" required no new issue, and a
photographed sheet worked forever. But people recover precisely when something
went wrong — including when the paper may have been seen. Leaving it valid keeps
open the very door somebody may have come through. The price is named plainly:
somebody who has just lost a device copies sixteen characters again, with the
same two-group confirmation. Without it they have no insurance left.

**There are no "other sessions" to stop.** The question is natural, so the answer
lives here: an identity always has exactly one live session — the partial unique
index will not accept a second. Recovery freezes it, and that is the whole
list.

**The key file in `depth` is encrypted with the same vault key** — the PIN plus the node's share, with no exception for the terminal. A stolen or copied volume is useless: half the key is not in it, and getting that half means proving knowledge of the PIN to the node, which counts the attempts. This closes the terminal's main weakness: here they are a file — and since 2026-09-15 the browser keeps them the same way, wrapped under the vault key (above). The file itself is `0600`, and the client **refuses to start** if the permissions are wider, instead of a warning nobody reads. The price is the same as everywhere: **forget the PIN and that device's conversations are gone**, while the identity comes back with the paper code.

**Changing age and the band.** Age is freely editable **within your own pool**, but the 20/21 border can only be crossed upwards:

```
20 → 21   allowed (they turned 21)
21 → 20   refused — an adult does not walk into the teenage sandbox
```

Otherwise free age editing becomes the door into the sandbox and the whole band system is pointless. The rule is one-way and irreversible, which the UI must say before saving.

When age changes, `filter_age_min/max` are re-clamped into the new band, and every open chat receives a system message — the peer sees that the age changed, and when. **Built 2026-09-22, the owner's decision:** the node sends a `sys {kind: age_changed, age}` frame — the number with no ready text, the client words the line in the person's language (`routes/profile.ts`, in the same transaction as the edit; an end-to-end `depth` test). An open room gets the frame at once; whoever is not in the room sees the age in the inbox, where it already is:

```
age changed   → "they changed their age: 39"
```

**There is no such message for a name, and there cannot be** (decided 2026-08-20): with a chat open the name is frozen (§8.2), so there is nothing to change mid-conversation. [retired] This used to carry a line reading "they now call themselves Anya" — it described a world where the swap was allowed and merely trailed by a notice. The freeze solves the same problem earlier and without a trace in the conversation: the peer agreed to talk to a particular person, and a silent swap is a way to deceive, not a convenience.

Disclaimers (both required in the UI):

> Your identity lives on one device — this one. You can move it to another yourself, and then it freezes here. Clearing browser data or deleting the volume erases both the conversations and the session — and the browser itself may do the same when it runs short of disk; after that the only way back is the paper code you wrote down at registration. The conversations do not come back: they exist nowhere else, including with us.


> Creating a new identity loses every chat — yours and your peers'. Nothing can be restored: conversations live only on the participants' devices, never on the server.

**Age bands.** Age is not decorative — it cuts the feed. Two worlds that never meet:

```
band(A) = A ≤ 20  →  [max(13, A - 2), A + 2]      -- the sandbox
          A ≥ 21  →  [min(21, A - 2), ∞)          -- the adult pool
```

The line between 20 and 21 is soft rather than solid: right at the edge both rules reach across by the same ±2 years. A 20-year-old sees `[18, 22]`, a 21-year-old sees `[19, ∞)`, and they meet. Further from the edge the overlap ends: 19 and 22 no longer see each other, because 22 ∉ `[17, 21]` and 19 ∉ `[20, ∞)` — the rule breaks on both sides at once, with no one-way holes.

What matters is preserved. To reach the adult pool a teenager needs `A + 2 ≥ 21`, meaning they must be 19 or 20; everyone younger than 19 is cut off from 21+ entirely. And an adult never reaches deeper than 19: the lower bound `min(21, A - 2)` drops to 19 only for a 21-year-old, and by 23 it settles at 21 and goes no lower.

The rule applies **symmetrically**:

```sql
-- a pair is visible only if each falls inside the other's band
other.age BETWEEN band_low(me.age) AND band_high(me.age)
AND me.age BETWEEN band_low(other.age) AND band_high(other.age)
```

Asymmetry is unacceptable here: one side would like a phrase the other cannot see in their feed, and a match would be impossible in principle — the like would go nowhere.

On top of the band sits a **user filter**, clamped to it: narrower than your band is fine, by the year; wider is not. **Its bounds are free — the owner's decision of 2026-09-17, which reverses SEC-3 of 2026-09-15.** The age is shown to the other person next to the name on the match card and in the chat header (§8.11), so to whoever you talk to it is public, and 5-year steps were fencing what a match hands over anyway. The node accepts any `min <= max` inside the band; anything else is `filter_out_of_band`. The price is named and accepted: a handful of `GET /feed` requests with sliced filters gives every phrase author's age before any match, and a cell plus an age helps glue one person's phrases together; the owner judged age too weak a mark for that. [retired] This said "each bound is a multiple of 5 years, spanning at least 5 years" (2026-09-15, SEC-3), and before that "narrower is free".

**The edge of the band is stated out loud — 2026-08-26.** A twenty-year-old's band `[18, 22]` reaches adults, and symmetry holds — `band(22) = [20, ∞)` contains them. They can narrow the filter to 21–22 and see adults only — again since 2026-09-17; between 2026-09-15 and 2026-09-17 the 5-year steps made a sandbox filter equal to the band [retired]. No second ceiling is added for it. In the interface the bounds carry no numbers, so nobody learns from here that the wall stands at 21.

**What a person sees is in the storefront screens:** the handle does not pass the band, an adult's right end is labelled "no limit", and a band shifted by a birthday is announced in one line.

Both columns stand in the declaration of `identities` above (§8.2). **There will be no
separate `ALTER` — decided 2026-09-20:** no earlier state of this table ever
existed for a single day, its first migration already carried them, and an `ALTER`
in the spec would hand the next person writing a migration a "column already
exists". The pair's own order is held by the database:

```sql
CHECK (filter_age_min IS NULL OR filter_age_max IS NULL OR filter_age_min <= filter_age_max)
```

`band(age)` cannot be expressed in a `CHECK` — it depends on the age — so the
clamp stays with the node. Without this line a reversed pair would show an empty
feed with no error at all.

Age is self-declared, with no verification whatsoever. The bands separate teenagers from adults as far as that is possible without documents, and that limit should be understood plainly.

### 8.3. Feed and geography

A phrase is tied not to a city but to **an area the person chooses themselves** — not to where they are. They choose it on a **diagram** rather than a map: no face draws a map (decided 2026-08-28), because a tile tells whoever serves it which square is being looked at. So the point does not reveal a location anyway. **Coarsening is still needed, for a different reason — decided 2026-08-31:** not against "where is he", but against joining up one author's phrases. The reasoning is below, in the paragraph on what goes out.

```sql
CREATE TABLE feed_messages (
  id               uuid PRIMARY KEY,
  brand            text NOT NULL,                             -- ATTRIBUTION ONLY: which face the author arrived through
  author_identity  uuid REFERENCES identities(id) ON DELETE SET NULL,  -- never exposed, NULL = the author was erased
  text             text NOT NULL CHECK (char_length(text) >= 1 AND octet_length(text) <= 2048),  -- 128 graphemes: node
  mode             text NOT NULL CHECK (mode IN ('alone', 'company', 'party')),
  lang             text NOT NULL,                             -- the language the node detected at publication (storefront mechanics §7) — the feed filter runs on it (2026-09-16, DATA-22)
  lat              double precision NOT NULL,                 -- area centre
  lon              double precision NOT NULL,
  area_radius      integer NOT NULL CHECK (area_radius IN (100, 300, 1000, 3000, 10000)),  -- metres, in steps
  like_count       integer NOT NULL DEFAULT 0,
  discount_value   text,                                      -- NULL = an ordinary phrase
  conditions       text,                                      -- limits on the discount
  created_at       timestamptz NOT NULL DEFAULT now(),        -- when it was submitted
  visible_at       timestamptz,                               -- NULL = waiting on the moderation queue
  expires_at       timestamptz,                               -- set together with visible_at, same UPDATE
  CONSTRAINT feed_published CHECK ((visible_at IS NULL) = (expires_at IS NULL))
);
CREATE INDEX feed_expiry ON feed_messages (expires_at) WHERE visible_at IS NOT NULL;
CREATE INDEX feed_cursor ON feed_messages (visible_at DESC, id DESC) WHERE visible_at IS NOT NULL;  -- the feed cursor `(visible_at, id) < (:va, :id)` (2026-09-16, DATA-5)
CREATE INDEX feed_live_geo ON feed_messages (lat, lon) WHERE visible_at IS NOT NULL;  -- the geo cut of the live feed (2026-09-16, DATA-5)
CREATE INDEX feed_by_author ON feed_messages (author_identity) WHERE author_identity IS NOT NULL;  -- "one at a time" and "four per hour" at send time (2026-09-14)
CREATE UNIQUE INDEX feed_one_waiting ON feed_messages (author_identity) WHERE visible_at IS NULL;  -- "one at a time" is this constraint, not the count: a second waiting INSERT raises 23505; a refused row is deleted (checked in postgres:16, 2026-09-14)
```

**`brand` is attribution, and only that (clarified 2026-08-21 from the review).** The column stood here commented "every lookup is scoped by it" — describing exactly the visibility boundary that §8 rejects in its first principle above ("the world is one"). Two places gave two opposite rules, and whoever writes the migration would copy the DDL, not a paragraph four hundred lines earlier. The comment is corrected and the column stays: **it takes part in no condition of the feed query, the like or the match**, while the boundary of the DSA snapshot is set not by the column itself but by `visibility` next to each surface (decided 2026-09-07, discussed below): for an offer the face is the boundary, for the feed and tables it is not. The fear this sentence used to carry — a notice carrying somebody else's identifier pulling another tenant's row into the reporter's moderator view — is answered by routing rather than by narrowing the lookup: a notice whose copy belongs to another face is examined by the platform, not by the storefront it was filed through (`relay/node/src/lib/dsa_snapshot.ts`; the test `dsa_snapshot_columns.test.ts` holds that contract and caught the first, too-broad edit).

**The snapshot is bounded by what the notifier could see. Decided 2026-09-07.** The world is one while a notice arrives under a brand, and until this day it was unclear what the copy should follow: the storefront it was filed through, or the target. The answer is one rule for every surface, in one sentence: **the copy is bounded by what the notifier could see.** It lands differently per surface only because the surfaces differ.

For the **feed and tables** the world is one: `brand` there is attribution and takes no part in retrieval (see earlier in this same section). A phrase is visible to everyone whichever face they arrived through — so the notifier really did see it, and the lookup is not narrowed by a storefront. The notice follows the target. There is a price, accepted deliberately: **a moderator on the filing storefront will see a row attributed to another tenant.** That is not a leak — the row was public to the whole world before any notice — and refusing to examine it would mean answering "we cannot look at what you are looking at".

For a **venue's offer** it is the opposite: `docs/offers/SPEC_EN.md` declares `brand` the column "any search is bounded by", so there the storefront *is* the visibility boundary. An offer published under another face never existed for this reporter, and the right answer is `out_of_scope`, "we did not look under this face" — not "the target expired".

**How this was reached.** The snapshot code was written before the decision (`relay/node/src/lib/dsa_snapshot.ts`, 2026-09-01) and scoped the copy by the storefront the notice arrived through — not because that was decided, but because there was no time to decide. **A review panel on 2026-09-03 showed that one boundary cannot serve all three surfaces**, and in doing so changed the question: not "storefront or target", but "what bounds visibility on each surface". The answer of 2026-09-07 settles both — one rule, with the per-surface split derived from it rather than enumerated.

**The untrue answer was removed before the boundary was settled, on 2026-08-31** (`relay/node/db/014_dsa_notice_out_of_scope.sql`): the case used to be filed as "there was nothing to copy", telling the notifier the phrase had expired while it was alive and one query away. Since 2026-09-07 that case cannot arise on the feed at all — there is nothing left to narrow — while for an offer `out_of_scope` stays and means exactly what it says.

**It is written next to the surface rather than as one scope over every copy:** each `SNAPSHOTTABLE` entry now carries `visibility` — `world` for the feed and tables, `per_brand` for the offer (`relay/node/src/lib/dsa_snapshot.ts`). A surface added without it would compile and slip silently into the widest branch, so `dsa_snapshot_columns.test.ts` holds the field present, and `database.test.ts` holds both halves against a real database: a phrase under another face **is copied**, an offer under another face answers `out_of_scope`.

**An unattributed notice** — no face determined at all — is no longer refused on a world surface: there is nothing to narrow to, and the phrase was public. For an offer the `unattributed` reason stays: with no face, there is no boundary to look within.

Separate from the boundary, and by the panel's account costlier than it: **what happens when the owner cannot be determined at all** — for a chat, for a notice with no `target_id`, for an expired target, and for a surface the schema does not yet have. Today that is the entire flow. Answering "then it is the platform's notice" means a tenant stops seeing its own complaints; answering "then the storefront it came through" keeps the present behaviour as the fallback. The boundary was settled on 2026-09-07; this was not. Part of it went with the same decision: when the owner **is** determined and differs from the filing storefront, the notice goes to the platform. What remains open is the case where no owner can be determined at all.

`expires_at` was declared `NOT NULL` while being derived from `visible_at`, which is empty at insert. Checked by experiment in a container: `INSERT ... visible_at = NULL` fails the constraint, and `GENERATED ALWAYS AS (visible_at + interval '4:20') STORED` is rejected by Postgres — the expression is not `IMMUTABLE`. So the column is empty until the verdict and is filled by one `UPDATE` together with `visible_at`; the `CHECK` keeps them in step so that "published" and "has a deadline" cannot drift apart.

```sql
-- verdict passed (inside the verdict transaction, §8.3):
UPDATE feed_messages
   SET visible_at = now(), expires_at = now() + interval '4 hours 20 minutes'
 WHERE id = :id AND visible_at IS NULL;
```

**A private offer is a phrase with a discount, not a separate entity.** The neighbour giving away two stools writes the same phrase into the same feed; a non-empty `discount_value` is what makes it an offer. Everything else — geography, lifetime, likes, matching, chat — works without a single new line, because it is a post. What a private author may put in an offer (text, discount, conditions — and nothing else: no link, no promo code) is decided in `offers/SPEC_EN.md` §2.

**A business offer does not live in this table.** There is no identity behind it, and an empty author here already means something else: since 2026-09-02 `author_identity` is nullable, and a `NULL` there reads as "the person was erased", not "there was no author". An offer placed here would be indistinguishable from an erased neighbour. It stays a separate object (`offers/SPEC_EN.md` §3) and joins the feed when the delivery is assembled, by its venue's coordinates. It carries no like by construction: a like leads to a match, a match to a conversation, and there is nobody to converse with.

The quota counts **both** kinds of commercial card together — phrases with a discount and business offers alike: no more than one per ten ordinary phrases in a given person's feed. Otherwise "selling a stool" walks around the very limit the quota exists for.

What goes out is `{id, text, mode, lat, lon, area_radius, like_count, created_at}` (a table carries `game`, `name`, `playing`, `watching` instead of `text` and `mode`; tables are sifted by `table_likes` as phrases are by `likes`, 2026-09-17), where **`lat`/`lon` are not what the database holds**: the node rounds them to a grid node before sending. It stores the exact ones — the intersection is computed from them — and publishes a cell.

**Why — decided 2026-08-31.** The exact `double precision` centre used to go out, and an author's four live phrases carried one and the same triple `(lat, lon, area_radius)`. That is a stable pseudonym for as long as they live, while §8.11 promises the opposite: "what an interceptor does not see: … whether two phrases belong to one person". The promise was broken not by a leak but by the response itself.

**The cell is not only about what is handed out, but about what is computed —
added 2026-09-10.** Rounding a coordinate on the way out while checking visibility
against the exact one meant rounding precisely what was being measured: the radius
handle is a free instrument, and "visible / not visible" is the instrument's
reading. So the overlap in §8.4 is measured from the cell. The cost is accepted and
it is visible: at the edge of the circle a phrase appears and disappears in steps
the size of a cell rather than smoothly, and two people standing ten metres apart on
either side of a grid node will see different things.

**The grid step equals the phrase's radius.** Everyone who published with the same radius inside one cell then sends out **identical** coordinates, and equality stops being a signal. A random offset was considered and rejected: an attacker joins by proximity rather than equality, and four points within a couple of hundred metres group together after any jitter.

**How the cell is computed — written down on 2026-08-31, because a naive implementation cancels this whole paragraph.** The radius is in metres, `lat`/`lon` are in degrees, and the bridge between them is the one place where the decision breaks silently:

```
Δφ    = r / 111320
lat_q = round(lat / Δφ) · Δφ
Δλ    = r / (111320 · cos(lat_q))      ← cosine of the ALREADY ROUNDED latitude
lon_q = round(lon / Δλ) · Δλ
```

The grid is anchored at (0°, 0°) and what goes out is a grid node. The cosine is taken from the rounded latitude, and that is not pedantry: take it from the exact one and the longitude step becomes a function of an unpublished quantity. A thousand people in one cell would then get a thousand **different** longitudes, equality would vanish, and the exact latitude itself would be recoverable from the published pair by searching one integer — measured: 25–30 bits with a cautious float tolerance, 36–43 at full `double` precision, and the leak falls to zero only on the prime meridian. So the naive variant does not leak a little; it leaves exactly the unique pseudonym all of this is written against. The trap sits nearby: the query below has `cos(radians(:lat))` on the exact latitude — that is the coarse index filter, and it must not be carried into the rounding.

**The radius became stepped too — and that is the other half of the same hole.** A free integer from 100 to 10000 is 9901 values, which is close to a unique mark on its own.

**Every phrase has a zone of its own** — the circle, the radius and the "district or city" field live in the composer and are chosen at each publication, not once per identity. So the join is not guaranteed by construction: it appears **on repetition**, when a person publishes from the same place with a similar circle, which is both natural and convenient. How often that happens is decided by an open question — whether the placed point is remembered between openings (`00-mechanics_EN.md`, "Open") — and while it is open, the worst case is what counts.

Five steps — 100, 300, 1000, 3000, 10000 — widen the set inside which a value stops being a mark. **By how much was computed on 2026-08-31, and the earlier wording "shared with hundreds of neighbours" did not survive it.** On the most favourable reading (10% of residents in the app, each holding all four live phrases, steps equally likely) a cell in Paris holds 16 other phrases at 100 metres, 144 at 300 and 1600 at a kilometre; on sober assumptions (1% of residents, one publication a day) — 0.07, 0.65 and 7.2. For a 100-metre cell to hold two hundred neighbours you would need 250,000 people per km², denser than anywhere on Earth. So, honestly: **hundreds begin at a kilometre and up, and at 100 and 300 metres a cell holds single digits** — the lower steps hide weakly. The price is named twice: whoever wanted 700 metres gets 1000 and the control on screen 4 becomes five positions instead of a continuum — and whoever took 100 metres for precision hides less well than the word "cell" suggests.

**What this does not fix, second: the steps are not nested.** Publishing from one point at 300 metres and then at a kilometre sends out two cells, and their intersection is sometimes narrower than the smaller of them: simulated over 2 million points — 30% of positions narrow, in the worst case to 50 metres instead of 300. The pairs 100/300 and 1000/3000 are nested and never narrow; 300/10000 narrows for 3% of positions. A divisibility chain — 100/300/900/2700/8100 — would close the channel outright, but it would move the ceiling off the 10 km reconciled with the filter rectangle above; keeping five steps and naming the remainder was chosen instead. The one consolation is thin and worth knowing: to intersect the cells you must already know the phrases belong to one person, so this sharpens a join rather than making one.

**What this does not fix, first.** In a sparse area a cell may hold one person, and then the join is back. A grid cannot help there by construction, and the honest answer is not to obscure but not to send: **no screen today draws another phrase's area** (checked across all twenty), so the field stays in the response only against the day such a screen exists.

**The viewing radius in the feed (screen 3) gets no steps** — it is not published to other people and so cannot be a joining signal. The node does see it: `GET /feed` and `GET /feed/density` are built on it, and as a measuring instrument in someone else's hands it is discussed separately.

The area can be placed **anywhere** — there is no check against a real location and no geolocation permission is required. That is deliberate: it lets you set something up in a city you are only travelling to.

**A phrase is moderated before publication — but not inside the request.** The priority here is higher than in chat: the feed is public, anyone in range sees it, and unchecked text there is a shop window. But holding the model inside the HTTP request means paying its weight on every submission, so the check moved **into a queue**:

```
POST /feed  → INSERT feed_messages (visible_at = NULL) → 202, answered at once
                 │
                 └─ queue → passed   → visible_at = now(), the phrase is live
                          → rejected → the row is deleted, the author gets the reason
```

**"Before publication" stays true, and that is not a formality.** While
`visible_at` is empty the phrase is in nobody's delivery except its own author's,
who sees it marked as being checked. That is what the storefront policy says
("checked before it is published") and what the Art. 28 position in `dsa/` rests
on; "publish now, take down later" would make both statements false, and "taking
it down quickly" does not undo the people who read it.

Two consequences of the queue, settled together with it:

- **4:20 counts from `visible_at`, not from submission.** Otherwise the queue eats
  somebody else's life: an hour of backlog and the phrase lives three twenty.
- **A failing queue closes rather than opens.** If there is nothing to check with
  — the model did not come up, the queue stalled — the phrase **waits** rather
  than publishing. Fail-open here is exactly the trick already rejected for links
  in offers ("not reviewed within two hours, publish"): it is what gets exploited,
  and it gets exploited at night.

**A rejection has consequences.** Otherwise moderation can be hammered endlessly and for free:

```sql
-- edited 2026-09-14 after the review panel: one number cannot hold a sliding hour [retired: rejected_count integer]
ALTER TABLE identity_stats
  ADD COLUMN rejected_at_recent  timestamptz[] NOT NULL DEFAULT '{}',  -- moments of refusals within the last hour, at most 6
  ADD COLUMN published_at_recent timestamptz[] NOT NULL DEFAULT '{}',  -- moments of publications within the last hour, at most 4
  ADD COLUMN first_published_at  date;                                 -- first accepted publication, a UTC date
```

**Moments, not a number — decided 2026-09-14 after the review panel (D4, D5, S7).** A single `integer` cannot "drop out" after an hour, and after phrases are `DELETE`d — taken down, a step-away — the "four per hour" limit had nothing left to count from. The arrays are cleaned on write and cut to the six and four latest moments — the write expression itself holds the length, not a `CHECK`: a constraint would make the verdict write fail. The window is filtered in the query too: there is no sweeper here, and a failed cleanup does not turn the window into a history. The pause and the next slot are expressions at read time (below). `first_published_at` is written at the first `visible_at` as a UTC date: it serves only the rule "the reporter posted long ago" (offers spec §10.1, storefront mechanics §5). The `identity_stats` row is created in the signup transaction — without it a conditional `UPDATE` silently refuses forever (experiment in `postgres:16`). Handles that send text for checking start with `SELECT … FROM identity_stats WHERE identity = :me FOR UPDATE`, and the check at send time counts what is still being checked: moments are written at the verdict, and without this parallel sends passed the limit before the first verdict (review panel 2026-09-14, `PANEL_2026-09-14_stage2-part1.md`). **A feed phrase goes to checking one at a time — decided 2026-09-14.** While one's own phrase is being checked the next cannot be sent — as it already was while waiting for the name (§8.2); so "four per hour" counts the moments of publications plus the one that waits. **Table lines and applications go in parallel, but the pause counts each one still being checked as a possible refusal:** while a pause is on — refused; outside a pause, if something of one's own is already being checked and together with the refusals within the hour it makes five or more, a new send waits for the verdicts — a **hold** of seconds, not a pause (clarified 2026-09-14 after the review panel: the former "refusals within the hour together with those in the queue at five or more" [retired] held sending until the end of the hour with an empty queue — experiment in `postgres:16`). A row whose checking wait expired is deleted and not counted as queued. **Every verdict is one transaction — refusal, publication, name — and first takes the same `identity_stats` row lock as a send:** deleting or publishing the queued row and appending the moment go together, or a send between them would see the queue already empty and the moment not yet written (widened 2026-09-14 after the review panel: only the refusal was named [retired], and a publication written apart from its moment let a fifth phrase into the hour). The price is named: someone typing fast at a table hits the hold for a few seconds while the verdicts come. The expressions were checked in `postgres:16` on 2026-09-14: nine refusals in a row keep six; refusals at 12:00–12:04, 12:30 and 12:55 hold the pause until 13:10; a sixth refusal after the pause within the same hour sets a new one; a publication on the same day as the offer does not count. The price of the date: "older than a day" is in fact 24 to 48 hours.

```sql
-- writing a verdict: a one-hour window, at most the six latest moments (four for publications, `- 3`)
rejected_at_recent = (SELECT (x)[greatest(1, cardinality(x) - 5):]
  FROM (SELECT ARRAY(SELECT t FROM unnest(rejected_at_recent) t
                     WHERE t > now() - interval '1 hour' ORDER BY t) || now() AS x) s)

-- paused until: five refusals within the hour ending at the latest refusal, and 15 minutes from it
SELECT CASE WHEN (SELECT count(*) FROM unnest(rejected_at_recent) t WHERE t > m - interval '1 hour') >= 5
             AND now() < m + interval '15 min' THEN m + interval '15 min' END
FROM identity_stats, LATERAL (SELECT max(t) AS m FROM unnest(rejected_at_recent) t) s
WHERE identity = :me

-- the next "four per hour" slot: the earliest moment in the window plus an hour
SELECT min(t) + interval '1 hour' FROM unnest(published_at_recent) t WHERE t > now() - interval '1 hour'

-- "posted long ago" — 24 to 48 hours, all in UTC
first_published_at <= (now() AT TIME ZONE 'UTC')::date - 2
AND first_published_at < (offers.published_at AT TIME ZONE 'UTC')::date

-- publication verdict — one transaction, taking the same identity_stats row lock as a send first (checked in postgres:16, 2026-09-14)
BEGIN;
SELECT 1 FROM identity_stats WHERE identity = :author FOR UPDATE;
UPDATE feed_messages SET visible_at = now(), expires_at = now() + interval '4 hours 20 minutes'
 WHERE id = :id AND visible_at IS NULL;
UPDATE identity_stats
   SET published_at_recent = (SELECT (x)[greatest(1, cardinality(x) - 3):]
         FROM (SELECT ARRAY(SELECT t FROM unnest(published_at_recent) t
                            WHERE t > now() - interval '1 hour' ORDER BY t) || now() AS x) s),
       first_published_at = COALESCE(first_published_at, (now() AT TIME ZONE 'UTC')::date)
 WHERE identity = :author;
COMMIT;

-- "four per hour" when sending a phrase: moments of publications plus one's own waiting phrase
(SELECT count(*) FROM unnest(published_at_recent) t WHERE t > now() - interval '1 hour')
  + (SELECT count(*) FROM feed_messages WHERE author_identity = :me AND visible_at IS NULL) < 4

-- nothing more is accepted for checking: a pause is on, or a hold — one statement, both windows spelled out (checked in postgres:16, 2026-09-14)
WITH s AS (SELECT rejected_at_recent AS r FROM identity_stats WHERE identity = :me),
     p AS (SELECT max(t) AS m FROM s, unnest(s.r) t),
     w AS (SELECT (SELECT count(*) FROM s, unnest(s.r) t, p WHERE t > p.m - interval '1 hour') AS in_pause_window,
                  (SELECT count(*) FROM s, unnest(s.r) t WHERE t > now() - interval '1 hour') AS refusals_in_hour,
                  (SELECT count(*) FROM table_lines   WHERE author_identity = :me AND visible_at IS NULL)
                + (SELECT count(*) FROM feed_messages WHERE author_identity = :me AND visible_at IS NULL)
                + (SELECT count(*) FROM identities    WHERE id = :me AND name_state = 'pending') AS queued)
SELECT COALESCE(w.in_pause_window >= 5 AND now() < p.m + interval '15 min', false)  -- the pause: the hour ending at the latest refusal
    OR (w.queued > 0 AND w.refusals_in_hour + w.queued >= 5)                       -- the hold: the hour ending now
FROM w, p
```

The counter grows on every `rejected` and counts **over a sliding hour**, the same one the publishing limit uses. Five refusals in an hour — **15 minutes of blocked sending** for that identity, alongside the per-address rate limit. Everything that goes to checking is blocked — feed phrases, table lines and applications, a name change, an offer like that sends the name, and a hangman word (added 2026-09-15: it goes through the same queue, storefront screen 18); the feed, likes on phrases, conversations and reading stay available, so the penalty fits the offence (clarified 2026-09-14 after the review panel: the screens said "only new phrases", while table lines feed the counter too). **Each further refusal within the same sliding hour — another 15 minutes** (decided 2026-09-14): the pause is computed from the moments of refusals and has no separate deadline. **An expired queue waiting limit is not a refusal:** the outcome "the check did not happen" does not touch the counter, or a model outage would pause everyone.

**Edited 2026-09-07 after a review panel.** This said "resets on the first successful publication" and "five refusals in a row" — so the limit came undone by alternating: four probes, one deliberately clean phrase, four more. At four publications an hour that is sixteen probes against the filter instead of five. A window in place of a run adds no control at all: the period is the same hour. The counter and whatever is left of the block **survive a departure** (`sosed.place/docs/00-mechanics_EN.md` §13): a twenty-minute step away is longer than a fifteen-minute pause, and would otherwise put it out.

**Five and fifteen are deliberately mild.** A refusal from the model is not proof of ill intent: mixed languages, a rare word, quoting somebody else's text — it makes mistakes, and the first person to hit the threshold will not be a troll but someone who was misunderstood. The threshold exists to **break the rhythm of hunting for a wording that gets through**, not to punish; anyone hunting in earnest hits it five times in a row, while anyone merely misunderstood does not lose an evening over fifteen minutes. The sliding window matters as much as the number: a refusal older than an hour drops out of the count on its own, so the counter does not accrue for months and does not fire out of nowhere (edited 2026-09-14: this said "resetting on the first successful publication" [retired] — a remnant the 2026-09-07 edit two paragraphs up had missed).

The block used to hang on the browser fingerprint so that a new identity would not lift it. There is no fingerprint any more (§8.2), and there is no point pretending: an identity takes ten seconds to make, and an address changes by switching to mobile data. This is **a speed bump, not a wall**. The feed's real defence is the check before publication: refused text is never published, however many identities are created.

The counter is fed **by everything that passes the moderation queue**: feed phrases, lines and applications at a table (§6.1), and a refused name (since 2026-09-14 after the review panel: an offer like sends the name to the queue, and without this a name could be hunted for without limit). A conversation between two is not moderated (§8.8), so there is nothing there to refuse. **Edited 2026-09-14 after the review panel (S11):** this said "by the feed alone" [retired], while table lines go through the same queue and get the same refusal with its reason named — at your own empty table a wording could be hunted for without limit. This is the only place where the server remembers something bad about a person, and what it remembers is the moments of refusals within the last hour, not a text (edited 2026-09-14: "a number" [retired]): the rejected message itself is never written anywhere.

**What does the moderating.** Two steps, both on the node:

1. **Rules** — length, links, contact details, stop-word lists. Instant, free, and it catches the bulk of crude abuse and spam.
2. **A local model on the node** — a small toxicity classifier running on the node itself. No per-call charge at all, and better privacy: the text never leaves our infrastructure. The price is the node's memory and CPU, and lower quality than a large model — especially on sarcasm, context and mixed languages.

**The latency is measured, and it is not "tens of milliseconds" — which is what stood here until 2026-08-21.** The `relay/moderation-bench` rig on production-class hardware, 41 phrases:

```
translate   median 1624 ms   max  8174
guard       median 1083 ms   max  3376
total       median 2789 ms   max 11948
```

The gap from the old wording is two orders of magnitude, and it changes the construction rather than the phrasing. With a worker taking jobs one at a time the node's ceiling is about **20 phrases a minute**; an evening surge of 60 submissions a minute grows the queue linearly, and the author sees "being checked" throughout. Hence three obligations without which step 2 of §13 must not be written:

- **inference out of the node's event loop** — 2.8 seconds of CPU in the same process that holds the sockets means message delivery measured in seconds;
- **queue depth and the age of the oldest unchecked phrase exposed as metrics**, otherwise a backlog is visible only through complaints; today the node's metrics module can only count, and these two are gauges;
- **a waiting limit named as a number**, past which a phrase does not hang forever: the author is told the check did not happen — `fail-closed` without a deadline turns into a leak of rows that never expire.

**The waiting limit is 10 minutes — decided 2026-09-15 by the owner after the final panel (OPS-7).** A phrase with no verdict after 10 minutes is waited for no longer: its queue row is deleted, the slot is freed, and the author sees "the check did not happen, your text is kept — send it again"; the text stays on the device. It does not count toward the refusal pause: nothing was refused. The number is `moderation.queue.wait` in `docs/facts/limits.tsv`; watchdog W6 (`watchdogs_EN.md`) watches the age of the oldest phrase in the queue. The ordinary acceptable wait stays a measurement for the day the queue exists (§8.14). [retired] This said "The limit itself and the acceptable waiting time are the open question in §8.14".

**A third step — an external model for borderline text — stood here and was
removed 2026-08-17.** It contradicted the "Bounds" further down this same
section: the text of a phrase does not leave the node, which is what the
processing register records and the storefront policy promises. Two paragraphs
gave two answers to one rule, and the one that held was the wrong, convenient
one.

**Which has a consequence worth naming: borderline is no longer an outcome.**
Doubt used to have somewhere to go; now the second step has nobody to defer to
and its decision is final — `passed` or `rejected`. There is one threshold, and
where it sits is the whole of the choice.

"Free" for the local model means no per-call charge; it does consume node resources, and for the pool in §8.1 that has to be budgeted into machine size. No specific model is fixed here: the choice depends on the languages and on how much RAM we are willing to give up — that is a measurement, not a decision on paper.

Visibility is **circle intersection** plus the age band (8.2): if I can see you, you can see me.

**The circle chooses what is delivered; it is not a boundary of access (owner's decision,
2026-09-23).** The viewer's point is stated by the client and the node does not check it:
whoever names a point reads the phrases around it. So a like and a hide by a known `id`
(§8.4, §8.9) check no distance — a check against a point that can be named freely would
close nothing and would break the contract. Accepted as a risk: a phrase's text and coarse
cell are open to whoever is handed its `id` by someone who has it in their feed (review panel
2026-09-23, S1). Only a check of location could close this, and the product has none.

```sql
SELECT f.id, f.text, f.mode,
       grid_round_lat(f.lat, f.area_radius)        AS lat,   -- outwards: the grid node,
       grid_round_lon(f.lon, f.lat, f.area_radius) AS lon,   -- not what the database holds
       f.area_radius, f.like_count   -- no time: with a fixed span the start is the end (§8.11, 2026-09-24)
FROM feed_messages f
JOIN identities author ON author.id = f.author_identity
WHERE f.visible_at IS NOT NULL                                      -- passed the queue; without this the feed serves unchecked text
  AND f.expires_at > now()
  AND author.closed_at IS NULL                                      -- a closed identity leaves the feed
  AND f.lat BETWEEN :lat - :deg AND :lat + :deg                     -- cheap index prefilter
  AND f.lon BETWEEN :lon - :deg / cos(radians(:lat))
                AND :lon + :deg / cos(radians(:lat))
  -- The overlap is measured from the ROUNDED centre — decided 2026-09-10. This used
  -- to read haversine(f.lat, f.lon, ...) over the exact coordinates, which made the
  -- feed a rangefinder: "visible at radius r" is an inequality with one unknown, a
  -- binary search on the handle gives the distance to the unrounded centre, and
  -- three points give the centre itself. §8.3 was rounding exactly what was being
  -- measured here. The exact coordinates stay in the table: the cell is computed
  -- from them.
  AND haversine(grid_round_lat(f.lat, f.area_radius),
                grid_round_lon(f.lon, f.lat, f.area_radius),
                :lat, :lon) <= :viewer_radius + f.area_radius
  AND author.age BETWEEN :band_low AND :band_high                   -- the viewer's band
  AND :viewer_age BETWEEN band_low(author.age) AND band_high(author.age)
  AND author.age BETWEEN :filter_age_min AND :filter_age_max        -- the viewer's filter
  AND f.author_identity <> :me                                      -- no liking your own
  AND NOT EXISTS (SELECT 1 FROM blocks b WHERE ...)                 -- 8.9
  AND NOT EXISTS (SELECT 1 FROM likes l                             -- what the viewer liked does not go to the feed:
                  WHERE l.liker_identity = :me AND l.feed_message_id = f.id)  -- it is on screen 25, GET /likes (2026-09-17)
ORDER BY f.visible_at DESC
```

**Ordered by `visible_at`, not by `created_at` (edit of 2026-08-21).** A phrase held up by the queue gets its full 4:20 from the moment of publication — that is settled above — but sorting by submission time would drop it straight into the depths of the feed. The queue would be eating its life a second way, and the storefront's promise of a chronological feed would not mean what a person sees. **The time on the card is `visible_at` too — clarified 2026-09-15 after the final panel (DATA-16):** the response field keeps the name `created_at` but carries `visible_at`, or a phrase that waited an hour would show a time an hour older than its neighbours. [retired] Since 2026-09-24 the card carries no time at all (§8.11, the owner's decision); the `next` cursor carried `visible_at` to the microsecond (`reviews/PANEL_2026-09-24_owner-decisions.md`) [retired]; **since 2026-09-24 it is sealed** — AES-256-GCM under the pool's key, and a cursor the pool did not issue answers 400 (`relay/node/src/lib/cursor.ts`, protocol §6; the owner's decision).

`:deg = (viewer_radius + 10000) / 111320` — the maximum phrase radius is known up front (10 km), so the box needs no data. Index: a plain `btree (lat, lon)`.

The area is modelled as an object, not a pair of numbers: a circle today, an arbitrary polygon tomorrow — storage and the intersection test change, the API and UI do not.

**Anti-flood is counted by the node, not the client.** A pause in the interface
is a hint to its author; someone else's client will not draw it, so both limits
live on the node and are tied to an identity rather than an address (the
per-address limit works alongside, separately).

```
likes     64 per 32 minutes
phrases   at most 4 live at a time
          and at most 4 published per hour
```

**Why phrases have two numbers instead of one.** The main one is "four live"
(edit of 2026-08-28; [retired] "five live" stood here from 2026-08-26, when it was
reconciled with the storefronts). It is the natural limit, because a phrase
occupies space in the neighbours' feed and a person sees their four rather than
counting minutes. But a phrase lives 4:20 while the ceiling's window is an hour:
none would expire by itself in that time, so the second number would never
fire. It exists for exactly one case —
when a person **takes their own phrase down** to free a slot, and repeats that in
a loop.

Hence a consequence worth naming outright: **a phrase can be taken down by its
author**. The spec did not describe this before — a phrase only expired. A phrase
taken down disappears exactly as an expired one does (§8.10): the text is
deleted, the likes cascade away, `chat_starters` survive as copies. The slot frees
immediately; the hourly ceiling does not: it is held by `identity_stats.published_at_recent`, not by live phrases, or taking down and stepping away would reset it (clarified 2026-09-14). In the same transaction the matches born of the phrase that have not become a chat go out — `DELETE FROM matches m USING match_participants p WHERE p.match_id = m.id AND p.message_id = :id AND m.chat_id IS NULL` — or a match would outlive its reason until the old `least()` (2026-09-15, final panel DATA-10).

Likes are counted with room to spare: 64 in half an hour is one every thirty
seconds without a break. No living person keeps that up, while automation hits it
at once. The number matters more than it looks: a like on a phrase with a
discount **creates a match immediately** (§8.5), so a stream of likes is a stream
of conversation requests aimed at living people.

A private author may have at most one live phrase **with a discount** at a time
(`offers/SPEC_EN.md` §4, `PRIVATE_ACTIVE_OFFERS`): the limit of four is about
phrases in general, the limit of one about the commercial ones among them.

**The feed has a size — 30 cards, then paging by time (decided 2026-09-10).** The
quota limits a person; an area is limited by nothing. Somewhere dense a phrase leaves
the visible part within minutes, and `expires_at` stops answering "how long am I
heard". The number lives in `docs/facts/limits.tsv` (`feed.page.size`) and is
**chosen, not measured**. The order stays chronological: ranking would decide for
people who they get to hear, and that is a separate decision nobody has taken.

**When the band and the radius come up empty, the feed widens the radius — and
only the radius.** An empty screen says nothing: broken, nobody here, or a
delivery the person narrowed themselves — indistinguishable. So on an empty
result the radius grows in steps up to **25 km**, the same ceiling a person could
have set for themselves (§8.3; the number follows the storefront's control, checked
2026-08-26 — it used to say 10 km, from the control as it was before).

**The band is never widened.** It separates teenagers from adults, and touching
it to fill a feed is exactly the door it exists to close. A sparse sandbox at
launch is an accepted price, not a problem to be fixed with age.

**The widening is visible and does not change the setting.** Every such card is
marked "further than you asked", and the person's own radius stays where they
left it: this is a temporary answer to an empty result, not a quiet edit of their
preferences. If 25 km is empty too, we say so: "nobody here yet. Write first — a
phrase lives 4:20", with the number of people in range beside it.

**How many are in the circle — the node answers with a step, not a number (settled
2026-08-26).** The radius handle says how many live phrases are inside:
`nobody here yet` · `a few` (1–4) · `about a dozen` (5–14) · `dozens` (15–99) ·
`hundreds` (100+). Without it the handle is dragged blind and lands either in
emptiness or in somebody else's district.

There is no exact number here, and the reason is not rounding for looks. A counter
tied to a radius is **a measuring instrument**: stepping the handle and reading
exact numbers, a person builds a density profile of their surroundings, and from
the increment on a single step works out the ring holding one particular phrase —
going around the blur its author chose for themselves. Steps do not forbid that,
they make it coarse enough to stop being worth the effort; only the absence of a
counter would close the question, and its price is a blind handle.

Hence two requirements: the answer is computed **on release**, one request per
gesture, and the route carries **a rate limit of its own** — a hundred (100) requests an
hour per identity is not a person with a slider but a density profile being taken
(`feed.density.burst` in `docs/facts/limits.tsv`, 2026-09-15; the window is an hour by the
owner's decision of 2026-09-21 — this said "in a row" while the node counted an hour, which
are different things, and the hour was chosen because the handle is asked on release, so a
hundred gestures an hour is ample room for a person).

**A consequence worth knowing up front: a like across a widened radius often will
not become a match.** Mutuality requires the other person to see your phrase in
**their** circle, and they did not widen theirs. So such a like travels one way
and fades — except on a phrase with a discount, where the match is born one-sided
(§8.5) and the distance is the offer author's call.

#### Stop categories: one list, two regimes

The list is one for the whole product, and it lives here. It used to sit in the
offers spec while the chat spec pointed at "§12 of the Terms" — two homes for one
rule, and they would have drifted apart the way other documents already have.

```
alcohol
tobacco, vapes, nicotine in any form
gambling and betting
financial services: credit, investment, cryptocurrency
medicines, supplements, and services promising a therapeutic effect
weapons
```

**The regimes differ, and the difference is the point.**

| | Feed | Offer |
|---|---|---|
| what is forbidden | only what is illegal | **promoting** the category |
| "let's have a beer in the yard" | allowed | — |
| "second glass free" | — | forbidden |
| "−€5 on dinner" from a taverna | — | allowed |

In the feed people are talking, and forbidding a mention means cutting the
conversation: a neighbour inviting you for a beer is not an advertiser. The model
catches what is illegal here, not words from a list.

In an offer, what is forbidden is the category being the **subject of the
discount**. The venue is not cut out of the product for it: a taverna cannot
discount a glass but can discount dinner; a kiosk cannot discount cigarettes but
can discount coffee. A ban by type of venue was rejected — on Cyprus it would have
removed half the neighbourhood places at a stroke.

**For medicine the line is drawn at the promise, not the signboard.** Medicines,
supplements and services that promise a therapeutic effect are forbidden: we
cannot check the promise, and a discount pushes a decision that should not be made
in haste. A dentist discounting a check-up does not belong here — no result is
being promised.

**There will be no age filtering for offers.** Age is self-declared (§8.2), and a
gate on it would be pretence: we would be acting as if we verified. It is the same
mistake rejected in the Art. 28 position, where the ban is enforced by the
**absence of a mechanism** rather than by a setting. The category is forbidden to
everyone at once — there is nothing to circumvent.

#### The frame for the moderation model

No specific model is named here, and that is a decision rather than an omission:
once the check moved into a queue the choice became **reversible** — same input,
same output, a swap touches neither the schema nor the clients. So there is no
reason to choose blind today; what is fixed instead is the frame, and the model
itself is the result of a measurement on the day the queue exists.

**Where it runs.** On the node, in the queue. The text of a phrase **does not
leave the node** — that is recorded in the processing register and promised in the
storefront policy, so an external moderation service is excluded regardless of its
quality.

**Memory.** The node is a `cpx22` — 4 GB for everything, Postgres, Caddy and Deno
included. The model's budget is at most **1.5 GB** resident, and it may not push
Postgres out of memory: the database comes first here, the model second.

**Throughput matters more than the speed of one check.** A person no longer sees
the latency, but when the queue falls behind the phrases **wait** (fail-closed
above) — that is, the feed empties. The target is to hold the publication peak
without the queue growing; the number comes from a measurement, not from thin air.

**Languages that must work:** the storefronts' six — English, Russian, French,
German, Spanish, Greek. And above all: **a mixed phrase is the norm, not an edge
case.** On Cyprus one sentence carries Cyrillic, Latin and Greek side by side,
plus transliteration. A model excellent in English and blind in Greek skews
exactly where our people live.

**What it catches:** what is illegal and plain harm. The stop categories are above
in this same section; in the feed only the illegal part of them is forbidden, while
promotion is cut in offers. **What it does not do:** judge tone, judge the author, or
**use membership of a group as a signal** — in either direction.

**How it is chosen.** By measurement on **our own** set of phrases, not from
published tables. The set is assembled in advance and deliberately includes the
hard cases: mixed alphabets inside one sentence, transliteration, quoting someone
else's forbidden text, sarcasm, discussing a subject versus calling for it.

**One threshold, and both costs on screen.** With the external model gone, the
band of doubt has nowhere to lead (above in this section), so the decision is
binary. Counting the two errors apart is not a way to set two numbers but a way
to see what each side of the chosen threshold pays: moving it cheapens one error
by exactly as much as it makes the other dearer. Where it goes is settled by
measurement, with both prices visible.

**The two errors are counted separately, because they cost differently.** A false
refusal hits an innocent person and **feeds the auto-block counter** (§8.3 above)
— someone who was misunderstood gets fifteen minutes of silence. A false pass puts
something illegal into a public feed. Thresholds are set per direction; a single
"accuracy" figure hides precisely what matters here.

### 8.4. Likes and counters

**A like is available only to someone with a live phrase in the feed — settled 2026-08-26.** The rule is derived from §8.5 rather than added to it: a match counts only while **both** phrases are alive, so a like from a person without one of their own could never become a match — it was placed and went quietly nowhere, and the one who placed it never learned that. The check runs on the node, because the client is open: `EXISTS (SELECT 1 FROM feed_messages WHERE author_identity = :me AND visible_at IS NOT NULL AND expires_at > now())`.

**An offer is an exception, and it is named (2026-08-27).** The check does not apply to a like on a phrase **with a discount**: there the match is born one-sided (§8.5), and the argument "a like could never become a match" is simply false for an offer — it becomes one at once. Without this proviso the rule would cancel the offer mechanism itself: to collect stools somebody is giving away you would first have to write something of your own into the feed, so the barrier would remain, merely a different one. The node-side condition becomes

```sql
EXISTS (SELECT 1 FROM feed_messages
         WHERE author_identity = :me AND visible_at IS NOT NULL AND expires_at > now())
OR (SELECT discount_value IS NOT NULL FROM feed_messages WHERE id = :target)
```

The second consequence matters more than the first, and the rule is written down for it: to like, you must publish, and publishing takes the name through the queue (§8.2). So an unchecked name reaches nobody's screen by any route — neither through a post nor through a match.

**For a like on an offer without a phrase of one's own this is ensured separately — decided 2026-09-14 after the review panel (S7).** The exception above lets that like past publication, and so past the name queue, which made the promise a paragraph up untrue: the offer's author saw a name nobody had checked. Such a like now first sends the unchecked name to the queue, and the match appears only after the verdict. Name refused — no match, and the liker sees the line for a like on an offer (`xor.ad/docs/refusal-wordings_EN.md` §3; clarified 2026-09-14 — this said "the same text as when a phrase is waiting" [retired]: the liker has no phrase). The like waits meanwhile, as a phrase would (§8.2): the corrected name goes through the queue, and the match appears by itself if the offer is still alive.

Counting must happen **at event time**: `likes` are cleaned along with the phrase, so a day later there is nothing left to count.

```sql
CREATE TABLE likes (
  liker_identity   uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  feed_message_id  uuid NOT NULL REFERENCES feed_messages(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (liker_identity, feed_message_id)
);

-- A table like is a bookmark without a match (the owner's decision of 2026-09-17, §6.1): the same shape as likes.
CREATE TABLE table_likes (
  liker_identity   uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  table_id         uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (liker_identity, table_id)
);

CREATE TABLE identity_stats (
  identity        uuid PRIMARY KEY REFERENCES identities(id) ON DELETE CASCADE,
  likes_received  integer NOT NULL DEFAULT 0,
  likes_given     integer NOT NULL DEFAULT 0,
  matches         integer NOT NULL DEFAULT 0,
  chats_opened    integer NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

**The like transaction starts with two locks — decided 2026-09-15 after the final panel (DATA-1, DATA-2, DATA-3), all three races reproduced in postgres:16:**

```sql
SELECT pg_advisory_xact_lock(hashtext(:pair_key));   -- first, a statement of its own
SELECT 1 FROM identity_stats WHERE identity IN (:me, :author) ORDER BY identity FOR UPDATE;
```

**A row lock is not enough, and this is said outright.** Without the pair lock two mutual likes in READ COMMITTED do not see each other's uncommitted row and no match is born — and never will be, because the repeated like hits `ON CONFLICT DO NOTHING`. `FOR UPDATE` on the like row does not save a take-back either: the waiting `DELETE` rechecks its own row while its `NOT EXISTS` over `matches` sees the old snapshot. The ordered `identity_stats` lock is the second half: the pair lock orders only the pair, an author receives likes from many, and two opposite likes updating counters in opposite order ended in `deadlock detected`. The take-back and the match (§8.5) start with the same two statements.

Then, in the same transaction as the like: `INSERT ... ON CONFLICT DO NOTHING` (a double tap must not inflate anything), and on an actual insert — `feed_messages.like_count + 1` plus the `identity_stats` increments. The `identity_stats` row itself is created at signup (§8.3, "Moments, not a number"), not by the first like: the publication limits rest on it too (§8.3).

- **`like_count` is visible to everyone** — it is an aggregate, it gives nobody away, and it makes the feed feel alive.
- **A like can be taken back until a match has come of it — decided 2026-09-15.** `DELETE FROM likes` in the same transaction as `like_count - 1` and the `likes_given` and `likes_received` decrements in `identity_stats`, under the two locks above, and only if the pair has neither a `matches` row nor a `chats` row — `NOT EXISTS (SELECT 1 FROM matches WHERE pair_key = :pk) AND NOT EXISTS (SELECT 1 FROM chats WHERE pair_key = :pk)` (clarified 2026-09-15 after the final panel, DATA-4: a like into a pair with a live chat makes a `chat_starters` card rather than a match, and a `matches` row is deleted on expiry while its chat lives on); otherwise the answer is `{state: 'spent'}`, and declining is "not now" on the card. Mutuality counts the likes that stand at the moment of the answering one. A like on a private author's offer makes the match at once and cannot be taken back. A successful take-back answers `{state: 'unliked'}` — also when there was nothing to take, so the answer does not tell whether there was a like (2026-09-21); only the pair's live matches count: an expired one the sweeper has not reached does not hold the like. **`spent` is per phrase, not per pair (owner's decision, 2026-09-21, screen 25):** the like that cannot be taken back is the one on the phrase a live match came from (`match_participants.message_id`); likes on that person's other phrases can be. Read the `NOT EXISTS … pair_key` condition above with this amendment. **The limit is 300 likes and take-backs an hour per identity** (`limits.tsv` `like.hour`, 2026-09-21): a brake for a script that never touches a person. The price is named: `like_count` on a phrase can move up and down, and the author sees it.
- **`identity_stats` outlives the feed**: phrases expire, likes are deleted, the numbers remain. It is the only "history" the server keeps about a person, and it is nameless — how many, never with whom or for what. A new identity starts from zero — whatever was accumulated dies with the old one, and that is accepted deliberately.
- The client sends only `feed_message_id` and gets back `{state: 'liked'}` or `{state: 'matched', match_id}` — never who was liked.
- **Self-likes are forbidden**: not by a `CHECK` (it cannot look into another table) but inside the insert itself — the like is written by `INSERT ... SELECT` from `feed_messages` under conditions, and an empty `RETURNING` means neither the counters nor `identity_stats` are touched. Otherwise both `like_count` and `likes_received` can be inflated at will.
- **The band and visibility are re-checked on the like, not only in the feed query — decided 2026-08-21 from the review.** The age band used to live in exactly one place: the feed `SELECT`. Yet §8.6 says itself that our client is open and "any check that lives only on the client is a hint to the author, not a rule of the system"; a filter in the query is a check of that same kind — it decides what a person **sees**, not what the node **accepts**. The reachable bypass went like this: a 19-year-old and a 17-year-old see each other and like; the 19-year-old edits their age to 22 (allowed, and one-way — existing likes are not revisited); likes back — and a match is born between a 22-year-old and a 17-year-old, with the match card showing name and age. That is precisely what `dsa/SPEC_EN.md` promises will not happen.

```sql
INSERT INTO likes (liker_identity, feed_message_id)
SELECT :me, f.id
  FROM feed_messages f
  JOIN identities author ON author.id = f.author_identity
 WHERE f.id = :feed_message_id
   AND f.author_identity <> :me                                   -- self-like
   AND f.visible_at IS NOT NULL AND f.expires_at > now()          -- published and alive only
   AND author.closed_at IS NULL
   AND author.age BETWEEN band_low(:my_age) AND band_high(:my_age)   -- the viewer's band
   AND :my_age BETWEEN band_low(author.age) AND band_high(author.age) -- and symmetrically
   AND NOT EXISTS (SELECT 1 FROM blocks b
                    WHERE (b.blocker_identity, b.blocked_identity) IN ((:me, author.id), (author.id, :me)))
ON CONFLICT DO NOTHING
RETURNING feed_message_id;
```

The reply on an empty `RETURNING` is the same one a successful like gets: `{state: 'liked'}`. Different replies here would be an oracle — they would tell a block apart from an expiry, and §8.9 promises that nobody learns about a block.

### 8.5. Match: mutuality in a live window, and double consent

**A match is a meeting of current moods, not an archive of sympathies:** it counts only if **both phrases are still alive in the feed**.

```sql
SELECT their_msg.id, my_msg.id
FROM feed_messages their_msg                       -- the phrase I just liked
JOIN likes his_like ON his_like.liker_identity = their_msg.author_identity
JOIN feed_messages my_msg ON my_msg.id = his_like.feed_message_id
JOIN identities them ON them.id = their_msg.author_identity
JOIN identities me   ON me.id   = :me
WHERE their_msg.id = :liked_now
  AND my_msg.author_identity = :me
  AND their_msg.visible_at IS NOT NULL AND their_msg.expires_at > now()
  AND my_msg.visible_at   IS NOT NULL AND my_msg.expires_at   > now()   -- this is the "while alive" part
  AND them.closed_at IS NULL AND me.closed_at IS NULL
  AND them.name_state <> 'rejected' AND me.name_state <> 'rejected'     -- the second line of §8.2 (2026-09-15)
  AND them.age BETWEEN band_low(me.age)   AND band_high(me.age)          -- the band as of the match,
  AND me.age   BETWEEN band_low(them.age) AND band_high(them.age)        -- not as of the like
ORDER BY his_like.created_at DESC
LIMIT 1
```

**The band is computed here afresh, from both current ages (edit of 2026-08-21).** A like lives for hours, and an age can change in that time — it changes always and only upwards. Checking as of the like left a hole: having stepped over the 20/21 boundary after somebody else's like, a person would get a match with someone their own feed no longer shows. The price is stated plainly: **a like placed before an age edit may not fire after it** — and the person who placed it will never know, because likes are never reported back here.

A match is **not a chat**: it is an invitation to talk that both must accept.

```sql
CREATE TABLE matches (
  id          uuid PRIMARY KEY,
  pair_key    text NOT NULL UNIQUE,     -- sha256(min(a,b) || ':' || max(a,b))
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,     -- least() of both phrases
  chat_id     uuid REFERENCES chats(id) ON DELETE SET NULL  -- filled once both accepted (FK: 2026-09-15)
);

CREATE TABLE match_participants (
  match_id          uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  identity          uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  message_id        uuid NOT NULL,
  text_snapshot     text NOT NULL,      -- snapshot taken at match time
  mode              text NOT NULL CHECK (mode IN ('alone', 'company', 'party')),
  accepted_at       timestamptz,        -- NULL = has not pressed "open chat" yet
  declined_at       timestamptz,        -- "not now" (2026-08-28): the refusal is visible to its own side only;
                                        -- written at once, cleared by an undo while the match lives
  ephemeral_public_key text,            -- this side's ephemeral public half (8.13)
  ephemeral_signature  text,            -- its signature by the long key over "xor.ephemeral.v1\n<match_id>\n" ‖ SPKI — bound to the match, checked by the node (db/030, panel 2026-09-22)
  PRIMARY KEY (match_id, identity)
);
```

Participants are rows, not `_low`/`_high` columns: no handler has to work out "am I the first or the second", and "my row / their row" is the same query up to `WHERE identity = / <> :viewer`. The pair is normalised exactly once — into `pair_key`, whose unique index prevents a duplicate match.

**An expired row the sweeper has not reached does not block a new match — decided 2026-09-15 after the final panel (DATA-5), checked in postgres:16.** `ON CONFLICT (pair_key) DO NOTHING` [retired] created nothing, silently, for a pair whose old match had expired. Under the pair lock of §8.4 the old participants go first — the foreign key from `match_participants` refuses changing `id` while they remain — and then the row is replaced:

```sql
DELETE FROM match_participants p USING matches m
 WHERE p.match_id = m.id AND m.pair_key = :pk AND m.expires_at <= now();
INSERT INTO matches (id, pair_key, expires_at) VALUES (:id, :pk, :expires_at)
ON CONFLICT (pair_key) DO UPDATE
   SET id = EXCLUDED.id, created_at = now(), expires_at = EXCLUDED.expires_at, chat_id = NULL
 WHERE matches.expires_at <= now()
RETURNING id;   -- no row: a live match already stands
```

Flow:

```
mutual like     → INSERT matches + two match_participants rows
                  both see: "match — open chat?" + peer's phrase and mode
one presses     → the "not checked" disclaimer — and that is all, no span here
                  → generates an EPHEMERAL pair for this chat (§8.13)
                  → UPDATE match_participants SET accepted_at = now(),
                      ephemeral_public_key = :epk, ephemeral_signature = :sig
both press      → INSERT chats + chat_participants + chat_starters, matches.chat_id = <new>
                  both get chat_id and the system line "you both liked this — chat is open"
expired         → the match quietly disappears; there was no chat
```

**The disclaimer at consent.** It is the only thing on this screen — a person reads what they are stepping into:

```
This chat is not checked. Nobody reads what you write here —
not us, not a filter.

It is encrypted on your devices: our server carries it and
cannot read it.

If someone behaves badly, block them and report them, describing
in your own words what happened.
```

This is **not** another consent or a checkbox: "open chat" stays the single press on the screen. The disclaimer is said here because this is the last moment at which nothing has been opened yet.

**There is no span on this screen — settled 2026-08-26.** An `idle_ttl` choice used to stand here, and the column behind it in `match_participants` outlived the decision by two days, marked "not filled"; now it is gone. The span is picked inside the conversation, one per person (§5, §8.6), because deciding it before a person has seen who they are talking to demands a decision before there are grounds for one.

- **Match TTL** = `least()` of both phrases' `expires_at`, with no safety floor. Either phrase dies and the match dies with it, even if one side already accepted; a new mutual like does **not** extend it. The consequence is accepted deliberately: a match born on a dying phrase may leave a pair only minutes for two presses, and then burn out. The rule matters more than the match count — the reason died, so the invitation dies too.
- **The conversation opens for the first to press at once and waits for the second — the owner's decision of 2026-09-18:** on one's own "talk" the conversation opens in the state "waiting for an answer"; writing is allowed, replies sit in a queue without ✓ and go to the second person the moment they press "talk"; the conversation's lifespan starts at the second press; until they agree the second person sees the offer; their refusal turns the open conversation into the tombstone "the offer is gone". Overrides the lens quorum's decision of the same day ("the conversation does not open by itself"). The queue before consent is kept only on the first person's device: there is no conversation key yet (8.13 — it is born when both agree), so there is nothing to encrypt it with; after the second press the queue is encrypted with the conversation key and goes out by ordinary delivery, the node accepts neither replies nor the fact of a queue before consent; a device change by the first person before consent loses the queue, and the line under the queue says so (the "Security" lens of 2026-09-18: "with the second person's session key" contradicts 8.13 and the disclaimer, "in the clear" is forbidden). **Built 2026-09-24:** the half carries the session that published it (`db/048`), and freezing that session before the second press takes back its half and its consent, so the chat never opens on a half nobody can derive with; the new device consents with a half of its own (`lib/sessions.ts`).
- **The text snapshot is taken at match time**, not at opening: otherwise a phrase can expire between "match" and "both pressed", and someone would consent without seeing why.
- The card shows **the remainders of both phrases**, one per phrase; once one accepts, the other sees "waiting for you". (Edited 2026-09-14: this was a single `match expires · Nh Nm` timer [retired] — it never said which phrase was ending, screen 6 of the storefronts.) **A match from an offer has one remainder — the offer's own** (clarified 2026-09-14 after the review panel): whoever liked it may have no phrase (screen 6 of the storefronts, flow 10).

**A match born from an offer is one-sided.** A like on a phrase with a discount creates the match immediately, without waiting for one back.

The ordinary rule breaks against its own meaning here: to collect the stools you would have to wait for the neighbour giving them away to like some phrase of yours. A mutual like checks that two people's moods coincided; an offer has a different occasion — it is stated in the announcement itself, and there is nothing to coincide with.

```
ordinary phrase        I liked theirs → they liked mine → match
phrase with a discount I liked theirs → match
```

From there the machinery is unchanged: two `match_participants` rows, the disclaimer, the `idle_ttl` choice, double consent. The author of the offer may decline, and then there is no chat, exactly as in any other match.

One schema change follows: whoever came to the offer has no phrase of their own.

```sql
ALTER TABLE match_participants
  ALTER COLUMN message_id    DROP NOT NULL,   -- NULL for whoever came to an offer
  ALTER COLUMN text_snapshot DROP NOT NULL;
```

The occasion in such a match is **one for both** — the offer itself, shown to both on the card. The author sees not the other side's phrase, which does not exist, but their own announcement and "is interested in your offer", plus a name and an age — exactly the same disclosure as in an ordinary match.

The `TTL` is taken from the single live phrase, the offer: the offer dies and the match goes with it.

This cannot be used to spam beyond the usual: `pair_key` is unique, so a second like from the same pair creates no new match, and a private author has at most `PRIVATE_ACTIVE_OFFERS` live offers at a time (`offers/SPEC_EN.md` §4).

**Business** offers carry no like at all, so this path does not reach them either.

**The match window is left as it is — revisited 2026-08-10.** The question came up
because the span was chosen when a person could be called by push; they cannot be
now, and some matches will burn out unread. We weighed it and kept `least()`.

The reason is that widening the window treats the wrong illness. A match is an
offer to talk **about a particular phrase**, and the card shows that phrase.
Widen the window and a person opens an offer about an occasion that no longer
exists: the phrase has expired, the other side has long since moved on, and the
consent still waits for two taps. The freshness of the occasion is the substance
of a match here, not its packaging.

The price is accepted and written down: **a match that burned out is never seen** —
the inbox shows only what survived. That follows directly from dropping push
(§8.12), and we will not compensate for it by stretching deadlines.

**Edge cases** — all three are real, and staying quiet about them is not an option:

- **A block while a match is pending** — the match dies immediately, as if expired. Blocking someone and keeping their invitation is a contradiction.
- **An identity closed between the two consents** — the chat is not created: before `INSERT chats` both `identities` rows are checked for `closed_at IS NULL`. Otherwise a conversation opens with a dead peer who will never answer.
- **A race on the second press** — both confirmations can arrive at once, so creating the chat must be atomic: `INSERT ... ON CONFLICT (pair_key) DO NOTHING` followed by a read. The unique `pair_key` works here not only as "one chat per pair" but as the latch against double creation.

**What is revealed at this step.** Before the match — nothing. On the match card: the peer's phrase, its `mode` (a property of the phrase, not the person: alone today, a party tomorrow), name and age. Name and age can never appear in the feed — otherwise every phrase of one person glues together under "Zhenya, 38". Disclosure is stepwise and irreversible, which is why "open chat" is a deliberate press rather than automatic.

### 8.6. Chat

```sql
CREATE TABLE chats (
  id                uuid PRIMARY KEY,
  pair_key          text NOT NULL UNIQUE,
  last_activity_at  timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
  -- expires_at is neither a column nor one number: each participant has their own,
  -- COALESCE(last_own_message_at, chats.created_at) + their idle_ttl_minutes (see chat_participants; clarified 2026-09-14)
);

CREATE TABLE chat_participants (
  chat_id   uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  identity  uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  idle_ttl_minutes integer NOT NULL DEFAULT 60 CHECK (idle_ttl_minutes IN (10, 30, 60, 260)),  -- ONE PER PERSON (§5)
  last_own_message_at timestamptz,               -- their span counts from here; NULL — from chats.created_at (2026-09-14)
  away_marked boolean NOT NULL DEFAULT false,    -- the "stepped away" label for the peer: set by leaving, cleared by one's own message or move (§8.2, 2026-09-14)
  gone_at   timestamptz,                         -- the conversation ended for this participant
  match_id  uuid,                                -- the match the consent half was signed for (§8.13; db/031, 2026-09-22)
  ephemeral_public_key text,                     -- this side's current ephemeral half (§8.13): from consent, a new one after a reissue
  ephemeral_signature  text,                     -- its signature by the long key: epoch 0 — over consent, later — over (chat_id, epoch)
  key_epoch integer NOT NULL DEFAULT 0,          -- the epoch of this half (db/031, 2026-09-22); a reissue writes over it, no history of epochs
  PRIMARY KEY (chat_id, identity)
);
CREATE INDEX chat_participants_by_identity ON chat_participants (identity);  -- the step-away transaction and the identity sweeper go by identity (2026-09-14)

CREATE TABLE chat_starters (
  chat_id        uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  position       integer NOT NULL,
  text_snapshot  text NOT NULL,       -- a copy: the feed expires, the chat header must not
  mode           text NOT NULL CHECK (mode IN ('alone', 'company', 'party')),
  liked_by       uuid NOT NULL,       -- internal identity, never exposed
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, position)
);
```

- Access check is "is there a row": `SELECT 1 FROM chat_participants WHERE chat_id = :id AND identity = :me`.
- `chat_starters` stores a **copy** of the text rather than a reference to `feed_messages`: the phrase lives N hours, the chat lives by its own clock, and the header must not empty out mid-conversation. `feed_message_id` is deliberately not stored — the link "this phrase → this chat" is better off not existing in the database at all.
- Opening a chat returns: **your own** `idle_ttl_minutes` and `last_own_message_at`, `last_activity_at`, `max_message_length`, `max_ciphertext_bytes`, the `chat_starters` list by `position` labelled `you liked` / `they liked` (resolved per viewer), the peer's name and age, `peer_stepped_away` and the conversation's `created_at` (since 2026-09-14: without it the client cannot count the span while it has no message of its own). **That is all** — the history comes from the client's own local storage under the same `chat_id`.

**Message length is a server parameter, not a client constant.** `max_message_length` arrives when the chat opens, defaults to **256 characters**, and changes without shipping a client. The client draws the counter and will not let you send more.

**The node, however, counts bytes and not characters.** What it sees is ciphertext: 256 characters cannot be counted in it, exactly or approximately. So the chat opens with a second parameter — `max_ciphertext_bytes`, **2048 bytes** by default — and whatever does not fit it is refused with `error`, delivered to nobody. Two parameters, and the division of labour is this: the counter in the client is a convenience, the rule of the system is bytes at the node (edit of 2026-08-25; §8.6 promised a check on characters while the acceptance checklist of the same spec already required bytes, and the promise was impossible to keep).

2048 is calculated from the worst case rather than chosen: 256 emoji characters are 1024 bytes of UTF-8, 1052 with an AES-GCM nonce and tag, 1404 in base64. That leaves 46% of headroom and a quarter of the `NOTIFY` payload.

**An honest client never reaches that limit — recomputed 2026-08-26.** 1404 bytes against 2048: hitting the refusal takes **378** emoji characters, one and a half counters. So `max_ciphertext_bytes` guards against a forged client rather than bounding a real conversation, and there is no point showing it to a person: the interface keeps one counter, at 256 characters.

The separation is not pedantry. Our client is **open**: the `depth` image can be rebuilt by anyone, and the web script is edited in the debugger in a minute. Any check that lives only on the client is a hint to its author, not a rule of the system. Treating it as a defence would be self-deception, so the limit is enforced where it cannot be rewritten.

The limit is not cosmetic — it holds up the arithmetic in §8.1 and §8.13. 256 characters of UTF-8 come to ~1 KB, the ciphertext with nonce, tag and base64 to about 1.4 KB, and all of it must fit inside the 8 KB `NOTIFY` payload with room to spare. Raising the value is allowed, but not blindly: there is a transport behind it.

**One chat per pair.** The unique `pair_key` means that while a chat lives there will be no second one:

- **a chat already exists** → no match is created; a special message lands in the chat and the phrase is appended to `chat_starters` (8.7);
- **an unclosed match is pending** → no second match; the phrase is appended to the card.

**A sliding TTL, measured from the last activity.** On every **delivered** message and every **move in a game**: `UPDATE chats SET last_activity_at = now()`. This is the only thing the server learns about a conversation: **when** something moved, with no text, author or count.

Moves count deliberately: a game (§6) is an ice-breaker where staying silent in words is the point, and it would be absurd for the chat to die under the hands of two people happily pushing checkers around. Activity is any shared action, not text alone.

Each side picks `idle_ttl_minutes` **inside the conversation**, with the handle in the header, and changes it at any time; the value lives in `chat_participants`, one row per person. The other side's value is never handed out — neither the number nor the remainder computed from it: knowing that it is time to answer is needed, knowing someone's character from the span they chose is not. Your own is always visible (`fades after 1h of your silence`).

**It counts from your own last message**, not from the last activity in the conversation: reading is not talking, and someone who reads silently for an hour loses the conversation exactly as if they had left. `last_activity_at` stays on the conversation itself but does a different job — it moves the game board and the ordering of the list (§8.10).

**There is no smaller-of-the-two any more — settled 2026-08-26.** The old rule took `min()` of the two picks so that one person's caution was not overridden by the other's generosity; now there is nothing to override, because each side governs only its own. Petya's conversation dies on Petya's span and does not touch Kolya's.

**The silence counter** — two different thresholds:

```
threshold = idle_ttl_minutes / 4   (your own span, from your own last message)

silence < threshold   → no timer
silence ≥ threshold   → counter: chat deletes in Nm
my silence + my ttl   → the conversation ends FOR ME
```

A quarter is a **display** threshold, not a deadline, and the fraction matters more than any fixed number: on a ten-minute conversation any "twenty minutes" would light the counter after its death, which is to say never show it at all. A quarter feels the same across all four spans: 2:30 on a ten-minute conversation, a quarter of an hour on an hour-long one, 65 minutes on "while we're talking". The previous rule — a third of `min(20 min, ttl)` — is retired along with the pick at consent (§5).

Any **of your own** delivered messages resets both the counter and the countdown; theirs does not. **Your own move in a game counts the same as your own message** (settled 2026-08-27): the game exists so that two people can be silent in words, and without this rule a game played in silence would kill the conversation in the middle of itself. Their move, like their line, does not move your count. The server pushes nothing: the client knows `last_own_message_at` and its own `idle_ttl_minutes` and computes the rest.

A chat can outlive its originating phrases by a long way if people keep talking — that is fine: the texts are already copied, and the feed has nothing to do with the conversation any more.

### 8.7. An extra like into an open chat

Liking a phrase by someone you already have a chat with creates nothing new — it arrives **in that chat**:

```
INSERT chat_starters (chat_id, position = next, text_snapshot, mode, liked_by)  -- outlives everything
relay: a special message to both, worded per viewer                             -- in transit only
```

```json
{
  "kind": "extra_like",
  "position": 3,
  "text": "anyone heading to the embankment tonight",
  "mode": "company",
  "direction": "they_liked_yours"
}
```

Rendered as a centred card (like `sys`) holding the quote and a number matching the one in the `Liked, in order` header. Styling is the starters' styling: it is the same thing, arriving later.

**And the fact that it is shared is a protection, not a delivery detail (recorded
2026-09-10).** The feed is anonymous as to its author (§8.11), while this like answers
"is this phrase theirs" exactly: the card arrived, so it is. What keeps that from
being an oracle is that the answer lands **in the shared list of starters**, visible
to both from the first minute of the conversation: every check is a line the checked
person sees. Sixty-four likes in half an hour (§8.4) would be sixty-four cards on
their screen.

One-sided delivery is therefore ruled out — "to the initiator now, to the author
sometime", "skip whoever is offline". It looks like an optimisation and makes a quiet
oracle over 128 phrases an hour. If a row reached `chat_starters`, both see it, and
that is a condition of the mechanic rather than a property of the transport. Wordings: "they liked one more of yours" / "you liked one more of theirs". The bubble goes away with the local history; the `chat_starters` row does not.

### 8.8. Messages: only the undelivered is in the database

**There is no `messages` table, and no history on the node.** A message passes **through** the node encrypted: membership check → a row in the queue of the undelivered → delivery → **history is stored only in the participants' browsers**. The node does not look into the text — not because it promised, but because it cannot: it holds no keys (§8.13). The queue changes none of that: it holds the same unreadable bytes, and they live until delivery rather than for ever.

```
client: local record {local_id, text, status: pending}
        encrypts with the chat key (§8.13)
   → server: membership in chat_id
   → INSERT pending_deliveries + UPDATE chats.last_activity_at
        ↓ written      → ack {local_id, accepted}
        ↓ could not    → ack {local_id, error}
   → handed to the peer at once or on their next connect
        ↓ the peer acknowledges receipt → DELETE the queue row
client: updates its record by local_id; decrypts what arrives
```

Statuses are state **on the sender's client**, not a database row:

```
pending    — sent, the node has not answered
accepted   — the node took it and answers for delivery
error      — the node did not answer or refused → a "send again" button
```

**There is no "delivered" and no "read" state — decided 2026-09-12.** The sender is told
neither that the message was picked up nor that it was opened: any such signal reports
someone else's presence, which is exactly what §8.6 forbids. The node's answer is the
same for a live peer and for one gone a week ago, latency included: it writes the row
first, answers second, and only then looks for a socket.

`local_id` is generated by the sender; the server echoes it back and keeps it in the
queue as the key against duplicates (edited 2026-09-12; this used to read "stores it
nowhere").

**The queue of the undelivered.**

```sql
CREATE TABLE pending_deliveries (
  chat              uuid NOT NULL REFERENCES chats(id)    ON DELETE CASCADE,
  recipient_session uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  local_id          uuid NOT NULL,
  ciphertext        bytea NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat, recipient_session, local_id)
);
CREATE INDEX ON pending_deliveries (recipient_session, created_at);
CREATE INDEX pending_deliveries_by_age ON pending_deliveries (created_at);  -- the sweeper by age, every minute (step-5 panel, 2026-09-21)
```

- Every insert is `ON CONFLICT DO NOTHING`: a retry with the same `local_id` creates no
  duplicate.
- A row dies before the conversation does in three cases, and they matter more than the
  cascade: the recipient acknowledged receipt; their session was frozen (a PIN-limit
  freeze too, §8.2) — there is nothing to read it with anyway; the conversation ended for
  **either** of the two, because the key `K` dies on the first death (§8.13). The
  cascade from `chats` is the last net rather than the main janitor: a `chats` row lives
  until `gone_at` stands for both (§8.10).
- The cap `chat.pending.max` — **200 messages** per (conversation, recipient) pair — and
  the term `chat.pending.ttl` of **260 minutes**, the longest conversation span, are held
  by the node. Overflow evicts the oldest **silently**: a
  refusal on overflow would again signal "they have been away for a long time".
- The table stays out of the nightly dump (`--exclude-table-data`): transit is not
  restored, and ciphertext in the copies would live another two weeks.

**Resending** is always available on `error`, regardless of whether the peer is online. The pause grows geometrically (×3): immediately, 5 s, 15 s, 45 s, 135 s, capped around 10 min. The counter belongs to a specific `local_id` rather than the chat, and lives on the sender. A retry reuses the same `local_id` so the recipient can drop the duplicate.

**A chat is not moderated.** That is the whole project's position, not this document's decision: the privacy policy of both faces says chats are not checked, the same is written in the Article 30 register and in the chat-screen notes. The reasoning is simple. The feed is public — anyone within the radius sees it, and unchecked text there is a shop window. A chat is two people talking, opened by mutual consent, and that is not publication; a platform is under no duty to watch private correspondence.

**What protects a chat instead of moderation** — four things, working together:

- **the door** — a chat opens only on a mutual like and double consent: you cannot write to a stranger;
- **blocking** (§8.9) — killing phrases, the match and the shared chat;
- **reporting** (§8.10) — carrying a copy from the reporter's own device, because the server has none and can have none;
- **ephemerality** — a conversation does not accumulate, and disappears for both.

The refusal counter and the moderation ladder moved to §8.3: they belong to the feed, and the chat no longer has anything to feed them with.

**The game board** (`chat_games` from §6 — the name was corrected 2026-09-10, there is no `game_sessions` in the schema) is synced as chat state and disappears with the chat: by cascade from `chats`, and a row that outlives the conversation by the sweeper on `expires_at`. This used to read "nothing is written to the database"; since 2026-09-10 that is untrue — the position, whose turn and the score sit in the game cache. **Encryption was taken off it on 2026-09-09**, together with the introduction of minimal rules: only whoever sees the board can judge the play. The **board, and only the board**, is outside §8.13; messages and stickers are encrypted as before, and the secret word is seen by the node (§6, 2026-09-12). At a table the game state sits in the database beside the table — everything there is public by construction (§6.1).

**The exception is named: games with randomness (2026-08-26).** In cards, uno and backgammon the node shuffles and rolls, which means it sees the deck, the hands and the dice — encrypting from it what it deals out itself is impossible. **Rewritten 2026-09-10:** this used to say "the promise that the node does not read holds for messages and for boards without randomness", and since 2026-09-09 the second half is untrue — no class of board is encrypted. The promise holds **for messages**, and for nothing else. The difference between classes remains, but a different one: in the other games the node watches, and in these three it also decides — it shuffles and rolls. A private hand is still wrapped for its player: the others at the table see backs, the node sees contents.

### 8.9. Blocks

Recorded by identity, on both sides:

```sql
CREATE TABLE blocks (
  blocker_identity  uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  blocked_identity  uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  id                uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,  -- an opaque key for `GET /blocks` and `DELETE /blocks/:id`: not reducible to an identity (2026-09-16, DATA-21)
  PRIMARY KEY (blocker_identity, blocked_identity)
);
CREATE INDEX ON blocks (blocked_identity);
```

The check is symmetric — one row either way is enough:

```sql
SELECT 1 FROM blocks
WHERE (blocker_identity = :me    AND blocked_identity = :other)
   OR (blocker_identity = :other AND blocked_identity = :me)
LIMIT 1
```

The effect applies at all three levels at once: phrases are hidden from both sides; a like produces no match; a shared chat is closed.

**The limit, plainly.** A block holds until the person makes a new identity — which takes ten seconds (§8.2). They will be back in the feed, and that is true. But getting back to **you** takes more than returning: it takes a fresh mutual like on live phrases and your consent to open a chat. Blocking does not guard the door to a conversation — the entry model does.

**Hiding a phrase is not blocking a person.** The community guidelines promise it outright: blocking a message hides it for you only, not for everyone. That is a third action, with consequences of its own:

```sql
CREATE TABLE hidden_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- an opaque key for `DELETE /hidden/:id` (2026-09-16, DATA-17)
  identity         uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  feed_message_id  uuid REFERENCES feed_messages(id) ON DELETE CASCADE,
  -- A table line is hidden as the outcome of a complaint without the "illegal" checkbox (screen 19),
  -- not by a menu item; exactly one of the two columns is filled (2026-09-16, DATA-17).
  table_line_id    uuid REFERENCES table_lines(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(feed_message_id, table_line_id) = 1),
  UNIQUE (identity, feed_message_id),
  UNIQUE (identity, table_line_id)
);
```

The feed query (§8.3) gains `AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.identity = :me AND h.feed_message_id = f.id)`.

| Action | What it covers | Who learns of it | How long it lasts |
|---|---|---|---|
| Hide a phrase | one phrase, for me only | nobody | until the phrase dies (`CASCADE`) |
| Block a person | all their phrases, the match and the shared chat, both ways | nobody | until lifted |
| Report | nothing immediately — it is a signal to us | a moderator | per the procedure (§8.10) |

Hiding is **silent and one-way**: the author is not told, their feed does not change, the like count is untouched. It is a viewer's filter, not a sanction, and it must not be confused with reporting — otherwise someone who simply does not want to see a thing ends up in the moderation queue.

### 8.10. Ephemerality and cleanup

- **Feed** — `expires_at` (N hours): the phrase drops out of results, a background job deletes the row, `likes` cascade away. Starters survive — the text was copied.
- **Match** — `least()` of both phrases; expired means gone.
- **A conversation** — each participant has their own end: `COALESCE(last_own_message_at, chats.created_at) + their idle_ttl_minutes` (§8.6; clarified 2026-09-14 after the review panel — for someone who never wrote, the span otherwise never came). It arrives for one — the node sets their `gone_at` and stops accepting messages from them into that conversation; the other keeps counting on their own span. The transaction that sets the **first** `gone_at` deletes the `chat_games` row: the board goes out for both at the first death (§8.13), and the daily sweeper on `expires_at` is only insurance (2026-09-15, final panel DATA-8). Once no participant with `gone_at IS NULL` remains, the node closes the room and deletes `chats`, with `chat_participants` and `chat_starters` cascading. The chat sweeper looks for exactly that — `NOT EXISTS (SELECT 1 FROM chat_participants p WHERE p.chat_id = c.id AND p.gone_at IS NULL)` — not for "`gone_at` for both" [retired]: after the cascade from a deleted identity a conversation may keep one participant row or none (2026-09-15, final panel DATA-7).
- **Local history** — cleaned by the client, always on the client's initiative:

```
POST /chats/alive  { ids: [uuid, ...] }  →  { alive: [uuid, ...] }
```

Anything missing from `alive` is deleted from IndexedDB along with its messages. This covers, in one move: an expired TTL, a peer's closed identity, a block, and "hasn't opened the app in a month" — the very next session sweeps the dead away.

**The endpoint answers differently to the two participants of one conversation — a consequence of §8.6, written down here so it is not discovered during debugging.** `alive` is computed **for the caller**: a conversation is alive for them until **their** span runs out. The same `chats` row lands in Kolya's `alive` and not in Petya's — and that is the correct answer to both, not a desync. Separately: a conversation whose peer has `gone_at` set **stays alive** for the caller — they still see their own history — but is marked as **ended**, and nothing can be written into it (§8.6). Otherwise a person sends words into emptiness and waits for an answer.

**Three rules for this endpoint, all from 2026-08-21 — it is the only destruction command the system has.** The reply contains only those `id`s for which a `chat_participants` row exists with the caller: other people's and non-existent ones are silently absent and therefore indistinguishable from dead. The array length is capped. And above all: **the list of the living is valid only on a confirmed read of the database** — on error the node answers 503, not an empty list. The node's policy of "the query failed, carry on without an answer" would mean here that five minutes of unavailable Postgres wipe the conversations of everyone who opened the app in those minutes.

**The client does not delete what its own clock still calls alive.** If a conversation has not expired by `COALESCE(last_own_message_at, created_at) + its own idle_ttl_minutes` and the node did not name it, it is marked "the node says this chat is gone" and deleted once its own timer runs out too. A cheap insurance against a single node-side error that is otherwise irreversible.

**Local history is encrypted with the vault key of §8.2** — `HKDF(local share ‖ the node's share)`, where the node releases its share only after the PIN checks out. Since everything lives in the browser and entry has no barrier, anyone opening the app on a shared device would otherwise read someone else's conversations; a device taken without the PIN yields nothing, because half the key was never on it — and since 2026-09-15 that holds for the keys as well as the history: in the web the private halves also lie wrapped under the vault key, and a locked tab holds no socket (§8.2). Erasing an identity makes the old records unreadable even before the `alive` sweep removes them.

This paragraph used to say the key came from "the same secret that signs requests", which stopped being true when §8.2 replaced that secret with a key pair — there is no secret to derive from, only a public half the node keeps. Three sections gave three answers to one question; this is the one that holds.

**A pair can match again.** `pair_key` is freed when the `chats` row is deleted, so after a chat dies a new match is possible — but only under the usual rules: both phrases must be alive, and both people must consent again. That is intended, not a side effect.

**A report carries one side's word, and nothing else — decided 2026-09-11.** There is no text on the server, and the client does not upload any: the other person's decrypted message never reaches the node in any form, or end-to-end encryption would end exactly at the report. The earlier wording described the opposite — the client took the last N messages from local history and showed them to the reporter before sending [retired]. A person can still quote: by their own hand, in the description, as much or as little as they choose.

**What it looks like.**

```
"report" inside the chat
  → the reporter describes what happened and quotes whatever they choose
  → sends {kind: chat, chat_id, the reporter's text, reason, good faith}
  → snapshot_state = not_accessible: we have no snapshot and can have none
```

**In the panel it is marked as one side's word.** The copy came from the
reporter and we have nothing to check it against — no original, no second
version. The moderator sees that mark beside the text rather than inferring it.
A decision leans on it as a **signal**, not as evidence: measures against an
identity only follow from independent grounds (§5.2 in `dsa/SPEC_EN.md`).

### 8.11. What is visible from outside

| Level | Available |
|---|---|
| Feed | `feed_message.id`, text, `mode`, circle (centre **rounded to a cell** — §8.3 — + radius), `like_count` (the card's time was removed on 2026-09-24: with a fixed span the start is the end); in a phrase's last 65 minutes, a `soon` flag instead of its end (2026-09-23) |
| Match | `match_id`, peer's phrase + `mode`, name, age, the remainders of both phrases (since 2026-09-14; "timer" [retired]) — the one exception to "when other phrases expire" below: the span of a phrase that has already led to a mutual like is disclosed to its counterpart |
| Chat | `chat_id`, `chat_starters`, name, age, `idle_ttl_minutes`, `last_activity_at` |
| Never | anyone else's `identity_id`, private keys, **authorship of feed phrases**, who liked, chat counts, conversation text, **when other phrases expire** — with a caveat: polling the feed still gives away when a phrase appears, and the public 4:20 give its end (2026-09-15, final panel SEC-7) |

**Expiry of other people's phrases was added to "Never" on 2026-09-08.** The
promise was already being cited as obvious — in the reasoning for why the quota
screen does not show the time a slot frees (`refusal-wordings_EN.md`) [retired: there was no such reasoning, see the clarification below] — and it
was not in the list. Obvious does not survive in a list like this one: the list
is what people read when deciding what may go out. Same device as §8.3, where the
centre is rounded to a cell: the feed must not work as a measuring instrument on
other people's spans.

**Clarified 2026-09-14: there was no "reasoning" in `refusal-wordings_EN.md`, and
one's own spans are shown.** The paragraph above cited a reasoning for why the quota
screen does not show when a slot frees; the review panel of 2026-09-11 found one line
saying "in a few minutes" and not a single argument in that file. A slot is freed by
**one's own** phrase, whose span the person already sees on screen 9 of the
storefronts, so a quota refusal and an hourly-limit refusal now name the time ("frees
at HH:MM"). The "Never" list does not change: other people's spans are still given
out by no answer at all.

**The line runs at the chat, not at the phrase.** In the feed the author is never shown — that is the core rule. But once a chat is open, authorship inside it is known by construction: the peer sees a name and age and knows whose phrases sit in `chat_starters`. Every `extra_like` (8.7) adds one more phrase by the same person to that list.

So over a long conversation a peer will accumulate a set of one author's phrases with a name and age — and that is not a leak but the very point of an open chat: these people chose to meet. What matters is the other half — **that set never leaves the chat**: it is not published, not handed to third parties, and it dies with the chat.

What a traffic observer sees: uuids, feed phrase texts (public anyway), and the **ciphertext** of a conversation. What they do not see: what was said, who wrote what, who liked what, or whether two phrases belong to one person.

### 8.12. Notifications: the inbox only

There is one layer. The **inbox** answers "what happened while I was away", works always and costs almost nothing. The second layer — the one that pulls at a person from outside — does not exist in this system, and that is a decision rather than an omission (see "There is no push" below).

#### Inbox

There is **no** `notifications` table — the server state already holds every event, and the inbox is assembled by a query on app start:

```sql
-- matches waiting for my decision
SELECT m.id FROM matches m
JOIN match_participants me ON me.match_id = m.id AND me.identity = :me
WHERE m.expires_at > now() AND me.accepted_at IS NULL;

-- "waiting for you": I accepted, they have not  (and the reverse)
-- chat opened: a chats row that is missing from my local database
-- one more phrase liked: chat_starters with a position beyond what I have seen
-- the conversation fades FOR ME: COALESCE(my last_own_message_at, created_at) + my idle_ttl_minutes is close
```

This is the rare case of a feature that adds not a single line to the schema: everything derives from `matches`, `chats`, `chat_starters` and `last_activity_at`. The inbox honestly survives a closed tab, a reload and a node switch — because it lives in the data, not in memory.

**The "new" dot on a conversation is counted by the device, not by the inbox — the owner's decision of 2026-09-17.** The catch-up delivery brings the lines, the device remembers which of them screen 8 has shown, and puts the dot on the conversation's entry and on the tab (storefront screen 7). The node still knows nothing about reading: there is neither a request nor a column for it.

**A missed message is recovered indirectly.** There is no text on the server, but there is a trace of activity:

```
server.last_activity_at > the time of my last local message
   → "something happened here and you do not have it"
```

The client shows a line — "you missed a message, ask them to send it again". The text itself is never recovered, which follows directly from 8.8. **There is no "I'm here" signal button — removed 2026-09-14** [retired]: asking works with an ordinary reply, and a signal would be a second report of presence beside "stepped away" (§8.2).

**While the tab is open the inbox works in real time** — events arrive over the same WebSocket (8.1), with no extra request. The initial `GET /inbox` is only for a cold start.

In the UI this is the counter on the "Offers" tab and the dot on "Conversations" (§3) and highlighted threads, not a separate notifications screen: there are few events and they all live in those two lists anyway.

**A burnt-out match will not appear in the inbox.** The `matches` row is deleted on expiry, so there is nothing to show — and that is for the better: instead of a graveyard ("you had three matches, all dead") a person sees only what is alive. The price is honest and worth knowing: **what was missed disappears silently and for good**.

#### There is no push — in any face

No Web Push in the browser, no system notifications in the terminal, no `BEL`. The decision is taken for the whole platform, which is why it is recorded here rather than in one face's document.

**The reason is metadata, not difficulty.** A push is impossible without an intermediary: in a browser that is a service worker plus somebody else's delivery service (Google, Mozilla, Apple), in a terminal a system bus. Even with a fully opaque payload, that intermediary receives what we hand to nobody: a durable subscription identifier tied to an identity, and the **rhythm** — when exactly somebody spoke to this person, how often, at what hours. The whole of §8 is built on the fact that not even our own server keeps the correspondence; handing its metadata to a third party for convenience is a contradiction with nothing to justify it.

A good deal disappears along with it: VAPID keys and their rotation, the subscription table and the sweeping of dead rows, a separate sub-processor in the Article 30 register, a dependency on Apple's and Google's policies, and a different set of capabilities on every platform.

**Delivery when the other person returns does happen — decided 2026-09-11,
refined 2026-09-12.** [retired] This used to read "there will be no automatic resend
— decided 2026-08-10", and the argument ran: any "later" delivery requires the message
to sit somewhere, and the whole of §8, along with a plain sentence in the storefront
policy, rests on the server not keeping conversations. The argument holds; the consent
changed: what may sit there is **ciphertext** the node cannot read, and it sits in a
queue until delivery rather than for ever (§8.8). There is still no push and nobody is
called — the message simply waits. The storefront policy was rewritten together with
this decision instead of being left promising the old thing.

The price is accepted and stated: a conversation with someone who left resumes
only when they come back themselves, and it is resumed by a person, not by the
system.

**What it costs, stated plainly, because the cost is real.** Everything in this model lives in minutes and needs an answering action: a match fades and waits for **two** taps, a chat dies of silence, a message to an offline peer waits in the queue while the conversation lives (8.8). There is **nothing** with which to call a person who is not in the application right now. They learn about all of it only when they open the client themselves, and a match that burned out they will never see — the inbox shows only what survived until the opening.

The direct consequence: **this system works for someone who comes back on their own, regularly**, and does not work for someone waiting to be called. That is how it should be described — to people, too, and not only in the spec.

What is left in place of a push:

| Layer | When it works |
|---|---|
| The live connection (8.1) | the client is open — events arrive instantly |
| The inbox | the client was opened again — everything that survived is visible |
| — | the client is closed — nothing arrives |

**A missed message** is recovered indirectly through `last_activity_at`, and the mechanism is described above in this same section. The sender gets an `error` and a retry button; the loop is closed not by a notification but by the other person opening their client one day.

### 8.13. End-to-end encryption

A chat is encrypted on the devices: the node carries ciphertext and holds no keys. This became possible exactly when the chat stopped being moderated — you cannot read text and be blind to it at the same time.

**A key per conversation, not per person.** It is born when two people consent and dies with the chat. The identity's long-lived key (§8.2) takes no part in the encryption at all: it only vouches that a public half belongs to that identity. Losing the long-lived key exposes no conversation — it lets someone impersonate a person, not read them.

```
consent      each side generates an EPHEMERAL pair for this chat
             and publishes its half, signed with the long-lived key
opening      S = ECDH P-256(my ephemeral, their ephemeral), salt = chat_id
             K_low_high = HKDF(S, salt = chat_id, info = "low→high")
             K_high_low = HKDF(S, salt = chat_id, info = "high→low")
             ─► low and high are the participants' identity_id sorted the same way
                as in pair_key: each side knows which key it encrypts with and which it expects
message      AES-GCM(K_of_my_direction, nonce, text) → node → the peer decrypts
             nonce — 96 bits from crypto.getRandomValues, fresh for every message
chat death   both K and the ephemeral keys are wiped, the wraps are deleted
             ─► old ciphertext can no longer be opened, by anyone
```

**Built 2026-09-22 in the `depth` terminal (`depth/core/seal.ts`), and what the spec left unsaid is named:** the bytes signed are `"xor.ephemeral.v1\n<match_id>\n" ‖ SPKI` (bound to the match — panel 2026-09-22), the HKDF salt is `chat_id` as the UTF-8 of its text form, `info` are the strings with the arrow U+2192, on the wire `nonce ‖ ciphertext ‖ tag` in base64url, the AES-GCM additional data is the message's `local_id` (a box the node re-labels does not open), a nonce seen before does not open twice (a replayed frame), and at the chat's opening the halves are copied to `chat_participants` (db/031) so a match gone no longer takes them; the half on consent is mandatory, without it consent is not taken (400), a different half on a repeated consent is 409 `half_published`. **The reissue is built (2026-09-22)** (`POST /chats/:id/rekey`, the half's epoch in `chat_participants.key_epoch`, db/031; signed over `"xor.rekey.v1\n<chat_id>\n<epoch>\n" ‖ SPKI`; an end-to-end test of two terminals: the one that lost its pair asks, the other agrees, the new opens and the old does not). Open rooms hear the reissue as a `rekey` frame (NOTIFY `chat_rekey`), on agreement the delivery queue under the old keys is cleared, and a chat of the pair that ended for both and is not yet swept is deleted on a new consent — the pair gets a new one rather than going back into a dead one (panel 2026-09-22). The question put to the person on the other side is a screen, not built: in the test the terminal agrees by itself. **The `chat_key_wraps` are not built**, deliberately: a wrap serves a client that keeps keys between runs, and the `depth` terminal keeps no history on disk by design. For the web face the open question is what to wrap: the spec wraps a single `K`, and what is built is two direction keys.

**Two keys, not one — decided 2026-08-21 from the review.** A single symmetric `K` shared by both used to stand here. Ciphertext then says nothing about who created it, and a dishonest node can hand a sender their own message back as an incoming one from the peer: the cryptography stays silent, the key being genuine. Splitting by direction closes that with one `info` string in HKDF — a side decrypts incoming traffic **only** with the other direction's key, and its own echo stops opening.

**The `nonce` is written down because silence here costs more than a line.** WebCrypto has neither a default nor a counter: `iv` is mandatory and entirely on the caller. This spec settles such places everywhere else — it names P-256, `SHA-256`, the exact string to sign, `extractable: false`, the HKDF salt — and leaving the one unnamed hands the decision to the first implementation, which will live with it for years.

**How the key survives an identity transfer.** Whoever consented wraps `K` under their live session's `wrap_public_key` (§8.2) and puts the wrap on the server. The server cannot unwrap it — it stores opaque bytes. There is one live session, so there is one wrap; on transfer the new session gets the wraps of new chats, while the old ones stay with the frozen session and come back with it.

```sql
CREATE TABLE chat_key_wraps (
  chat_id     uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  wrapped_key bytea NOT NULL,        -- K under this session's key
  PRIMARY KEY (chat_id, session_id)
);
```

`ON DELETE CASCADE` carries meaning here rather than hygiene: the chat dies and its wraps go; a session is deleted and its wraps go with it.

**Freezing becomes real.** With a single long-lived key a frozen device would lose only access while keeping the ability to decrypt for ever. With wraps it loses the ability itself: nobody will wrap a future chat's key for it. This is not cosmetic — transfer without this would be a feature that looks like protection without being one.

**A device that joins later starts on an empty screen.** The keys of chats opened before it appeared had nobody to be wrapped for, and we will not backfill them: a wrap is made for a live session, and that session did not exist yet.

**This applies to a transfer and to a recovery alike, and it used to be a dead end.** The person sees the chat rows and can read nothing in them — new messages included: a conversation has one `K` and it stayed on the previous device. "The chats are there, the history is not" sounded milder than the truth: it is not that the old messages are gone, it is that the conversation is mute.

#### Reissuing a chat key after a device change

There is a way out, and it is one way for both cases — no reason to give two answers to one illness.

```
new device      signs the request with the LONG-TERM identity key
                ─► the node passes it to the other side
other side      verifies the signature against the long-term key it saw
                when the chat opened ─► the same identity, not a substitution
                ─► asks the person: "they changed device.
                   Issue new keys? Old messages will not come back"
both            fresh ephemeral pairs, a new K = HKDF(ECDH P-256(...), salt = chat_id)
                ─► wraps for the live session on each side
the old K       cannot be recovered by anything
```

**Signed with the long-term key, not merely a chat membership.** A row in `chat_participants` is available to whoever took the identity too; the long-term key is the only thing that survives a device change and does not sit on the node in the clear. Only its holder can forge the request — that is, the identity itself. That is the whole role of the long-term key in §8.13: it encrypts nothing, it attests.

**The person is asked rather than told**, for the same reason a transfer requires "that's me": a companion changing device is an event worth knowing about, particularly if the identity was taken.

**The safety code does not change** — it is derived from the long-term keys, and those are the same. Two people who compared it aloud can compare it again and see the same number.

**Forward secrecy is not weakened but strengthened:** the new `K` is out of reach of the previous device, and nothing written from here on can be read by it.

**What this does not fix.** If the long-term key was taken along with the paper, the reissue works for the attacker just the same — but that is the theft of a whole identity, not a hole in the reissue.

**A schema consequence — created 2026-09-22.** [retired] This said "a reissue has no such place, and one has to be created". The place is `chat_participants.{ephemeral_public_key, ephemeral_signature, key_epoch}` (db/031): the consent half is copied there when the chat opens, and a reissue writes over it and raises the epoch. There is no history of epochs, deliberately: past halves are of no use to anyone — the old keys are not restored. **The client remembers the epoch, not the node:** its own pair is kept with the epoch it was published at, and the peer's half is checked against that; a node that presents an old epoch with an old, honestly signed half is refused — otherwise a rollback to the lost device's key would read the new conversation (panel 2026-09-22, security lens). For the same reason agreeing to a reissue checks the request's signature before anything is signed.

**Forward secrecy holds.** The ephemeral keys and `K` are wiped when the conversation dies, and the wraps go with it. Even someone who later obtains the identity's long-lived key cannot open an old conversation.

**When the spans diverge, `K` goes out on the first of them — settled 2026-08-26.** Participants have their own spans (§5, §8.6), so "the death of a conversation" stopped being a single moment: it ended for Petya while it still runs for Kolya. The key is nevertheless destroyed **for both at once**, together with both `chat_key_wraps` and the game board.

This does not undo the per-person count, because the count is about history and the key is about transit. The local history sits under the **vault key** (§8.2), not under `K`: Kolya's reads exactly as it read and lives until his own span. Putting `K` out later would be a cost with nothing bought — nothing can be written into the conversation by either side any more, while the key from which intercepted ciphertext could be decrypted would stay derivable for hours. Forward secrecy must fire at the **earliest** of the two moments, not the latest.

**A key that cannot be extracted.** The private halves live in IndexedDB only wrapped under the vault key (§8.2, 2026-09-15); on unlock they are unwrapped into memory as `extractable: false` and forgotten on lock. They can encrypt; their material cannot be exported, not even by our own code: a foreign script running on an unlocked page reads what is open right now but carries no key away. [retired] This said "The pairs are created with `extractable: false` and live in IndexedDB as `CryptoKey` objects".

**There is one exception, and it is permanent — which is how it should be stated.** The identity's long-lived key has to reach a new device during a transfer (§8.2), and WebCrypto cannot wrap a non-extractable key: `wrapKey` requires `extractable: true`. So the long-lived key is extractable **always**, not "for exactly as long as the transfer takes" as this said before — and a foreign script will carry it off at any moment, not only during a transfer. What that buys an attacker is bounded by §8.13 above: they can impersonate the person, but not read the conversations, because the long-lived key takes no part in the encryption. At rest it is wrapped under the vault key like the other private halves, so a foreign script takes it only from an unlocked page; in `depth` the same vault key — the PIN with the node's share — protects the key file (web and `depth` are the same since 2026-09-15, §8.2).

**Size.** The ciphertext of a 256-character phrase is up to ~1.4 KB with nonce, tag and base64 (1024 + 12 + 16 bytes → 1404 characters; §8.1 counts the same). The 8 KB `NOTIFY` limit (§8.1) still holds with room to spare.

**What it does not give — and this must be said plainly.**

- **We serve the very script that encrypts.** That is the ceiling of any web application: a person trusts not the mathematics but our not swapping the code tomorrow. It is why Signal is an app rather than a page. The honest wording: **the server cannot read a conversation after the fact** — not through a breach, not through a seized database, not on request. That is a great deal, but it is not "we are physically incapable", and it must not be sold that way.
- **That promise has a condition, and it is named in §8.2 (2026-08-21).** "A seized database" is safe exactly as long as the vault shares sit in it **encrypted under the node's key**, and the key does not travel in the dump. Without that condition a dump plus one device gave an offline PIN search and a read of the local history — precisely the reading-after-the-fact promised not to happen. The condition is met by the `vault_shares` schema, and the day it stops being met this line is the first one to remove.
- **A message reflected by the node — closed 2026-09-22 by the two direction keys (`depth/core/seal.ts`, test "a reflected message does not open").** [retired] The chat key `K` is one and symmetric for both, so ciphertext by itself does not say who created it: a dishonest node can return a sender's own message as an incoming one. The safety code (below) does not catch that — it is about key substitution at the opening of a chat, whereas reflection works at any point in the life of an already-open one. It is closed by splitting the key per direction (§8.13 above), and until then this is an honest boundary.
- **Metadata remains.** The node knows `chat_id`, both participants, when something moved and how long the messages were. What is encrypted is the content, not the fact of the conversation.
- **Encryption does not protect you from the person you are talking to.** They have the plaintext on their screen: they can keep it and quote it in a report by their own hand. That is by design (§8.10) — otherwise there would be nothing to report with; the client will not upload the conversation on their behalf (2026-09-11).

**Us substituting a key.** The public halves are handed out by our server, so in theory we could slip in our own and read a conversation live. Cryptography does not stop that; comparison does: a **safety code** derived from both identities' long-lived keys and shown in the chat header, which two people can check in person or over a call. Using it is optional, but without it one has to trust us regardless.

**The safety code's format (the owner's decision, 2026-09-22).** Twenty digits in five groups of four — `5079 0098 2219 6667 9602`: read aloud in about twenty seconds, about 66 bits. Derivation: `SHA-256("xor.safety.v1\n" ‖ min(P_a, P_b) ‖ max(P_a, P_b))`, where P are the points of both identities' long-term keys, uncompressed and ordered bytewise (one encoding per key; a key that is no P-256 point is refused rather than hashed); the first 16 bytes as an unsigned integer, modulo 10²⁰, zero-padded. The ephemeral halves do not go in — so a rekey does not move the code. The code is opened from the chat's menu instead of standing in its head; the "verified" mark lives until the process exits and is not stored on the device (the owner's decisions, 2026-09-22). Opening the panel asks for the code again: a rekey does not move it, but a long key that has become someone else's does — and then the mark is dropped and the person is told the code has changed since they compared it (2026-09-22). The reference and its tests are `depth/core/seal.ts` `safetyCode()` and `depth/core/safety.test.ts`; the web face must produce the same code for the same keys. The client computes the code where it opens the conversation, from the same key that verified the peer's half: a code from another read could match while the conversation runs under a planted key. **Why twenty, not twelve.** A node that swaps keys can search for its own key so that both people's codes match: at twelve digits that is about 2⁴⁰ tries, days on ordinary hardware (security lens, 2026-09-22). The owner chose twenty digits the same day — the search moves into years.

**Edge cases.** The peer closed their identity — the chat is killed like an expired one. Reconnecting to a different node does not touch the keys: they live on the clients, and the node holds only public halves and wraps, from which nothing can be derived.

### 8.14. The moderation model: measured

**Settled 2026-08-27 by numbers rather than by argument.** The `relay/moderation-bench`
stand collected 300 human-labelled examples per language across nine languages and
read each of them two ways: **natively**, with a multilingual classifier on the
original, and **through translation** into English with an English classifier.
Three languages (ru, es, fr) are excluded from the conclusion: the model was
trained on those very sets, and the number there is flattering.

Across the six honest languages (en, el, tr, ar, de, uk):

| | native | through translation |
|---|---|---|
| mean F1, threshold tuned per language | **0.784** | 0.737 |
| F1 at **one** threshold for all | 0.741 | 0.720 |
| worst language at one threshold | **de 0.404** | de 0.669 |

**We take translation, although its mean F1 is lower.** The gap in the mean is
0.047, and it evaporates as soon as the threshold is one for all languages — and
in production it is one, because the language is identified by the same pipeline
and with error, and tuning per language means trusting that identifier more than
it deserves.

What decides is not the mean but the **worst case**: on German the native arm
collapses to F1 0.404 — at its tuned threshold it flags nearly everything (0.50
precision at 1.00 recall). The translation arm holds 0.669 on the same language.
Moderation is a place where being good on average matters less than never
collapsing: a collapse means either a feed full of abuse or blocking the innocent,
and both cost more than forty-seven thousandths of a mean.

**The cost is named:** translation adds a step and time, and machine translation
launders abuse — which is why the lexicon over the original stays the first layer
and stands **before** the translator (§8.3). That ordering is what makes this
choice work.

**The operating point is set by the cost of a mistake, not by peak F1 — edit of
2026-08-27.** The table above compares the arms where each shows its best F1, and
for moderation that point is unusable: there the translation arm wrongly blocks
**41%** of ordinary messages, and the native arm 22%. F1 is symmetric, the two
mistakes are not, and the product has already named its price out loud: "0.07 of
ordinary messages are blocked for nothing" (§5 of the storefront mechanics). So
the arms have to be compared at an equal price:

| at 7% false blocks | native | translated |
|---|---|---|
| caught overall | 0.55 | 0.46 |
| caught in the worst language (de) | 0.13 | **0.26** |

The conclusion has not changed, but it no longer rests on F1: at the same cost of
a mistake, the translation arm catches **twice as much** in German. Two
consequences did change. First, **the threshold is set by a false-block budget**
and therefore lives as a node parameter rather than a constant of the model — it
is moved without retraining anything. Second, the published promise "0.55 is
caught, 0.07 blocked for nothing" describes the **native** arm, the one we did
not take; for the arm we did, the honest numbers are **0.46 and 0.07**, and they
are corrected in both storefronts' mechanics.

**What stays open:** the queue's throughput (§8.3) — a separate measurement on
live hardware, made on the day the queue appears.

## 9. UI states and breakpoints

- **`≥900px`** — a workspace: **[Feed] | [Offers and conversations]**, while **[Active chat]** appears only when a conversation is open (the second column gained two tabs on 2026-08-26: matches waiting for an answer, and open conversations — until then matches were shown nowhere, though the inbox collects them first, §8.12) (feed `flex:1`, chats `300px`, active chat `400px`). **From `1030px` the active chat stands next to the list, between 900 and 1030 px in its place** (decided 2026-09-15, storefront screen 3). No rails and no bottom navigation: "Say" and "Me" are in the feed header. [retired] This said "Columns collapse into vertical rails" and the empty `Pick a chat` state.
- **`≤899px`** — single column, bottom navigation (`Feed` / `Chats` / `Say` / `Me`); the conversation is a full-screen overlay (`position:fixed`), "back" → list.
- **`≤560px`** — compact header.

## 10. Accessibility / quality

- `:focus-visible` — accent outline; `prefers-reduced-motion` — disables fading/pulsing.
- `overflow = 0` horizontally in every state (list / conversation / game), baseline screen iPhone 12 mini (375px).

## 11. Logo: house and text (shared behavior — landing and app)

The logo has two clickable parts with **different** actions. The rule is identical on the landings (sosed.place / neighbro.place) and in the app.

- **House mark** — cycles the accent colour round the storefront's set, the same on the landing (button `#logoBtn`) and in the app (decided 2026-09-15). Light and dark are a separate ☀/🌙 button on the landing and storefront screen 22 in the app. In the app the choice is kept with the identity, one row per face (§8.2, the `identity_appearance` table).
  [retired] This said "changes the theme (as now)" and "The house behavior does not change": on the landing the house mark cycled the accent even then, so the shared behaviour promised by the section heading did not hold.
- **Name text** (`SOSED` / `NEIGHBRO`) — navigates **"home"**, where "home" depends on auth:
  - **has an identity** (`identity_id` and the private half of the key in the browser, see §8.2) → the app's **chat window**;
  - **no identity** → the **landing**.
- **"Has an identity" is defined** as an `identity_id` plus the private half of the key that signs requests. [retired] This said "a live secret" — the model §8.2 retired on 2026-08-12 and never cleared from here; corrected 2026-08-17. Until that exists there is no identity → the name text always goes to the landing.
- Accessibility: the name text is a semantic link/button with an `aria-label`; house and text are distinguishable by focus.

## 12. Open questions

What is settled moved into §8; what remains here is UI and product.

- Notifications are designed in §8.12 (including why there is no push and what that costs). There will be no settings, no quiet hours and no coalescing: there is nothing to silence and nothing leaves the device. What remains is the inbox UI — tab counters and thread highlighting.
- The open list for data and moderation lives in §8.14.

## 13. Build order

The spec describes **what** gets built; this is the order, because here the
order is not a matter of taste. Without an identity there is no feed, without a
feed no like, without a like no match, and without a match nobody to open a chat
with. Starting "with the chat" is physically impossible.

There are two orders here and they are perpendicular. The first is by data: it
is the numbered list below and it does not depend on the face. The second is by
face, and it is decided separately: **the terminal goes first**.

**The core first, the faces after.** Protocol, cryptography and state live in a
shared module — **with no DOM and no Ink**. Two thin rendering layers sit on
top: one draws into a terminal, the other into a browser.

```
        ┌──────────────────────────────────────────────┐
        │  core: protocol, crypto, state               │
        │  not one reference to the DOM or to Ink      │
        └──────────────────────────────────────────────┘
                   ▲                        ▲
        ┌──────────┴─────────┐   ┌──────────┴─────────┐
        │  depth: Ink layer  │   │  web: DOM layer    │
        └────────────────────┘   └────────────────────┘
```

Without that split the client doubles whole rather than only in its screens:
Argon2id twice, key wrapping twice, two implementations of the code transfer —
and two chances to diverge in behaviour where divergence means incompatibility
rather than cosmetics.

**The terminal first — a choice, not a convenience.** The reason is that it
makes the protocol checkable. While there is one face and it is ours, "client"
and "server" quietly grow together: whatever suits a particular page seeps into
the API. A terminal client draws the same thing with no DOM, no cookies and no
browser storage — and everything that was implicitly propping up the web client
surfaces at once.

The web follows it over a protocol that is by then already proven. The reverse
order would produce an API the terminal would have to be bent to fit.

1. **Identity and session** (§8.2) — `identities`, `sessions`, `vault_shares`,
   request signing, the code transfer with confirmation. Registration: **name and
   age, then the PIN and the exchange with the node for a share, then the paper
   code**. Three steps, all mandatory — without the share the local database sits
   unencrypted, and without the code a lost device means a lost identity. **The
   code came back here on 2026-08-26** (§8.2): the move to the first chat is
   overridden, because a window without insurance has no way out, while a screen
   that fails to convince mends itself — the person returns a day later.
   Everything else rests on "who is this".
**There is no unchecked-name window — decided 2026-08-20.** A gap used to stand
here: a name goes through the same moderation queue as a phrase, the queue only
arrives at step 2, and so between steps 1 and 2 a name was accepted unchecked.
The gap is closed by moving the moment of the check, not the order of the steps.

**The name is checked at the first publication** — no queue is needed at step 1,
because until the first post the name is visible to nobody: the feed never
reveals an author (§8.11), and another person's eye reaches the name only from
the first match, which is after step 4. From then on the same queue checks the
name **on every change**.

```
step 1  name accepted, seen by nobody     nothing to check and no reason to
step 2  first post → the queue exists     the name rides into it with the phrase
        name rejected → the phrase WAITS  only both together reach the feed;
        the author is asked to fix it     fix the name and it publishes itself
step 4  first match                       the name is first seen by another
```

**While the name stands rejected, no match opens.** This is a consequence of
§8.11 rather than a separate rule: the name is visible only from a match, so the
match is the last point at which a rejected name can still be withheld. The post
stays alive meanwhile: it passed its own check, and there is nothing to delete it
for over a mistake in a different field.

2. **Feed and geography** (§8.3) — `feed_messages`, delivery by circle overlap,
   age bands, moderation before publication through a queue. **With this step, not
   after it:** the Article 17 statement screen for an author with no email
   (`dsa/SPEC_EN.md` §7). We never ask for an address, so an author usually has
   none, and without that screen the first restriction is a silent removal. The
   first screen on
   which the product does anything at all.
3. **Likes** (§8.4) — `likes`, `identity_stats`, the count on a phrase.
4. **Match and double consent** (§8.5) — `matches`, `match_participants`; the
   chat's ephemeral keys are born here.
5. **Chat: transport** (§8.1, §8.6, §8.8) — rooms by `chat_id`, the
   `LISTEN`/`NOTIFY` bus, delivery and acknowledgements. The largest part, and
   it depends on none of the open questions.
6. **Encryption** (§8.13) — the ephemeral exchange, `chat_key_wraps`,
   unwrapping on a second device. A separate step after transport: first let
   messages travel, then let them travel encrypted.
7. **Blocks and hiding** (§8.9), **cleanup and `alive`** (§8.10).
8. **Notifications** (§8.12) and **games** (§6) last: the scheme works without
   them, only worse.
9. **The web face** last, over the protocol the terminal has proven by then.
   Steps 1–8 are done in `depth`.

Steps 1–4 are not worth queueing behind one another: each adds a working
screen, and each is a place one can stop. That screen is a terminal one — the
web catches up in a single step at the end.

**The first migration carries ten tables, not twenty-four — decided 2026-09-11.** Eleven since 2026-09-14, see below.
The set follows from steps 1–4 and is written down here so that it
is not picked by whoever first sits down to write `db/`: `identities`,
`sessions`, `vault_shares`, `legal_acceptances`, `feed_messages`, `likes`,
`identity_stats`, `matches`, `match_participants`, `blocks`. The first four are
"who this is" together with the consent that cannot be reconstructed after the
fact. Then the feed, the like and the pair. `blocks` is in because from the very
first match there has to be a way to end contact, not because step 4 demands it.

**The eleventh is `support_requests`, added 2026-09-14** (screen 14 of the
storefronts). The screen promised a list of one's own requests and an answer kept
with the identity, and there was nothing to hold them: the table existed neither in
the set nor in any build step. The columns below are introduced by this decision and
appear in no other document:

```sql
CREATE TABLE support_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),         -- internal; bigserial [retired] 2026-09-14
  public_no    text NOT NULL UNIQUE CHECK (public_no ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),  -- the number the person sees: Crockford base32 from the node's CSPRNG
  identity     uuid REFERENCES identities(id) ON DELETE SET NULL,  -- "start over" nulls it in the closing transaction (§8.2); SET NULL is the backstop for DELETE
  body         text NOT NULL,
  email        text,                                               -- optional
  from_frozen  boolean NOT NULL DEFAULT false,                       -- written from a session frozen by the PIN limit (§8.2, 2026-09-14)
  created_at   timestamptz NOT NULL DEFAULT now(),
  answer       text,
  answered_at  timestamptz,
  answer_seen  boolean NOT NULL DEFAULT false,                      -- the dot under "Me" shows while there is an answer and answer_seen is false; seen_at [retired] 2026-09-14
  brand        text,                                               -- the storefront the request came through: the team's digest goes to its support@<domain> (db/039, the owner's decision of 2026-09-22)
  CHECK (answer_seen = false OR answer IS NOT NULL)
);
CREATE INDEX support_by_identity ON support_requests (identity, created_at DESC) WHERE identity IS NOT NULL;  -- own list and the daily cap
CREATE INDEX support_by_created ON support_requests (created_at);  -- the sweep after a year and the daily digest
CREATE INDEX support_by_brand_created ON support_requests (brand, created_at);  -- the daily digest per storefront (db/039)
```

**Built 2026-09-22** (`relay/node/db/039_support_requests.sql`, `routes/support.ts`; closing an identity cuts its requests loose in the sweeper): the text is at most 2000 characters (`support.body.length`, the owner's decision of 2026-09-22), and the list returns the text itself (screen 14 A). The year's cleaning and the daily digest were built the same day (`sweep_support`, below). Not built: turning a request into an Article 16 notice.

**The request number is random, the answer goes only to its owner, the cap is three a day with an email line — decided 2026-09-14.** The number used to be a `bigserial` [retired]: it showed how many requests came in a day, and a neighbouring number could be guessed. Now `id` is an internal `uuid`, and the person sees `public_no` — ten Crockford base32 characters from the node's CSPRNG (50 bits); a collision on insert raises `23505` and the node retries with a new number (checked in `postgres:16`: a duplicate — `23505`, the letter `I` outside the alphabet — `23514`). **The number is not a key:** the list and the answer are returned only to a request signed by a session of the identity that `identity` matches; given a number without a signature the node answers nothing, and the screen says so. `seen_at` [retired] is replaced by `answer_seen`: nobody needs the moment of reading, and a flag is enough for the dot under "Me". Every new answer is written together with `answer_seen = false`, or a second answer would not light the dot. **The cap is three requests a day per identity** (`limits.tsv` `support.requests.day`) plus the general per-address rate limit (`protocol_EN.md` §3); a fourth is not accepted, and the refusal carries a line with the storefront's support address — the channel to a person is not cut off (DSA Art. 12(1)). A frozen session has its own cap — one a day (§8.2). Both caps are counted under the same `identity_stats` row lock as a send for checking: without it two parallel requests at two existing ones leave four (experiment in `postgres:16`, 2026-09-14). **The team gets not a letter per request but a daily digest** — the number of new ones, of those awaiting an answer and, separately, of those written from a frozen session (`from_frozen`, a possible takeover), with no request text: a letter per request would turn the mailbox into a copy of a table that lives a year. The sweep is built (2026-09-22, `lib/support_sweeper.ts`, job `sweep_support`); the digest is built in the same job (2026-09-22): the request's brand in `support_requests.brand` (db/039, the owner's decision), per storefront to its `support@<domain>`; a request without a brand (no storefront key) is in no one's digest. The price is named: the team sees an urgent request no earlier than the digest or opening the panel; a report of illegal content sent through the screen 5 form does not pay this price; one sent here does: it enters the notice register when support is read, up to a day later (clarified 2026-09-14 after the review panel: "does not pay" [retired] was said of both paths).

It is kept for a year from `created_at` (`sosed.place/docs/00-mechanics_EN.md` §7; the starting point named 2026-09-14 after the review panel), and **since 2026-09-22 it is
carried out** by the daily job `sweep_support` (`lib/support_sweeper.ts`; `support.retention` in the limits registry). [retired] It said "still has no one to carry that out".

**A report moved into the notice register is deleted from `support_requests` — decided 2026-09-14 after the review panel.** A request in which support recognised a report of illegal content (screen 14 of the storefronts) becomes a notice with no notifier identity (`docs/dsa/SPEC_EN.md`, "It goes by email only"), and the request row is deleted in the same transaction. Otherwise the link "who reported ↔ identity", which the DSA spec refused, would live for a year in the neighbouring table and be recoverable by simply matching the text. That the report was passed on, the person sees from the state of their own device, not from the list of requests. The price: the record of how such a report was handled lives in the notice register, not in support.

The price of the decision: the set that was deliberately narrowed to ten on
2026-09-11 is one table wider, and in return support works in `depth` already at
steps 1–4.

The price is named out loud: until step 5 two people who matched see that they
matched and walk into a wall — there are no conversations yet. That is the price
of the order itself rather than of this set, and it is accepted together with the
decision to put the terminal first.

## 14. Acceptance criteria

What "the chat is done" means, checkable rather than eyeballed. Broken down by flow
and turned into queries, these criteria live in [`test-map_EN.md`](test-map_EN.md);
here are the ones without which the chat is not done at all:

- Two clients hold a conversation and in at least one pair one of them is
  `depth`: that tests that the face does not affect the protocol.
- **On "different nodes" — the criterion is deferred until the pool exists, not
  quietly dropped (2026-08-21).** It stood here as the test of the bus, but there
  is nowhere to show it today: the deploy refuses a second box for an environment
  with a database (§8.1). Until the pool exists, what is testable is tested:
  whether a conversation survives a **node restart** — sockets break, clients
  reconnect, the chat continues with the same history. The neighbouring-node
  criterion returns the day a shared Postgres does.
- An identity transferred to a second device shows **the same chats and empty
  windows** there; the previous device freezes and, once the identity comes back,
  its old history opens by no means — the share was burned by the move (§8.2),
  and this is tested the same way as ten wrong PINs. `depth` has nothing to bring
  back anyway: it writes nothing to disk but keys, so its windows are as empty after a
  return as they are on a new device. An empty window is not a defect in either
  case (§8.13).
- Ten wrong PINs lock access until the paper code, and the local database **opens with
  nothing** until then; after recovery on the same device the old PIN opens it again
  — tested against a live node, not by reasoning (edited 2026-09-14: "burn the share"
  [retired]).
- A frozen session stops receiving messages **immediately**, including in the
  chat that was open on it, and receives no keys for new chats. Tested by
  transferring during a live conversation.
- The code transfer works across faces: a code shown in `depth` and typed in the
  web, and the other way round. An expired or already-applied code does
  nothing, a mistyped one gets "the code did not fit or has expired" and counts toward
  the claim miss limits, a second claim cancels the transfer on both sides, and
  without "that's me" on the old device no transfer happens at all.
- The paper code restores the identity on a clean device **including when a live
  session exists** — it is frozen (§8.2). The former wording demanded "when no
  live session is left" and contradicted itself: there is nothing to freeze if
  none is live. Tested twice — on an identity whose browser was wiped, and on one
  with a live device.
- A message longer than the limit is refused by the **node**, not merely by the
  counter in the client. Tested with a request that bypasses the client — but by
  **ciphertext bytes** (`max_ciphertext_bytes`), not by characters: the node sees
  ciphertext and cannot count 256 characters in it, exactly or approximately.
  `max_message_length` = 256 stays what §8.6 calls it — a counter in the client.
- A conversation disappears **for whoever's span ran out**, along with their local
  history, on the first `alive` sweep; for the other it remains until their own
  span, marked as ended, and sending into it is refused **by the node**. Checked
  with a pair on different spans: ten minutes for one, an hour for the other.
- **The game board and the key go out for both at the first death** (§8.13), while
  the other person's history keeps reading: it sits under the vault key, not under
  the conversation key. Checked on a live node, not by reasoning.
- Whoever had the conversation open on screen at that moment keeps a headstone
  reading "conversation ended" until they press "close", and it does not return to
  the list (§5).
- **A node with an unreachable database does not cause local history to be
  deleted.** `POST /chats/alive` answers with a list of the living only on a
  confirmed read of the database; on error it answers 503 and the client deletes
  nothing. Otherwise five minutes of unavailable Postgres wipe the conversations
  of everyone who came in during those minutes — irreversibly, because no copy
  exists either with us or with the other side.
- A message to an offline peer yields `accepted` and arrives when they come back
  to a living conversation; `error` is left for a refusal by the node.
- After all of the above the database holds **not one message in the clear**, and
  `pending_deliveries` is empty: everything was delivered, or the conversation ended,
  or the recipient was frozen. Verified by querying it, not by trusting the schema.

