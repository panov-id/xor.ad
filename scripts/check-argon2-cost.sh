#!/usr/bin/env bash
# Сколько стоит Argon2id во вкладке — замер, а не память.
#
# §8.2 задаёт 64 МБ и t=3 и для ПИНа, и для бумажного кода. До 11.09.2026 эти
# числа не проверялись ни разу: WebCrypto Argon2id не умеет, это WASM, и
# существующие ворота check-webcrypto-support.sh про него молчат. Цена ошибки
# здесь не такая, как везде: параметры входят в вывод ключа КАЖДОГО устройства,
# поэтому сменить их после запуска — значит обнулить все доли хранилища и все
# бумажные коды разом, то есть стереть локальные истории у всех сразу.
#
# Ноутбук — не телефон, и замер этого не скрывает: он отвечает на вопрос
# «работает ли вообще и не падает ли вкладка по памяти», а не «сколько ждёт
# человек». Телефонное число появится, когда появится телефон с клиентом.
#
# Не в check-all.sh по той же причине, что и WebCrypto: каждый прогон качает три
# браузера. Это замер, а не ворота.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker run --rm \
  -v "$root/testing/argon2-cost.mjs":/work/probe.mjs:ro \
  -w /work \
  --entrypoint bash \
  mcr.microsoft.com/playwright:v1.49.0-noble \
  -c '
    npm init -y >/dev/null 2>&1
    npm install --silent playwright@latest >/dev/null 2>&1
    npx playwright install --with-deps chromium firefox webkit >/dev/null 2>&1
    node probe.mjs
  '
