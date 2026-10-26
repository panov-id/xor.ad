# Map: sosed designer states vs the app shell app/

Cross-check of the sosed designer sheets (packs `docs/newsdesign/all/sosed-1..5-*.zip`, motion rules `sosed-motion-svg.zip` -> `MOTION.md`) against the shell `app/src/`. Paths in the table are relative to `app/src/` unless stated. Status was set from the code; the look of the sheets was not compared to the pictures (text in the sheets is converted to curves).

## Summary

- States (390 px mobile sheets, SCREENS.md): **79**. Packs 1 and 2 (animated) hold the same 79 screens plus 4 transitions; packs 3 and 4 (static) hold 79 files; pack 5 has tablet 834 (7), desktop 1440 (7) and 1920 (2) for seven screens.
- Status: **yes 71**, **partial 3**, **no 5** (total 79).
- MOTION.md rules: 8. Fully implemented **1 of 8**, partial 4, none 3; implemented at least in part 5 of 8.
- `useLayers` is called only in `screens/feed-card.tsx:81` (open) and `:142` (close) and in `screens/tables/Table.tsx:41` - checked by grep over `app/src`, there are no other calls (definition: `shell/layers.tsx:10`).
- Status no (no screen at all, or a stub): wizard-1, wizard-2, wizard-3, wizard-4, wizard-5.
- Partial: feed, card-matched, me.

## Motion rules

| Code | MOTION.md rule | Implemented | Where in code |
|---|---|---|---|
| S | Sheet layer (base shrinks to .93 and dims) | partial | shell/layers.tsx:25-43, shell.css:18-49 (View Transitions + CSS fallback); useLayers call sites: feed-card.tsx:81,142 and tables/Table.tsx:41 (checked by grep, no others); chat, write, chat sheet - none or own sheet (chat.css:76-81) |
| K | Skeleton shimmer (1.3 s) and the 300/600 ms rule | partial | shell.css:86-95, shell/Skeleton.tsx:4, shell/loading.ts:5-39; used in Feed.tsx:214, Tables.tsx:107; absent in Chats, Where I am in, cabinet offers, hidden, blocked |
| R | Ring indicator (28% arc, 0.9 s turn) | partial | Loading.tsx:16 + screens.css:55; on a button screens.css:186-191; move wait move.css:77 (border arc); the waiting-for-reply ring MatchWaiting.tsx:65 does not turn |
| T | Tap ripple (0.3 -> 1.2 in 0.45 s) | partial | screens.css:183-185,192 only on a button with aria-busy (16 files); no ripple on list rows (transition 02) |
| D | Typing dots (5 px hop, 0.9 s, 0.15 s offset) | no | no: tokens motion.css:42-44 are defined, var(--d-typing/--o-typing/--stagger-typing) are read nowhere (grep: 0) |
| E | Staggered entrance (header, sheet, items 0.08 s apart, button, tab bar) | yes | shell.css:52-79 (rise, sheet-up, bar-up), screens.css:85,145,165,175 (--stagger-item step), feed.css:4,18, me.css:11-24, tables.css:8-52, cabinet.css:9-28, move.css:6-20 |
| M | Message pop (0.85 -> 1, 0.35 s, 0.38 s step) | no | no: tokens motion.css:45-47 are defined, var(--d-bubble/--scale-bubble-from/--stagger-bubble) are not read (grep: 0); chat.css has no keyframes |
| P | Both-in window pops (0.85 -> 1.03 -> 1) | no | no: tokens motion.css:56-57 are defined, var(--d-popup/--scale-popup-peak) are not read (grep: 0); Match.tsx:51 is a full screen with no window animation |

Extra (not counted): the pulse 1 -> 1.07 -> 1 in 1.6 s exists on `.lock-circle` and the tile (`screens.css:15,158`); empty states, away and email-sent do not have it (NOT VERIFIED for each: only css was read).

## State table

Motion: codes from the table above, each with yes / partial / no and the place in code. E (entrance) is counted by the screen's common rule. Widths: 390 is the mobile sheet; 834, 1440, 1920 are the pack 5 sheets for this screen.

| No | Wave | State | Widths | Component (file:line) | How it is reached | Status | What is missing | Motion |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `feed` Feed | 390/834/1440/1920 | screens/Feed.tsx:44 | after sign-in, /feed; the Feed tab | partial | no place picker, header search/menu, density line, tables between phrases, own sent phrase above the list (Feed.tsx:8-9) | E yes (shell.css:52-62); K yes (Feed.tsx:214; shell/loading.ts:5-39) |
| 2 | 1 | `feed-error` Feed · error | 390 | screens/Feed.tsx:180 | feed, node did not answer; retry button | yes | - | E yes (shell.css:52-62) |
| 3 | 1 | `feed-hidden-return` Feed · hidden, return (5 s) | 390 | screens/Feed.tsx:170 | card -> ... -> Hide -> back to the feed | yes | - | E yes (shell.css:52-62) |
| 4 | 1 | `feed-blocked` Feed · author blocked | 390 | screens/Feed.tsx:177 | card -> ... -> Block author (asked twice) | yes | - | E yes (shell.css:52-62) |
| 5 | 2 | `feed-empty` Feed empty | 390 | screens/Feed.tsx:190 | feed with no cards; the wider button | yes | - | E yes (shell.css:52-62) |
| 6 | 1 | `card` Card | 390/834/1440 | screens/feed-card.tsx:69 | tap a tile in the feed; Feed.tsx:228 | yes | - | E yes (shell.css:52-62) |
| 7 | 1 | `card-liked` Card · you are in | 390 | screens/feed-card.tsx:73-75 | the I'm-in button on the card | yes | - | E yes (shell.css:52-62) |
| 8 | 1 | `card-matched` Card · both in | 390 | screens/feed-card.tsx:33,121 | node answer state=matched after I'm in | partial | only the web.card.matched note line under the rows, no separate sheet look (look not compared to the picture) | E yes (shell.css:52-62) |
| 9 | 1 | `card-details` Card · details | 390 | screens/feed-card.tsx:116 | dl rows on the card (going, language, count in) | yes | - | E yes (shell.css:52-62) |
| 10 | 1 | `card-more` Card · ... menu | 390 | screens/feed-card.tsx:141 (MoreSheet), открытие :81 | the ... button in the card header | yes | - | E yes (shell.css:52-62); S yes (feed-card.tsx:81,142 useLayers) |
| 11 | 1 | `register-1` Register · step 1 | 390 | screens/Register.tsx:143 | splash -> Start, /register | yes | - | E yes (shell.css:52-62) |
| 12 | 1 | `register-2` Register · step 2 | 390 | screens/Register.tsx:171 | step 1 -> Next | yes | - | E yes (shell.css:52-62); T yes (screens.css:182-191) |
| 13 | 1 | `register-3` Register · step 3 | 390 | screens/Register.tsx:178 | step 2 -> Create | yes | - | E yes (shell.css:52-62); T yes (screens.css:182-191) |
| 14 | 2 | `splash` Splash | 390 | screens/Splash.tsx:42 | / with no saved identity | yes | - | E yes (shell.css:52-62) |
| 15 | 2 | `splash-lang` Splash · language | 390 | screens/Splash.tsx:16 | first launch on a device, before the splash | yes | - | E yes (shell.css:52-62) |
| 16 | 2 | `lang` Language (from Me) | 390 | screens/me/LangPicker.tsx:6 | Me -> Language row (sub=lang, Me.tsx:44) | yes | - | E yes (shell.css:52-62) |
| 17 | 2 | `loading` App loading | 390 | screens/Loading.tsx:10 | startup when the wait exceeds 300 ms (shell/App.tsx:83,282) | yes | - | E yes (shell.css:52-62); R yes (Loading.tsx:16; screens.css:55) |
| 18 | 2 | `unlock` PIN sign-in | 390 | screens/Unlock.tsx:21 | /unlock, or any path when an identity is kept | yes | - | E yes (shell.css:52-62); T yes (screens.css:182-191) |
| 19 | 2 | `locked` Idle lock | 390 | screens/Locked.tsx:18 | 5 minutes without input, App.tsx:155 | yes | - | E yes (shell.css:52-62); T yes (screens.css:182-191) |
| 20 | 2 | `away` You are away | 390 | screens/Away.tsx:14 | /away; sign-in while step-away is active (App.tsx awayCheck) | yes | - | E yes (shell.css:52-62); T yes (screens.css:182-191) |
| 21 | 2 | `departure-start` Move · departure: start | 390 | screens/Departure.tsx:113 | Me -> Move, /move | yes | - | E yes (shell.css:52-62); T yes (screens.css:182-191) |
| 22 | 2 | `departure-code` Move · one-time code | 390 | screens/Departure.tsx:156 | after the PIN on /move | yes | - | E yes (shell.css:52-62) |
| 23 | 2 | `departure-claimed` Move · symbol check | 390 | screens/Departure.tsx:136 | the new device typed the code; polled every 2 s | yes | - | E yes (shell.css:52-62) |
| 24 | 2 | `departure-done` Move · done | 390 | screens/Departure.tsx:96 | after Yes on the check | yes | - | E yes (shell.css:52-62) |
| 25 | 2 | `arrival-code` Move · arrival: code | 390 | screens/Arrival.tsx:73 | splash -> bring it here, /arrival | yes | - | E yes (shell.css:52-62); T yes (screens.css:182-191) |
| 26 | 2 | `arrival-check` Move · arrival: waiting for approval | 390 | screens/Arrival.tsx:124 | after the code | yes | - | E yes (shell.css:52-62); R partial (Arrival.tsx:129 .mv-wait, move.css:77: border arc, not a 28% arc) |
| 27 | 2 | `arrival-pin` Move · arrival: new PIN | 390 | screens/Arrival.tsx:100 | after the old device approves | yes | - | E yes (shell.css:52-62); T yes (screens.css:182-191) |
| 28 | 3 | `chat` Chat | 390/834/1440/1920 (Talks) | screens/Chat.tsx:128 (ChatPane :37) | Chats -> a row, /chat (history entry); beside the list on tablet and up, Chat.tsx frame=pane | yes | - | E yes (shell.css:52-62); S no (App.tsx:217 openChat: setScreen, not useLayers; own slide-up chat.css:81, layer under not scaled); D no (tokens motion.css:42-44, 0 uses); M no (tokens motion.css:45-47, 0 uses) |
| 29 | 3 | `chat-game` Chat · game | 390 | screens/chat-game.tsx:87 (панель :41), вставка Chat.tsx:152 | the game button in the chat (quick-game) | yes | - | E yes (shell.css:52-62) |
| 30 | 3 | `chat-more` Chat · ... menu | 390 | screens/chat-menu.tsx:37, открытие Chat.tsx:147,160 | the ... button in the chat; history entry sheet=menu | yes | - | E yes (shell.css:52-62); S partial (own sheet-up and shade, base layer not scaled) |
| 31 | 3 | `chat-over` Chat · over | 390 | screens/Chat.tsx:87-91 | chat ended or closed by a block (view.over / view.blocked) | yes | - | E yes (shell.css:52-62) |
| 32 | 3 | `inbox` Chats | 390/834/1440/1920 (Talks) | screens/talks/Inbox.tsx:109 (TalksList :63) | Chats tab, /inbox; on 1440+ the pane TalksPane.tsx:8 | yes | - | E yes (shell.css:52-62); K no (no list skeleton) |
| 33 | 3 | `tables` Tables | 390/834/1440 | screens/tables/Tables.tsx:24 | Tables tab, /tables | yes | - | E yes (shell.css:52-62); K yes (Tables.tsx:107) |
| 34 | 3 | `new-table-1` New table · step 1: game | 390 | screens/tables/NewTable.tsx:76 | Tables -> New table, /tables/new | yes | - | E yes (shell.css:52-62) |
| 35 | 3 | `new-table-2` New table · step 2: variant | 390 | screens/tables/NewTable.tsx:93 | step 1 -> Next | yes | - | E yes (shell.css:52-62) |
| 36 | 3 | `new-table-3` New table · step 3: preview | 390 | screens/tables/NewTable.tsx:126 | step 2 -> Preview | yes | - | E yes (shell.css:52-62); T yes (screens.css:182-191) |
| 37 | 3 | `table-dots` Table · Dots | 390 | screens/tables/Table.tsx:35 + screens/tables/boards.tsx:57 DotsBoard | Tables -> Watch, /table (id in the history entry); board picked by Board, boards.tsx:18 | yes | - | E yes (shell.css:52-62); S yes (Table.tsx:41,103 useLayers (table menu)) |
| 38 | 3 | `table-checkers` Table · Checkers | 390 | screens/tables/Table.tsx:35 + screens/tables/boards.tsx:141 SquaresBoard (chess=false) | Tables -> Watch, /table (id in the history entry); board picked by Board, boards.tsx:18 | yes | - | E yes (shell.css:52-62); S yes (Table.tsx:41,103 useLayers (table menu)) |
| 39 | 3 | `table-chess` Table · Chess | 390 | screens/tables/Table.tsx:35 + screens/tables/boards.tsx:141 SquaresBoard (chess=true) | Tables -> Watch, /table (id in the history entry); board picked by Board, boards.tsx:18 | yes | - | E yes (shell.css:52-62); S yes (Table.tsx:41,103 useLayers (table menu)) |
| 40 | 3 | `table-durak` Table · Durak | 390 | screens/tables/Table.tsx:35 + screens/tables/boards-deck.tsx:13 DurakBoard | Tables -> Watch, /table (id in the history entry); board picked by Board, boards.tsx:18 | yes | - | E yes (shell.css:52-62); S yes (Table.tsx:41,103 useLayers (table menu)) |
| 41 | 3 | `table-hangman` Table · Hangman | 390 | screens/tables/Table.tsx:35 + screens/tables/boards.tsx:83 HangmanBoard | Tables -> Watch, /table (id in the history entry); board picked by Board, boards.tsx:18 | yes | - | E yes (shell.css:52-62); S yes (Table.tsx:41,103 useLayers (table menu)) |
| 42 | 3 | `table-backgammon` Table · Backgammon | 390 | screens/tables/Table.tsx:35 + screens/tables/boards.tsx:167 BackgammonBoard | Tables -> Watch, /table (id in the history entry); board picked by Board, boards.tsx:18 | yes | - | E yes (shell.css:52-62); S yes (Table.tsx:41,103 useLayers (table menu)) |
| 43 | 3 | `table-dominoes` Table · Dominoes | 390 | screens/tables/Table.tsx:35 + screens/tables/boards.tsx:207 DominoesBoard | Tables -> Watch, /table (id in the history entry); board picked by Board, boards.tsx:18 | yes | - | E yes (shell.css:52-62); S yes (Table.tsx:41,103 useLayers (table menu)) |
| 44 | 3 | `table-chapayev` Table · Chapayev | 390 | screens/tables/Table.tsx:35 + screens/tables/boards-physics.tsx:10 ChapayevBoard | Tables -> Watch, /table (id in the history entry); board picked by Board, boards.tsx:18 | yes | - | E yes (shell.css:52-62); S yes (Table.tsx:41,103 useLayers (table menu)) |
| 45 | 3 | `table-reversi` Table · Reversi | 390 | screens/tables/Table.tsx:35 + screens/tables/boards.tsx:122 ReversiBoard | Tables -> Watch, /table (id in the history entry); board picked by Board, boards.tsx:18 | yes | - | E yes (shell.css:52-62); S yes (Table.tsx:41,103 useLayers (table menu)) |
| 46 | 3 | `table-four` Table · Four in a row | 390 | screens/tables/Table.tsx:35 + screens/tables/boards.tsx:40 FourBoard | Tables -> Watch, /table (id in the history entry); board picked by Board, boards.tsx:18 | yes | - | E yes (shell.css:52-62); S yes (Table.tsx:41,103 useLayers (table menu)) |
| 47 | 3 | `table-battleship` Table · Battleship | 390 | screens/tables/Table.tsx:35 + screens/tables/boards-sea.tsx:11 SeaBoard | Tables -> Watch, /table (id in the history entry); board picked by Board, boards.tsx:18 | yes | - | E yes (shell.css:52-62); S yes (Table.tsx:41,103 useLayers (table menu)) |
| 48 | 3 | `table-poker` Table · Poker | 390 | screens/tables/Table.tsx:35 + screens/tables/boards-poker.tsx:15 PokerBoard | Tables -> Watch, /table (id in the history entry); board picked by Board, boards.tsx:18 | yes | - | E yes (shell.css:52-62); S yes (Table.tsx:41,103 useLayers (table menu)) |
| 49 | 3 | `composer` Write | 390/1440 | screens/Composer.tsx:104 (ComposerPane :38) | feed -> the say button, /write; the rail button on 1440 | yes | - | E yes (shell.css:52-62); T yes (screens.css:182-191); S no (not a layer, feed not scaled) |
| 50 | 3 | `likes` Where I am in | 390 | screens/talks/Likes.tsx:25 | Chats -> the Offers circle, /likes | yes | - | E yes (shell.css:52-62); K no (no list skeleton) |
| 51 | 3 | `match` Both in · offer to talk | 390/834 | screens/talks/Match.tsx:19 | Chats -> a match row, /match (row in the history entry) | yes | - | E yes (shell.css:52-62); P no (a full screen, not a window; tokens unused) |
| 52 | 3 | `match-waiting` Both in · waiting for reply | 390 | screens/talks/MatchWaiting.tsx:21 | Match -> Let's talk when the other has not yet agreed | yes | - | E yes (shell.css:52-62); R partial (ring exists, does not turn (no animation in talks.css)) |
| 53 | 4 | `me` Me | 390/834/1440 | screens/me/Me.tsx:34 | Me tab, /me | partial | the new-paper-code row now opens Reissue (Me.tsx:67); status not re-judged here | E yes (shell.css:52-62) |
| 54 | 4 | `me-edit-name` Me · name and age | 390 | screens/me/EditName.tsx:24 | Me -> Edit (Me.tsx:46) | yes | - | E yes (shell.css:52-62); T yes (screens.css:182-191) |
| 55 | 4 | `me-pin` Me · change PIN | 390 | screens/me/ChangePin.tsx:20 | Me -> PIN (sub=pin) | yes | - | E yes (shell.css:52-62); T yes (screens.css:182-191) |
| 56 | 4 | `me-reset` Me · start again | 390 | screens/me/Reset.tsx:19 | Me -> Start again (sub=reset) | yes | - | E yes (shell.css:52-62); T yes (screens.css:182-191) |
| 57 | 4 | `step-away` Me · step away | 390 | screens/me/StepAway.tsx:15 | Me -> Step away (sub=away) | yes | - | E yes (shell.css:52-62); T yes (screens.css:182-191) |
| 58 | 4 | `statements` Restrictions | 390 | screens/me/Statements.tsx:14 | Me -> the restrictions row, shown when n>0 (Me.tsx:85) | yes | - | E yes (shell.css:52-62) |
| 59 | 4 | `reissue-1` New paper code · step 1 | 390 | screens/me/Reissue.tsx:26 (Me.tsx:67) | Me -> New paper code (sub=reissue) | yes | the current code is asked and checked on the device (recovery.ts isCurrentCode) before the new one is shown, as the web does; the sheet has no PIN and the web asks none; run live against the stand's node 23.10 (see reissue-2) | E yes (me.css:19); T yes (screens.css:182-191)
| 60 | 4 | `reissue-2` New paper code · step 2 | 390 | screens/me/Reissue.tsx:26 | reissue-1 -> Next, after the current code is right | yes | the new code is shown once, the second and the fourth group are typed back (web.reissue.mismatch otherwise), Done = recovery.ts reissue then vault.ts rememberWrappedLongKey; live on the stand's node 23.10: register, reissue, clear the device, /restore with the OLD code -> refused (404), with the NEW code -> feed; the sheet's back on step 2 goes to step 1 (the web has none there) | E yes (me.css:19); T yes (screens.css:182-191)
| 61 | 4 | `restore` Restore from paper code | 390 | screens/Gate.tsx:95 | splash/PIN -> Have a code, /restore | yes | the reload grace is armed after the raise, as on the web (app/src/vault.ts hands out armGrace); run live against the stand's node 23.10: right code + new PIN -> feed; reload at once -> feed, no PIN; reload after 35 s -> PIN, the new PIN -> feed; with armGrace commented out the reload at once asks the PIN (Gate.tsx:1-8) | E yes (me.css:19); T yes (screens.css:182-191) |
| 62 | 4 | `hidden` Hidden | 390 | screens/me/Hidden.tsx:11 | Me -> Hidden (sub=hidden, row me-hidden; no route of its own); Return = client.unhide | yes | the Me sheet (w4_me) draws no such row: it is added as the web has it, without the count | E yes (me.css:19); K no (no list skeleton) |
| 63 | 4 | `blocked` Blocked | 390 | screens/me/Blocked.tsx:13 | Me -> Blocked (sub=blocked, row me-blocked; no route of its own); Lift = client.unblock | yes | the Me sheet (w4_me) draws no such row: it is added as the web has it, without the count | E yes (me.css:19); K no (no list skeleton) |
| 64 | 4 | `theme` Theme | 390 | screens/me/Theme.tsx:14 | Me -> Theme (sub=theme) | yes | - | E yes (shell.css:52-62) |
| 65 | 4 | `age-filter` Age filter | 390 | screens/me/AgeFilter.tsx:15 | Me -> Filter (sub=filter) | yes | - | E yes (shell.css:52-62) |
| 66 | 4 | `legal` Documents | 390 | screens/me/Legal.tsx:19 | Me -> Documents (sub=legal) | yes | - | E yes (shell.css:52-62); T yes (screens.css:182-191) |
| 67 | 4 | `cabinet-sign-in` Cabinet · sign in | 390 | screens/cabinet/SignIn.tsx:16 | separate page adv.<storefront> or /adv (main.tsx:30, Cabinet.tsx:15) | yes | - | E yes (shell.css:52-62); T yes (screens.css:182-191) |
| 68 | 4 | `cabinet-sent` Cabinet · email sent | 390 | screens/cabinet/SignIn.tsx:52 | after the address is sent on sign-in | yes | - | E yes (shell.css:52-62) |
| 69 | 4 | `cabinet-venues` Cabinet · venues | 390 | screens/cabinet/Venues.tsx:91 | the cabinet after sign-in | yes | - | E yes (shell.css:52-62); T yes (screens.css:182-191) |
| 70 | 4 | `cabinet-new-offer` Cabinet · new offer | 390 | screens/cabinet/Offers.tsx:75 | cabinet -> New offer | yes | - | E yes (shell.css:52-62); T yes (screens.css:182-191) |
| 71 | 4 | `cabinet-offers` Cabinet · offers | 390 | screens/cabinet/Offers.tsx:52 | cabinet -> Offers | yes | - | E yes (shell.css:52-62); K no (no list skeleton) |
| 72 | 4 | `offer` Offer link landing | 390 | screens/Offer.tsx:17 | /o/<code>, router.ts:68; App.tsx:107-109 | yes | - | E yes (shell.css:52-62) |
| 73 | 4 | `wizard-1` Wizard · 1 phrases nearby | 390 | - | no route; no such screen in the Screen type of router.ts | no | no screen (grep wizard in app/src finds only a comment about New table) | E no |
| 74 | 4 | `wizard-2` Wizard · 2 I'm in | 390 | - | no route; no such screen in the Screen type of router.ts | no | no screen (grep wizard in app/src finds only a comment about New table) | E no |
| 75 | 4 | `wizard-3` Wizard · 3 tables and games | 390 | - | no route; no such screen in the Screen type of router.ts | no | no screen (grep wizard in app/src finds only a comment about New table) | E no |
| 76 | 4 | `wizard-4` Wizard · 4 nothing leaves the device | 390 | - | no route; no such screen in the Screen type of router.ts | no | no screen (grep wizard in app/src finds only a comment about New table) | E no |
| 77 | 4 | `wizard-5` Wizard · 5 place | 390 | - | no route; no such screen in the Screen type of router.ts | no | no screen (grep wizard in app/src finds only a comment about New table) | E no |
| 78 | 4 | `place` Place | 390 | screens/me/Place.tsx:18 | Me -> Place (sub=place) | yes | - | E yes (shell.css:52-62) |
| 79 | 4 | `place-qr` Place · QR | 390 | screens/me/PlaceQr.tsx:26 | Place -> QR (sub=place-qr) | yes | - | E yes (shell.css:52-62) |

## Sheets wider than the phone (pack 5, not counted as states)

These are the same screens at other widths. Sheet-name to screen mapping is by names and code comments (`tokens/wide.css:1-14`, `shell/App.tsx:40-44`), not by pictures.

| Sheet | Screen | Status in code |
|---|---|---|
| tablet_834_Feed / desktop_1440_Feed | feed | yes: wide.css, App.tsx:44 PANE_BESIDE |
| desktop_1920_Feed | feed | not confirmed: no 1920 mention for the feed in code (only 1920_Talks, wide.css:247) |
| tablet_834_Phrase / desktop_1440_Phrase | card | yes: wide.css:1-14, feed-card.tsx:69 (more) |
| tablet_834_Talks / desktop_1440_Talks / desktop_1920_Talks | inbox + chat | yes: Inbox.tsx:109 (beside), TalksPane.tsx:8, wide.css:247 |
| tablet_834_Write / desktop_1440_Write | composer | yes: App.tsx:44 (composer beside the pane), rail button App.tsx:232 |
| tablet_834_Tables / desktop_1440_Tables | tables | yes: wide.css:256 |
| tablet_834_Me / desktop_1440_Me | me | yes: wide.css:1-14,62-64 |
| tablet_834_BothIn | match | yes: wide.css:147 |
| desktop_1440_BothIn | match | not confirmed: no mention in code |

Animated transitions (not states): 01 feed-loading, 02 open-chat, 03 send-phrase, 04 both-in. What of them is in code - see the rules table: 01 -> K, 02 -> S, T, D, M (S, D, M not done), 03 -> S, T (S not done), 04 -> P (not done).
