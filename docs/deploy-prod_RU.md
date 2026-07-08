# DEPLOY PROD — чеклист (лендинг neighbro.place)

Прод — реальные домены. Общая механика — в `deployment_RU.md`, dev/uat — в `deploy-today_RU.md`.
Фокус: витрина **neighbro.place** (sosed — на паузе, панель — позже).

## 0. Решения перед стартом
- [ ] **Supabase для прода:** сейчас проект **общий** на dev/uat. Для прода это риск: реальные подписки смешиваются с тестовыми, один сбой затрагивает всё. Решить: **отдельный prod-проект** (рекомендую) или пока общий.
- [ ] **Канон домена:** apex `neighbro.place` как основной + `www` → редирект на apex (или наоборот).
- [ ] **Объём:** только лендинг neighbro (без sosed/панели).

## 1. Предпосылки
- [ ] GitHub **`production`** окружение в репо (токен теперь умеет создавать; визард создаст сам).
- [ ] Ключи в `deploy/.env.deploy` уже есть (Bunny/Supabase/GitHub/Namecheap).
- [ ] Витрина принята на **UAT**, есть релиз-тег (`Deploy UAT` авто-тегает при пуше в `main`).

## 2. Контент лендинга перед продом
- [ ] **OG/meta для шеринга** (сейчас нет): `<meta name="description">`, `og:title/description/image/url`, `twitter:card`. Плюс og-картинка (1200×630).
- [ ] Проверить футер-ссылки Terms/Privacy/Rules ведут на живой `legal.html`.
- [ ] `robots.txt` / фавиконки/`apple-touch-icon` — есть (проверить).
- [ ] Прогнать **E2E** на UAT (форма→бэкенд), убедиться зелёные.

## 3. Провижн прод-окружения
```bash
deploy/run-wizard.sh prod     # Bunny prod-зоны (сайт+api.*+панель) + миграции + GitHub production-секреты
```
Печатает DNS-записи. Хостнеймы прод: `neighbro.place`, `api.neighbro.place`.

## 4. DNS на neighbro.place (Namecheap)
- [ ] **apex** `@ neighbro.place` → **ALIAS** → `neighbro-prod.b-cdn.net` (CNAME на корне нельзя!).
- [ ] `www` → CNAME → `neighbro-prod.b-cdn.net` (+ редирект www↔apex по вкусу).
- [ ] `api` → CNAME → `neighbro-api-prod.b-cdn.net`.
- Автоматизация: `deploy/namecheap-add.py neighbro.place records.json --apply` (умеет ALIAS/CNAME; сохраняет существующие записи — на neighbro.place их надо проверить).

## 5. Руками в Bunny
- [ ] **SSL** (Let's Encrypt) на `neighbro.place`, `www.neighbro.place`, `api.neighbro.place`.
- [ ] Для `api.neighbro.place` (прокси): **Origin Host Header = `<ref>.supabase.co`**, **WebSockets ON**, кэш `CacheControlMaxAgeOverride=0` (можно через Bunny API, как на dev).

## 6. Деплой файлов
- [ ] Actions → **Deploy prod** (`workflow_dispatch`) → указать **release-тег** (напр. `v2026.07.08-abcdef1`).
  - Деплой берёт код тега, генерит `config.js` с `api.neighbro.place` + prod anon-ключом, льёт в Bunny.

## 7. Проверка
- [ ] `https://neighbro.place` открывается (зелёный TLS), тема/язык/сплэш ок.
- [ ] Форма вейтлиста: отправка → успех; строка в Supabase (`waitlist`, source `neighbro.place-landing`).
- [ ] `api.neighbro.place/rest/v1/...` роутит в Supabase (не 404 Bunny).
- [ ] Легал-страницы (`/legal.html`) рендерятся; футер-ссылки живые.
- [ ] Мобайл: `overflow=0`, футер аккуратный.

## 8. После запуска
- [ ] **Откат:** при проблеме перезапустить `Deploy prod` с предыдущим тегом.
- [ ] Мониторить `client_errors` (логер) первые часы.
- [ ] Почистить тестовые строки в `waitlist`, если общий Supabase.

## Открытые вопросы / риски
- Общий Supabase на прод (данные/аптайм) — вынести prod в отдельный проект.
- Apex через Namecheap ALIAS + Bunny SSL — проверить, что Bunny выдаёт сертификат на apex.
- SMTP (письма) — отдельный трек (`email-smtp.md`); для лендинга не блокер.
