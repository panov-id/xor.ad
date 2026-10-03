# стикеры — lens pass (02.10.2026)

> **Где мы сейчас (W15-D1, 2026-10-04).** Это журнал разработки направления neighbro «стикеры», который велся в неотслеживаемом файле `web/design/gen/dir-stickers/lens.md` на 2026-10-02; текст ниже — этот журнал без изменений.
> Его пути изменились: `gen.py` это `scripts/design/neighbro-sheets.py`, `render.sh` и `build.sh` это
> `scripts/design/brand-sheets.sh`, `../lint_svg.py` это `scripts/design/lint_svg.py`, `../themes/neighbro/*.json` это
> `web/themes/neighbro/` (создаётся `scripts/design/neighbro-themes.py`), контракт тем это
> `docs/design/themes_EN.md`, и листы находятся в `panel/design/sheets-neighbro/`. English: `lens-neighbro-stickers_EN.md`.

Линзы машины работают внутри `gen.py` (`./render.sh` вызывает его с `--strict`):
- colour: 60 пар WCAG заявлено (текст 4.5, mu 4.5, ink-on-every-sticker-hue 4.5, focus/line/button 3) для day, sunset, night, neighbro;
- targets: каждая role=button/tab >= 48x48, имеет aria-label, внутри экрана, нет двух перекрывающихся целей (70 целей);
- type: масштаб 14/16/18/22/28/36, body (Golos 400) >= 16 на экранах; нет "!" в тексте; нет имени вне Match/Chat/Profile;
- icons: stroke 1.5 с non-scaling-stroke.
Финальный запуск: `screens=11 targets=70 contrast_pairs=60 problems=0`.

Визуальный pass (PNG превью, потом исправлено в gen.py и переопущено):
1. Card-liked — свежеположенный heart стикер прикрыл последнее слово фразы. Переместен в пустой нижний-правый угол карты.
2. Card-liked — сиротский "✓" на строке отмены читался как случайный символ. Удален; чип отмены с 5 s это подтверждение.
3. Profile — "перенести на другое устройство" наезжало на шеврон. Сокращено до "перенести личность".
4. Chat — целевой элемент "срок беседы" лежал посередине строки, вдали от своей иконки. Теперь покрывает иконку таймера и ярлык (16..296).
5. Arrival — курсор текста лежал на разрыве вместо девятого слота. Переместен внутрь слота 9.
6. Ранний черновик: проверка перекрытия целей добавлена после замечания что лоток и нижняя панель могли столкнуться на Card; раскладка держит 24 px между ними.

Не проверено: реальный порядок фокуса в браузере; drag на touch устройствах (экраны это статические SVG).

## Round 2 (02.10.2026): English, lint gate, visual pass at 2x

Gate: `render.sh` запускает `gen.py --strict`, потом `../lint_svg.py` на всех 11 экранах, потом проверку Cyrillic на behavior.svg; любой сбой останавливает сборку.
Последний запуск: `lint: 0 problems in 11 files`.

Исправления:
1. Весь видимый текст и aria-labels переведены на английский (Boris, Anya; бренды sosed/neighbro сохранены). Каждый <text> получает id.
2. Card / Card-liked / Card-dark: большая пустая область между картой и листом — карта теперь спускается до листа как зона drop, с reactions и ⓘ в её footer и пунктирной drop target посередине.
3. Card-liked: отмена (5 s) переместена в нижнюю панель на место кнопки листа; она больше не плывёт под картой.
4. Card-more: след drag больше не пересекает текст — бежит из пустого слота лотка через пустую середину карты; подсказка переместена на панель.
5. Chat: heart стикер под пузырём перекрывал следующий пузырь — добавлен 12 px после пузыря который носит стикер.
6. ⓘ якорение: Arrival рядом с "code", Compose рядом с "zone", Card в footer карты, Match рядом с кнопкой "talk", Chat внутри строки терма.
7. Compose: "3 km" выходил за правый gutter — четыре чипа zone теперь делят 343 px ровно (79.75 каждый).
8. Compose: фраза переполняла карту (lint t42 x..379) — разделена на две строки.
9. Die-cut тень имела дублирующийся атрибут fill (невалидный XML); исправлено.
10. Chat: целевой элемент "talk term" была пустая группа (нет bbox, сломала запрос inkscape); дана прозрачный rect.
11. Feed/Match: вдова "in" на своей строке — пример фразы укорочен.
12. Счёты reactions касались их стикера (видно на night) — счёт переместен 5 px вправо.
13. Chat: кнопка safety касалась фазы стикера — переместена 18 px влево.

Не смотрели: behavior.svg на 2x (только lint-free от Cyrillic), hover/focus состояния, реальный порядок фокуса браузера, touch drag.

## Round 3 (02.10.2026, owner shortlist)
1. Card / Card-liked / Card-dark: фраза на 36; одинокий пунктирный круг удален — в покое нет маркера drop, только полная dashed outline на Card-more (drag). 36 один оставил пустую карту, поэтому карта теперь обнимает её содержимое (272) и следующие две фразы выглядывают ниже на 55% — экран читается как стек, не дыра. Фраза укорочена чтобы избежать однословной последней строки.
4. Card-more: след drag переорганизован вдоль правого края; пересекал ⓘ и peek текст после изменения раскладки.
2. Feed: карты больше не повёрнуты — левые края на gutter 16 px, die-cut border и тень сохранены.
3. Arrival: стикер, код и обе кнопки стянуты в один блок (кнопки на 400/468) вместо кнопок привязанных к bottom.
Lint после перестройки: 0 problems in 11 files.

## Round 4 (02.10.2026): neighbro это бренд, темы как данные
- Темы: ../themes/neighbro/{light,dark,mono,sea,mint}.json (контракт themes.md; дополнительный опциональный token tile-5 для пятой reaction, fallback на tile-1). gen.py --theme/--out; никакая тема не живёт в коде. Card-dark (night фаза) использует dark.json бренда.
- build.sh: за тему gen --strict + lint_svg + no-Cyrillic в behavior.svg; sheet.pdf = overview (Card во всех темах) + за тему страница title token, 10 экранов, behavior = 61 vector страница.
- sosed удален; Feed-neighbro сброшен (10 экранов за тему).
- Card-more: след теперь оставляет пустой слот, бежит в разрыв над листом, и входит в карту перпендикулярно в столбец стикера — нет бега вдоль dashed outline, clear от ⓘ и текста.
- Dark: cream die-cut border читалась как тяжёлый outline — die = 30% fg над surface.
- Счёты reactions касались следующего стикера (dark Feed) — spacing 58 → 64.
Смотрели на 2x: Card, Feed, Card-more во всех 5 темах.

## Round 5 (02.10.2026)
- Mint и Sea были near-copies Light на overview. Mint теперь имеет mint background, header и tiles (bg #d9f2e2, surface-2 #8fd9ad, all-green tiles); Sea синий по всему (bg #d6e7f7, surface-2 #86b9e8, blue tiles). Light переместён на нейтральный bg #f4f4f0 чтобы три отделились. Asserts контраста неизменны и проходят.
- Match: карты фраз были всё ещё наклонены пока Feed была прямой — tilt 0, левые края на gutter.
- Arrival (dark): ячейки кода слились в один band — ячейки 28 в ширину с разрывом 10 px.
Смотрели на 2x, light + dark: Arrival, Compose, Match, Chat, Profile, Card-dark. Видели и оставили: Compose имеет свободное место над кнопкой отправки (сохранено для клавиатуры).

## Round 6 (02.10.2026): kit палитры заменяют выдуманные
Темы переге́нерированы из panel/design/kit/schemes.css (точные hex): gold-dark (.k-neighbro), gold-light (.k-neighbro-light), sea-dark (.k-neighbro-sea), sea-light (.k-neighbro-sea-light), mono = luminance-equal серые gold-light. light/dark/mint/sea удалены.
Маппинг: bg<-bg, surface<-panel, surface-2<-panel-2, fg<-fg, fg-muted<-muted, line<-border, accent<-accent, accent-fg<-accent-ink, danger<-err, tile-1..3<-cat-amber/teal/violet, tile-4<-ok, tile-5<-accent-text, shadow<-shadow, focus<-accent-text (kit не имеет focus var).
Header gradient = surface -> bg; dark die-cut border = surface-2; light die-cut остаётся #ffffff.
Icon/text ink на tiles = theme fg или bg, что бы контрастировало более (kit light tiles тёмные, поэтому fixed ink сломалась).
Palette контрост сбои рапортированы, цвета сохранены (gen выводит PALETTE строки):
- gold-dark line/bg #3a331f на #0c0b09 = 1.57 (< 3)
- gold-light accent/bg #c6a24e на #e9e6dd = 1.94 (< 3)
- mono accent/bg #a7a7a7 на #e6e6e6 = 1.93 (< 3)
- sea-dark line/bg #23383d на #0b1416 = 1.51 (< 3)
- sea-light line/bg #c9d1ce на #f3f1ea = 1.38 (< 3)
Видимый эффект: ⓘ outline тусклый на dark темах; kit solid shadow читается как hard offset edge, тяжелейший на sea-light (#14201e).
- Gold gradient (owner 02.10, переопределяет brief "no gold gradients"): опциональный token accent-gradient ["#a5822f","#c6a24e","#f1dc9a","#c6a24e"] в gold-dark/gold-light только; диагональный (~135deg) static, нет glow. Применяется к fillам равным accent или tile-1 (accent кнопки, FAB, gold стикеры). Ink на gold = accent-fg #1a1509, заявлено >= 4.5 на каждой остановке (darkest остановка поднята из #8f6f2a на #a5822f потому что #8f6f2a дало 3.9).

## Round 7 (02.10.2026): landing палитра, sosed-like структура
Источник: neighbro.place landing/index.html строки 85-129 (read-only). make_themes.py пишет themes/neighbro: light, dark (gold), crimson, teal, azure, violet (light ground, night = свой dark-<accent>, section:false), mono, mono-dark (equal-luminance серые). gold-*/sea-* удалены.
Маппинг: bg<-bg, surface<-panel, surface-2<-panel-2, line<-border, fg<-fg, fg-muted<-muted (light) / muted-2 #928979 (dark), accent<-accent, accent-fg<-accent-ink, accent-text и focus<-accent-text за mode, danger<-err, shadow<-border, tile-1..4<-четыре other accents, tile-5<-ok, tile-ink<-каждый accent's accent-ink.
Big card носит accent темы (gold: metallic gradient). Dark panel #14120e это 1.06:1 на bg; карты остаются видимы через die-cut border (panel-2), поэтому panel сохранён.
Font gate как dir-blocks: sheet.pdf шрифты GolosText + RussoOne только; ✓ ✕ ⓘ в behavior.svg (не в Golos, fell back на DejaVu/VL Gothic) заменены словами.
Рапортировано, сохранено: accent fill на light ground < 3:1 — gold #c6a24e 1.94, teal #1fb39a 2.11, mono #a7a7a7 1.93.

## Round 8 (02.10.2026): нет gold, cool нейтрали
Gold удален (accent, gradient, sticker). Base light/dark = teal #1fb39a (ink #04201c, accent-text dark #1fb39a / light #126a5c). Темы: light, dark, crimson, azure, violet, mono, mono-dark. Стикеры: teal, crimson, azure, violet, green.
Нейтрали: той же WCAG luminance, hue 215, saturation 8% (make_themes.py cool()):
| старый | новый |
|---|---|
| #0c0b09 | #0b0b0c |
| #14120e | #111314 |
| #26221a | #202326 |
| #6a5d39 | #585e67 |
| #ede8dd | #e7e8eb |
| #928979 | #838a95 |
| #e9e6dd | #e5e6e9 |
| #f4f1e8 | #f1f1f3 |
| #ded9cc | #d7d9dd |
| #1e1b14 | #1a1b1e |
| #181510 | #141618 |
| #5f5a4e | #545b63 |
#8a8172 и #5c5749 не используются (fg-muted берёт #928979 dark / #5f5a4e light).
Green: ok #9ecb7a -> #7fd19a (dark), #4b712c -> #3f9a5c (light).
Accent-text значения: только gold's #735b25 был коричневый; он ушёл с gold. Crimson #b32922/#e0625b, azure #2d609c/#548dce, violet #793fbe/#a077d2, teal #126a5c не коричневые.
mono-dark line grey закруглена до 2.99:1; сдвинута на один уровень чтобы пройти 3:1.
Рапортировано, сохранено: teal fill на light bg 2.11, mono accent 2.12 (< 3). Видели: teal heart стикер на teal карте (light/dark) отделяется только своим die-cut border.

## Round 9 (02.10.2026): Match hero, same-colour sticker
- Match hero: два solid стикера r52 — accent + первый цвет стикера >= 60 deg от друга в hue (заявлено; mono: серый most different в lightness), crisp #ffffff ring 8, soft translucent shadow, 28 px overlap, нет blends. Иконки: accent-fg на accent, contrast-picked ink на другой.
- Reaction стикер равный цвету карты accent: white fill, иконка в hue стикера, falling back на accent-text / accent-fg когда hue < 3:1 на white (teal 2.63, mono grey 2.65).
- Overview страница: полоса всех Match heroes под Card строкой.
- build.sh: bash + pipefail — failing gen.py assert был проглочен `| sed` pipe до.
Смотрели на 2x: Match и Card во всех 7 темах, overview.

## Round 10 (02.10.2026): один стикер — сердце
- REACT = heart только (node знает like/unlike). Tray = heart pad: одно сердце на полосе с двумя сердцами стопкой позади; drag-onto-card, tap-then-card, 5 s undo сохранён.
- Карты показывают единый счёт heart; Match hero = два сердца (мой accent, их >= 60 deg от друга).
- Chat-line reaction удалена со своей behavior строкой (нет like на chat линиях в node).
- Размещённое / dragged сердце на accent карте было teal на teal: нарисовано white с accent-ink иконкой (>= 3:1 на white).
- behavior.svg строки переформулированы в heart pad. Tokens tile-2..5 остаются в JSON, используются только Match hero и phase стикером.
Смотрели на 2x: Card, Card-liked, Card-more, Match в light и dark.
