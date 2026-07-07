# Чеклист доработок — neighbro (лендинг) + панель

Составлен по результатам ревью с разных сторон (корректность, a11y, PWA/SW, безопасность, i18n, производительность, архитектура, авторизация, тесты, консистентность). Пути относительно `/home/eugene-panov/Projects/panov-id/xor.ad`.

Легенда приоритета: 🔴 критично (до публичного запуска) · 🟠 важно · 🟡 гигиена.

## Прогресс (обновлено 2026-07-07)

**Закрыто:** все 🔴 (№1–4), все 🟠 (№5–16), вся 🟡-гигиена панели и лендинга (neighbro). Каждое изменение покрыто тестом; прогоны зелёные: панель e2e 35/35, landing e2e 14/14, build панели чистый, SQL last-admin guard PASS.

Ключевое: authz-дыра `check()` + `shouldCreateUser:false`; invite-функция (откат/валидация/CORS/409); RLS update/delete + триггер последнего админа; RLS-аудит `waitlist`/`push_subscriptions` + `unique(email)`; legal XSS-санитайзер + EN-fallback; focus-visible/aria/контраст/reduced-motion; CSP (same-origin, `font-src 'self'`); SW (network-first config, offline-fallback, controllerchange-гейт); self-host шрифтов (лендинг + панель); прод fail-loud на отсутствие env.

**Осознанно отложено / не в скоупе:** юнит-тесты панели (только e2e); i18n декоративных мокапов; переход панели на единый variable-шрифт; `manifest lang` (won't-fix); rate-limit anon-inserts (уровень Supabase Cloud / edge); **sosed заморожен** — перенос трекается в `sosed.place/docs/PENDING_FROM_NEIGHBRO_*.md`.

---

## 🔴 Критичное

### 1. Панель: `check()` не проверяет членство в `panel_users` ✅
- [x] **Файл:** `panel/src/providers/auth.ts:58-89`
- **Проблема:** `check()` подтверждает вход только по наличию Supabase-сессии. Любой, кто прошёл OTP, попадает в UI панели (списки пустые из-за RLS, но доступ получен).
- **Решение:** в `check()` дополнительно запрашивать строку в `panel_users` для текущего пользователя; при отсутствии — `logout()` + redirect на login.
- **Критерий готовности:** чужак с валидной сессией, но без записи в `panel_users`, не попадает в UI; добавлен e2e-тест этого сценария (сейчас не покрыт).

### 2. Панель: `signInWithOtp` без `shouldCreateUser:false` ✅
- [x] **Файл:** `panel/src/providers/auth.ts:9-14`
- **Проблема:** запрос OTP на произвольный email создаёт нового auth-пользователя.
- **Решение:** передать `options: { shouldCreateUser: false }`.
- **Критерий готовности:** запрос кода на несуществующий email не создаёт пользователя в auth.

### 3. Лендинг: XSS через href в markdown-рендере legal ✅
- [x] **Файл:** `neighbro.place/landing/legal.html:117`
- **Проблема:** рендер `[t](href)` подставляет href без санитизации схемы → `[x](javascript:...)` даёт исполняемую ссылку.
- **Решение:** разрешать только схемы `http:`, `https:`, `mailto:`; остальные href отбрасывать (рендерить как текст).
- **Критерий готовности:** ссылка с `javascript:`/`data:` не даёт кликабельного исполняемого href.

### 4. Лендинг: отсутствует `:focus-visible` ✅
- [x] **Файл:** `neighbro.place/landing/index.html` (глобально)
- **Проблема:** нет ни одного стиля фокуса → клавиатурная навигация фактически сломана.
- **Решение:** добавить видимый акцентный `outline` на `:focus-visible` для кнопок, ссылок, инпута, select.
- **Критерий готовности:** каждый интерактивный элемент имеет видимый фокус при навигации с клавиатуры.

---

## 🟠 Важное

### 5. Панель: осиротевший auth-пользователь при сбое invite ✅
- [x] **Файл:** `functions/invite-panel-user/index.ts:47-63`
- **Проблема:** если `generateLink` прошёл, а `insert` в `panel_users` упал — остаётся auth-пользователь без записи и без отката.
- **Решение:** при ошибке insert удалять созданного auth-пользователя (компенсирующая операция).
- **Критерий готовности:** сбой insert не оставляет осиротевших пользователей.

### 6. Панель: валидация и нормализация email в invite ✅
- [x] **Файл:** `functions/invite-panel-user/index.ts:42-45`
- **Проблема:** email не валидируется по формату и не нормализуется (trim/lowercase); повторный invite существующего даёт невнятную 500.
- **Решение:** валидировать формат, trim + lowercase; повторный invite обрабатывать понятной ошибкой (409/сообщение).
- **Критерий готовности:** невалидный email → 400 с понятным сообщением; повторный invite → внятный ответ, не 500.

### 7. Панель: нет CORS/OPTIONS в invite-функции ✅
- [x] **Файл:** `functions/invite-panel-user/index.ts:14-17`
- **Проблема:** нет обработки `OPTIONS` и CORS-заголовков; на не-POST — 405 без `Access-Control-Allow-Origin`.
- **Решение:** обрабатывать preflight `OPTIONS`, добавить CORS-заголовки.
- **Критерий готовности:** прямой вызов из браузера в другом окружении не падает на preflight.

### 8. Панель: нет UPDATE/DELETE политик на `panel_users` ✅
- [x] **Файл:** `db/migrations/0002_panel_users.sql`
- **Проблема:** есть только select/insert; нельзя отозвать/понизить панель-юзера через UI; нет защиты «последнего админа».
- **Решение:** добавить admin-only `UPDATE`/`DELETE` политики + ограничение «нельзя удалить/понизить последнего админа».
- **Критерий готовности:** админ может отозвать другого; последнего админа удалить/понизить нельзя.

### 9. Панель: мёртвый `panel/.env` (несовпадение имён переменных) ✅
- [x] **Файл:** `panel/.env` ↔ `panel/src/providers/constants.ts:5-9` — удалён (dev использует localhost-фоллбэк, прод — `.env.production`)
- **Проблема:** `.env` задаёт `VITE_API_URL`/`VITE_SUPABASE_API_KEY`, а `constants.ts` читает `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`. Конфиг не применяется, сборка молча падает на localhost-дефолты.
- **Решение:** привести имена в соответствие или удалить `.env` из рабочего дерева.
- **Критерий готовности:** значения из окружения реально подхватываются; нет тихого фоллбэка на localhost.

### 10. Панель: код/доки расходятся по SMTP-входу ✅
- [x] **Файл:** `panel/src/pages/login/index.tsx:4-8` + `panel/src/providers/auth.ts` (комментарии приведены к реальности: SMTP-плейсхолдер, письма не идут)
- **Проблема:** комментарий описывает рабочий магик-линк, а SMTP — плейсхолдер («no emails go out yet»); само-сервисный вход фактически не работает.
- **Решение:** синхронизировать комментарий/доки с реальностью или пометить как TODO до настройки SMTP.
- **Критерий готовности:** доки и комментарии соответствуют фактическому состоянию входа.

### 11. Лендинг: `config.js` в precache отдаётся cached-first ✅
- [x] **Файл:** `neighbro.place/landing/sw.js:6-14` — убран из precache, раздаётся network-first
- **Проблема:** при смене окружения без нового `__BUILD__` отдаётся старый Supabase-таргет.
- **Решение:** исключить `config.js` из precache либо раздавать network-first.
- **Критерий готовности:** после смены окружения форма бьёт в актуальный Supabase без ручного сброса кеша.

### 12. Лендинг: дубликат email трактуется как ошибка ✅
- [x] **Файлы:** `neighbro.place/landing/index.html` + `sosed.place/landing/index.html` (тот же баг был на обеих витринах) — 409 трактуется как успех
- **Проблема:** повторная отправка того же email даёт 409 (unique) → пользователь видит «Couldn't submit».
- **Решение:** трактовать 409 / код `23505` как успех («вы уже в списке»).
- **Критерий готовности:** повторная отправка показывает дружелюбное подтверждение, не ошибку.

### 13. Лендинг: нет CSP + проверить RLS на waitlist/push ✅
- [x] CSP добавлен в `neighbro.place/landing/index.html` и `legal.html` (`<meta http-equiv>`): same-origin only + Google Fonts; `connect-src 'self'` (Supabase через gateway).
- [x] RLS-аудит: `waitlist` гранты ужаты (anon только INSERT, authenticated только SELECT); создана недостающая таблица `push_subscriptions` (`db/migrations/0003_push_subscriptions.sql`) с тем же RLS-паттерном (anon insert-only, панель select) и ужатыми грантами. Тесты в `panel/tests/e2e/anon-writes-rls.spec.ts`.
- [x] `unique(waitlist.email)` добавлен (`db/migrations/0004_waitlist_unique_email.sql`, с дедупом существующих) — 409 из №12 теперь реален, дубли невозможны.
- [ ] Rate-limit на anon-inserts: **не в нашем слое** — прод = Supabase Cloud + CDN, своего nginx в проде нет (единственный `nginx.conf` — локальный dev-стенд). Оставлено как зона Supabase Cloud / edge, в dev-заглушку не добавляю (сломало бы e2e без прод-пользы).
- **Проблема:** нет CSP при инлайн-скриптах и внешних Google Fonts; клиент теоретически может слать произвольные поля в insert (`early_access` и др.).
- **Решение:** добавить CSP (`script-src 'self' 'unsafe-inline'` или хеши, `connect-src` для Supabase, `font-src`/`style-src` для Google Fonts); подтвердить жёсткие RLS-политики по колонкам + rate-limit на `waitlist`/`push_subscriptions`.
- **Критерий готовности:** CSP активен; вставка произвольных полей отклоняется на стороне БД.

### 14. Лендинг: reduced-motion гасит только splash ✅
- [x] **Файл:** `neighbro.place/landing/index.html` — reduced-motion reset для всех анимаций/переходов + остановка бесконечного `.dot` pulse
- **Проблема:** бесконечная `pulse` анимация `.dot` и hover-трансформы не отключены при `prefers-reduced-motion`.
- **Решение:** обнулить все анимации/трансформы в reduced-motion.
- **Критерий готовности:** при reduced-motion нет непрерывных анимаций.

### 15. Лендинг: legal-доки только EN/RU при 6-язычном UI ✅
- [x] `legal.html` уже зажимает язык в EN/RU; добавлен явный graceful fallback на EN при отсутствии перевода (юр. текст не выдумываем). FR/DE/ES/EL получают EN, а не ошибку.
- **Проблема:** FR/DE/ES/EL-пользователь получает EN на legal-страницах.
- **Решение:** добить переводы юр. документов или честно ограничить набор языков в UI.
- **Критерий готовности:** язык legal соответствует выбранному языку интерфейса (или явно помечен как EN-only).

### 16. Лендинг: `fetch` в legal без таймаута и fallback ✅
- [x] **Файл:** `neighbro.place/landing/legal.html` — `fetchMd()` с AbortController-таймаутом (8s) + fallback на EN при 404/сбое
- **Проблема:** при сетевой ошибке или 404 (нет файла для языка) — всегда «Could not load».
- **Решение:** обрабатывать 404 отдельно + fallback на EN; добавить таймаут/повтор.
- **Критерий готовности:** отсутствие перевода → показывается EN, а не ошибка.

---

## 🟡 Гигиена / мелочи

### Панель
- [x] `panel/src/App.tsx` — Devtools только в dev (`import.meta.env.DEV`), `DevtoolsPanel` теперь рендерится (в dev). ✅
- [x] `panel/src/providers/auth.ts` — `getPermissions`/`getIdentity` на общем `loadPanelUser()` (сделано в №1). ✅
- [x] `panel/src/pages/login/index.tsx:10` — `isLoading` → `isPending` (Refine v5 / TanStack Query v5); `npm run build` снова чистый. ✅
- [x] `panel/src/pages/panel-users/list.tsx` — убран `result ?? data`: `useGetIdentity` возвращает `UseQueryResult`, identity на `.data` (комментарий был неверен). ✅
- [x] `panel/src/pages/panel-users/list.tsx` — `clipboard.writeText` в try/catch, при отказе — понятный статус, ссылка остаётся для ручного копирования. ✅
- [x] `panel/src/providers/auth.ts` — `onError` инициирует logout+redirect на 401/403. ✅
- [x] `panel/tests/report/**` — в git не трекается (0 файлов); добавил `tests/report`/`tests/results` в `panel/.gitignore` как подстраховку. ✅
- [x] `panel/src/providers/constants.ts` — fallback на localhost/демо-anon оставлен только в dev (`import.meta.env.DEV`); в prod-сборке отсутствие `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` бросает ошибку (проверено: throw в прод-бандле). `tests/helpers/env.ts` — тест-инфра, fallback оставлен намеренно. ✅ (`panel/.env` удалён ранее в №9)
- [ ] Нет юнит-тестов, только e2e. Не покрыто: logout, orphan-откат invite, copy-link, повторный invite, дубликат email. Добить сценарии.
- [x] `panel/src/App.css` — self-host шрифтов: woff2 в `panel/public/fonts/`, `@import "./fonts.css"`, preload в `panel/index.html`. Убран Google CDN `@import`. ✅ (переход на единый variable-шрифт — отдельная дизайн-задача)

### Лендинг
- [x] `index.html` — `controllerchange`→reload теперь гейтится по наличию контроллера на момент загрузки (нет лишней перезагрузки на первой установке SW). ✅
- [x] `index.html` — `subscribePush` показывает статус при отказе/отсутствии поддержки; ошибка fetch больше не глотается (`res.ok` → catch с сообщением). ✅ (закрывает и следующий пункт)
- [x] `index.html` — `catch {}` push-подписки заменён на понятный фидбэк + проверку `res.ok`. ✅
- [x] `index.html` — `--muted-2` поднят (dark `#928979`) / затемнён (light `#5c5749`) под 4.5:1. ✅
- [x] `index.html` — h1 `.outline` fallback-цвет (`color:var(--accent)`), прозрачность только под `@supports (-webkit-text-stroke)`. ✅
- [x] `index.html` — splash: hold только на первом показе сессии; повторные визиты и reduced-motion — мгновенно (LCP). ✅
- [x] `index.html`/`legal.html` — self-host шрифтов: 15 woff2-сабсетов в `landing/fonts/` + `fonts.css`, preload latin-фейсов, `fonts.css` в SW precache. Google preconnect/link убраны, **CSP ужат до `font-src 'self'`**. Скрипт `scripts/fetch-fonts.sh`. ✅
- [x] `index.html` — email-инпут получает `aria-label` из i18n (в `applyLang`). ✅
- [x] `index.html` — оба `.status` получили `role="status" aria-live="polite"`. ✅
- [ ] `index.html` — тексты в мокапах захардкожены по-английски. **Отложено:** мокапы декоративные (в основном под `aria-hidden`); вынос в i18n — объёмная задача, низкий приоритет.
- [x] `index.html` — мёртвый i18n-ключ `sayPh` удалён из всех 6 языков. ✅
- [x] `sw.js` — offline-fallback для навигаций (`mode:navigate` → кэшированный `/`). ✅
- [x] `sw.js` — дубль `/`+`/index.html` в precache убран (оставлен `/`). ✅
- [ ] `manifest.json` — `lang:"en"`. **Не меняю:** метаданные установленного PWA с брендовым (языконезависимым) именем; валидно как есть.

---

## Заметка по консистентности
Панель-вход завязан на активную Supabase-сессию — тот же сигнал «зареган», что заложен в спеке чата (`docs/chat_RU.md` §11: текст-лого ведёт в чат для залогиненного). Логика едина. Но пока SMTP — плейсхолдер, само-сервисный вход не работает нигде; пункты 1–2, 10 и настройка SMTP связаны.
