# DEPLOY TODAY — раннбук dev + uat (лендинги + панель)

Быстрый чеклист, чтобы поднять **dev** и **uat** за один заход. Прод — отдельно, позже.
Общая архитектура и детали — в `deployment_RU.md`. dev+uat делят **один** Supabase-проект.

## 0. Что должно быть создано (только вручную — аккаунты/ключи)
- [ ] **Bunny.net** — Account API Key (Dashboard → Account → API Key).
- [ ] **Supabase Cloud** — один проект (общий dev+uat); **Management token** (Account → Access Tokens) и **project ref** (Settings → API).
- [ ] **GitHub PAT** — Environments + Secrets (write) на `panov-id/{sosed.place, neighbro.place, xor.ad}`.
- [ ] **Namecheap** — Profile → Tools → **API Access: включить**; в whitelist добавить egress-IP хоста (узнать: `curl https://api.ipify.org`; на момент подготовки было `46.199.76.154`, может смениться если динамический).

## 1. Конфиг `deploy/.env.deploy` (gitignored)
```bash
cp deploy/.env.deploy.example deploy/.env.deploy
```
Заполнить минимум для dev+uat+панель:
```
SUPABASE_ACCESS_TOKEN=      # Supabase Management token
SUPABASE_PROJECT_REF=       # ref общего проекта
BUNNY_API_KEY=              # Bunny Account API key
GITHUB_TOKEN=               # PAT с доступом к 3 репо
NAMECHEAP_API_USER=
NAMECHEAP_API_KEY=
NAMECHEAP_USERNAME=         # обычно = API_USER
# NAMECHEAP_CLIENT_IP=      # пусто = автоопределение
```

## 2. Провижн окружений (визард, идемпотентно, в одноразовом контейнере)
```bash
deploy/run-wizard.sh dev      # миграции + Bunny-зоны (сайт+api.*+панель) + GitHub-секреты dev
deploy/run-wizard.sh uat      # то же для uat (тот же Supabase, другие зоны/хостнеймы)
```
Визард в конце печатает DNS-записи (CNAME → `<zone>.b-cdn.net`).

## 3. DNS на panov.id (Namecheap, безопасно: getHosts → merge → setHosts)
```bash
deploy/namecheap-dns.sh dev            # dry-run: показывает план
deploy/namecheap-dns.sh dev --apply    # применить
deploy/namecheap-dns.sh uat            # dry-run
deploy/namecheap-dns.sh uat --apply
```
Записи (dev; для uat — `uat` вместо `dev`):
```
dev.sosed.panov.id        → sosed-dev.b-cdn.net
api.dev.sosed.panov.id    → sosed-api-dev.b-cdn.net
dev.neighbro.panov.id     → neighbro-dev.b-cdn.net
api.dev.neighbro.panov.id → neighbro-api-dev.b-cdn.net
dev.xor.panov.id          → panel-dev.b-cdn.net
```

## 4. Руками в Bunny (API не покрывает красиво)
- [ ] Включить **SSL** (Let's Encrypt) на каждом custom-хостнейме (сайт, api.*, панель).
- [ ] Для `api.*`-прокси зон: **выключить кэш**, **Origin Host Header = `<ref>.supabase.co`**, включить **WebSockets** (Pull Zone → General) — для Supabase Realtime.
- [ ] Панель: **SMTP** в Supabase Auth для magic-link (иначе вход только через bootstrap-ссылку; на dev можно `deploy/bootstrap-admin-cloud.sh`).

## 5. Деплой файлов
CI зальёт по пушу в ветку окружения (секреты уже проставлены визардом):
```bash
# в каждом из 3 репо: обновить ветку dev текущим кодом и запушить
git checkout dev && git merge --ff-only day4 && git push origin dev   # → Deploy dev
```
UAT: мерж `dev → main` → авто-тег → `Deploy UAT`.
(Альтернатива без CI: `deploy/deploy-cdn.sh <sosed|neighbro|panel>` с заполненными в `.env.deploy` именами/ключами зон.)

## 6. Проверка
- [ ] `getent hosts dev.neighbro.panov.id` — резолвится на b-cdn.net.
- [ ] Открывается `https://dev.neighbro.panov.id` и `https://dev.sosed.panov.id` (TLS зелёный).
- [ ] Вейтлист: отправка email → успех; строка появилась в Supabase (`waitlist`).
- [ ] `https://dev.xor.panov.id` — панель грузится; вход через magic-link/bootstrap.
- [ ] Повторить для `uat.*`.

## Заметки
- Всё идемпотентно — повторный прогон визарда безопасен.
- `.env.deploy`, `github-secrets.json` — gitignored, в репозиторий не попадают.
- Секреты не вставлять в чат — только в `deploy/.env.deploy`.
