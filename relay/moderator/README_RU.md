# Модель-модератор

Первый уровень §8.14: локальная модель читает фразу, которую правила отправили
в очередь, и оставляет рядом подсказку — `publish`, `reject` или `unsure`
(`moderator_hints`, миграция 080). Решает по-прежнему человек в очереди; модель
ничего не публикует и ни в чём не отказывает.

- **По умолчанию выключена.** Узел спрашивает модель, только если задан
  `MODERATOR_URL` (`MODERATOR_MODEL`, по умолчанию `qwen2.5:3b-instruct`;
  `MODERATOR_TIMEOUT_MS`, по умолчанию 20000). Код: `relay/node/src/lib/moderator.ts`.
- **С машины ничего не уходит.** Модель работает в Docker в сети `internal`
  без шлюза; узел подключается к этой сети. Ни ключа, ни аккаунта, ни внешнего API.
- **После ответа.** Узел спрашивает после 202, вне транзакции фразы: медленная
  или мёртвая модель автору ничего не стоит, неудавшейся подсказки просто нет.

## Веса

Один раз на машину, в том `moderator-models`. На машине, где это собиралось,
веса уже лежали в томе другого проекта и были скопированы, а не скачаны:

```bash
docker volume create moderator-models
docker run --rm -v <том с весами>:/from:ro -v moderator-models:/to alpine cp -a /from/models /to/
```

На чистой машине — один раз `ollama pull qwen2.5:3b-instruct` в этот том из
контейнера с сетью; у работающей модели сети нет никогда.

## Запуск и проверка

| Команда | Что |
|---|---|
| `docker compose -f relay/moderator/docker-compose.yml up -d` | модель в сети `moderator` |
| `relay/moderator/measure.sh > report.json` | модель на корпусе замера правил |
| `relay/moderator/check-migration.sh` | 079 → 080 поверх строк, 080 дважды |
| `scripts/run-relay-database-tests.sh --filter E2` | путь подсказки в узле с моделью-заглушкой |

Замер: `docs/measurements/moderator-2026-09-27_RU.md`.
