# Goal: the web face whole, clear and beautiful

Accepted by the owner 12.10.2026, refined by his word of 13.10 · branch day59 · Russian pair — `goal-web-whole_RU.md`

## Why

On 12.10.2026 the owner opened the face and found: the design is unfinished screen by screen; the place's QR
code has no screen at all; the «где я» button asks the browser for coordinates against the privacy policy;
place and composing a phrase are unclear to a newcomer — "as if nobody walked them". Until now the work was
measured by gates and e2e: they prove that buttons click and boxes match the entry sheets, not that the
product is whole and clear.

## The goal in one sentence

Every flow the documents promise is on the screen, walked through a newcomer's eyes, and beautiful at every
width (375, 393, 768, 1024, 1440, 2560) in both brands (sosed, neighbro).

## When the goal is reached — all five conditions, each by machine or by frame

1. **Whole.** The inventory "promised → on the screen" (`docs/reviews/GAPS_2026-10-12_web-vs-promise.md`)
   has no "absent from web" row: everything is in alpha.
2. **Walked.** The walk (`scripts/textwalk/textwalk.mjs`) goes through every flow of the inventory; 0 failed
   steps at 6 widths × 2 brands.
3. **Clear.** A newcomer agent who does not know the product goes through every flow by frames and words and
   does not get stuck: on each screen it can say what to do here and what happens after the press. Its notes
   go to `docs/reviews/`; stuck points: 0.
4. **Beautiful.** A perfectionist round over all frames: 0 critical, 0 defect and 0 polish at every width (word of 13.10). I have looked at every frame of the last round myself.
5. **Truthful and green.** The face does nothing that contradicts the privacy policy and the terms; e2e of
   both brands green; the `check-adaptive` gate at 0 defects; every new test shown red when the thing breaks.

"Done" is the owner's word; I report only the five conditions with numbers.

## Owner decisions the goal stands on

- Icons on buttons stay; the word is in a tooltip (12.10).
- Routes: tabs and nested screens without ids; the screen's object only in `history.state` (12.10).
- Remove the «где я» button: the browser is not asked for coordinates, as the policy promises (12.10).
- Language as a list on first visit; «back» as the second part of the button; from 1024, boxed fields (12.10).
- 13.10.2026 — owner: EVERYTHING is in alpha. Everything except complaints is decided by the model (no human moderation queue);
  complaints and DSA notices are handled by a human. Stickers stay: a small fixed set, tappable in chat and at a
  table. One device: identity is moved, the old one stops at once; no device list. Offers from a private
  person (a phrase with a discount) and from a business (promo code with a copy button) are in alpha.
  Games more varied, table creation beautiful. Polish goes to zero.

## Tasks in order

Order: truth first (the law), then the newcomer's main path, then what is missing, then the rest.

| # | Task | Counts as done |
|---|---|---|
| 1 | Remove «где я»: `here()` (`web/src/geo/place.ts:105`) and its button in `Place.tsx`; round a point and a city the same way on the device | no `navigator.geolocation` in `web/src`; e2e green |
| 2 | Place on first visit: do not silently open Rome (`FALLBACK`, `place.ts:12`), ask for a city; the place screen says in words why the place matters and what goes to the server | a newcomer goes through without questions |
| 3 | The place's QR code: the link `/location#p=<cell>&s=<step>` opens the feed at that cell (`docs/protocol_EN.md:177`), per the sheet `screen-26-place-qr.svg`. In-app screen (sheet 26, `panel/design/screen-26-place-qr.svg`): show the QR, save as image, share, copy the link (no "copy link" button in the mock-up — add it) | e2e on the link; a frame per the sheet |
| 4 | Composing a phrase through a newcomer's eyes: «режим», «схема, не карта», «зона», «предлагаю скидку» — words and order | a newcomer goes through without questions |
| 5 | Reporting someone else's phrase (DSA Art. 16, `docs/depth-client_RU.md:344`); a human handles it | e2e; the request reaches the node |
| 6 | Routes (an agent is on it; decision of 12.10) | e2e `routes.spec` green, and red when broken |
| 7 | Extend the walk to the 25 unwalked items of the inventory: venue cabinet, arrival and moving the identity, the whole chat (keys, safety code, stickers, block, end, span, game), the 6 game classes besides dots, statements, age filter, hidden, step-away, theme, documents, reset, new paper code, change PIN, idle lock, offline | 0 failed steps |
| 8 | Games drawn as 8×8 text (checkers, chess, backgammon, dice, chapayev): a real board; games more varied, table creation beautiful | a frame per the sheet, e2e of a move |
| 13 | Stickers: a small fixed set of standard ones, tappable in chat and at a table | e2e of sending; a frame per the sheet |
| 14 | Offers: private (a phrase with a discount, no link or code) and from a business (promo code, copy button) | e2e of both kinds |
| 15 | One device: moving the identity to another, the old one stops at that moment | e2e of the move; the old device refused |
| 9 | Newcomer over every flow (condition 3) → fixes to words and order | stuck points: 0 |
| 10 | Perfectionist rounds over all frames (condition 4) → fixes until 0 critical/defect. Open from round 1: 2560 at small-device size; the feed grid and card captions; blank coloured blocks on the match; the game board ~100 px and no game result; Latin city names; contrast of the «я» tiles; card, chat and table at 1440 a narrow strip without the rail; the language list on an empty screen | 0 critical, 0 defect |
| 11 | Extend the `check-adaptive` gate from the entry to feed, card, chat, tables, «я» — against the `adaptive-*` sheets | 0 defects |
| 12 | Draw the missing design sheets for screens that have none (game boards, a point from a map) — the sheet first, then CSS | every walked screen has a sheet |

## How I work

- Each task: the change, e2e of both brands, frames, and only then "closed" in this document.
- New tests come with their red shown on a break.
- Product forks (words, behaviour) go to the owner as a questionnaire; I do not decide them.
- Commits only on the owner's word.

## Out of the goal

- Russian texts of the terms and the policy: by the decision in the sosed.place repository the documents are English only.
- A built-in QR scanner: `docs/offers/README_RU.md:302` explicitly rejects it.

## Open questions to the owner

1. ~~What from "out of the goal" is actually in it?~~ Decided 13.10: everything is in alpha.
2. Place on first visit: ask before the feed (a screen), or show the feed with a "set your place" bar?
3. ~~Condition 4: polish to zero too?~~ Decided 13.10: to zero.
