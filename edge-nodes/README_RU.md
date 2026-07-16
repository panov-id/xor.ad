# edge-nodes

Децентрализованный пул одинаковых Deno-нод на нескольких VPS-провайдерах/регионах.
**dev + uat крутятся мульти-стендом на общих боксах и ПРИВАТНЫ** (доступ только с
whitelist-IP); **prod** — на своих боксах, публичный (гео-стиринг через Bunny DNS).
v1 обслуживает бэкенд лендинга (waitlist, client-error, welcome-письмо); заглушка
WS-relay держит ноду готовой под чат.

> Подготовительный слой — живой лендинг на текущем бэкенде до cutover.

## Структура

```
edge-nodes/
  node/          одинаковый Deno-образ ноды (роуты: health · waitlist · client-error; слот чата)
  caddy/         образ Caddy с модулем Bunny DNS (TLS через ACME DNS-01)
  wizard/        Python-визард (Docker-launchpad) — генерирует для каждого бокса
                 docker-compose.yml + Caddyfile + per-env .env из инвентаря
```

## Окружения и доступ

| Env | Где | Доступ | TLS | SSH |
|-----|-----|--------|-----|-----|
| **dev** | общие боксы (мульти-стенд) | приватно — 443+22 только с `whitelist_ips` | DNS-01 | только ключ, без root, вайтлист |
| **uat** | те же боксы (свой стек) | приватно — вайтлист | DNS-01 | так же |
| **prod** | свои боксы | публично 443 + гео-стиринг `api.pool` | DNS-01 | так же |

Каждый бокс крутит по одному контейнеру-ноде на env + общий Caddy, роутящий по
hostname `<box>-<env>.<dns_zone>` (напр. `n1-dev.pool.panov.id`). Приватные env
берут ACME **DNS-01 через Bunny** — публичный порт 80 не нужен, файрвол закрыт.

**Логи и почта (на бокс, за вайтлистом):** **Dozzle** на `logs-<box>.<zone>`
(живые логи контейнеров в браузере); **Mailpit** на `mail-<box>.<zone>` для env
с `mail = "mailpit"` (ловит welcome-письма вместо отправки — dev так; uat/prod
шлют через Resend).

Локально — `local/` самодостаточный стенд (node + Mailpit + Dozzle, fs storage):
`cd local && docker compose up`; см. `local/README.md`.

## Нода — v1 эндпоинты

| Эндпоинт | Назначение |
|---|---|
| `GET /health` | liveness/readiness |
| `POST /waitlist` | валидация → дедуп+запись в Bunny Storage → welcome через Resend |
| `POST /client-error` | fire-and-forget сток ошибок |
| `GET /chat` | заглушка → `501`, пока не приедет чат |

Stateless: единственное состояние — в **Bunny Storage** (`waitlist/<env>/<hash>.json`).
Образ одинаковый везде, различается только per-env `.env`.

## Визард

Запуск в Docker. Скопируй `wizard/inventory.example.toml` → `inventory.toml`;
секреты — в `secrets.env` (`export SECRETS_ENV=…`).

```bash
cd wizard
./run.sh status                 # боксы + их env-стеки
./run.sh up --node n1           # provision? → dns → configure (все env-стеки бокса)
./run.sh deploy                 # rolling: пере-заливка + пересборка, проверка /health
./run.sh pool                   # CUTOVER (только prod): в гео-стиринг api.pool
```
Команды: `status` · `provision` · `configure` · `dns` · `pool` · `deploy` · `up`.
Режим бокса (в инвентаре): `provision` (создать VM через API — Hetzner/Vultr/DO)
или `configure` (бокс сделан руками — Oracle/GCP free VM: впиши `ssh_host`).

Секреты (окружение визарда): `BUNNY_API_KEY`, `BUNNY_STORAGE_ZONE/KEY`,
`RESEND_API_KEY`, `WELCOME_FROM?`,
`HETZNER_TOKEN`/`VULTR_API_KEY`/`DIGITALOCEAN_TOKEN`, `SSH_PUBLIC_KEY`.

## Безопасность

- **Файрвол default-deny.** `configure` открывает только 22 (из `ssh_whitelist` +
  IP, с которого подключился) и 443 (из `whitelist_ips` каждого приватного env;
  публичные env открывают 443 в мир). Остальное закрыто. Порт 80 не открывается.
- **SSH захардненен:** `PasswordAuthentication no`, `PermitRootLogin no`, только
  ключ — используй ключ с passphrase.
- **TLS:** DNS-01 через Bunny — cert выпускается при закрытых портах.
- Модель угроз чата (недоверенные community-релеи → E2E) — см.
  `../docs/chat-decentralized-ideas_RU.md`.

## Статус

Нода рабочая (типы ок, `/health` 200). Визард реализует приватную мульти-стенд
модель: `provision` (Hetzner/Vultr/DO), `dns` (per-env записи Bunny), `configure`
(хардненинг ssh + вайтлист-файрвол + генерация compose/Caddyfile + DNS-01 TLS +
все env-стеки), `deploy` (rolling), `pool` (prod cutover), `up`. Осталось:
реальный прогон на живых боксах/токенах; потом uat/prod. Живой лендинг не тронут
до cutover.
