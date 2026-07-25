# Панель: ролевая модель и просмотр логов — чеклист

Задача: показать логи в панели XOR. Право на логи требует ролевой модели, поэтому
ролевая модель делается первой — как самодостаточное ядро, переносимое копированием
каталога в другой проект, без отдельного репозитория и без workspace-пакета.

## Принятые решения

| Решение | Выбор |
| --- | --- |
| Модель прав | RBAC: карта `роль → пермишены` живёт в коде; у пользователя только роль. `PanelUser` не меняется |
| Форма модуля | Самодостаточный каталог `access/` — чистый TypeScript, ноль импортов за пределы каталога |
| Адаптеры | Живут снаружи ядра: relay (JWT → subject, guard), панель (Refine `accessControlProvider`) |
| Логи | Все три источника, поэтапно: client-errors → audit → серверные логи relay |

## Отправная точка (что есть сейчас)

- `relay/node/src/lib/auth.ts` — `type Role = "admin" \| "moderator"`, `authed(req, minRole?)`
  умеет только `minRole === "admin"`.
- `relay/node/src/routes/admin.ts:22` — `guard(req, admin = false)`: бинарная проверка
  «админ / не админ», повторяется в каждом роуте.
- `relay/node/src/lib/log.ts` — структурный JSON-лог в stdout, никуда не сохраняется.
- `relay/node/src/routes/client_error.ts` — уже пишет `client-errors/<env>/*.json`
  в Bunny Storage. Читателя нет.
- `panel/src/providers/auth.ts` — `getPermissions()` возвращает строку роли.
- `panel/src/App.tsx` — Refine без `accessControlProvider`.

---

## Этап 1. Ядро `access/` — ✅ сделано

Итог: `relay/node/src/access/` (4 файла + README), `relay/node/test/access.test.ts`
(7 тестов), `scripts/run-relay-tests.sh`. `deno check` + 17 тестов зелёные.

**1.1** Создать `relay/node/src/access/` — источник истины. Ноль импортов наружу,
никакого знания о Bunny Storage, HTTP, Refine.

```
relay/node/src/access/
  permissions.ts   # каталог пермишенов + тип Permission
  roles.ts         # ROLE_PERMISSIONS: Record<Role, readonly Permission[]>
  can.ts           # can(subject, permission) + permissionsOf(role)
  index.ts         # публичная поверхность
  README.md        # как перенести каталог в другой проект
```

**1.2** `permissions.ts` — плоский каталог с полными словами, без сокращений:

```ts
// Каталог пермишенов панели. Строки стабильны: они попадают в JWT-сессии
// и в проверки на клиенте, поэтому переименование = миграция.
export const PERMISSIONS = [
  "waitlist.read",
  "panel_users.read",
  "panel_users.write",
  "logs.client_errors.read",
  "logs.audit.read",
  "logs.server.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
```

**1.3** `roles.ts` — карта ролей. `"*"` = все пермишены:

```ts
import type { Permission } from "./permissions.ts";

export const ROLES = ["admin", "moderator", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly (Permission | "*")[]> = {
  admin: ["*"],
  moderator: ["waitlist.read", "panel_users.read", "logs.client_errors.read", "logs.audit.read"],
  viewer: ["waitlist.read"],
};
```

**1.4** `can.ts` — единственное место, где решается вопрос «можно или нет»:

```ts
import { PERMISSIONS, type Permission } from "./permissions.ts";
import { ROLE_PERMISSIONS, type Role } from "./roles.ts";

export interface AccessSubject {
  role: Role;
}

export function permissionsOf(role: Role): readonly Permission[] {
  const granted = ROLE_PERMISSIONS[role] ?? [];
  return granted.includes("*") ? PERMISSIONS : (granted as readonly Permission[]);
}

export function can(subject: AccessSubject | null, permission: Permission): boolean {
  if (!subject) return false;
  return permissionsOf(subject.role).includes(permission);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && value in ROLE_PERMISSIONS;
}
```

**1.5** `index.ts` — реэкспорт `PERMISSIONS`, `Permission`, `ROLES`, `Role`,
`ROLE_PERMISSIONS`, `AccessSubject`, `can`, `permissionsOf`, `isRole`.

**1.6** `access/README.md`: перенос = скопировать каталог, отредактировать
`permissions.ts` и `roles.ts` под новый проект, написать свои адаптеры. Явно
зафиксировать правило: **ни один файл внутри `access/` не импортирует ничего извне.**

**1.7** Юнит-тесты ядра в `relay/node/test/` (рядом с `unit.test.ts`):
`admin` покрывает все пермишены; `viewer` не видит логи; неизвестная роль → `false`;
`can(null, ...)` → `false`.

---

## Этап 2. Адаптер relay — ✅ сделано

Итог: `lib/auth.ts` (роль из ядра, `authed()` без `minRole`), новый
`lib/access_guard.ts`, все 5 admin-роутов на пермишенах, `/auth/me` отдаёт
`permissions[]`, защита последнего админа в PATCH/DELETE (409),
`test/access_guard.test.ts`. `deno check` + 20 тестов зелёные.

Изменение поведения: `moderator` теперь видит список панельных пользователей
(`panel_users.read`), но не может его менять. Раньше список был только у админа.

**2.1** `lib/auth.ts`: убрать локальный `type Role`, импортировать из `access/`.
`PanelUser` не меняется. Обратная совместимость: сессии со старой ролью
`moderator`/`admin` продолжают работать, `viewer` — новая роль.

**2.2** `authed()` переводится с `minRole` на пермишены:

```ts
// было
export async function authed(req: Request, minRole?: Role): Promise<PanelUser | null>
  ... if (minRole === "admin" && claims.role !== "admin") return null;

// стало — резолвит субъекта, решение о правах принимает вызывающий через can()
export async function authed(req: Request): Promise<PanelUser | null>
```

**2.3** `lib/http.ts` (или `access_guard.ts` рядом с роутами) — единый guard,
заменяющий `guard(req, admin)`:

```ts
// 401 когда не аутентифицирован, 403 когда прав не хватает.
export async function requirePermission(
  req: Request,
  permission: Permission,
): Promise<{ user: PanelUser } | { response: Response }> {
  const user = await authed(req);
  if (!user) return { response: json({ error: "unauthorized" }, 401) };
  if (!can(user, permission)) return { response: json({ error: "forbidden" }, 403) };
  return { user };
}
```

**2.4** Перевести существующие роуты в `routes/admin.ts` на пермишены:

| Роут | Было | Стало |
| --- | --- | --- |
| `GET /admin/waitlist` | `guard(req)` | `waitlist.read` |
| `GET /admin/panel-users` | `guard(req, true)` | `panel_users.read` |
| `POST/PATCH/DELETE /admin/panel-users/*` | `guard(req, true)` | `panel_users.write` |

**2.5** Валидация роли при создании/изменении панельного пользователя: заменить
захардкоженное `b.role !== "admin" && b.role !== "moderator"` на `isRole(b.role)`.

**2.6** `GET /auth/me` отдаёт и роль, и развёрнутый список пермишенов — панель не
дублирует карту ролей:

```ts
return json({ id: u.email, email: u.email, role: u.role, permissions: permissionsOf(u.role) });
```

**2.7** Защита последнего админа. Обнаружено при реализации: в relay её не было
вообще — `PATCH` мог разжаловать, а `DELETE` удалить единственного админа, после
чего в панель никто не войдёт. Добавлен `isLastAdmin()` в `routes/admin.ts`, оба
роута отвечают 409. `scripts/test-last-admin-guard.sh` проверяет Postgres-триггер
`prevent_last_admin_removal` на таблице `public.panel_users` — это артефакт
до-relay архитектуры, текущий путь он не покрывает. Открытый хвост: покрыть
`isLastAdmin()` тестом (нужен мок Storage — единственный роут-тест, которому это
нужно) и решить судьбу старого скрипта.

---

## Этап 3. Панель: клиентская сторона прав — ✅ сделано

Итог: `panel/src/access/` (каталог прав + имена ролей + карта ресурсов),
`providers/access.ts`, кэш `/auth/me` в `providers/auth.ts`, компоненты
`Gated`/`Forbidden`, меню с проверкой на каждый пункт, страница пользователей на
пермишенах, `viewer` в селекте и бейджах. `typecheck-panel.sh` чистый.

Отклонения от эскиза:
- Неизвестная пара ресурс/действие **запрещается** (в эскизе 3.3 было наоборот) —
  страница без решения о праве не должна открываться всем.
- Вместо `CanAccess` — свой `Gated` на `useCan`: нужен третий стейт «права ещё
  грузятся», иначе на первом рендере после входа показывался бы отказ.
- Меню проверяет каждый пункт явно через `useCan`, а не полагается на то, что
  `useMenu` фильтрует сам (проверить это без поднятого стека нельзя).

**3.1** `panel/src/access/` — копия ядра (те же файлы) или один тонкий модуль,
использующий `permissions` из `/auth/me`. Решение: панель **не** хранит карту ролей,
она читает готовый список пермишенов из `/auth/me` — тогда копия ядра в панели
нужна только для типа `Permission`.

**3.2** `providers/auth.ts`: `getPermissions()` возвращает массив пермишенов вместо
строки роли; кэшировать ответ `/auth/me` (сейчас он запрашивается на каждый вызов
`check`/`getIdentity`/`getPermissions`).

**3.3** `accessControlProvider` для Refine + регистрация в `App.tsx`:

```ts
const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action }) => {
    const permissions = await loadPermissions();
    const required = PERMISSION_BY_RESOURCE[`${resource}.${action}`];
    return { can: !required || permissions.includes(required) };
  },
};
```

**3.4** Меню (`components/menu/index.tsx`) скрывает недоступные разделы —
Refine делает это сам при `meta.canDelete`/`accessControlProvider`, проверить
фактическое поведение, а не предполагать.

**3.5** Страница-заглушка 403 для прямого перехода по URL без прав.

---

## Этап 4. Логи, шаг 1 — client-errors — ✅ сделано (Grafana-lite)

Объём расширен по решению пользователя: не простая таблица, а исследователь логов —
окно времени, гистограмма нагрузки, курсорная догрузка назад.

Итог: `listDetailed()` в `lib/storage.ts`, новый `lib/log_reader.ts`, роут
`GET /admin/logs-client-errors`, страница `pages/logs/client-errors/list.tsx`,
`test/log_reader.test.ts` (7 тестов), `scripts/verify-logs-local.sh`.
27 юнит-тестов relay + typecheck панели зелёные; роут проверен вживую на локальном
стенде (окно, курсор, гистограмма, 403/401/422).

Отклонения и находки:
- **Ключи записей — случайные UUID**, а `list()` отдавал только имена: отсортировать
  по времени без чтения каждого объекта было нельзя. Добавлен `listDetailed()`,
  берущий дату из листинга (Bunny `DateCreated`, для fs — mtime). Один листинг
  вместо тысяч GET.
- **Даты Bunny приходят без таймзоны** (`2025-07-25T10:12:33.123`) — как локальное
  время они сдвигали бы порядок. Нормализуются в канонический ISO
  (`canonicalTimestamp`), после чего лексикографическое сравнение = сравнение времени.
- **Путь `/admin/logs-client-errors`**, не `/admin/logs/client-errors`: вложенный
  требовал бы правки data-провайдера.
- **Страница не использует `dataProvider`/`useList`**: ответ — конверт
  (`rows` + `total`/`matched`/`truncated` + `buckets`), это не контракт «список +
  total». Зовёт `api()` напрямую; провайдер в итоге не тронут вообще. Ресурс в
  Refine остаётся ради меню, маршрута и гейта прав.
- **Поиск по `message` работает только по загруженному окну.** Полнотекстовый поиск
  за всё время означал бы чтение всех объектов за период — за этим нужен индекс
  (Loki, вариант (в) в 6.1). Ограничение хранилища, не UI.
- Для проверки локально добавлены `SESSION_SECRET`/`PANEL_URL` в
  `relay/local/docker-compose.yml` (панельная авторизация на стенде раньше вообще
  не поднималась) и `relay/node/tools/mint_panel_token.ts`.
- Авто-обновление (live tail) не делалось — по выбору пользователя.

### Исходный план этапа 4

**4.1** `GET /admin/logs/client-errors` под `logs.client_errors.read`: читает префикс
`client-errors/<env>/`, сортировка по `received_at` убыв., заголовок `x-total-count`.

**4.2** Ограничение выборки: префикс растёт неограниченно. Определить лимит
(например, последние N объектов) и **явно** отдать в ответе признак усечения —
молчаливое обрезание читается как «это все логи».

**4.3** Страница `panel/src/pages/logs/client-errors/list.tsx`: таблица
`received_at / kind / message / page_url / source`, раскрытие строки со `stack`
и `extra`, фильтр по `kind` и подстроке в `message`.

**4.4** Ресурс `logs_client_errors` в `App.tsx` (маппинг `_` → `-` в data-провайдере
уже работает, правки провайдера не нужны).

**4.5** e2e-тесты в `panel/tests/e2e/`: админ видит страницу; `viewer` получает 403;
неаутентифицированный — 401.

---

## Этап 5. Логи, шаг 2 — audit log — ✅ сделано

Итог: `lib/audit.ts`, запись событий во всех мутирующих admin-роутах (включая
отказы), роут `GET /admin/logs-audit`, общий компонент
`components/log-explorer/` и две страницы логов на нём, `scripts/verify-audit-local.sh`.
27 тестов relay + typecheck панели зелёные; журнал проверен вживую — шесть событий,
из них два отказа с причинами.

Решения и находки:
- **Отказы пишутся** (403 и 409). Для этого `AccessResult` при отказе теперь несёт
  актора: 401 некому приписать, а 403 — есть кому.
- **`LogExplorer` вынесен в общий компонент** (окно, гистограмма, курсор, фильтры),
  страница client-errors переписана на него: обе страницы стали ~25 строк, третья
  (серверные логи, этап 6) будет почти бесплатной.
- **`DELETE` несуществующего пользователя отвечал 200** и писал в журнал «удалено».
  Журнал не должен утверждать то, чего не было — теперь 404, как у `PATCH`.
- Пустой `PATCH` (роль не изменилась) тоже пишется: кто-то открыл роль и нажал
  сохранить — это событие.
- Найдено при проверке: адреса вида `admin@local` не проходят валидацию (нет TLD).
  Это корректное поведение `isEmail`, скрипт проверки использует домен `.test`.

### Исходный план этапа 5

**5.1** Формат записи (новый префикс `audit/<env>/`):

```ts
interface AuditEvent {
  id: string;            // uuid
  at: string;            // ISO
  actor_email: string;
  action: string;        // "panel_users.create" | "panel_users.role_change" | ...
  target: string | null; // email/идентификатор объекта
  before: unknown;       // null для create
  after: unknown;        // null для delete
  node: string;
  env: string;
}
```

**5.2** `lib/audit.ts` — `recordAuditEvent(...)`, fire-and-forget, ошибка записи
не роняет основную операцию (как в `client_error.ts`).

**5.3** Вставить вызов во все мутирующие admin-роуты: create/patch/delete панельного
пользователя. Решить и зафиксировать: логировать ли неудачные попытки (403) —
предложение: да, отдельным `action` с пометкой отказа.

**5.4** `GET /admin/logs/audit` под `logs.audit.read` + страница
`pages/logs/audit/list.tsx` с фильтрами по актору и действию.

**5.5** Тест: смена роли пользователя порождает ровно одну запись audit с корректными
`before`/`after`.

---

## Этап 6. Логи, шаг 3 — серверные логи — ✅ сделано (вариант «а»)

Решение по 6.1: `log.ts` дополнительно пишет `warn`/`error` в
`server-logs/<env>/`. Итог: сток в `lib/log.ts`, роут `GET /admin/logs-server`
под `logs.server.read` (только admin), страница `pages/logs/server/list.tsx`,
`test/log_sink.test.ts`, `scripts/verify-server-logs-local.sh`. 29 тестов relay +
typecheck панели зелёные; проверено вживую на настоящей ошибке узла.

Решения:
- **Защита от шторма.** Узел в аварии логирует пачками, а каждая сохранённая
  строка — запрос в хранилище. Больше 32 записей «в полёте» — копия отбрасывается,
  а число отброшенных едет полем `dropped_before` в следующей прошедшей записи:
  читатель видит разрыв, а не молча урезанную картину. В stdout при этом всё.
- **Без рекурсии.** Сбой записи пишется прямо в `console.error`, а не через `log()`
  — иначе каждая неудачная запись порождала бы следующую попытку.
- **`info` не сохраняется** — это строка на каждый запрос, то есть объект на каждый
  запрос. Проверено скриптом явным сравнением счётчиков.

Не сделано (осознанно, ждёт решения): мимо стока идут прямые `console.error` —
`lib/mailer.ts:24,50` (ответы Resend), `routes/waitlist.ts:72`,
`routes/client_error.ts:31`, `config.ts:38,93,104,107` (предупреждения при старте,
там хранилище ещё не готово). В панели их не будет, пока не переведены на `log()`.

Также не сделано: retention. Префикс растёт без ограничения.

### Исходный план этапа 6

**6.1** Выбрать источник (нужно решение до реализации):
- (а) `lib/log.ts` дополнительно пишет `warn`/`error` в Bunny Storage
  (`server-logs/<env>/`) — просто, но теряет `info` и добавляет запись на каждую ошибку;
- (б) эндпоинт читает `docker logs`/journald на узле — полный поток, но требует
  доступа к сокету/systemd из контейнера relay;
- (в) внешний сборщик (Loki) и панель как ссылка на него — вне текущего объёма.

**6.2** Реализовать выбранный источник, накинуть retention (иначе префикс растёт вечно).

**6.3** `GET /admin/logs/server` под `logs.server.read` — только `admin`, с фильтром
по уровню и временному окну.

**6.4** Страница `pages/logs/server/list.tsx`: моношрифт, фильтр по уровню,
автообновление опционально (не по умолчанию — лишние запросы).

**6.5** Проверить, что в ответ не утекают секреты: `config.session.secret`,
Bunny-ключи, SMTP-креды. Явный allow-list полей, а не blacklist.

---

## Этап 7. Завершение

**7.1** `scripts/typecheck-panel.sh` и `scripts/run-panel-tests.sh` — зелёные.
**7.2** Юнит-тесты relay — зелёные.
**7.3** `docs/panel_RU.md` / `docs/panel_EN.md` — описать роли, таблицу пермишенов
и страницы логов.
**7.4** README-синхронизация по правилу проекта: `xor.ad`, `sosed.place`,
`neighbro.place` — EN/RU пары согласованы, общие факты не расходятся.
**7.5** Пройти по коду и убедиться, что `guard(req, admin)` больше нигде не остался —
одна модель проверки прав, без двух параллельных.

---

## Что осознанно не делается

- Персональные grant/deny поверх роли — отложено, ядро расширяется добавлением поля
  в `AccessSubject` без изменения `can()`-контракта у вызывающих.
- Отдельный репозиторий / npm-пакет для `access/` — перенос копированием каталога.
- Иерархия ролей (наследование) — плоская карта читается проще и ревьюится в git.
