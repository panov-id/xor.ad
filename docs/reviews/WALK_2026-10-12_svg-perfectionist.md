# Perfectionist pass over the saved walk — 2026-10-12

- Material: `testing/walk-svg/2026-10-12/{sosed-393,neighbro-1440}/` (SVG captured by
  `scripts/textwalk/svg-walk.sh`, rendered to JPEG by `scripts/textwalk/svg-to-jpg.mjs`; 244/244 rendered).
- Tree: branch day59, uncommitted entry re-layout.
- Reviewers: two Opus agents, one per folder, screen-level and flow-level.
- Coverage (their own words): sosed-393 — 46 of 61 frames; neighbro-1440 — 30 of 61, EN guest 059–061 unseen.

## Lead's checks

| Claim | Status |
|---|---|
| neighbro-1440 050: «отойти» label broken into «от / ой / ти» | VERIFIED — viewed `050-Аня-я.jpg` |
| neighbro-1440 001: language list in the right half, 4 items visible | VERIFIED — viewed `001-Аня-выбор_языка.jpg`; whether the list is cut or scrolls — NOT VERIFIED |
| sosed-393 044–048: player names break mid-word («Бори/с») | VERIFIED — viewed `045-Аня-партия_началась.jpg` |
| sosed-393: split button's right part clipped at the right edge | VERIFIED — viewed `024`, `045`: the second part's rim runs past the column |
| Everything else | NOT VERIFIED — agent claims |

## Raw — perfectionist, neighbro-1440

1. critical · 050-Аня-я.jpg · seen: "отойти" row label breaks into «от / ой / ти» over three lines because its long value ("перерыв: фразы снимутся, беседы подождут") squeezes the label column to near zero. Fix: label column `min-width:max-content; white-space:nowrap`; move the value text under the label or into a description line.
2. critical · 002, 059/060 (walk.txt `PAST-EDGE svg`) · seen: red house sticker cut off at the left edge; the two main splash buttons carry only an arrow and a key, no words; the only text action is a tiny underlined "Перенести личность сюда". Fix: keep stickers inside the canvas (inset ≥24px); put text labels on the buttons next to the icons.
3. critical · 001 · seen: language list shows only 4 of 17, starts at x≈720 and runs into the right edge with no margin; left half empty under the logo. Fix: centre a 440px column or give the list a right gutter; show all items or a scroll affordance.
4. defect · 006, 049 · seen: empty PIN fields have no visible field — just a label and "показать" over blank space; dots appear only after input. Fix: draw 6 empty slots or an underline, as in 057.
5. defect · 003/004 · seen: legal-links row is wider than the 440px form, sticks out ~75px right. Fix: wrap inside the column.
6. defect · 003–010 vs 049/057 · seen: two entry layouts — register bare form with the button under it; unlock/restore framed card with the button pinned ~600px below. Fix: one pattern (welded card, guess).
7. defect · 004/005 · seen: after "дальше" with age 12, 005 is pixel-identical to 004; reason in 50%-contrast grey above a disabled button. Fix: shake/focus the age field, reason in error colour.
8. defect · 011 · seen: title "Фразы рядом" below the example cards, steps 2–4 title under an icon mid-screen; ~40% empty above. Fix: one structure for all steps.
9. defect · 015/020/053/054 · seen: header mixes languages ("Rome · рядом десятки", "Limassol · здесь пока никого"); city input "Лимассол" vs suggestions "Limassol · CY", label above still "Rome". Fix: localized names or the typed name.
10. defect · 015 · seen: lone unlabeled icon circle at top-left of feed (x≈93). Fix: label/tooltip or fold into place bar.
11. defect · 020 · seen: "Ваша фраза вышла" is 9px grey with × overlapping the text; own card shows "0" while others show 1. Fix: proper toast; mark own card «вы».
12. defect · 017/018 · seen: mode and zone chips use different selected colours (red «один», blue «1 км»); «один» rotated; in 018 send enabled while the error shows; send is a 60px stub. Fix: one selected style, clear the error on edit, full-width send.
13. defect · 030/031 (also 040, 043, 046, 047, 053, 057) · seen: primary actions are distorted ellipses with shadows clipped at the bottom. Fix: fixed radius (height/2), not a percentage.
14. defect · 031 · seen: under "Ждём ответа" the chat input is already active. Fix: hide/disable until consent or say what typing does.
15. defect · 039 vs 042 · seen: created "поле 3×3", list says "поле 2×2"; board 3×3 dots = 2×2 boxes. Fix: one name.
16. defect · 029/034/050 · seen: inbox/me column at 456–1096, card/chat/table at 400–1040, feed/tables 136–1416 — column jumps 56px between tabs. Fix: centre every 640 column right of the rail.
17. polish · 029/038/042/054 · seen: content in the top-left corner, rest blank (single 200px table tile; empty state pinned left). Fix: centre empty states, column max-width.
18. polish · 029 ff. · seen: active rail item "разговоры" overflows its red pill. Fix: widen pill or shrink label.
19. polish · 046/047 · seen: board ~50px inside a 300px panel; legend floats right. Fix: scale board, legend under it.
20. polish · throughout · seen: helper text ~9px at half scale, grey on grey; contrast under 4.5:1 (guess); "ошибка: Код не подошёл." casing mix. Fix: darker secondary token, one casing.
21. polish · 040/043 · seen: "сказать" frame almost invisible with a lone icon button — third input style next to outlined (039) and sunken (003). Fix: one input component.

Flow: icon-only splash buttons hide start vs restore; invalid presses (005, 008) give no visible feedback; feed opens on identical seed phrases with no «you / say something» anchor, compose is a tiny pencil at the rail bottom; match pills carry only a chat icon and an hourglass; inbox offer row is a card but the conversation row is plain text; tables end state (047) shows the score but no winner banner; reopen (049) has a 600px dead zone above the button; place change carries Latin city names into RU UI.

Top-5: «от/ой/ти» (050); icon-only splash primaries + clipped sticker (002); language list right half and cut (001); squashed ellipse pills (030, 046, 053, 057); invisible empty PIN fields and two entry layouts (006 vs 049/057).

## Raw — perfectionist, sosed-393

1. 001 critical: language list shows 4 of 17 (Azərbaycanca…Ελληνικά), card ends there, no scroll cue; Ελληνικά regular while others bold. Fix: full list or browser-matched first with a "more" fade; one weight.
2. 002, 060 defect: «Начать» and «у меня есть бумажный код» icon-only (arrow, key); only the least important «Перенести личность сюда» has text. Fix: text labels.
3. 003, 004, 061 defect: «имя» label right under the header band; legal links break mid-word («пользовательск/ое соглашение», «конфиденциаль/ности»); consent sentence repeats the three links below it. Fix: ≥12px top padding, hyphens or shorter labels, «принимаю документы ниже».
4. 004, 005 defect: after «дальше» with age 12 the screen is pixel-identical. Fix: focus the age field, pulse its error.
5. 007, 008 defect: PIN field shows 5 dots for 6 digits (6th under «показать», guess); «внимание: этот ПИН легко угадать» clipped by the card bottom; footer still says «введите ПИН из 6 цифр и повторите его» on mismatch. Fix: reserve width for the toggle, let the card grow, footer echoes the real blocker.
6. 006, 009 polish: footer hint wraps an orphan word. Fix: shorten or `text-wrap: balance`.
7. 010 defect: «группы не сходятся» while the primary turns active; code font switches from bold sans in the plate to monospace in inputs. Fix: keep disabled until match; one code face.
8. 011 defect: wizard step 1 puts sample cards above the title, no subtitle; steps 2–4 differ. Fix: one template.
9. 015, 016, 020, 023 defect: grid cards put the person icon on its own line above «один · русский»; header «Rome · рядо…» truncated at 393. Fix: icon inline; shorter label.
10. 018 defect: composer send half-width, left-aligned; hint «сначала текст» under it (017). Fix: full-width, hint above.
11. 024, 025 defect: header has a circle (↓) next to a rounded rect (⋯), both touching the top edge; like/hide split's right segment clipped at the right edge; a blue card peeks under the red one unexplained; «Лайк»/«мэтч» vs the UI's «метка». Fix: one header button shape with 8px top margin, fix split width, «метка».
12. 029, 034, 038, 042, 050 defect: active tab pill too narrow for «разговоры». Fix: fit pill or smaller text.
13. 029 polish: inbox secondary line larger and bolder than the title. Fix: caption size.
14. 031 defect: «Ждём ответа» with an active input and send; phrase cards change style 030 (white) → 031 (beige, left accent). Fix: hide/disable input while waiting; one card style.
15. 035, 037 polish: info button has a stray beige halo; «на связи» floats unanchored. Fix: drop the halo; status under the name.
16. 044–048 critical: player names break mid-word in the score row («Бори/с», «Ан/я», «Бо/ри/с»). Fix: name cells `min-width:max-content`, shrink the status cell, or names on their own row.
17. 039 / 042 guess, defect: new-table form «поле 3×3», list and game 2×2. Check the log.
18. 050 defect: «я» tiles mix filled and outlined; «сменить ПИН» beige without border; «отойти» dark on purple, low contrast; tile heights vary leaving a hole; «Как это устроено» the only capitalised label. Fix: one tile style per type, ≥4.5:1, lowercase.
19. 051–053 polish: location buttons icon-only; suggestions Latin («Limassol · CY») for a Russian query. Fix: labels, localised suggestions.
20. 056, 057 defect: restore primary is an icon-only key on the left and back arrow on the right; back looks primary; «ошибка: Код не подошёл.» casing. Fix: text primary on the right, back as a quiet link.

Flow: icon-only primaries recur (splash, wizard, the table «→», new table, location, restore) — «→» means «start» in 040 and «join» in 043; form-error feedback inconsistent (silent 005/008, error with enabled button 010, disabled with hint 003); match side order flips between users, the game legend «В» means «вы» for both; the split button is clipped on the right in 024, 030, 033, 040, 043–048 — one component bug; the phrase card is orange in the feed and red-orange in the detail view.

Top-5: language list 4 of 17 without cue (001); names split on the scoreboard (044–048); icon-only primaries; split clipped at the right edge everywhere; silent/contradictory form feedback and 5 dots for 6 digits (007).

## Cuts into tasks (lead)

| # | Task | Level | Both brands? | Status |
|---|---|---|---|---|
| T1 | Split second part clipped at the right edge (feed card, match, tables) — one component | critical | sosed seen | FIXED: the rim moved to the capsule (styles.css); re-shot 045 shows a whole rim |
| T2 | Name / label cells break mid-word: scoreboard (sosed 044–048), «отойти» on «я» (neighbro 050) | critical | both | FIXED: seat cells keep their width, setting label ≥ its longest word (styles.css); re-shot 045, neighbro 050 |
| T3 | Language list: 4 of 17 visible, right half at 1440, one weight | critical | both | FIXED: own language first and ticked, bottom fade hints the scroll, 440 centred in the right half at 1440 (splash.css, Splash.tsx); re-shot 001. The weight of Ελληνικά is not addressed |
| T4 | Icon-only primaries (splash, restore, table, location) — product call: words or icons | defect | both | product decision |
| T5 | Silent / contradictory form feedback (005, 008, 010; send enabled with error 018) | defect | both | not verified |
| T6 | Pill radius as a percentage → ellipses (neighbro 030, 046, 053, 057) | defect | neighbro | not verified |
| T7 | «поле 3×3» vs «2×2» naming | defect | both | not verified |
| T8 | Latin city names in RU UI | defect | both | not verified |
| T9 | Column jumps between tabs at 1440; empty states pinned top-left | defect | neighbro | not verified |
| T10 | Active rail/tab pill too narrow for «разговоры» | polish | both | not verified |
| T11 | Chat input active while «Ждём ответа» | defect | both | product decision |
| T12 | Wizard step 1 template differs from 2–4 | defect | both | not verified |
