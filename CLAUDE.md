# Project Rules

- **Exercise what you build or claim. Reading the code is not a check.** Nothing
  is reported as working, done, or already-the-case unless it was run against the
  thing itself: the live URL, the deployed node, the registry, the database, the
  actual screen. A route read in a file, a checklist tick, an old note — each is a
  claim, and claims get measured before they are repeated. This rule exists
  because the opposite kept happening: prod was said to have no rate limit while
  it had one, a DNS cutover was listed as pending after it had happened, a panel
  URL was handed over with a `#` nobody had tried, and a screen shipped that no
  role could open.
- **A test that has never failed proves nothing.** After writing one, break the
  thing it guards and watch it go red with a legible message, then restore. A
  green suite whose failure mode was never seen is decoration.
- **Say what was verified and how, and say plainly what was not.** "Checked in the
  registry: both digests match" and "not exercised live" are both useful. "Should
  work" is not.

- Whenever working on any README in this project group (`xor.ad/README.md` / `README_RU.md`, `sosed.place/README.md` / `README_RU.md`, `neighbro.place/README.md` / `README_RU.md`), synchronize across all of them before finishing: keep the EN/RU pair of each file consistent with each other, and keep cross-references and shared facts (architecture, features, links between the three faces) consistent across all three repos.

<!-- global:begin sha=0c4406b6ef -->
## Экономия токенов (глобальный блок, правится в ~/.claude/templates/project-rules.md)

- Шумный вывод — только через `digest`: `… 2>&1 | digest <phpunit|phpstan|cs|compose|git|httplog|auto>`.
  Печатает ≤12 строк, полный текст кладёт в scratchpad и называет путь; подробности — `sed -n` по диапазону.
  Хук `guard-long-output.py` отказывает прогону тестов, логам и полному diff без `digest`/`tail`/файла.
- Механический шаг с машинной проверкой — `haiku-runner`; модуль по спецификации — `sonnet-runner`;
  готовый diff-план — `codex exec` через обёртку (навык `delegate`). Fable — безопасность, миграции, развилка без ответа; решения и ревью — Opus.
- Прогон дольше минуты — `run_in_background`, читать итог через `digest`, не файл целиком.
- Команда длиннее 300 символов или из 4+ звеньев без скрипта — отказ `guard-inline-command.py`:
  повторяемое — в `scripts/` или `~/.claude/scripts/bin/`, разовое — файл в scratchpad.
- Офлайн-ворота проекта — `.claude/gates.txt` (команда на строку, `watch:` — какие правки
  их запускают); после хода с правкой `gates-run.py` гонит их фоном, вердикт (rc на ворота)
  приходит со следующим промптом. Только офлайн-контейнеры — сети в фоне не бывает.
<!-- global:end -->
