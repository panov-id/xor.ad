# Деплой (runbook)

Прод-архитектура: **фронтенды** (2 лендинга + сборка панели) на **Bunny CDN** (по отдельной Storage+Pull Zone на домен), **бэкенд** на **Supabase Cloud** (Postgres/Auth/Realtime/Storage/Edge Functions). Гейта nginx в проде нет — фронтенды ходят в Supabase Cloud напрямую (CORS), поэтому Supabase URL/ключ параметризованы по окружению.

Паттерн адаптирован из `noisen-app/infrastructure`.

## Три окружения (dev / UAT / prod)

Полная изоляция: у каждого окружения свой Supabase-проект и свои Bunny-зоны/поддомены.

| Окружение | Ветка/триггер | Домены | Supabase |
|-----------|---------------|--------|----------|
| **dev** | push в `dev` | `dev.sosed.place`, `dev.neighbro.place`, `dev.panel.xor.ad` | проект `xor-ad-dev` |
| **UAT** | push/мерж в `main` → авто-тег → деплой | `uat.sosed.place`, `uat.neighbro.place`, `uat.panel.xor.ad` | проект `xor-ad-uat` |
| **prod** | ручной запуск workflow с выбором тега | `sosed.place`, `neighbro.place`, `panel.xor.ad` | проект `xor-ad-prod` |

### Флоу продвижения

1. Работаешь в `dev` → каждый push деплоит на **dev** (`Deploy dev`).
2. Мержишь `dev` → `main` → workflow `Deploy UAT` ставит **авто-тег** `vГГГГ.ММ.ДД-<sha>`, пушит его и деплоит этот тег на **UAT**.
3. Проверяешь UAT. Если ок — запускаешь вручную `Deploy prod` (Actions → Run workflow) и **указываешь тег** релиза → деплой на **prod**.

### CI/CD (GitHub Actions, по workflow в каждом репо)

- **sosed.place / neighbro.place** — деплоят свой лендинг: `deploy-dev.yml`, `deploy-uat.yml` (авто-тег на `main`), `deploy-prod.yml` (dispatch с тегом). Сборки нет — статика.
- **xor.ad** — reusable `_deploy.yml` (сборка панели + миграции + Edge Functions), вызывается из `deploy-dev/uat/prod.yml`.

### Секреты (GitHub Environments: `dev`, `uat`, `production`)

В каждом репо создать три Environment и положить в них секреты (свои значения на окружение):

- **Лендинги (sosed/neighbro):** `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_API_KEY`, `BUNNY_PULL_ZONE_ID`, `BUNNY_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- **xor.ad (панель+бэкенд):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `BUNNY_PANEL_STORAGE_ZONE`, `BUNNY_PANEL_STORAGE_API_KEY`, `BUNNY_PANEL_PULL_ZONE_ID`, `BUNNY_API_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `PANEL_URL`.

Проставить всё это руками по 3 репо × 3 окружения долго — есть помощник:

```bash
cp deploy/github-secrets.example.json deploy/github-secrets.json
# заполнить github_token и значения по всем repo/env
deploy/set-github-secrets.sh   # создаёт Environments и заливает секреты через GitHub API
```

`deploy/github-secrets.json` в gitignore. Токену нужны права Environments (write) + Secrets (write) на каждый репо. Пустые значения пропускаются — можно заполнять постепенно.

### Визард для прод-лендингов

Одной командой поднять прод обеих витрин (Bunny-зоны + домены, миграции Supabase, GitHub prod-секреты) — интерактивно:

```bash
deploy/wizard.sh
# спросит: Bunny API key, Supabase Management token, prod project ref, GitHub token
```

Идемпотентно (существующее находит, не дублирует). В конце печатает DNS-записи и следующий шаг (мерж → тег → Deploy prod). SSL для доменов включить в панели Bunny вручную.

Ниже — ручной деплой теми же скриптами (для локального прогона/отладки одного окружения).

## Предварительно (делаешь ты — я не могу создать аккаунты/ключи)

1. **Bunny.net:** аккаунт, Account API Key (Account → API Key). Три Storage Zone + Pull Zone: под `sosed.place`, `neighbro.place`, `panel.xor.ad`. Для каждой Pull Zone привязать кастомный домен и включить TLS (Bunny выдаёт Let's Encrypt).
2. **Supabase:** Management API токен (Account → Access Tokens). Проект можно создать скриптом (ниже) или заранее в дашборде.
3. **DNS:** записи на `sosed.place`, `neighbro.place`, `panel.xor.ad` → на CNAME соответствующих Pull Zone.
4. **SMTP для входа в панель:** вход по magic-link требует SMTP в Supabase Auth (напр. Resend). Без него залогиниться нельзя — как временный обход, ссылку входа генерируют через Admin API (см. `scripts/bootstrap-admin.sh` для локали, аналогично для облака).

## Конфигурация

```bash
cp deploy/.env.deploy.example deploy/.env.deploy
# заполнить: SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, BUNNY_API_KEY,
# и по три BUNNY_<TARGET>_STORAGE_ZONE / _STORAGE_KEY / _PULL_ZONE_ID,
# плюс PANEL_URL / SOSED_URL / NEIGHBRO_URL.
```

`deploy/.env.deploy` в gitignore (реальные секреты).

## Бэкенд: Supabase Cloud

```bash
deploy/setup-supabase-cloud.sh       # создаёт/находит проект, пишет URL+ключи в .env.deploy
deploy/apply-migrations-cloud.sh     # db/migrations/*.sql через Management API
deploy/deploy-functions-cloud.sh     # Edge Function invite-panel-user + секрет SITE_URL
deploy/bootstrap-admin-cloud.sh ev.panov@gmail.com   # первый админ панели
```

Затем в Supabase Dashboard → Authentication:
- **Site URL** = `PANEL_URL` (напр. `https://panel.xor.ad`).
- **Redirect URLs** — добавить `PANEL_URL`.
- **SMTP** — подключить провайдера (Resend), иначе magic-link не отправляется.

## Фронтенд: панель (Vite build)

```bash
cp panel/.env.production.example panel/.env.production
# вписать VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (из deploy/.env.deploy)
```

## Деплой на Bunny

```bash
deploy/deploy-all.sh          # сборка панели + заливка всех трёх целей
# либо по одной:
deploy/build-panel.sh
deploy/deploy-cdn.sh sosed
deploy/deploy-cdn.sh neighbro
deploy/deploy-cdn.sh panel
```

Для лендингов `config.js` генерируется на этапе деплоя и указывает на Supabase Cloud (закоммиченный `config.js` остаётся локальным same-origin). Панель собирается с прод-URL из `.env.production`.

## SPA-fallback для панели (важно)

Панель — SPA с клиентским роутингом (react-router). В Bunny Pull Zone панели включить **Error Pages → 404 → `/index.html` со статусом 200** (или Origin/Edge Rule), иначе прямой заход на `/waitlist` даст 404.

## Smoke-тест после деплоя

1. Открыть `https://sosed.place` и `https://neighbro.place`, отправить почту в вейтлист → «Готово», строка появляется в Supabase (`waitlist`).
2. Открыть `https://panel.xor.ad` → войти админом (magic-link при настроенном SMTP), увидеть вейтлист и пользователей панели.

## Откат

Bunny хранит только последний загруженный набор. Откат = задеплоить предыдущий коммит: `git checkout <prev> && deploy/deploy-cdn.sh <target>`. Бэкенд — миграции только вперёд; для отката нужна обратная миграция.

## Открытые вопросы

- SMTP-провайдер не выбран (Resend отложен) — без него вход в панель только через Admin-API-ссылку.
- Инфраструктуру (3 Supabase-проекта, 9 Bunny-зон, поддомены, DNS/TLS, GitHub Environments + секреты) нужно поднять руками — скрипты и workflow готовы, но ресурсы создаёшь ты.
- Bunny Shield (рейтлимит) и Cloudflare Turnstile (капча) — для флоу публикации постов, не входят в этот деплой.
