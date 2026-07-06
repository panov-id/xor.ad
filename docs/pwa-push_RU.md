# Спека: PWA-оболочка + Web Push (вейтлист → уведомление → «soon»)

Статус: спека. Код — отдельным шагом.

## Идея

Лендинг витрины (`sosed.place` / `neighbro.place`) прокачивается в **PWA** с одностраничным экраном «soon» — это начало самого приложения. Человек оставляет почту в вейтлисте → соглашается на уведомления → получает **Web Push** «ты в списке» сразу, а на запуске — броадкаст «мы открылись». Пуш открывает установленную PWA на экране «soon».

## PWA-оболочка (паттерн из noisen)

Переиспользуем подход `noisen-app` (проверенный):

- `manifest.json` — имя/иконки/`display: standalone`/`start_url: /`, тема под бренд (советская у sosed, европейская у neighbro).
- `sw.js` — service worker с версионированным кешем `<face>-<BUILD>`: `install` (precache + `skipWaiting`), `activate` (чистка старых кешей + `clients.claim`), `fetch` (stale-while-revalidate только для GET).
- Регистрация: `navigator.serviceWorker.register('./sw.js')` + reload по `controllerchange`.
- Деплой инъектит `__BUILD__` (git-хеш) в `sw.js`, пишет `version.json` — страница поллит его и предлагает обновиться (как в noisen `deploy-cdn.sh`).
- Иконки 192/512 + maskable + svg.

Экран «soon» на первом этапе = текущий контент лендинга (питч + вейтлист-форма + кейсы), просто теперь оно PWA-устанавливаемое.

## Web Push (дописываем сами, в noisen нет)

### Ключи
- VAPID пара (public/private). Публичный ключ — во фронт (в `config.js`), приватный — секрет Edge Function.

### Флоу подписки (на сабмит вейтлиста)
1. Форма как сейчас пишет email в `waitlist`.
2. После успеха: `Notification.requestPermission()`.
3. Если granted: `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <VAPID public> })`.
4. Подписку (endpoint + keys) сохранить в таблицу `push_subscriptions` (через тот же `api.*` прокси, anon insert по RLS).

### Отправка
- Edge Function `send-push`:
  - **immediate** — сразу после подписки шлёт «ты в списке» на этот один endpoint;
  - **broadcast** — рассылка по всем подпискам витрины (на запуске), запускается кнопкой из админ-панели.
  - Использует библиотеку web-push с VAPID-приватным ключом; протухшие подписки (410/404) удаляет.

### Обработка в service worker
- `self.addEventListener('push', ...)` → `showNotification(title, { body, icon, data:{url} })`.
- `self.addEventListener('notificationclick', ...)` → открыть/сфокусировать PWA на `start_url` (экран «soon»).

## Данные (миграция)

```
push_subscriptions:
  id uuid pk
  endpoint text unique
  p256dh text, auth text        -- ключи подписки
  source text                    -- sosed.place / neighbro.place
  created_at timestamptz
  RLS: anon insert only (как waitlist); чтение/рассылка — service_role в Edge Function
```

## Ограничения (важно)

- **iOS Safari**: Web Push работает только если PWA **добавлена на домашний экран** (A2HS). В обычной вкладке Safari пуши не придут — надо показывать подсказку «добавьте на экран».
- **Разрешение** запрашиваем только после явного действия (сабмит вейтлиста), не на загрузке.
- **Realtime тут не участвует** — пуши это отдельная механика (сокеты Supabase — для ленты приложения позже).

## Открытые вопросы

- Тексты пушей (immediate/broadcast) на 6 языках (переиспользовать i18n лендинга).
- Хранить ли связь подписки с email (для дедупликации), или подписка анонимна.
- Кнопка броадкаста в админ-панели: подтверждение + счётчик отправленных.
- VAPID-ключи: одна пара на витрину или общая.
