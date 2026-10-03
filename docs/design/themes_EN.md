# Themes contract (owner 2026-10-02)

> Moved from the untracked `web/design/gen/themes.md` (W15-D1, 2026-10-04) and brought to the paths
> the branch uses. Russian: `themes_RU.md`.

Design = brand separation: sosed wears the "blocks" design, neighbro the "stickers" design.
Each brand ships several THEMES; more will be added later, so a theme is data, not code.

## File layout
`web/themes/<brand>/<theme-id>.json` — one file per theme:

- `brand`: `sosed` | `neighbro` — must match the folder;
- `id`: `light` | `dark` | `mono` | `mono-dark` | a colour variant (`amber`, `azure`, …) or its night pair
  `dark-<variant>` — must match the file name;
- `name`: short English label;
- `scheme`: `light` | `dark` (for `prefers-color-scheme` and `meta theme-color`);
- `night`: the id of the theme the brand switches to at night — must name a theme of the same brand;
- `section` (optional, `false`): a night-only file, not offered in the theme list;
- `source`: where the colours come from;
- `tile-ink`: the text colour for each tile colour;
- `tokens`: a flat map — `bg`, `surface`, `surface-2`, `fg`, `fg-muted`, `line`, `accent`, `accent-fg`,
  `accent-text`, `danger`, `focus`, `shadow`, `tile-1` … `tile-4` (neighbro also `tile-5`); every value `#rrggbb`.

Token names are the CSS custom properties: `--bg`, `--surface`, … (kebab-case, no brand prefix).

## Required per brand
- `light`, `dark`, `mono`, `mono-dark` (mono means no hue at all: greys of equal luminance).
- Colour variants on top, each with its `dark-<variant>` night pair — the owner wants «разные цвета».
- Every theme passes the contrast asserts: text 4.5:1 (`fg` and `fg-muted` on `bg` and `surface`,
  `accent-fg` on `accent`), focus 3:1 on `bg` and `surface`, `line` 3:1 on `bg` (a control's border is UI,
  WCAG 1.4.11). `scripts/design/themes-css.py` is red below these; an accent fill under 3:1 on `bg` is a warning.

## Where the themes come from and where they go
- `scripts/design/sosed-themes.py` writes `web/themes/sosed/*.json` from the kit (`panel/design/kit`);
  `scripts/design/neighbro-themes.py` writes `web/themes/neighbro/*.json` from the neighbro.place landing palette.
  Each run reproduces the committed files exactly; a theme changed by hand is changed in its generator too.
- `scripts/design/themes-css.py` turns the JSON into `web/src/themes.gen.css` and `web/src/themes.gen.ts`;
  `--check` is red when either is stale. `web/src/theme.ts` sets `data-brand` and `data-theme` on `<html>`.
- `scripts/design/sosed-sheets.py` and `neighbro-sheets.py` draw the sheets for a theme
  (`--theme web/themes/<brand>/<id>.json --out …`); `scripts/design/brand-sheets.sh` builds light and dark
  of both brands into `panel/design/sheets-<brand>/`, the reference of `scripts/check-web-design.sh`.

Adding a theme = a JSON file (through its brand's generator) and `themes-css.py`; no screen code changes.
