# Альтернативы Supabase для бэкенда (анализ, 2026-07)

Цель: уйти от «конского» ценника Supabase Cloud (3 окружения → по отдельному
Pro-проекту ≈ $45–75+/мес фиксировано, до usage) на что-то дешёвое сейчас, без
переписывания и с дорогой к realtime-приложению потом.

## TL;DR — рекомендация

1. **Немедленно и почти без боли:** self-host OSS Supabase на одном
   **Hetzner CX32 (~$8/мес, все 3 окружения через схемы)**. Клиентский SDK тот
   же — миграция ≈ смена `SUPABASE_URL`/ключей + прогон миграций. Realtime и
   Storage включаются позже без переписывания кода. Единственная цена — ops
   (бэкапы, апгрейды, TLS, SMTP), а ты Docker-беглый и уже гоняешь этот стек
   локально. **Это основной выбор.**
2. **Если хочется платить почти ноль, пока альфа спит:** сборка
   **Neon Free (Postgres + branching = 3 env) + Better-Auth (magic-link в своём
   бэкенде) + Bunny Storage (уже есть) + Deno Deploy (3 Deno-функции почти как
   есть) + Resend**. ~$0 в простое, ~$10–30 при 10k MAU. Минус — auth/realtime
   собираешь сам.
3. **Промежуточный шаг без ухода вообще:** свернуть 3 Supabase-проекта в
   **1 org + Branching** (~$25 + usage за ветки) — режет счёт сегодня, миграции ноль.

Cloudflare (Durable Objects) держим в уме как лучший realtime-примитив под
эфемерный чат — но это переписывание, туда идём только осознанно.

## Что реально используется сейчас (важно для выбора)

Сейчас (альфа/вейтлист) задействован мизер, а не «вся Supabase»:

- **Postgres:** 5 маленьких таблиц (`waitlist`, `panel_users`,
  `push_subscriptions`, `client_errors`, `app_config`). Данных — крохи.
- **Auth:** magic-link (email OTP) для входа в админку + проверка JWT. Пара админов.
- **RLS:** есть.
- **Edge Functions (Deno):** `invite-panel-user`, `send-waitlist-welcome`,
  `main` (JWT-gateway).
- **Web Push (VAPID):** подписки в Postgres.
- **Realtime и Storage — в коде НЕ используются.** Это планы под приложение
  (эфемерная лента + исчезающий чат + стикеры/картинки), не текущий факт.

Вывод: **дёшево нужно сейчас, а тяжёлый realtime/scale — потом.** За 3× Supabase
Pro сегодня платится в основном за воздух.

## Сводное сравнение

| Вариант | $/мес альфа (3 env) | $/мес ~10k MAU | Миграция (1–5) | Что теряем/получаем |
|---|---|---|---|---|
| **Self-host Supabase** (Hetzner CX32) | **~$8** | ~$18–55 (CX42/CCX) | **2** | Всё то же, SDK идентичен; цена — ops |
| **Composable** (Neon+Better-Auth+Bunny+Deno Deploy) | **~$0** | ~$10–30 | 3 | Postgres сохраняется, Deno-функции почти как есть; auth/realtime собираешь сам |
| **PocketBase** (1 VPS) | ~$5–15 | ~$10–40 | 4 | Один бинарь, realtime/auth/storage/админка внутри; но SQLite single-writer |
| **Cloudflare all-in** (Workers+D1+DO+R2) | **~$5** | ~$5–20 | 4 | Самый дешёвый пол, DO — лучший realtime под комнаты; но нет Postgres/RLS, всё руками |
| **Bunny consolidation** | ~$15–30 | ~$40–90 | 4 | Один вендор для stateless; но нет managed Postgres (Bunny DB = SQLite), бэкапы сам |
| **Appwrite** (self-host) | ~$0 + VPS | ~$20–60 | 3 | Ближе всех к паритету с Supabase среди FOSS, тяжелее PocketBase |
| Supabase Cloud (1 org + Branching) | ~$25 + ветки | ~$50–90 | 1 | Статус-кво дешевле, но всё ещё Supabase-ценник |
| Nhost / Convex / Firebase | $0–25 | $25–150 | 5 | Rewrite и/или сильный lock-in — мимо |

---

## 1. Self-host OSS Supabase (рекомендуемый)

Смысл: SDK Supabase байт-в-байт одинаков для Cloud и self-host, поэтому
**миграция в коде ≈ ноль** — меняешь `SUPABASE_URL` + anon/service-ключи и
прогоняешь свои SQL-миграции. Вся стоимость уходит в ops, не в деньги.

- Из официального `docker/docker-compose.yml` получаешь тот же набор: Postgres,
  GoTrue (auth), Realtime, Storage, Edge Functions (Deno), Studio, PostgREST.
  Твои будущие Realtime/Storage заработают без переписывания клиента.
- **Железо дёшево, ops — нет.** Hetzner CX32 (4 vCPU/8 ГБ, ~€6.8/$7.7) тянет
  весь стек для альфы; для ~10k MAU с Realtime — CX42 (8/16, ~€16.4) или CCX
  (~$30–55). Даже верх — заметно ниже $75 Cloud.
- Ты берёшь на себя: бэкапы, апгрейды, TLS, SMTP, ротацию секретов, скейл
  Realtime (авто-скейла нет). «Первый месяц самый тяжёлый», дальше ~1–2 ч/мес.
- **Coolify** снижает ops на ступень (деплой/апдейты/часть бэкапов), но он всё
  ещё public beta — прод доверять с оглядкой.
- **3 окружения без 3× цены:** dev/UAT/prod на одном боксе через отдельные
  схемы/базы или отдельные compose-стеки. Прод перед публичным запуском — на
  свой бокс.

**Вердикт:** один CX32 (~$8/мес, 3 env через схемы) под docker-compose (или
Coolify) — почти без правок кода, ~10× дешевле 3 Cloud-проектов, масштабируется
под будущие Realtime/Storage сменой тарифа бокса.

## 2. Composable — дешёвый serverless Postgres + отдельные кусочки

~$0 в простое альфы, потому что scale-to-zero.

**Postgres-хосты:** Neon (Free 0.5 ГБ, scale-to-zero, copy-on-write branching —
ветки = твои dev/UAT/prod без 3 платных инстансов) — лучший баланс. Prisma
Postgres — без cold-start (плюс для чата), но биллинг за операции + привязка к
ORM. Fly/Render/Railway — не scale-to-zero, для простаивающей альфы $18–38/мес
за воздух, мимо.

**Кусочки на замену остальному Supabase:**

| Нужда | Дешёвый вариант | $/мес |
|---|---|---|
| Auth (magic-link) | **Better-Auth** (TS-библиотека в своём бэке, на твоём Postgres) | $0 (+ письма) |
| Realtime лента+чат | Postgres LISTEN/NOTIFY (лента) + Ably free (6M сообщ/мес) | $0 на альфе |
| Storage | **Bunny Storage** — уже в стеке ($0.01/ГБ, CDN, без egress) | центы |
| Edge-функции | **Deno Deploy** free (1M req/мес, тот же Deno — код почти без правок) | $0 |
| Email | Resend (уже настроен) | $0 |

**Вердикт-комбо:** Neon + Better-Auth + Ably/LISTEN-NOTIFY + Bunny Storage +
Deno Deploy + Resend — ~$0 в простое, ~$10–30 при 10k MAU, без переписывания
Deno-функций. Минус — realtime и auth больше не делят auth-контекст БД
автоматически, это твой клей.

## 3. PocketBase — один бинарь

Один Go-бинарь: SQLite + realtime (SSE-подписки) + auth (вкл. OTP/magic-link) +
файловое хранилище + админка + хуки (Go/JS). Все 3 env на одном VPS за $4–5,
режет ~$75 Supabase до однозначных цифр.

- **Потолок — SQLite single-writer и отсутствие горизонтального скейла.** Чтение
  и realtime-fan-out тянут далеко, но тяжёлые конкурентные записи/удаления (а
  эфемерка = много удалений) упираются в `SQLITE_BUSY`. Ок для альфы и
  малого/среднего прода, жёсткий потолок при вирусном росте.
- Миграция с Postgres — переписывание в коллекции + RLS→API-правила (effort 4).

## 4. Cloudflare all-in — самый дешёвый пол, но rewrite

Workers ($5/мес аккаунт разблокирует D1+DO+R2+KV+Queues) + D1 (serverless SQLite)
+ Durable Objects (realtime WS) + R2 (storage, zero-egress).

- **Durable Objects — лучший realtime-примитив под твою эфемерку:** один DO на
  комнату/район, WS Hibernation, SQLite-в-DO под окно ~2 ч, TTL через alarms.
- **R2 zero-egress** — структурный выигрыш на раздаче картинок/стикеров.
- **Минусы:** нет Postgres (D1 = SQLite, нет RLS, другой диалект), лимит D1 10 ГБ
  и скромная запись; RLS → авторизация в коде Workers; auth → Better-Auth на
  Workers; 3 Deno-функции → Workers-рантайм (переписать). **Это rewrite (4/5),
  не миграция.** Один $5/мес реально покрывает dev+UAT+prod на альфе.

## 5. Bunny — консолидация на одном вендоре

Технически бэкенд **может** жить на Bunny: **Magic Containers** (Docker, GA,
persistent volumes с мар-2026) + **Edge Scripting** (Deno на эдже).

- **НО: managed Postgres на Bunny нет.** Bunny Database = managed **libSQL/SQLite**
  (preview), не Postgres/RLS. Значит Postgres либо self-host в контейнере
  (single-region, single-writer, бэкапы сам), либо внешний (Neon/…).
- **Edge Scripting отлично ложится на 3 Deno-функции** (тот же Deno/V8,
  $0.20/M req).
- **Цена ≈ как у Supabase, не выигрыш:** ~$15–30 альфа, ~$40–90 при 10k MAU,
  плюс больше ops. Обычный Hetzner VPS ($5–15) под твой docker-compose дешевле и
  проще, чем оркестрировать stateful-БД на Bunny.

**Вердикт:** консолидировать *stateless* (Edge Scripting для функций + Magic
Container под API/WS) — разумно; но Postgres всё равно снаружи или self-host, и
для соло-дева это больше возни, чем Supabase, при почти нулевой экономии.

---

## Как мигрировать (топ-вариант: self-host Supabase)

1. Поднять Hetzner CX32, поставить Docker + официальный Supabase
   `docker-compose` (или через Coolify).
2. Прогнать `db/migrations/*` на новый Postgres (у нас уже есть
   `deploy/apply-migrations-cloud.sh` — адаптировать URL).
3. Перенести секреты/JWT, настроить SMTP (Resend — уже есть) для magic-link.
4. Задеплоить 3 Edge Functions на self-host (`deploy-functions-cloud.sh`,
   сменить endpoint).
5. dev/UAT/prod — отдельные схемы/стеки на боксе; прод перед публикой — свой бокс.
6. Поменять `SUPABASE_URL`/ключи в конфиге лендингов и панели (dev → uat → prod),
   прогнать e2e (`run-landing-tests.sh`, `run-panel-tests.sh`).
7. Настроить бэкапы: `pg_dump` по cron в Bunny Storage + проверка восстановления.

Дешёвый нулевой шаг прямо сейчас, если не готов съезжать: свернуть 3 проекта в
1 org + Branching — сразу режет фикс-счёт без миграции.

## Источники

Собрано 2026-07-15 из документации и прайсингов вендоров: Supabase self-hosting/
branding/billing; Hetzner CX; Coolify; Nhost; PocketBase; Appwrite; Convex;
Firebase; Neon; Prisma Postgres; Xata; Nile; Railway; Render; Fly.io MPG;
Better-Auth; Logto; Zitadel; Ably; Soketi; Deno Deploy; Cloudflare Workers/D1/
Durable Objects/R2/KV/Queues; Bunny Magic Containers/Edge Scripting/Database;
Backblaze B2. Цифры для usage-биллинга (Neon/Prisma/CF/Bunny) — оценки по
опубликованным юнит-ставкам под наш крохотный профиль данных, не фикс-прайс.
