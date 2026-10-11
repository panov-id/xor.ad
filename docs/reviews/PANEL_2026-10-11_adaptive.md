# Панель 11.10.2026 — адаптив, знак, лайк-знак

- Что: ветка day59, коммиты `6d81342e..bd65d7d7` (`git diff 6d81342e..bd65d7d7 -- web depth scripts/textwalk docs`).
- Линзы: безопасность (fable), согласованность (opus), стандарты WCAG 2.2 AA (opus). Данные и эксплуатация не собирались:
  узел и база в диапазоне не менялись.
- Ведущий перепроверял находки сам: `grep`, пересчёт контраста скриптом по 24 темам (scratchpad `logo-contrast.py`).

## Сырьё: безопасность

> Nothing critical found; a few minor points.
> Checked, no finding: favicon.ts — colours come from getComputedStyle(probe).color, normalised rgb()/rgba(), cannot carry `"`
> or `<`; SVG from constants + those colours, encodeURIComponent into a data: URL; no injection even with --accent overridden.
> Mark.tsx — same probe pattern, span removed synchronously, drives a boolean only. Icon.tsx — static JSX, BRAND is the
> viewer's build constant. Offer cards — venue_name, conditions, discount_value, text rendered as JSX text only; no
> dangerouslySetInnerHTML, no href, no redirect handling. Identity leak — nothing new reaches the client; the like/mark are
> the viewer's storefront; FeedCard carries no author brand. e2e edits — counts/names/selectors only. depth/ink — glyph only.
> Minor 1 — scripts/textwalk/widths.sh:19 — docker exec xor-local-$brand-postgres-1 … DELETE FROM rate_limit_hits: hardcoded
> local names, but honours DOCKER_HOST/context; with a remote context holding such names it would run there. Fix: refuse a
> non-default context; fail loudly — `set -uo pipefail` without -e, a failed delete silently continues.
> Minor 2 — widths.sh:19 — db relay_test / user relay hardcoded; a differing stand silently no-ops.
> Minor 3 — run.sh:11 — --network host on chromium (pre-existing), localhost URLs only, acceptable.
> Could not find in range: the written «brand is not sent to clients» decision (docs/chat_RU.md §8, outside the range).

## Сырьё: согласованность

> kit §10 RU/EN match; walkthrough RU/EN match; decisions.tsv:216-219 match the kit word for word; every number matches the
> code (640/1024/1440/2560, 720/1280/1600, 112, 160/200/440, 44, 32, 72, 16, 60 ms, 24×24). Grep and reading only.
> 1 Contradiction — locales/*.json key web.card.heart «сердце: …» / «heart: drag onto…» is the aria-label of neighbro's like
> button (brands/neighbro/index.tsx:240); the kit says the heart is gone. 2 Contradiction — Icon.tsx:39 the `likes` icon is
> still a heart. 3 Stale — Card.tsx:26-29 «gold medallion with ♥». 4 Stale — styles.css:137 «with its heart», class
> .ui-burst-heart. 5 Stale — brands/sosed/index.tsx:61,168, brands/neighbro/index.tsx:2-5,62,72,109,118,127,137,160,258
> comments say «the heart». 6 Stale — tokens.css:86 `/* Russo One */` on --title-fs. 7 Stale — stickers.css:112 «the name in
> Russo One». 8 Minor — widths.sh:2-5 header does not say it deletes rate_limit_hits and restarts the node.

## Сырьё: WCAG 2.2 AA

> Read only, nothing run. 1 defect 4.1.2/1.4.1 — Card.tsx:72-80, brands/sosed/index.tsx:158: given like shown only by
> data-lit windows and disabled; same aria-label, no aria-pressed; disabled drops it from tab order. Fix aria-pressed or a
> state label, aria-disabled. 2 defect 1.4.11 — adaptive.css:14 lit windows currentColor on accent; if accent-fg on accent
> < 3:1 (sosed amber, turquoise) the lit state may not show. 3 minor 1.4.11 — Mark.tsx: check on mount only, stale after a
> theme switch; decorative, aria-hidden. 4 OK 2.3.3. 5 defect 2.4.11 (not verified) — adaptive.css:83-86 «write» fixed at
> the rail foot, z 11; on a short 1024 viewport tabs can run under it. 6 minor 1.3.1/2.4.3 — rail is the same nav moved by
> CSS; order content → rail; acceptable. 7 1.4.10 — new rules only from 640, 320 unchanged. 8 minor 1.1.1 —
> brands/sosed/index.tsx:128 peek tile: like icon then a bare number; the offer «−20» has no word. 9 OK 2.5.8. 10 1.4.12 —
> rail tab fixed height 64 can clip under text spacing; use min-height.

## Опровержения (ведущий, инструментами)

| Находка | Вердикт | Чем |
|---|---|---|
| Согл. 1 web.card.heart | ПОДТВЕРЖДЕНО | `grep` ru.json/en.json: «сердце: …», neighbro/index.tsx:240 aria-label |
| Согл. 2 likes = сердце | ПОДТВЕРЖДЕНО | Icon.tsx:39 путь сердца |
| WCAG 1 нет aria-pressed | ПОДТВЕРЖДЕНО | grep: в Card.tsx и sosed/index.tsx нет aria-pressed |
| WCAG 2 контраст окон | ОПРОВЕРГНУТО | accent-fg/accent по 24 темам: минимум 4.6 (neighbro azure/crimson/dark-azure) ≥ 3:1 |
| WCAG 5 «написать» над пунктами | НЕ ПРОВЕРЕНО | замера низкого экрана нет; закрывается с запасом |
| WCAG 8 голое число в выдвижной плитке | ПОДТВЕРЖДЕНО | sosed/index.tsx:128 |
| WCAG 10 height 64 | ПОДТВЕРЖДЕНО | adaptive.css:72 |
| Безоп. 1 widths.sh без -e и проверки контекста | ПОДТВЕРЖДЕНО | widths.sh:6 `set -uo pipefail` |
| Согл. 3–8, WCAG 3 | мелочи, закрываются правкой | — |

## Сводка ведущего и нарезка

Закрыто тем же заходом (коммит после этого файла): согл. 1–4, 6–8; WCAG 1 (aria-pressed), 5 (запас под «написать»),
8 (имя числа), 10 (min-height); безоп. 1–2 (отказ на не-локальном контексте Docker, громкий отказ при сбое).

Осталось задачами:
1. WCAG 1, вторая половина — `disabled` у поставленного лайка выводит кнопку из порядка Tab; `aria-disabled` меняет
   механику и e2e. Мелочь, ~1 шаг.
2. WCAG 3 — Mark.tsx перепроверяет контраст только при монтировании; смена темы без перезагрузки оставит старое. Мелочь.
3. Согл. 5 — комментарии «heart» в brands/*/index.tsx (механика наклейки neighbro по-прежнему называется heart-*). Мелочь.
4. WCAG 5 — замер низкого экрана (1024×600) проходом, а не правкой с запасом. Мелочь.
