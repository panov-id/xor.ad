# Панель 05.11.2026: правки шагов 1–4

lens coverage: 10 of 10 files. Файлы: `app/src/shell/App.tsx`, `app/src/shell/telegram.ts`, `app/public/tg-boot.js`, `app/public/telegram-web-app.js`, `app/index.html`, `scripts/flow/telegram-shell.mjs` (безопасность, verifier); `app/src/screens/tables/Tables.tsx`, `app/tokens/nd4-kit.css`, `scripts/design/nd4-extract.py`, тесты шагов 1 и 3 (verifier). Остальное дерево: `PANEL_2026-11-05_screens110_RU.md`.

| Уровень | Где | Находка | Статус |
|---|---|---|---|
| важная | `app/public/tg-boot.js` | После перезагрузки оболочка не включалась | VERIFIED Playwright; исправлено, тест краснел на поломке |
| средняя | `app/public/telegram-web-app.js:7-19` | Скрипт Telegram хранит данные запуска в `sessionStorage` вкладки; код приложения их не читает | Чтение кода; решение: оставить, на этом держится перезагрузка |
| мелкая | `app/public/tg-boot.js`, `app/vite.config.ts:90` | Скрипт можно включить ссылкой с хешем; от встраивания защищает только заголовок, на проде не проверен | Чтение кода |
