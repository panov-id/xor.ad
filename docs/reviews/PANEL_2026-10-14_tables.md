# Panel 2026-10-14 · tables, transfer durak, chat, CSS pass

Range: day59, commits 76dd4486, 754df0dc, 24447339 (`git diff 0d0a8c89^..24447339 -- relay/node web/src`).
Lenses: security (fable), game logic & data (opus), consistency & UX (opus). All read-only, nothing run.

## Raw findings (agent words, condensed only by dropping the "held" lists; file:line kept)

### Security
- Held: transfer only by defender in turn (`routes/tables.ts:411`, `tables_deck.ts:137`); card in hand, no dup, limits `:145-155`; no loop; hands leak only `{count}` (`:210-228`); table text goes through the same gates 1–128 graphemes, ≤2048 bytes, `hasInvisible`, model verdict (`routes/tables.ts:331-334,363-365`); no XSS (`Table.tsx:197,199`, `Message.tsx:33`, `iconTips.ts:31` textContent; dangerouslySetInnerHTML only static art).
- 7. No rate limit on text lines (line/application/refusal) — design defect, inherited; `lib/tables.ts:33-36` has limits for create/seat/sticker/ticket only. Fix: `LINE_LIMITS` + `checkAll` before INSERT in speak.
- 8. Model verdict called before seat check — design defect/cost; `routes/tables.ts:291-305` callerOf → judge → atTable. Any live session can make the node call the model on any tableId. Fix: cheap seat check before judge, or the limit of 7 before judge.
- 9. minor: throw-in limit only `defender.hands.length < 1` (`tables_deck.ts:203`), old behaviour.
- 10. not a defect: application button guarded by wrapper and node `routes/tables.ts:351`.

### Game logic & data
- Held: transfer before any beat `:148`, same rank `:149`, enough cards `:155`, limit 6 `:152`, next attacker/defender, two-player back, chain, deck end; side fix does not change podkidnoy (invariant `:186`); old boards without `deck.transfer` read as podkidnoy (`:79,:143,:228`).
- 1. design: no transfer by showing a trump of the same rank (`:142-162`). A variant, record the decision.
- 2. design: after a transfer only the passer throws in (`:176,:186`, `deck.attacker = seat` `:159`); the first attacker drops out of the bout. Engine was "main attacker only" before (comment `:21-22`).
- 3. minor: draw order after transfer by `live` order, not round from attacker (`endRound :102`), pre-existing.
- 4. minor: throw-in limit by current hand `:192`, no divergence found.
- Surviving mutations (tests `tables_games.test.ts:208-234`): drop `table.length >= 6` `:152`; drop skip of empty hands `:153`; drop `typeof` `:144` / `indexOf` `:146`; drop `table.length === 0` `:147`; any endRound change after transfer (bout not played to the end); transfer of null/number.

### Consistency & UX
- 1. design: `kk/ky/tg/uz` `web.newTable.perevodnoy`, `web.set.transfer` = «аударма», «котормо», «гузаронӣ», «o'tkazma» (text translation), others transliterate.
- 2. minor: transliteration case differs (de «Perewodnoy»).
- 3. contradiction: `docs/protocol_EN.md:292`, `docs/protocol_RU.md:281` deck row header lists `36`, `durak36` without `transfer`; Move column lacks `{transfer: card}`.
- 4. minor: RU «отбивающий» vs «отбивающийся» in the same row.
- 5. minor: dead `.ui-tabs` rule `web/src/styles.css:327`.
- Held: 17 locales same key set; inner.css:59 row change scoped to tables/inbox lists; icon buttons have aria-label; details/summary unchanged.
- Note: `docs/GOALS_RU.md:99` cites `table.spec.ts:106` — may be stale.

## Verification by the lead
- Security 7: CONFIRMED — `grep checkAll routes/tables.ts`: lines 164, 244, 312 only (create, seat, sticker).
- Security 8: CONFIRMED — `routes/tables.ts:291-305` judge() before atTable().
- Consistency 1: CONFIRMED — read kk/ky/tg/uz json values.
- Consistency 5: CONFIRMED — `styles.css:327`, no other `ui-tabs` in web/src.
- Logic 1, 2: design questions for the owner (variant of rules), not refuted, not fixed.
- Logic mutations: to be closed by tests.

## Tasks
1. Rate limit for table lines + seat check before the model call — defect, ~1 h.
2. Tests killing the surviving transfer mutations, bout played to the end after transfer — defect, ~1 h.
3. kk/ky/tg/uz transliteration, de case — minor, minutes.
4. protocol EN/RU deck row: header + Move column + term — contradiction, minutes.
5. Remove `.ui-tabs` — minor, minutes.
6. Owner: transfer by showing a trump; whether all attackers throw in after a transfer — product.
7. Owner: stickers 41–43 px at 375/393 (8 across on the sheet) — product.
