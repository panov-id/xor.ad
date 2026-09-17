# Согласование имён предложенных маршрутов — 17.09.2026

Пятьдесят шесть операций `docs/api/openapi.yaml` со статусом `proposed`: имена предложены мной, поведение — из спеки чата и экранов. Маршрут до отрисовки (§8 п. 2 протокола) требует согласовать их одним заходом до первой строки кода. Колонка **Решение** — ваша: `ок` оставляет имя, иное имя — переименовать; после этого статус меняется на `spec`, правятся `openapi.yaml`, протокол §4 и карта тестов. Пара — `ROUTES_2026-09-17_naming_EN.md`.

| № | Тег | Маршрут | Что делает | Альтернатива | Решение |
|---|---|---|---|---|---|
| 1 | identity | `GET /identities/me` | Свой профиль | GET /me | ок |
| 2 | identity | `GET /legal/manifest` | Нынешние редакции документов | GET /legal | ок |
| 3 | identity | `GET /statements` | Свои мотивировки по ст. 17 | GET /me/statements | ок |
| 4 | identity | `PATCH /identities/me` | Править профиль | PATCH /me | ок |
| 5 | identity | `POST /identities` | Завести личность | — | ок |
| 6 | identity | `POST /identities/close` | Начать заново — закрыть личность | POST /identities/me/close · DELETE /identities/me | ок |
| 7 | identity | `POST /legal/accept` | Записать принятие | POST /legal/acceptances | ок |
| 8 | identity | `POST /recovery/claim` | Поднять личность бумажным кодом | POST /identities/recover | ок |
| 9 | identity | `POST /recovery/reissue` | Перевыпустить бумажный код | POST /recovery/code | ок |
| 10 | identity | `POST /vault/pin` | Сменить ПИН | PUT /vault/pin | ок |
| 11 | identity | `POST /vault/share` | Обменять доказательство ПИНа на долю ключа хранилища | POST /vault/unlock | ок |
| 12 | identity | `PUT /identities/appearance` | Оформление личности для этого лица | PUT /identities/me/appearance | ок |
| 13 | feed | `DELETE /feed/{id}` | Снять свою фразу | — | ок |
| 14 | feed | `GET /feed/density` | Ступень плотности под ручкой радиуса | GET /feed/around | ок |
| 15 | chat | `DELETE /chats/{id}` | Закрыть беседу руками, сразу у обоих | POST /chats/{id}/end | ок |
| 16 | chat | `DELETE /chats/{id}/game` | Закончить игру | — | ок |
| 17 | chat | `DELETE /feed/{id}/like` | Снять лайк, пока нет мэтча | — | ок |
| 18 | chat | `GET /chats/{id}/game` | Партия после обрыва | — | ок |
| 19 | chat | `PATCH /chats/{id}` | Своя ручка срока | PUT /chats/{id}/span | ок |
| 20 | chat | `POST /chats/{id}/game` | Предложить или сменить игру | POST /chats/{id}/games | ок |
| 21 | chat | `POST /chats/{id}/game/answer` | Ответить на предложение игры | POST /chats/{id}/game/reply | ок |
| 22 | chat | `POST /chats/{id}/game/confirm` | «Я здесь» на новую игру | POST /chats/{id}/game/ready | ок |
| 23 | chat | `POST /chats/{id}/game/moves` | Ход или пас | POST /chats/{id}/game/move | ок |
| 24 | chat | `POST /chats/{id}/game/proposals` | Предложить: сыграть ещё, ничью, откат | — | ок |
| 25 | chat | `POST /chats/{id}/game/proposals/{pid}` | Ответить на предложение | — | ок |
| 26 | chat | `POST /chats/{id}/game/resign` | Сдаться | — | ок |
| 27 | chat | `POST /chats/{id}/game/word` | Загадать слово виселицы | POST /chats/{id}/game/secret | ок |
| 28 | chat | `POST /chats/{id}/messages` | Отправить шифротекст | — | ок |
| 29 | chat | `POST /chats/{id}/received` | Подтвердить получение | POST /chats/{id}/acks | ок |
| 30 | chat | `POST /feed/{id}/like` | Лайкнуть фразу или оффер | PUT /feed/{id}/like | ок |
| 31 | chat | `POST /matches/{id}/consent` | Согласиться поговорить | POST /matches/{id}/accept | ок |
| 32 | tables | `DELETE /tables/{id}/seat` | Встать | POST /tables/{id}/leave | ок |
| 33 | tables | `GET /tables/{id}` | Стол без скрытого | — | ок |
| 34 | tables | `POST /tables` | Поставить стол | — | ок |
| 35 | tables | `POST /tables/{id}/confirm` | «Я здесь» на новую игру | POST /tables/{id}/ready | ок |
| 36 | tables | `POST /tables/{id}/congratulate` | Поздравить место | POST /tables/{id}/cheer | ок |
| 37 | tables | `POST /tables/{id}/kick` | Голос за высадку места | POST /tables/{id}/votes | ок |
| 38 | tables | `POST /tables/{id}/lines` | Реплика, заявка, отказ или стикер | POST /tables/{id}/say | ок |
| 39 | tables | `POST /tables/{id}/moves` | Ход или пас | POST /tables/{id}/move | ок |
| 40 | tables | `POST /tables/{id}/proposals` | Предложить: сыграть ещё, ничью, откат | — | ок |
| 41 | tables | `POST /tables/{id}/proposals/{pid}` | Ответить на предложение | — | ок |
| 42 | tables | `POST /tables/{id}/resign` | Сдаться | — | ок |
| 43 | tables | `POST /tables/{id}/seat` | Подсесть | POST /tables/{id}/seats · POST /tables/{id}/join | ок |
| 44 | tables | `POST /tables/{id}/ticket` | Одноразовый билет для сокета стола | — | ок |
| 45 | safety | `DELETE /away` | Вернуться досрочно | DELETE /me/away | ок |
| 46 | safety | `DELETE /blocks/{id}` | Снять блокировку | — | ок |
| 47 | safety | `DELETE /hidden/{id}` | Вернуть скрытое | DELETE /hides/{id} | ок |
| 48 | safety | `GET /blocks` | Свои блокировки | — | ок |
| 49 | safety | `GET /hidden` | Список скрытого | GET /hides | ок |
| 50 | safety | `POST /away` | Отойти | POST /me/away | ок |
| 51 | safety | `POST /blocks` | Заблокировать человека | — | ок |
| 52 | safety | `POST /hidden` | Скрыть фразу или реплику у себя | POST /hides | ок |
| 53 | support | `GET /support` | Свои обращения | GET /support/requests | ок |
| 54 | support | `POST /support` | Обращение в поддержку | POST /support/requests | ок |
| 55 | support | `POST /support/{no}/seen` | Погасить точку «ответ ждёт» | POST /support/{no}/read | ок |
| 56 | intake | `POST /report/decision` | Решение по уведомлению по коду квитанции | GET /report/decision?…  (нет: код в теле) | ок |

**Правила имён, которые я держал:** существительное во множественном числе для коллекций (`/tables`, `/blocks`), действие глаголом только там, где ресурса нет (`/confirm`, `/resign`); `me` не используется, потому что подпись уже называет личность; `hidden` как имя коллекции читается хуже `hides`, но совпадает с именем таблицы `hidden_messages` — это единственное место, где я сам колеблюсь.

**Итог 17.09.2026:** все 56 утверждены владельцем как есть, интерактивно по шести группам; статус в `openapi.yaml` переведён в `spec`.
