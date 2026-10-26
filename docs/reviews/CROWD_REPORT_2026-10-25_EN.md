# A crowd of 10 people on the local stand — full report, 2026-10-25

Owner, 24.10: a test where several users in different places — say 10 — like each other and make tables, right against the local stand; the experience and the screens recorded; each person on a different device resolution.

Scenario `scripts/flow/crowd.sh` and `scripts/flow/crowd.mjs`: 10 Chromium browsers at once open the sosed app (`app/`) on the `xor-local-app` stand, with the real node `xor-local-sosed-node-1` behind it. After the crowd a moderator walks 13 panel pages. Every step has a shot, a journal line (screen, time, node and console errors, animations) and a video per browser. Finding details: `docs/reviews/CROWD_2026-10-24_EN.md`.

## 1. Result

- Working run 16 (flow-1024-235329): **94 of 94 app steps**, for all 10 people on all 10 devices.
- Run 8 (24.10, before the fixes): 72 of 90. The way from 72 to 94 is three app fixes and one in the chat keys.
- The run with the keys broken on purpose (flow-1024-235930): 88 of 94 — the crowd catches the break.
- Panel: 11 of 13 in run 16; after the finding 4 fix — **13 of 13** (flow-1025-015132).
- Not fixed: finding 3 (client errors do not reach the panel) and finding 5 (registration limit per address).

## 2. Who

| Person | Town | Device | Screen |
|---|---|---|---|
| Anna | Limassol | iPhone 14 | 390×844 |
| Boris | Limassol | iPhone SE | 375×667 |
| Chloe | Limassol | Pixel 7 | 412×915 |
| Dmitri | Limassol | Galaxy S8 | 360×740 |
| Elena | Limassol | small phone | 320×568 |
| Fotis | Limassol | iPad mini | 768×1024 |
| Giorgos | Nicosia | iPad Pro 11 | 834×1194 |
| Hana | Nicosia | laptop | 1280×800 |
| Irakli | Tbilisi | monitor | 1440×900 |
| Nino | Tbilisi | Full HD | 1920×1080 |

Everyone's path: registration → place on the map → phrase → feed → likes → chat → chat again → table (Anna, Boris, Giorgos and Irakli make one, the rest sit) → second table (four try to sit while already seated) → "Me" and place.

## 3. One person's path

Fig. 1 — Anna (iPhone 14), working run: 9 steps left to right.

Fig. 2 — Anna, the run with the keys broken: on "chat again" the line shows "did not open" and a request for new keys; the other 8 steps passed.

## 4. Steps: run 16 against the break

| Step | Run 16 | Median | Worst | With the break | Run 8 |
|---|---|---|---|---|---|
| registration | 10 of 10 | 6.8 s | 8.8 s | 10 of 10 | 10 of 10 |
| place | 10 of 10 | 20.3 s | 21.7 s | 10 of 10 | 10 of 10 |
| phrase | 10 of 10 | 13.1 s | 16.1 s | 10 of 10 | 10 of 10 |
| feed | 10 of 10 | 4.7 s | 5.4 s | 10 of 10 | 10 of 10 |
| likes | 10 of 10 | 10.1 s | 11.3 s | 10 of 10 | 10 of 10 |
| chat | 10 of 10 | 20.4 s | 28.8 s | 7 of 10 | 4 of 10 |
| chat again | 10 of 10 | 5.3 s | 24.5 s | 7 of 10 | 5 of 10 |
| make a table | 4 of 4 | 6.6 s | 6.7 s | 4 of 4 | 3 of 3 |
| sit at a table | 6 of 6 | 35.7 s | 37.7 s | 6 of 6 | 0 of 7 |
| second table | 4 of 4 | 47.1 s | 47.2 s | 4 of 4 | — |
| "Me" and place | 10 of 10 | 8.8 s | 15.8 s | 10 of 10 | 10 of 10 |

Run 8 had no "second table" step and three people made tables; hence 90 steps against 94.

Fig. 3 — median and worst step time in run 16, seconds.

The time includes the scenario's waits (it waits for the other side up to 60 s) and 10 browsers on one machine. It cannot be read as app speed; but "place" at 20 s and "sit at a table" at 36 s for all ten are worth a separate look.

## 5. What else run 16's journal recorded

- **Reloads on the way:** 22 steps, for 7 of 10 people. The app was opened again; 10 chat records had a reload right before the chat — and all 10 chats opened (finding 2 fixed).
- **Node errors:** 4, all `POST /tables/<id>/seat` 409 on "second table". An expected refusal: the person already sits at a table, the app says so in words and offers "To my table".
- **Console errors:** 4, the same 409s.
- **Steps with no animation:** 0.
- **Who saw whom:** each town saw only its own phrases. Limassol (6 people): 6 phrases, liked 3 each; Nicosia and Tbilisi (2 each): 2 phrases, liked 1 each.

## 6. Findings and what became of them

| # | Finding | Done | Proved by |
|---|---|---|---|
| 1 | Cannot sit at someone's table: the node answers 404 until the person sits | the app sits first, then reads the table | table 7 of 7; break 0 of 7 |
| 2 | A chat does not open after a reload: the key pair lived in the tab's memory | reason and "New keys" button on screen; the pair kept sealed in IndexedDB up to 14 days | chat 10 of 10; break 7 of 10; e2e 31 of 31 |
| 3 | Client errors do not reach the panel | not done | — |
| 4 | The panel calls `/admin/brands` for a moderator and gets 403 | brand switcher only with the `brands.read` right | panel 13 of 13; the test goes red without the right check |
| 5 | 10 registrations per hour from one address | not done; the scenario passes the limit as the prod edge does | — |

Also along the way: "second table" (the node's refusal shown in words, 4 of 4, break 0 of 4) and the rail tab (pressing the current tab leads to its list).

## 7. Panel

Platform moderator, 1440 screen. 13 pages: waitlist, reports, DSA recipients, envelopes, support, panel users, client errors, audit, server logs, page views, API keys, secret keys, brands. On server logs, API keys, secret keys and brands the moderator has no rights, and the panel says so — not a defect.

Fig. 4 — the 13 panel pages after the finding 4 fix (flow-1025-015132).

## 8. What the crowd does not check

- The second brand (neighbro) — the crowd walks sosed only.
- A real network and prod: everything is on one machine, the node is local.
- Speed on a real device: 10 browsers share one CPU.
- Table games beyond sitting down.
- Findings 3 and 5 are open; nothing is committed.

## 9. Runs of 2026-10-26: games, the phrase screen, the tables list

Three new runs (6th to 8th) and the 5th to compare, one crowd on the local sosed stand (`scripts/flow/crowd.sh`, `PANEL=0`). Counted: games where every player moved.

| Run | What the code had | Games of 12 | Not moving |
|---|---|---|---|
| flow-1026-081126 (5th) | before the fixes | 9 | battleship, poker, durak |
| flow-1026-094507 (6th) | the word only by word-go, the fleet from the placeholder, another try after a refusal | 9 | poker, durak, reversi (the guest did not see the table in 25 s) |
| flow-1026-102624 (7th) | node with the solo limit, the list looks every 60 s, Back on the phrase screen | 9 | poker, durak, chapayev |
| flow-1026-110213 (8th) | the crowd also presses the buttons under the board (poker's bets, durak's take and done) | 11 | chapayev (Chloe 0 moves) |
| flow-1026-123508 (9th) | chapayev as three taps: the piece, the aim, the aim again | 12 | — |
| flow-1026-125809 (10th) | the phrase menu by `more-menu`, the guest waits 70 s for the list | 12 | — |

- On a phone the phrase screen covers the tab bar by the w1_card sheet's design; the crowd now leaves it by Back. Presses on a tab taken by the like button: 5 in the 5th run, 0 in the 7th and 8th.
- The tables list (`app/src/screens/tables/Tables.tsx`) looks at its first page every 60 s while open. «Table not in the list»: 3 in the 6th run, 0 in the 7th and 8th. Not more often: /tables, /feed and /likes share one bucket of 300 reads an hour on the node.
- Durak refusals are now written with the reason: every 409 in the 8th run is `illegal_move` (a random card does not beat); a repeat finds a move.
- In the 8th run 14 of 437 steps failed: 7 times «no chat» for Chloe, 3 «report», one each of «hide», «block», «edit me», «solo seen». Analysis: §10.
- Chapayev: a move is a drag on the board and works every other time (2 and 1 moves in the 6th, 0 and 0 in the 7th, 1 and 0 in the 8th). Cause not found.

Findings panel of 2026-10-26: `PANEL_2026-10-26_solo-crowd_EN.md`.

## 10. The 14 failed steps of the 8th run

| Steps | Who, width | Step | Cause | Whose | Done |
|---|---|---|---|---|---|
| 5 | Chloe 412, Elena 320, Nino 1920, Anna 390, Boris 375 | report ×3, hide, block | the crowd looked for the phrase menu by `card-more`/`more`; the «…» button is `more-menu` (`app/src/screens/feed-card.tsx:109`) | crowd | selector fixed, a test in `crowd-plan.test.mjs` goes red under a break |
| 1 | Nino 1920 | solo seen | the guest already stood on the list; the tab sends no GET and the list's own look comes every 60 s; the step waited 15 s | crowd (after the list fix) | waits 70 s, the test is red at 15 s |
| 7 | Chloe 412 | chats 1–6 and reading | the journal says «said yes to 1 offer, chats 0»; the shot shows Elena and Dmitri circles at the top of «Chats» and no chat rows | NOT VERIFIED: the app, the node or the crowd's step order | not fixed; the path «yes» → chat needs analysis; in the 7th run it was Fotis, in the 9th Dmitri — a different person each time |
| 1 | Elena 320 | edit me | the name form did not open in 10 s; the shot shows «Edit» cut to «Измени» at 320 | NOT VERIFIED: the cut is an app defect at 320, its link to the form not opening is not proved | not fixed |

The live check of the crowd fixes is the 10th run; the 9th started before them.

### The 10th run (flow-1026-125809): 11 of 437 steps failed

- «Hide», «block», «solo seen» passed. «Report» passed for two of three.
- Nino 1920 «report»: on a desktop the phrase has no «…» — `app/tokens/wide.css:220` hides `more-menu` (`display: none`). On a wide screen the phrase has no way to «report», «hide», «block the author». A defect of the app or the sheet; not fixed, the owner's decision.
- Chloe 412 and Elena 320 «me tour»: after a report the «Report accepted» sheet stayed open and the phrase's Back was under it. The crowd now closes the sheet by a tap on the dim (`app/src/shell/layers.tsx:61`); a test in `crowd-plan.test.mjs` goes red under a break. Live: in the next run.
- «No chat»: 7 steps for Fotis. By run: Fotis, Chloe, Dmitri, Fotis — cause not found.
- Elena 320 «edit me»: as in the 8th.

## 11. «No chat»: the cause

In the 8th to 11th runs, in each one person's «chat 1–6» steps fail with «no chat»: Chloe, Dmitri, Fotis, Dmitri.
For all four the screen before the first chat step is «Chats» (the «chats again» step, journal field `screen`), and
their «yes» was the first of two: the other side said «yes» later, while they stood on the list. The chat exists on the
node, but the list `app/src/screens/talks/Inbox.tsx:43-57` reads again only on opening the screen, window focus and
return to the browser tab; a person standing on «Chats» does not see the new chat. Tables were the same before 2026-10-26.

Whose: the app (the list does not look by itself). The crowd only shows it. Not fixed: the owner's decision — the chats
list looks once a minute, as tables do (`GET /inbox` has no limit, `relay/node/src/routes/inbox.ts`: a look spends no read bucket), or the node sends an event.

«Edit» at 320: the button is as wide as its label, the sheet's width a floor (`app/src/screens/me/me.css`); a test in
`me.test.ts` goes red under a break. The overlap measure does not see text cut inside a button.

## 12. Runs of 2026-10-26 evening: the chats list channel and «your turn»

| Run | Steps ok | Games with every move | «No chat» | «Your turn» heard | Nino «me» at 1920 |
|---|---|---|---|---|---|
| flow-1026-172028 (a poll a minute) | 429 of 437 | 12 of 12 | 7 | — | failed |
| flow-1026-190348 (node channel) | 436 of 437 | 12 of 12 | 0 | — | failed |
| flow-1026-193139 (channel + «your turn») | 448 of 449 | 12 of 12 | 0 | 11 of 12 | failed |
| flow-1026-202151 (+ themes, `tab()` presses the phrase's rail) | 449 of 449 | 12 of 12 | 0 | 12 of 12 | passed |

Counted by a script from each run's `summary.txt` and `journal.jsonl`.

«No chat» went away when the node channel replaced the poll (owner's decision 26.10.2026 «a node channel at once»): the
chats list room, an `inbox` frame from database triggers (`relay/node/db/087_inbox_room.sql`, protocol §4.4, chat spec
§8.12).

«Your turn»: in 11 games of 12 the waiting player nudged and the one to move heard it. In poker there was no button: the
round had ended by that step — the step says so, it is not a failure.

Elena «edit» at 320 (run flow-1026-163934): the crowd pressed the `h1`, not the button. Fixed in the crowd; ok since 172028.

Nino «me» at 1920, two causes in a row:
1. 190348: `<html data-vt="close">` held the clicks — a sheet's transition did not end within 10 s. Why the browser did
   not end it is not found. `app/src/shell/layers.tsx` now cuts a transition after 2 s; 193139 shows no such hold.
2. 193139: from 1440 an open phrase has its own tab rail over the feed's, and the crowd pressed the first, covered one.
   Whose: the crowd. `tab()` in `scripts/flow/crowd.mjs` now presses the open phrase's rail; a test in
   `crowd-plan.test.mjs` goes red when it is broken. Run flow-1026-202151: the step passed; the first run with no failed step.
