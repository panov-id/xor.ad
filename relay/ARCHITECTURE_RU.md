# Архитектура: лендинги на relay-бэкенде

Как устроен бэкенд лендингов после перевода с Supabase на relay node-pool.
Актуально для **обоих брендов** (neighbro + sosed) и панели — Supabase полностью
выведен (2026-07-22).

## Обзор

Статика лендинга лежит на Bunny CDN. Форма (waitlist / client-error) больше не
ходит в Supabase — она бьёт в **relay**: пул одинаковых Deno-нод, которые
принимают заявку, кладут её в Bunny Storage и шлют welcome-письмо через Resend.

```
Пользователь ── статика с Bunny CDN
     │  fetch POST /waitlist  { email, brand:"neighbro", lang, accent, mode, ... }
     ▼
apiUrl (per env, из config.js):
   dev  → https://n1-dev.relay.panov.id       (нода n1, приватная)
   uat  → https://n1-staging.relay.panov.id   (нода n1, приватная)
   prod → https://api.relay.panov.id           (гео-record → нода p1, публичная)
     │  Caddy (TLS Let's Encrypt через DNS-01/Bunny) → reverse_proxy → Deno-нода
     ▼
  POST /waitlist ──┬─→ dedup по sha256(email) + запись в Bunny Storage
                   │      waitlist/<env>/<hash>.json
                   └─→ welcome через Resend (ключ аккаунта бренда,
                          from hello@neighbro.place; на dev вместо Resend — Mailpit)
  POST /client-error ─→ Bunny Storage: client-errors/<env>/<uuid>.json
  GET  /health, /metrics ─→ статус ноды / Prometheus-счётчики
```

## Компоненты

| Компонент | Роль |
|---|---|
| Bunny CDN (зоны `neighbro-dev/uat/prod`) | хостинг статики лендинга |
| relay node-pool (Deno) | бэкенд: `/waitlist`, `/client-error`, `/health`, `/metrics` (слот `/chat` — заглушка 501) |
| Caddy (на каждой ноде) | TLS (Let's Encrypt, DNS-01 через Bunny), маршрутизация по хостнейму |
| Bunny Storage (зона `sosed-waitlist-dev`) | лиды, просмотры, client-errors и серверные логи, разведены по арендатору и префиксу `tenants/<brand>/…/<env>/` |
| Postgres рядом с узлом (том на боксе) | управляющее состояние: ключи, бренды, квоты, очередь, идемпотентность, дневные агрегаты. Порт наружу не публикуется; без `DATABASE_URL` узел работает целиком на хранилище. См. `docs/state-decision_RU.md` |
| Resend (аккаунт на бренд) | welcome-письмо от домена бренда |
| Bunny DNS (зона `relay.panov.id`) | хостнеймы нод + гео-record `api.relay.panov.id` |
| GitHub Actions | сборка образов relay (build-once) + деплой лендинга по env |

## Ноды и окружения

| Env | Нода | Где | Доступ | Почта | Образ |
|-----|------|-----|--------|-------|-------|
| dev | n1-dev | Hetzner cpx22/nbg1 (IP в локальном inventory) | приватно (443 c whitelist-IP) | Mailpit | `relay-node:<sha>` |
| staging (=uat лендинга) | n1-staging | тот же бокс n1 | приватно | Resend | `relay-node:vX.Y.Z` |
| prod | p1-prod | Hetzner cpx22/nbg1 (IP в локальном inventory) | публично (443) | Resend | тот же `vX.Y.Z` |

Лендинг ↔ relay per env:
`dev.neighbro.panov.id → n1-dev`, `uat.neighbro.panov.id → n1-staging`,
`neighbro.place → api.relay.panov.id` (гео-record на p1).

`api.relay.panov.id` — общий публичный вход prod-пула; бренд определяется полем
`brand` (или по `source`) в теле запроса, ноды brand-agnostic (`sosed`+`neighbro`).

## Релиз (build-once, promote)

Один образ собирается один раз и промоутится dev → staging → prod без пересборки:

```
push dev ──CI──▶ relay-node:<sha>  → деплой dev
merge dev→main, tag vX.Y.Z ──CI──▶ relay-node:vX.Y.Z → деплой staging
опубликованный GitHub Release vX.Y.Z = approval → deploy --confirm-prod (тот же образ)
```

Инструмент — `relay/wizard` (Docker-лаунчпад): `provision → dns → configure/deploy`,
`pool` (добавить prod-ноду в гео-record). Ноды хардятся (key-only SSH, sudo-юзер
`deploy`, default-deny firewall).

## Что больше НЕ используется

| Было | Сейчас |
|---|---|
| Supabase как бэкенд лендинга | ❌ лендинг в Supabase не ходит |
| таблица `waitlist` (Supabase) | ❌ лиды → Bunny Storage |
| таблица `client_errors` (Supabase) | ❌ → relay `/client-error` |
| Edge Function `send-waitlist-welcome` | ❌ → welcome шлёт сама нода через Resend |
| Bunny proxy-зоны `api.dev/uat.neighbro.panov.id`, `api.neighbro.place` (→ Supabase) | ❌ удалены в Phase 4 |
| anon-ключ Supabase + заголовки `apikey`/`Authorization` в форме | ❌ не шлётся (relay гейтится по CORS) |
| PostgREST `/rest/v1/...` | ❌ → relay `/waitlist`, `/client-error` |
| `push_subscriptions` (Supabase) | ❌ push **отменён 07.08.2026** (`docs/pwa-push_RU.md`); инертный код и `supabaseUrl` убраны из лендингов в Phase 4, остатки и `vapidPublicKey` — 07.08.2026 |

## Решение: REST через Bunny, WebSocket напрямую

Принято 05.08.2026.

Прокси-зоны перед API уже были — и были **удалены** при переезде с Supabase (см.
«Что больше НЕ используется»). Возвращается не та конструкция: тогда зона
проксировала чужой бэкенд, сейчас она нужна ради того, чего одиночная нода не
умеет — поглощать поток до того, как он дойдёт до приложения.

**Почему вообще понадобилось.** У публичного `/waitlist` нет никакой защиты:
рейтлимита в узле нет, в Caddy нет, а суточная квота `lib/quota.ts` считается по
ключу, общему для всех посетителей. Бот, выжегший её за минуту, закрывает запись
всем на сутки. Внешнюю капчу мы не берём — это новый обработчик чужих IP ради
одной функции. Остаётся CDN, который у нас уже есть и уже наш обработчик.

**Схема адресов prod:**

    pool.relay.panov.id   A (гео) → ноды пула        ← origin, снаружи закрыт
    api.relay.panov.id    pull-зона Bunny            ← сюда бьют лендинги
    ws.relay.panov.id     A (гео) → ноды пула        ← чат, напрямую, когда появится

`apiUrl` в `config.js` не меняется: лендинги как звали `api.relay.panov.id`, так
и зовут. Меняется только то, что за этим именем — вместо A-записи pull-зона с
кэшем 0, а прежняя гео-запись переезжает под имя `pool`.

**Dev и uat не трогаем.** Они приватные, 443 открыт по whitelist-IP, публичного
потока туда нет. CDN там решал бы несуществующую задачу.

**WebSockets на Bunny не включаем.** Он их умеет, но берёт по минутам соединения
($0.235 за миллион), а чат — это постоянные соединения. Для него отдельное имя
`ws.`, прямо в пул. Решение пересмотреть, когда чат будет построен и появится
что считать.

**Без замка на origin схема бессмысленна.** Если `pool.relay.panov.id` останется
доступен снаружи, CDN обходится в одну строку. Поэтому одновременно:

- Caddy проверяет заголовок `X-Origin-Token`, Bunny добавляет его edge-правилом;
- файрвол пускает 443 только с edge-адресов Bunny (список из
  `https://api.bunny.net/system/edgeserverlist`, обновляется скриптом);
- узел доверяет `X-Real-IP` **только** при валидном токене — иначе заголовок
  подделывается и рейтлимит обходится подстановкой чужого адреса.

**Рейтлимит в узле остаётся** и после CDN: не дублирование, а последний рубеж.
CDN можно обойти, узел — нет, и только он знает, чей ключ и чей IP.


## Нюансы

- **Supabase полностью выведен** (2026-07-22): лендинги (neighbro + sosed) и панель
  (`xor.panov.id`) — всё на relay; оба Supabase-проекта удалены, api.* proxy-зоны и
  секреты вычищены. Данные до сноса — в бэкапе `supabase-backup-2026-07-22/`.
- **dev/uat relay приватные** — формы на `dev/uat.neighbro.panov.id` работают только
  с whitelist-IP. **prod (`neighbro.place`) публичный**.
- **Per-brand Resend**: у каждого бренда свой Resend-аккаунт (free-tier = 1 домен/аккаунт).
  neighbro заведён; **sosed — ещё нет** (его welcome даёт 401, waitlist при этом сохраняется).
- Один общий Bunny-стор `sosed-waitlist-dev` на все env, данные разведены по пути.

## Известные хвосты

- Метрика `relay_mail_total{result="sent"}` инкрементится даже при не-2xx от Resend.
- sosed: завести Resend-аккаунт (лендинг мигрирован; его welcome-письмо пока
  падает, waitlist при этом сохраняется).
