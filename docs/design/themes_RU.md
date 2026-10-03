# Контракт тем (владелец, 02.10.2026)

> Перенесён из неотслеживаемого `web/design/gen/themes.md` (W15-D1, 04.10.2026) и приведён к путям
> ветки. English: `themes_EN.md`.

Дизайн = разделение брендов: у sosed дизайн «блоки», у neighbro — «стикеры».
У каждого бренда несколько ТЕМ; позже их станет больше, поэтому тема — это данные, а не код.

## Раскладка файлов
`web/themes/<brand>/<theme-id>.json` — по файлу на тему:

- `brand`: `sosed` | `neighbro` — совпадает с каталогом;
- `id`: `light` | `dark` | `mono` | `mono-dark` | цветной вариант (`amber`, `azure`, …) или его ночная пара
  `dark-<вариант>` — совпадает с именем файла;
- `name`: короткая английская подпись;
- `scheme`: `light` | `dark` (для `prefers-color-scheme` и `meta theme-color`);
- `night`: id темы, на которую бренд переходит ночью, — тема того же бренда;
- `section` (необязательно, `false`): только ночной файл, в списке тем не предлагается;
- `source`: откуда взяты цвета;
- `tile-ink`: цвет текста для каждого цвета плитки;
- `tokens`: плоская карта — `bg`, `surface`, `surface-2`, `fg`, `fg-muted`, `line`, `accent`, `accent-fg`,
  `accent-text`, `danger`, `focus`, `shadow`, `tile-1` … `tile-4` (у neighbro ещё `tile-5`); каждое значение `#rrggbb`.

Имена токенов — это CSS-переменные: `--bg`, `--surface`, … (kebab-case, без префикса бренда).

## Обязательно для каждого бренда
- `light`, `dark`, `mono`, `mono-dark` (mono — без оттенка вовсе: серые равной яркости).
- Цветные варианты сверху, у каждого ночная пара `dark-<вариант>` — владелец хочет «разные цвета».
- Каждая тема проходит проверки контраста: текст 4.5:1 (`fg` и `fg-muted` на `bg` и `surface`,
  `accent-fg` на `accent`), фокус 3:1 на `bg` и `surface`, `line` 3:1 на `bg` (рамка элемента управления —
  это UI, WCAG 1.4.11). `scripts/design/themes-css.py` краснеет ниже этих порогов; заливка акцентом ниже 3:1 на `bg` — предупреждение.

## Откуда темы берутся и куда идут
- `scripts/design/sosed-themes.py` пишет `web/themes/sosed/*.json` из кита (`panel/design/kit`);
  `scripts/design/neighbro-themes.py` пишет `web/themes/neighbro/*.json` из палитры лендинга neighbro.place.
  Каждый прогон воспроизводит закоммиченные файлы точно; тему, изменённую руками, меняют и в её генераторе.
- `scripts/design/themes-css.py` превращает JSON в `web/src/themes.gen.css` и `web/src/themes.gen.ts`;
  `--check` краснеет, если любой из них устарел. `web/src/theme.ts` ставит `data-brand` и `data-theme` на `<html>`.
- `scripts/design/sosed-sheets.py` и `neighbro-sheets.py` рисуют листы для темы
  (`--theme web/themes/<brand>/<id>.json --out …`); `scripts/design/brand-sheets.sh` собирает светлую и тёмную
  обоих брендов в `panel/design/sheets-<brand>/` — эталон `scripts/check-web-design.sh`.

Новая тема = JSON-файл (через генератор своего бренда) и `themes-css.py`; код экранов не меняется.
