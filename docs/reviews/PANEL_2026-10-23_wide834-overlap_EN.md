# Panel 2026-10-23: wide 834 regression and the overlap measure

Russian pair: `PANEL_2026-10-23_wide834-overlap_RU.md`.

## Subject
The uncommitted tree on release/1.0.0, mainly this session's changes.

1. `app/tokens/wide.css`: the tablet block sets `--bar-clear` and `--say-clear` to 0.
2. `app/src/screens/me/Me.tsx` and `me.css`: from the tablet up, the place opens from the line under the name. The list has no place row.
3. `scripts/design/measure-app-overlap.mjs` and `snap-svg.mjs`: an ancestor does not clip an absolute box when it is static and is not its containing block.

## Machine checks before the panel
1. WIDE: 407/407.
2. check-app: GREEN.
3. Unit: 192/192.
4. Overlap @834: CLIPPED on chat 12 → 0; total 19 → 7.
5. Negative control: when the sheet really clips, chat shows 10 CLIPPED. The file was restored and cmp was equal.

## Lenses
Both lenses read the code only and ran nothing.

1. Security (fable): 4 minor defects, 0 critical.
2. Correctness (opus): 1 important, 2 minor. It covered the three focus areas only; the rest of the diff is NOT VERIFIED.

## Raw findings
1. Correctness, important, `measure-app-overlap.mjs:221` and `snap-svg.mjs:30`.
   - The skip rule checks only `transform`.
   - These also make a containing block, and are missed: `filter`, `backdrop-filter`, `perspective`, `contain`, `will-change`, `translate`, `rotate`, `scale` and `container-type`.
2. Correctness, minor, `me.css:40`: the focus ring on the place button is not checked.
3. Correctness, minor, `useMinWidth.ts:8`: when the token is empty, the query `(min-width: )` never matches.
4. Security, minor, `Gate.tsx:61-62`: when `firstPin` throws, the two pkcs8 buffers are not zeroed. `web/src/vault.ts:135` has the same shape.
5. Security, minor, `measure-app-overlap.sh:12`: the whole `/tmp/claude-1000` is mounted read-write.
6. Security, minor, `snap-svg.sh:39`: the default `SNAP_DIR` is another session's scratchpad.
7. Security, minor, `Gate.tsx:62,70`: the node's body goes into an Error text that reaches `console.error`.
8. Security, not found:
   - XSS;
   - SVG injection in `snap-svg.mjs`;
   - the code or PIN in a URL, storage or the log;
   - a consent bypass on Restore, Hidden, Blocked or Reissue;
   - network egress from the measures (not proven with `network_mode: none`).

## Second check
The lead ran the check; no refuting agent was used.

- Finding 1: CONFIRMED and fixed. Both files now have `holdsAbs()`.
  - Overlap @834: chat 0 CLIPPED.
  - Control (`overflow: hidden` and `filter` on the static `.tk-list`): chat 10 CLIPPED, where the rule before this fix skipped that list.
  - `wide.css` was restored and cmp was equal.
  - `snap-svg.sh me 834` still writes its snapshot.
- Findings 2-7: no refuting agent was run, so they are NOT VERIFIED. They are outside the approved files and wait for the owner.
