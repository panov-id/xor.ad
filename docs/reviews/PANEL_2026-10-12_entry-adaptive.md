# Panel 2026-10-12 · entry re-laid on the adaptive sheets

Reviewed: branch day59, uncommitted diff (`git diff` at 12.10.2026 ~15:00): web/src/ui/{form.css,FormCard.tsx},
web/src/screens/{Register,Restore,Unlock,Splash}.tsx, splash.css, feed.css, styles.css, locales/say.ts,
web/e2e/fixtures/address.ts, specs language/k4-screens/legal, scripts/design/check-adaptive.{mjs,sh},
scripts/textwalk/textwalk.mjs, scripts/design/adaptive-sheets.py, panel/design/adaptive-*-register-1440.svg.
Lenses: Security (fable), Consistency (opus), Standards WCAG 2.2 AA (opus). Data and Operations not convened:
no schema, no node, no prod path in the diff.

## Raw: Security

> Критичного не нашёл. Находки:
> 1. `web/src/screens/Register.tsx:184` — дефект дизайна (согласие). На телефоне (<1024) слова согласия
> («принимаю правила и политику») спрятаны в `visually-hidden`; видны только чекбокс и три иконки-ссылки.
> Человек ставит галочку, не видя, что он принимает. Поток технически не изменился (ПРОВЕРЕНО: `whyNext`
> строка 85 требует `agreed`, `acceptAndKeep` строка 121 пишет редакции на узел), но «явное
> информированное согласие» на экране 393 больше не читается глазами — только скринридером. Это
> противоречит смыслу legal-ворот W13-LC; e2e `legal.spec.ts` это не ловит.
> 2. `web/src/locales/say.ts:286–293` — мелочь/дефект (блокировка на списке языков). `keepLanguage`: если
> `setItem` бросает, `chooseLanguage` тоже молча возвращается без reload, `keepLanguage` отдаёт `false`,
> `setAsked` не вызывается — тап по другому языку ничего не делает. Выход только тапом по отмеченному.
> 3. `scripts/design/check-adaptive.mjs:174` — мелочь (токен). `x-origin-token: web-test-origin-token`
> захардкожен; `BASE` из argv без ограничения на localhost. Значение — тестовый ORIGIN_TOKEN стенда
> (docker-compose.web.yml:129, то же в shoot-web.mjs). Утечки нет.
> 4. XSS/внедрение — не нашёл. 5. Ссылки без rel — не нашёл (Links.tsx:18). 6. Бумажный код/ПИН — потерь
> нет. 7. e2e/textwalk — секретов нет.
> Не нашёл, где описано: требование видимости слов согласия на узких экранах; поведение при недоступной
> записи для lang-asked.

## Raw: Consistency

> 1. Дефект. `web/src/styles.css:16` `.screen` теперь `max-width: 100%`, а `adaptive.css:32-36` ограничивает
> только от 640px → на 393–639 ВСЕ экраны (лента, чат, столы, place, card, composer, me) идут во всю
> ширину, а не колонка 375. `.tabs` остался `max-width: 375px` (styles.css:66).
> 2. Мёртвый CSS: `feed.css:85,87,88+` и `splash.css:127` для `[data-part="lang"]`; `feed.css:75/84`
> перебиваются splash.css.
> 3. Противоречие: `StepBar` `of` идёт только в aria-valuemax, деления зашиты в CSS на 3.
> 4. `.ui-steps` для neighbro задан дважды (form.css:38 и :180), 38 фактически мёртвое.
> 5. Мелочь: `.ui-form-sub` aria-hidden, а на ≥1024 `.ui-steps` display:none — скринридер шаг не слышит.
> 6. kit.spec.ts не берёт фикстуру — если открывает корень свежим профилем, упрётся в список языков.
> Старой разметки (select в lang, «шаг из 2», шапки) в e2e/scripts/depth/panel не осталось.

## Raw: Standards (WCAG 2.2 AA)

> Критично 1. form.css:489/493 — 1.4.11: поля-строки без рамки, черта `--surface-2` к карточке 1.10–1.31.
> То же ячейки кода и строка ПИН.
> Критично 2. form.css:450/452 — 1.4.3: h1 24/600 на полосе: sosed unlock `--tile-2`/`--accent-fg` 2.74 во
> многих темах; sosed register-2 `--tile-1`/`--fg` 2.28 в тёмных.
> Дефект 3. Register.tsx:78 — 2.5.3/3.3.2: текст согласия visually-hidden, видны только подписи ссылок.
> Дефект 4. Register.tsx:63–64,75–76 — 3.3.2: «13+» и «осталось N» ушли под (i).
> Дефект 5. Register.tsx:110–113 — 3.3.2: инструкция «введите группы» под (i).
> Дефект 6. form.css:461 — 1.4.4/1.4.10: ПИН letter-spacing 41px — НЕ ПРОВЕРЕНО замером.
> Дефект 7. form.css:484 — 2.5.8: (i) 36×36 (≥24 выполнено).
> Дефект 8. FormCard.tsx — 4.1.2: progressbar без aria-valuetext; на ≥1024 шаг не озвучен.
> Дефект 9. splash.css:349 — 1.4.11 контур Split `--line` — НЕ ПРОВЕРЕНО.
> Мелочь 10. «прибытие» без min-height 44. 11. aria-current у языка — допустимо. 12. Restore/Unlock h1 в
> карточке — 2.4.6 соблюдён.

## Re-check by the lead (instead of a refuter: each claim against the tree)

| Claim | Verdict | How |
|---|---|---|
| Sec 1 / WCAG 3: consent words hidden on the phone | CONFIRMED, owner's call | Register.tsx: `visually-hidden ui-consent-words`; the owner chose «как лист» 12.10 — goes back to the owner |
| Sec 2: list holds when setItem throws | CONFIRMED, FIXED | say.ts chooseLanguage returned void on a throw; now returns boolean, keepLanguage opens the splash |
| Sec 3: test token in check-adaptive | CONFIRMED, accepted | test value of docker-compose.web.yml:129; wrapper calls localhost only |
| Cons 1: .screen 100% widens every screen < 640 | CONFIRMED, by intent | the adaptive sheets draw every phone screen at 393 with a 16 gutter; .tabs 375 left behind — FIXED to 100% |
| Cons 2: dead lang CSS | CONFIRMED, FIXED | feed.css:85-91, splash.css:127 removed |
| Cons 3: StepBar `of` vs CSS 3 | CONFIRMED, minor, open | only of=3 is used |
| Cons 4: neighbro .ui-steps twice | CONFIRMED, FIXED | form.css first rule cut to the background |
| Cons 5 / WCAG 8: step not spoken | CONFIRMED, FIXED | aria-valuetext; .ui-form-sub no longer aria-hidden |
| Cons 6: kit.spec | REFUTED | kit.spec opens /kit, not the splash |
| WCAG 1: row fields 1.4.11 | CONFIRMED by the sheet's own colours, owner's call | the sheets draw the rule in surface-2 |
| WCAG 2: h1 on tiles 1.4.3 | CONFIRMED, FIXED | head ink is now the theme's --tile-N-ink (themes.gen.css:21-24) |
| WCAG 4/5: hints behind (i) | CONFIRMED, owner's decision 1 | listed back to the owner with WCAG 3 |
| WCAG 6: PIN spacing in px | NOT CHECKED (no 200% walk) | open |
| WCAG 10: arrive < 44 | CONFIRMED, FIXED | min-height 44 |

## Left, one per task

1. Owner: consent words visible on the phone (WCAG 3.3.2 / 2.5.3) vs the sheet — ~20 min either way.
2. Owner: row fields' rule contrast 1.4.11 (surface-2 → line) vs the sheet — ~10 min + sheet redraw.
3. PIN letter-spacing in em, walked at 200% — ~30 min.
4. StepBar segments from `of` — ~10 min.
