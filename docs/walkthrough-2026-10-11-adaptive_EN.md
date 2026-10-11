# Walk of 11.10.2026 (evening): adaptive layout, the brand's mark, the like as the mark

The owner's goal of 11.10: «the product 100% ready locally», adaptive — phone, tablet, big screen and ultrawide; the
design of the sheets `panel/design/adaptive-*.svg` (34 sheets) working in the product. Pair: `walkthrough-2026-10-11-adaptive_RU.md`.

## How it was measured

- The local stands of both brands (`scripts/up-local.sh`, :4173 sosed, :4183 neighbro), rebuilt from day59 = 720917c2.
- A person's walk as text (`scripts/textwalk/widths.sh`): Anya and Boris sign up, write phrases, like each other, agree
  to talk, write to each other, sit at a table and finish a game of dots, Anya changes her name, restores on a new phone
  with the paper code, a guest opens the page in English. 51 steps a walk.
- Widths 393 / 768 / 1440 / 2560 / 3440, both brands — 10 walks. No screenshots: the visible text, the buttons' names, a
  `layout:` line (the content's width, sideways scroll, things past the edge, targets under 24×24).
- The gate `scripts/textwalk/check-widths.sh`; e2e of both brands (`scripts/run-web-tests.sh`).

## Result

| What | Result |
|---|---|
| Walks | 10 of 10, 51 steps each, 0 failed steps |
| Sideways scroll / past the edge | 0 / 0 at every width |
| Targets under 24×24 (WCAG 2.5.8) | 0 (the consent box and the dots' edges are exactly 24×24; the links in the consent sentence are the standard's exception) |
| The feed's width | 375 at 393, 720 at 768, 1280 at 1440, 1600 at 2560 and 3440 — as decided |
| The width gate | GREEN; red on planted faults (a narrow feed at 1440, a failed step, a 16×16 target) |
| e2e | sosed 122 of 122, neighbro 124 of 124 |
| Terminal | UI tests 104 + 24 + 11 + 4, 0 failed |

## What a person sees

- **Phone.** As before, plus the brand's mark 32 before the feed's title. The like is the outline of the storefront's
  own mark: sosed's bubble-house with its antenna, neighbro's house with its chimney. After a like the card's windows
  light. The button's label is «like». A phrase shows its mode's icon: alone, company, party. A venue's offer is a
  card of its own with the discount big.
- **Tablet 768.** A 720 column, the feed in 2 columns, the tab bar at the foot, 480 wide.
- **Monitor 1440.** A 112 rail on the left with the mark on top and words; the feed and tables in 3 columns; chat,
  card, composer, game, «me» in a column of 640 at most; the dots' legend beside the board. The splash is a poster with
  a 440 mark on the left, the entry on the right.
- **2560 and 3440.** 4 columns capped at 1600, a pale brand pattern at the very edge.
- The browser tab is the storefront's mark in the theme's colour. neighbro's headings are Golos 600.

## What is not there, and why

1. **No lit windows in the feed.** A phrase I liked leaves my feed (decision of 17.09.2026, `relay/node/src/routes/feed.ts`)
   and lives on «my likes», where the mark is lit. The feed sheets with lit windows missed this.
2. **No PWA manifest.** A new capability, not the design's move; the favicon is there.
3. **The edge pattern at 2560** is drawn with gradients: sosed's tiles have square corners, the sheet's are rounded.
4. **neighbro's sticker lean in the feed is off** (`stickers.css`, `transform: none`); the sheets lean them slightly.
5. **The gate's red was proven on planted results**, not through broken CSS → a walk.

## Commits on day59 (not pushed)

b21a68b4 walk and gate · a3c724f5 sheets, kit §10, registry · 08842dda web · 18499747 like counts, terminal «⌂» ·
720917c2 targets by WCAG 2.5.8.
