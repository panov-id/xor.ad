# Panel 22.10.2026 · app motion, overlaps, waiting rules

The panel reviewed the uncommitted diff under `app/` on release/1.0.0, plus `app/src/shell/ripple.ts`.
Two lenses ran from reading the diff only; nothing was driven live.

## Lenses

| Lens | Model | Defects | Clean |
|---|---|---|---|
| Security | fable | 1 (important) | DOM injection, CSP, network, listeners, layerOf spoofing |
| Correctness | opus | 1 (medium) | loading.ts stamp, Feed skeleton, ScreenLayer/layerOf, ripple, chat stagger, reduced motion |

## Findings

1. **Match.tsx:34-36, exit fallback timer.** Both lenses found it.
   - The defect: the timer was not cleared on unmount, and every call armed it again.
   - The consequence: Back during the 400 ms exit still moved the person into the chat or the wait 1.5 s later.
   - **Fixed.** The exit now lives in `app/src/screens/talks/match-exit.ts` (`leave`, `left`, `dispose`), and `Match.tsx` disposes it on unmount.
   - **VERIFIED** by `match-exit.test.ts`. With `dispose` emptied, the test is red: "the fallback timer moved the person after the match screen was closed". After the restore, unit tests are 173/173.
2. **Feed.tsx:213, the skeleton during its minimum hold.** It is no longer gated by `state === "loading"`. Not a defect: the hold is the point. It can share the screen with the cards for up to 600 ms.

## Waiting-rule boundary (fixed before the panel)

- **Cause.** `app/src/shell/loading.ts` stamped `shownAt` inside the 300 ms timer, before React rendered the skeleton. The skeleton therefore stood 599.x ms.
- **Fix.** The stamp moved to an effect on `visible`.

## Checks after the last edit

- **Motion and overlap measure** (`scripts/measure-app-overlap.sh`): 3 runs in a row, each rc 0.
  - Overlaps 0, MOTION RULES 8/8, waiting rules ok.
  - The Likes skeleton stood 603, 603 and 602 ms.
  - The Feed skeleton stood 605, 607 and 608 ms.
- **check-app**: GREEN. **Unit**: 173/173.
