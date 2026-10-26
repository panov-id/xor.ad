# Crowd: all interaction of the whole crowd (sosed)

Pair: `CROWD_INTERACTION_PLAN_RU.md`. A description written before any edit to `scripts/flow/crowd.mjs`.
Owner's goal, 2026-10-25: describe ALL interaction of the WHOLE crowd; errors must be reached too,
for example message limits; some people must be under 21.

## 1. What counts

A step counts only if the action happened and the other side shows it: the message reached
the peer and the peer replied to it; a move shows at the opponent; a complaint sits in the
panel; a limit answered with its refusal (code and text on screen). Today's defect: «talk ok»
with 0 chats for Anna and Elena (journal flow-1025-102702) must not happen again. Every step
logs: who, what, what the other side saw, a shot.

## 2. The crowd

sosed only. 10 people as now: 6 in Limassol, 2 in Nicosia, 2 in Tbilisi.

Ages follow `docs/chat_EN.md`: floor 13 (`CHECK (age >= 13)`), sandbox
`A ≤ 20 → [max(13, A−2), A+2]`, adult pool `A ≥ 21 → [min(21, A−2), ∞)`.

| # | Town | Age | Why |
|---|---|---|---|
| 1 | Limassol | 14 | sandbox; sees nobody 21+ |
| 2 | Limassol | 16 | sandbox; pairs with #1 (2 years apart) |
| 3 | Limassol | 19 | edge: reaches 21 |
| 4 | Limassol | 20 | edge: sees `[18, 22]` |
| 5 | Limassol | 21 | adult-pool edge: sees from 19 |
| 6 | Limassol | 34 | adult; sees nobody under 21 |
| 7 | Nicosia | 17 | sandbox in another town |
| 8 | Nicosia | 19 | a pair for #7 (was 45: in run flow-1025-182252 #7 and #8 could not meet) |
| 9 | Tbilisi | 22 | adult, sees from 20 |
| 10 | Tbilisi | 28 | adult |

Under 21: six people (#1, 2, 3, 4, 7, 8). The owner did not name 18, and the rules hold no 18 floor.

## 3. Interaction

### 3.1. Phrases and the feed
- Everyone publishes phrases; #1 and #6 push to the limits (§4).
- Band check: #1 does not see #6 and #5, #6 does not see #1–4; #3 and #5 see each other.
  Counted by a card being present or absent in that person's feed.
- Likes: each likes 2–3 visible phrases; a like across the band is an expected refusal.

### 3.2. Chats
- Each mutual pair opens a chat; everyone has at least one chat.
- At least 6 lines per chat, both ways; the reply is checked: B sees A's text and answers
  it, A sees the answer. A long message at the 256 edge and over it (§4).
- Change a chat's span (10/30/60/260 min); close one chat by hand.

### 3.3. Games: all 12 (`depth/core/new_table.ts:20`)
dots, checkers, chess, durak, hangman, backgammon, dominoes, chapayev, reversi, four,
battleship, poker. Each is played at least once: two-seat games in a chat, multi-seat
(durak, dominoes, chapayev, poker) at a table with 3+ players. Every game has moves from
both sides, counted when the move shows at the opponent; at least one game reaches an end
or a resignation, one gets a rematch.

### 3.4. Tables
- Tables in every town; two in Limassol with table talk (`line`), stickers, standing up, a pass.
- Seating across the band (#1 at #6's table) is an expected refusal.

### 3.5. Offers
Owner's decision of 2026-10-13 (`docs/GOALS_RU.md:38`): a private offer is a phrase with a
discount, no link and no code; a venue has a promo code with a «copy» button.

**3.5.1. Private offer.** #6 and #9 publish a discount phrase; neighbours within the band see
it, like it, open a chat. Counted by the offer card in another person's feed.

**3.5.2. Venue, the whole path.** Routes: `docs/protocol_RU.md:387–403`.
- a) the `adv.` cabinet: the venue signs up, adds a place, orders an envelope;
- b) the owner sees the order in the panel and sends the code — the `envelopes` page;
- c) the venue enters the code → `verified`;
- d) it publishes an offer with a link and a promo code (`POST /adv/offers`);
- e) a person sees the offer, copies the promo code, taps the link → the `/o/:code` screen →
  on to the venue's site; counted by `redirect_hits` growing in the venue's cabinet;
- f) a «no discount given» complaint (`POST /offers/:id/complaints`) → the venue's answer →
  the owner's decision in the panel (`POST /admin/offer-complaints/:id/decision`);
- g) two people's complaints on the link (`POST /o/:code/report`) extinguish it → a repeat tap gets 410.

### 3.6. Complaints and moderation
- Complaint on a phrase, a table, an offer link (`POST /o/:code/report`); three complaints
  from different people on one phrase — `report.threshold.floor` 3.
- A DSA art. 16 notice; the moderator decides in the panel; counted by the panel row and
  the author's statement (`GET /statements`).
- Model refusals: #6 writes forbidden text up to 5 refusals → 15-minute pause (§4).

### 3.7. Hide and block
- Hide a phrase and a message, bring it back (the «Hidden» screen).
- Block by phrase and by chat; after a chat block the chat is gone for both; unblock.

### 3.8. Panel
The 13-page walk after the crowd, but a page counts only if it holds rows the crowd made:
complaints, DSA notices, envelopes, the log — not merely «the page opened».

## 4. Limits to reach (`docs/facts/limits.tsv`)

| Limit | Value | How | Expect |
|---|---|---|---|
| feed.live.slots | 4 | fifth live phrase | refusal |
| feed.publications.hour | 4 | fifth publication in an hour (after a delete) | refusal |
| phrase.length | 128 | a 129-grapheme phrase | refusal / field stops it |
| chat.message.length | 256 | a 257-character message | refusal / field stops it |
| chat.messages.minute | 60 | 61 messages per minute | refusal |
| moderation.refusals.pause | 5 → 15 min | five model refusals in a row | pause |
| name.length | 24 | a 25-grapheme name | refusal |
| identities.create.hour | 10 | 11th signup from one address | refusal |
| tables.create.hour | 4 | fifth table in an hour | refusal |
| sticker.minute | 6 | seventh sticker in a minute | refusal |
| blocks.hour / hidden.hour | 20 / 60 | 21st block, 61st hide | refusal |
| age | 13; 21→20 | age 12; #5 edits 21→20 | refusal |

Counted by the refusal's code and text on the person's screen; a silent «nothing happened» is a failure.

## 5. What the run delivers

A journal per person and per step; «N of M» per section of §3 and §4; a shot of every step
(games included, to judge where it is ugly or unclear); a separate list «action did not happen».

## 6. Open questions for the owner (collected, no questionnaire)

- An 11th signup from one address breaks the crowd itself (it lives on one address), so this
  limit gets its own run.
