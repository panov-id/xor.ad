# edge-nodes

Децентрализованный пул одинаковых Deno-нод на нескольких VPS-провайдерах/регионах,
перед пулом — Bunny DNS geo-steering. v1 обслуживает **бэкенд лендинга** (waitlist,
сток клиентских ошибок, welcome-письмо); структура **готова под чат** (заглушка
WS-relay) для будущего децентрализованного чата.

> Подготовительный слой. Боевой лендинг живёт на текущем бэкенде, пока пул не
> готов и не проверен — переезд (cutover) отдельный осознанный шаг.

## Структура

```
edge-nodes/
  node/          одинаковый Deno-образ (нода)
    src/main.ts          HTTP-сервер + роутер
    src/routes/          health · waitlist · client-error
    src/lib/             storage (Bunny) · resend · cors · http · hash
    src/chat/relay.ts    слот WS-relay под чат (заглушка, отдаёт 501)
    Dockerfile
  compose/       что крутится на VPS: нода + Caddy (авто-TLS)
    docker-compose.yml · Caddyfile · node.env.example
  wizard/        Python-визард пула (запуск в Docker-launchpad)
    wizard.py · inventory.example.toml · Dockerfile · run.sh
```

## Нода — что делает (v1)

| Эндпоинт | Назначение |
|---|---|
| `GET /health` | liveness/readiness для балансера |
| `POST /waitlist` | валидация → дедуп+запись в Bunny Storage → welcome через Resend |
| `POST /client-error` | fire-and-forget сток клиентских ошибок (Bunny Storage) |
| `GET /chat` | заглушка → `501`, пока не приедет чат |

Stateless: единственное долговременное состояние — в **Bunny Storage** (объект на
запись, ключ = hash(email) → идемпотентный дедуп). Образ одинаковый везде,
различается только `node.env`.

### Запуск ноды локально
```bash
cd node
BUNNY_STORAGE_ZONE=... BUNNY_STORAGE_KEY=... RESEND_API_KEY=... \
  deno task dev
# GET http://localhost:8080/health
```

## Визард

Запускается в Docker (на хосте ничего не ставим). Скопируй
`wizard/inventory.example.toml` → `inventory.toml` и заполни.
```bash
cd wizard
./run.sh status                 # показать пул
./run.sh up --node dev          # provision? -> dns -> configure (полный bring-up)
./run.sh deploy                 # rolling: пере-заливка + пересборка каждого узла, проверка /health
./run.sh pool --node dev        # CUTOVER: добавить узлы в гео-стиринг api.<face>
```
Команды: `status` · `provision` · `configure` · `dns` · `pool` · `deploy` · `up`.
Режим ноды (в инвентаре): `provision` (создать VPS через API) или `configure`
(уже купленный бокс — IP+SSH). Секреты — из окружения визарда: `BUNNY_API_KEY`,
`BUNNY_STORAGE_*`, `RESEND_API_KEY`,
`HETZNER_TOKEN`/`VULTR_API_KEY`/`DIGITALOCEAN_TOKEN`, `SSH_PUBLIC_KEY`.

## Балансер и переезд

Bunny DNS geo-steer'ит hostname пула (`api.<face>`) на ближайший живой узел. На
подготовке ноды на своих hostname'ах (`n1.…`, `n2.…`), а живой `api.*` остаётся
на текущем бэкенде. **Cutover** = направить `api.sosed.place` /
`api.neighbro.place` на пул и переключить конфиг лендинга.

## Безопасность (база)

Firewall на узле (22/80/443), только SSH-ключи, fail2ban, автообновления;
секреты только через env (никогда в образе); TLS Caddy на каждом узле. Модель
угроз чата (недоверенные community-ноды → E2E, релеи только шифра) — в
`../docs/chat-decentralized-ideas_RU.md`.

## Статус

Нода рабочая (типы ок, `/health` отдаёт 200). Визард реализует `provision`
(Hetzner/Vultr/DO), `configure` (SSH-бутстрап), `dns` + `pool` (Bunny), `deploy`
(rolling), `up` (provision → dns → configure). Осталось: портировать
локализованные welcome-шаблоны в `node/src/lib/resend.ts` и реальный прогон на
живых боксах/токенах. Живой лендинг не трогаем до cutover.
