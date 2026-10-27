# Panel 2026-10-26: entry zone (PIN pad, forget, intro, themes, phrase sizes)

Pair: `PANEL_2026-10-26_entry_RU.md`. Lens: security + correctness (fable), read-only, one agent.

| # | Where | Level | Finding | Status | Fix and test |
|---|---|---|---|---|---|
| 1 | `app/src/brands/sosed/theme.ts` | important | `in` / `OLD_IDS[v]` walk the prototype: a kept «toString» gave `data-theme="undefined"` | VERIFIED by the agent (deno in Docker) and by the new test, red under the break | `Object.hasOwn`; `theme.test.ts` «own property» |
| 2 | `app/src/screens/Register.tsx` | important | a node refusal with both PINs typed left no way to try again | VERIFIED live: 503 on the first POST, «try again» shown, the retry made the identity | `register-retry`; `pin-flow.test.ts`, probe entry 15 of 15 |
| 3 | `app/src/screens/Unlock.tsx` | minor | two fast taps on «wipe it» ran forget twice | VERIFIED by reading; test red under the break | once-guard `forgetting` |
| 4 | `app/src/screens/Unlock.tsx` | minor | the PIN stayed in the screen's state after a successful open | VERIFIED by reading; test red under the break | `setPin("")` before `onDone` |
| 5 | `app/src/router.ts` | minor | `/intro` typed by hand showed «how it works» again | VERIFIED by the test, red under the break | `/intro` is the feed for a seat |

Not found by the lens: attempts burned twice on Unlock or Locked; `textSize` without `Intl.Segmenter`.
