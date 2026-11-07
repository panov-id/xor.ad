# Безопасность после дизайна, 07.11.2026

Панель из пяти линз и двух опровергателей; сырьё в `docs/reviews/PANEL_2026-11-07_security.md`.
Линзами покрыто 2762 из 3887 файлов. Не прочитаны: relay 253, клиенты 445, scripts 249, depth 118, удалённые 60.

## Закрыто

| # | Дыра | Где закрыто | Чем доказано |
|---|------|-------------|--------------|
| 1 | На публичном боксе (p1) мастер открывал `logs-` (Dozzle) наружу | `relay/wizard/wizard.py` `is_public_box`, `aux_hosts`; `relay/README.md` | `relay/wizard/test_wizard.py`: зелёный; при поломке красный `['logs-p1.z.example']`; вживую 07.11: до выкатки `https://logs-p1.relay.panov.id/` отвечал 200, после выкатки p1 мастером TLS-отказ, код 000 |
| 2 | Витрину можно встроить в чужую страницу | правка не нужна: `sosed.place/landing/security-headers.mjs:123,146` и `neighbro.place` уже шлют `frame-ancestors 'none'` и `X-Frame-Options DENY` | чтение кода; на живом адресе НЕ ПРОВЕРЕНО |
| 3 | Доказательство ПИН-кода хранилось без ключа, если флаг выключен: дамп базы плюс устройство перебирают 10⁶ ПИН-кодов офлайн | `relay/node/src/lib/vault_share.ts`: всегда печать `k1:` под `VAULT_SHARE_KEY`, флага нет; `docs/protocol_*.md` | `pin_limit_rollback.test.ts`: 2 из 2; при поломке красный «the proof was stored without the key» |
| 4 | Повтор подписанного «не сейчас» после отмены снова отказывал | `relay/node/src/routes/matches.ts` (nonce), `relay/node/db/092_nonce_decline.sql`, `depth/core/client.ts`, `docs/protocol_*.md` §2 | `feed_publish.test.ts`: зелёный; при поломке красный «the replayed decline declined again after its undo» |
| 5 | Повтор отмены «не сейчас» снимал новый отказ (найдено ревью fable) | `relay/node/src/routes/matches.ts` (nonce), `relay/node/db/093_nonce_undo.sql`, `depth/core/client.ts` | `feed_publish.test.ts`: зелёный; при поломке красный «the replayed undo took the new decline back» |
| 6 | Без `VAULT_SHARE_KEY` или при сбое перепечатки узел стартовал, старые доказательства ПИН-кода оставались открытыми | `relay/node/src/lib/vault_share.ts` `vaultAtStart`, `relay/node/src/main.ts`: узел с базой не стартует | `pin_limit_rollback.test.ts`: зелёный; при поломке красный «the start went on without the key» |
| 7 | Ключ сейфа нельзя было сменить без потери всех локальных историй и ПИН-кодов среды | `vault_share.ts`, `cursor.ts`, `pin_attempts.ts`: два ключа (`VAULT_SHARE_KEY`, `VAULT_SHARE_KEY_PREVIOUS`), доли перепечатываются при старте, ПИН-код переходит при верном вводе; мастер передаёт старый ключ; `relay/wizard/fill-secrets.sh` заполняет пустые ключи без вывода | `pin_limit_rollback.test.ts`: зелёный; при поломке красный «no share was resealed under the new key»; мастер 70 из 70; генератор 6 из 6 |

Полные прогоны узла: база 688 пройдено, 0 упало; линт и юнит 329 пройдено. Приложение: 476 из 476, карта экранов пересобрана.

## Цена

- Сервер без `VAULT_SHARE_KEY` теперь не поднимается вовсе (цена шага 6). Все стенды с узлом задают ключ: `docker-compose.web.yml:108`, `relay/local/docker-compose.yml:38`, скрипты depth.
- Откат узла на старый тег не примет верный ПИН у строк с `k1:`.
- Старый клиент без nonce получит 400 на «не сейчас». Клиент `depth/core` обновлён; тесты `depth` НЕ ПРОГОНЯЛИСЬ.

## Открыто (не чинилось, нужно слово владельца)

- Узел ходит в базу суперпользователем.
- Образы на теге `latest`, без закреплённых версий.
- Нет лимитов памяти у контейнеров.
- Порты локального стенда открыты на 0.0.0.0.
- `client_ip.ts:560` сравнивает токен не за постоянное время.
- Пустой `ALLOWED_ORIGINS` пускает любой источник.
- Режим Telegram включается фрагментом URL.
- Панель принимает `?token=` в адресе.
- Повтор сообщений после перезагрузки (`seal.ts:290`).
- Шаг 7: один GET к `logs-p1` на живом сервере, чтобы проверить, что хост закрыт, ждёт отдельного слова.

- HMAC адреса приостановленного заведения при ротации не переносится: после удаления старого ключа такой адрес не узнаётся (`lib/advertiser_sweeper.ts`).

## Попутно

- `depth/web-platform/chat/chat_state.test.ts`: два теста падали и на HEAD (3 из 3 прогонов): таймер подставного `keys.open` переживал тест. Теперь тест ждёт открытия; 5 из 5 зелёных, при поломке «Leaks detected».

## Шифрование

WebCrypto: AES-256-GCM, HKDF-SHA256, ECDSA и ECDH P-256. ПИН-код: argon2id из hash-wasm 4.12.0 (64 MiB, t=3, p=1). Redis нет: лимиты в памяти, очередь в Postgres.
