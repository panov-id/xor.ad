# Деплой (runbook)

Переписан 29.07.2026 под текущую архитектуру. До этого документ описывал эпоху
Supabase Cloud: тот бэкенд из тракта вынесен, вместе с ним ушли скрипты
`deploy/*-cloud.sh`, `deploy/wizard.sh` и `deploy/deploy-cdn.sh`.

## Что где живёт

```
sosed.place / neighbro.place      статика на Bunny CDN (Storage + Pull Zone на домен)
xor.panov.id                      панель (Vite-сборка) там же, отдельной зоной
api.<фейс>                        узел relay на своих боксах, за Caddy
   └─ Postgres рядом с узлом      только управляющее состояние (ключи, бренды, квоты)
   └─ Bunny Storage               данные (заявки, просмотры, логи) и дампы базы
```

Витрины и панель — статика, собирается в CI и заливается в зону. Всё
динамическое идёт в **узел relay**, у него своя топология и свой регламент
релизов: `relay/SPEC_RU.md`, `relay/RELEASE_RU.md`, `relay/ARCHITECTURE_RU.md`.

## Три окружения

Имена окружений **расходятся** между GitHub и релеем — это не опечатка:

| GitHub Environment | Окружение релея | Витрины | Панель |
|---|---|---|---|
| `dev` | dev | dev.sosed.panov.id / dev.neighbro.panov.id | dev.xor.panov.id |
| `uat` | **staging** | uat.sosed.panov.id / uat.neighbro.panov.id | uat.xor.panov.id |
| `production` | prod | sosed.place / neighbro.place | xor.panov.id |

Пары `uat` ↔ `staging` держатся в одном месте — в описании входа
`.github/workflows/mint-publishable-key.yml`.

## Флоу веток

Канон: **`dayN` → `dev` → `main`.**

1. День работы идёт в своей ветке `dayN`, отведённой от предыдущей. Апстрим у неё
   не выставляется — ветка отслеживает только свой одноимённый remote-реф.
2. Готовое вливается в `dev` → push деплоит витрины и панель на **dev**.
3. `dev` → `main` → workflow `Deploy UAT` ставит **датированный тег**
   `vГГГГ.ММ.ДД-<sha7>`, пушит его и деплоит **этот тег** на uat.
4. Прод — только руками: Actions → `Deploy prod` → Run workflow, в поле `ref`
   указать тот тег, что уже проверен на uat.

Прод берёт **тег, а не ветку**: то, что смотрели на uat, и уезжает в бой, без
пересборки от «текущего main». Узел релея живёт по тому же принципу, но своими
образами — `relay/RELEASE_RU.md`.

## CI/CD

**Витрины (`sosed.place`, `neighbro.place`)** — по три workflow в каждом репо,
сборки нет, только генерация страниц и заливка:

| Workflow | Триггер | Что делает |
|---|---|---|
| `deploy-dev.yml` | push в `dev` | `deploy/deploy-landing.sh` с `LANDING_ENV=dev` |
| `deploy-uat.yml` | push в `main` | режет тег `vГГГГ.ММ.ДД-<sha7>` и деплоит его на uat |
| `deploy-prod.yml` | ручной запуск с тегом | тот же скрипт с `LANDING_ENV=prod` |

**Панель (`xor.ad`)** — `deploy-dev/uat/prod.yml` зовут общий `_deploy.yml`:
`npm ci && npm run build` в `panel/` с `VITE_RELAY_API_URL`, затем
`deploy/deploy-panel-ci.sh` в зону панели.

**Узел (`xor.ad`)** — `relay.yml`: тесты и сборка образов на push в любую ветку
и на тег `v*`, только по путям `relay/**`. Деплой узла делает визард, не CI.

**Ключи** — `mint-publishable-key.yml`: выпускает publishable-ключ бренду в
выбранном окружении, чтобы пароль зоны не покидал GitHub.

## Секреты (GitHub Environments)

В каждом репозитории три Environment (`dev`, `uat`, `production`), значения свои
на окружение.

**Витрины:** `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_API_KEY`, `BUNNY_PULL_ZONE_ID`,
`BUNNY_API_KEY`, `RELAY_API_URL`, `RELAY_PUBLISHABLE_KEY`. Только в
`production`: `ANALYTICS_ID` (GA4) и `SEARCH_CONSOLE_TOKEN`. На dev и uat
`ANALYTICS_ID` пуст намеренно — нет счётчика, нет и баннера согласия.
`SEARCH_CONSOLE_TOKEN` фактически не нужен: домены верифицированы TXT-записью в
DNS, а не meta-тегом.

**Панель (`xor.ad`):** `VITE_RELAY_API_URL`, `BUNNY_PANEL_STORAGE_ZONE`,
`BUNNY_PANEL_STORAGE_API_KEY`, `BUNNY_PANEL_PULL_ZONE_ID`, `BUNNY_API_KEY`.

Проставлять руками 3 репо × 3 окружения долго — есть помощник:

```bash
cp deploy/github-secrets.example.json deploy/github-secrets.json
# заполнить github_token и значения по всем repo/env
deploy/set-github-secrets.sh   # создаёт Environments и заливает секреты через API
```

`deploy/github-secrets.json` в gitignore. Токену нужны Environments (write) +
Secrets (write) на каждый репозиторий. Пустые значения пропускаются — можно
заполнять постепенно.

## Узел relay

Поднимается и катится визардом, не через Actions:

```bash
relay/wizard/run.sh status                            # что где стоит
relay/wizard/run.sh --node n1 deploy                  # dev/staging
relay/wizard/run.sh --node p1 --confirm-prod deploy   # prod
```

Флаги `--node` и `--confirm-prod` — глобальные, поэтому идут **до** подкоманды.
Подкоманды: `status`, `provision`, `configure`, `dns`, `pool`, `deploy`, `up`.

Прод-гейт: `--confirm-prod` **и** `image_tag` окружения должен быть
опубликованным GitHub Release — визард проверяет через API. Миграции едут в
образе и применяются до старта узла; визард ждёт готовности базы перед
миграцией. Инвентарь (`relay/wizard/inventory.toml`) в gitignore — отсюда
открытый вопрос `A9` в `open-work_RU.md`.

Бэкап базы: `backup-postgres.sh` разложен визардом на бокс и запускается
systemd-таймером; восстановление проверяется `scripts/verify-backup-restore.sh`.

**Фоновые задачи живут внутри узла.** Очередь — таблица `jobs` в той же базе;
воркер стартует вместе с узлом и без `DATABASE_URL` молча не запускается.
Сегодня в ней одна задача — уборка объектов просмотров старше 14 дней, которая
переназначает себя на завтра сама. Ручной прогон
`scripts/prune-pageviews-remote.sh` остался, но нужен только вне расписания.

**На окружении, которое уже работает,** перед первой уборкой надо один раз
свернуть накопленные объекты в дневные строки:
`tools/backfill_pageview_daily.ts` (сначала без флагов — покажет план, затем
`--apply`). Иначе панель покажет больше хранимых объектов, чем сосчитанных
просмотров. Инструмент пересобирает дни целиком, поэтому повторный запуск
сходится, а не удваивает.

## SPA-fallback для панели

Панель — SPA с клиентским роутингом. В её Pull Zone нужен
**Custom404FilePath → `/index.html`**, иначе прямой заход на `/waitlist` даст
404. Ставится `deploy/bunny-panel-spa-fallback.sh`.

## Кэш `config.js` витрин

`config.js` генерируется при деплое и **не является ассетом с хэшем в имени** —
его нельзя кэшировать как ассет. Адрес версионируется (`config.js?v=<build>`),
страница живёт минуты, edge rule укорачивает TTL: `deploy/bunny-config-cache-rule.sh`.
История вопроса — `A8` в `open-work_RU.md`.

## Смоук после деплоя

1. Витрина открывается, форма вейтлиста отвечает «Готово», заявка видна в панели
   на странице Waitlist под нужным брендом.
2. `config.js` отдаёт актуальный `RELAY_PUBLISHABLE_KEY`; в проде — ещё и GA4 ID.
3. `/health` узла отвечает; preflight с домена витрины отдаёт `x-api-key` в
   allow-headers; запрос без ключа получает 401 там, где `require_api_key=true`.
4. Панель открывается, вход по magic-link, видны Waitlist и логи.

Пункты 3–4 автоматизированы в `relay/test/smoke.sh`.

## Откат

- **Витрины и панель:** Bunny хранит только последний залитый набор, поэтому
  откат = запустить `Deploy prod` с предыдущим тегом.
- **Узел:** задеплоить предыдущий `:vX.Y.Z` на затронутом окружении.
- **База:** миграции только вперёд; для отката нужна обратная миграция либо
  восстановление из ночного дампа.

## Открытые вопросы

- `A9` — теги образов окружений живут вне истории (инвентарь в gitignore).
- Bunny Shield (рейтлимит) и капча — для будущего флоу публикации постов, в этот
  деплой не входят.
- Своя страница 404 упирается в Bunny: `ErrorPageCustomCode` относится к ошибкам
  origin, а не к 404 от storage (`D6`).
