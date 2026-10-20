# Our sheets of the new design

Sheets drawn by us in the designer's format (Dusk export: cairo SVG, 390 × 844, text as glyph paths), where the designer's
set (`../all/*.zip`) has no sheet for a state the app needs. Each is derived from a designer's sheet by a script in
`scripts/design/`, never by hand, so the frame, the fonts and the spacing stay the designer's. `sosed/` and `neighbro/`
mirror the archives' `<brand>-static/mobile/`.

| Sheet | Out of | Script | Why |
| --- | --- | --- | --- |
| `w3_table-poker-{2,3,5,6}.svg` | `w3_table-poker.svg` (four at the table) | `poker-seat-sheets.py` | owner's decision of 18.10.2026: draw the seat layouts for 2, 3, 5 and 6 players |

Poker seats: two rows at the panel's ends as the designer's four (me at the bottom left, then clockwise), a middle place
halfway along each row for five and six. 2 and 3 are the four with seats empty; 5 is the six with the top left empty, so a
player joining moves nobody. `scripts/measure-app-w3-games.sh` reads the sosed sheets beside the designer's
(`OURS=` to point elsewhere); the neighbro sheets are drawn, not measured (the app is measured against sosed).
