# relay — спецификация

Слой **relay** — децентрализованный пул одинаковых нод (BFF / edge-ярус) для
соседских фейсов. Сейчас обслуживает лендинги (waitlist, welcome-письмо) и заложен
под будущий децентрализованный чат.

Сопутствующее: `RELEASE_{EN,RU}.md` (регламент релизов/промоушена), `README*`
(быстрый старт), `../docs/chat-decentralized-ideas_*` (будущий чат).

## 1. Топология

```
<face>.place (фронт на Bunny CDN)
   └─ api.<face>            вход = BFF  (ноды relay)
         └─ [app-логика] → ядро на xor.panov.id     (будущее: чат/app; для лендинга нет)
```

- Одна нода relay обслуживает **все бренды/фейсы** (sosed, neighbro, …). Бренд
  определяется по `source` заявки (или явному `brand`).
- Для **лендинга** нода **терминальна**: `/waitlist` пишет в storage + шлёт
  welcome; к ядру не ходит. Стрелка `→ ядро` включается с app/чатом.
- Публичный вход по фейсу+env: `api.dev.<face>` / `api.staging.<face>` (приватно) и
  `api.<face>.place` (prod). На **cutover** они указывают на пул (сейчас ноды на
  своих `n1-<env>.relay.panov.id` за вайтлистом).

## 2. Окружения и доступ

| Env | Где | Доступ | TLS | Почта | Тег образа |
|-----|-----|--------|-----|-------|------------|
| **dev** | общие боксы, мульти-стенд | приватно (вайтлист 443+22) | DNS-01 | Mailpit | `dev`/sha ветки |
| **staging** | те же боксы, свой стек | приватно (вайтлист) | DNS-01 | Resend | релиз `vX.Y.Z` |
| **prod** | свои боксы | публично 443 + гео-стиринг `api.<face>` | DNS-01 | Resend | тот же `vX.Y.Z` |

- **dev + staging — мульти-стенд** на ОДНИХ боксах: на боксе по контейнеру-ноде на
  env + общий Caddy, роутящий по hostname `<box>-<env>.relay.panov.id`.
- **Приватно** = файрвол default-deny; открыты только 443 (из `whitelist_ips`
  каждого env) и 22 (из `ssh_whitelist` + IP, с которого подключился визард). Порт
  80 не открывается → TLS через ACME **DNS-01 (Bunny)**.
- **prod** публичен на 443 (боевой трафик) на своих боксах; тот же SSH-хардненинг.

## 3. Компоненты (на бокс)

Генерируются визардом, запускаются `docker compose`:

- **node** (`relay-node`) — Deno-приложение, по контейнеру на env-стек.
- **caddy** (`relay-caddy`) — общий, терминирует TLS (DNS-01 через плагин
  `caddy-dns/bunny`), роутит по hostname на нужную ноду.
- **mailpit** — dev (env с `mail=mailpit`): ловит welcome-письма; UI на
  `mail-<box>.relay.panov.id`.
- **dozzle** — живые логи контейнеров в браузере на `logs-<box>.relay.panov.id`.

Всё за одним вайтлистом + DNS-01 TLS.

## 4. Нода

Stateless Deno-сервис. Образ одинаковый везде, различается только per-env `.env`.

| Эндпоинт | Назначение |
|---|---|
| `GET /health` | liveness/readiness (env, транспорты storage/mail, бренды) |
| `GET /metrics` | Prometheus-счётчики (requests/waitlist/mail) |
| `POST /waitlist` | валидация → дедуп+запись → per-brand welcome-письмо |
| `POST /client-error` | fire-and-forget сток ошибок |
| `GET /chat` | заглушка `501` (будущий чат-релей) |

- **Наблюдаемость**: структурные **JSON-логи** (level/msg/поля, node, env, request
  id) и `x-request-id` в каждом ответе; **`GET /metrics`** отдаёт Prometheus-счётчики
  (`relay_requests_total`, `relay_waitlist_total`, `relay_mail_total`). Централизованная
  отгрузка (Grafana/Loki/Prometheus) — в роадмапе, см. `HARDENING`.

- **Storage-транспорт** (`STORAGE_TRANSPORT`): `bunny` (Bunny Storage, объект
  `waitlist/<env>/<sha256(email)>.json`) или `fs` (примонтированная папка — локалка).
  Дедуп = ключ по хешу email → PUT идемпотентен.
- **Mail-транспорт** (`MAIL_TRANSPORT`): `resend` (боевой) / `smtp` (Mailpit на
  dev/local) / `none`.
- **Welcome-письмо**: брутализм, локализация на **16 языков** (en/ru/fr/de/es/el/
  uk/be/kk/ka/hy/az/uz/ky/tg/ro; неизвестный → en), акцент + светлая/тёмная тема.

## 5. Бренды (мультибренд)

- **Реестр брендов** (`config.brands`): каждый = `{key, name, upper, domain, from,
  match}`.
- По умолчанию — **sosed + neighbro**. Добавить ещё (напр. азиатский) через env
  **`BRANDS`** (JSON-массив) — **без правок кода**.
- `resolveBrand(source|host)` матчит по `match`-списку каждого бренда, фолбэк на
  первый (основной). Тема/тело/отправитель — per brand; шаблоны бренд-независимы
  (токен бренда подменяется при рендере).

## 6. DNS

- Bunny DNS-зона **`relay.panov.id`** (делегирована с Namecheap: `relay` NS →
  Bunny). Держит записи узлов.
- На (box, env): `<box>-<env>.relay.panov.id` → IP бокса. Плюс `logs-<box>` и
  `mail-<box>`.
- **DNS-01 через Bunny** выпускает TLS при закрытых портах (публичный 80 не нужен).
- **prod** команда `pool` добавляет бокс в гео-стиринг `api.<face>` (A +
  geolocation) — это cutover.

## 7. Образы и реестр

- Собираются в CI → **ghcr.io/panov-id/relay-node**, **relay-caddy**. Боксы делают
  `docker compose pull` (без сборки на боксе → бережём 1 ГБ free-VM + xcaddy).
- **Мультиарх:** `linux/amd64` + `linux/arm64` (боксы бывают ARM и x86).
- **Supply chain:** SBOM + SLSA-provenance, **cosign** keyless-подпись, **Trivy**-скан
  (см. `HARDENING`); зависимости зафиксированы через `deno.lock`.
- Теги: `:<sha>` + `:<branch>` при push, `:vX.Y.Z` при теге `v*`. **Без `:latest`.**
- Per-env **`image_tag`** в инвентаре пинит, что крутит каждый env.
- **Приватные пакеты:** визард логинит бокс в ghcr (`GHCR_TOKEN`, read:packages)
  перед pull. Если пакеты публичные — токен не нужен (в образе секретов нет,
  конфиг приходит через env в рантайме).

## 8. Провижн и визард

Python-визард, запуск в Docker-launchpad (`run.sh`). Инвентарь = `[pool]` +
`[env.*]` + `[[box]]`; секреты в `secrets.env`.

- **Режимы бокса:** `provision` (создать VM через API — Hetzner/Vultr/DigitalOcean)
  или `configure` (бокс сделан руками — Oracle/GCP free VM: вписать `ssh_host`).
- **Команды:** `status` · `provision` · `dns` · `configure` · `deploy` · `pool`
  · `up` (= provision → dns → configure).
- **configure** = хардненинг SSH (только ключ, без root, без пароля) + файрвол
  default-deny (вайтлист) + Docker + ghcr-login (если приватно) + генерация и
  запись `docker-compose.yml`/`Caddyfile`/per-env `.env` + `pull` + `up` + `/health`.
- **Секреты** (env визарда): `HETZNER_TOKEN`/`VULTR_API_KEY`/`DIGITALOCEAN_TOKEN`,
  `SSH_PUBLIC_KEY`, `BUNNY_API_KEY`, `BUNNY_STORAGE_ZONE/KEY`, `RESEND_API_KEY`,
  `GHCR_TOKEN?`, `WELCOME_FROM?` (глобальный override отправителя — по умолчанию
  выкл), `BRANDS?`.

## 9. Безопасность

- **Файрвол default-deny** на боксе; открыты только вайтлист-443/22, порт 80 не
  открывается.
- **SSH захардненен:** `PasswordAuthentication no`, `PermitRootLogin no`, только
  ключ — используй **ключ с passphrase**. Доступ только с whitelist-IP (+ IP
  визарда авто-разрешён, чтобы не залочиться).
- **Prod-гейт:** деплой публичного (prod) бокса требует `--confirm-prod` И чтобы
  `image_tag` env был **опубликованным GitHub Release** — визард проверяет через
  API. Публикация релиза = approve.
- Заметки/долги: `BUNNY_API_KEY` для DNS-01 на боксах — account-wide (подумать о
  scoped-ключе); rate-limit prod `/waitlist`; health-monitor гео-пула.

## 10. Релизы и промоушен

Build-once-promote — см. `RELEASE_{EN,RU}.md`. Кратко: dev крутит sha ветки
(авто); релиз = ручной тег `vX.Y.Z`, собранный **один раз**; тот же образ идёт
staging → prod; prod за гейтом **опубликованного релиза** + `--confirm-prod`;
откат = предыдущий `vX.Y.Z`.

## 11. Тесты и CI

- **Юниты** (`node/`, `deno test`): email/дедуп, welcome по 16 языкам,
  `resolveBrand`/мультибренд.
- **Интеграция** (`test/integration.sh`): локальный стенд → `/waitlist` → fs
  storage + Mailpit + дедуп.
- **Смоук** (`test/smoke.sh`): пост-деплой `/health` + синтетический `/waitlist`
  (для приватных env — с whitelisted-хоста).
- **CI** (`.github/workflows/relay.yml`): тесты → build+push образов, на изменения
  `relay/**`.

## 12. Локальный стенд

`local/` — самодостаточный: node (fs storage, почта → Mailpit) + Mailpit + Dozzle.
`docker compose up`; node `:8081`, Mailpit `:8025`, Dozzle `:8090`; waitlist-JSON
в `./data`.

## 13. Runbook (частые операции)

- **Добавить бокс:** `[[box]]` в инвентарь → `./run.sh up --node <id>`.
- **Добавить бренд (напр. азиатский):** `BRANDS` в `secrets.env` (полный JSON, вкл.
  sosed+neighbro+новый) → `./run.sh deploy`. Без кода.
- **Деплой dev:** push в `dev` → CI собирает `:dev` → `./run.sh deploy` (или `up`).
- **Срезать релиз:** merge `dev`→`main`, тег `vX.Y.Z` + опубликовать GitHub Release
  → CI собирает `:vX.Y.Z`.
- **Промоут staging→prod:** поднять `env.prod.image_tag` до `vX.Y.Z` →
  `./run.sh deploy --node <prod> --confirm-prod`.
- **Откат:** `image_tag` env → предыдущий `vX.Y.Z` → `deploy`.
- **Логи:** `logs-<box>.relay.panov.id`. **Пойманная почта (dev):**
  `mail-<box>.relay.panov.id`.

## 14. Открыто / в долгах

Health-monitor гео-пула (prod), scoped Bunny-ключ vs account-wide на боксах,
rate-limit prod `/waitlist`, опц. self-hosted-раннер + кнопка GitHub-Environment.
Полный приоритизированный enterprise-роадмап (централизованная наблюдаемость,
гигиена секретов, GDPR/PII, IaC, progressive delivery, DR, трейсинг) — в `HARDENING`.
