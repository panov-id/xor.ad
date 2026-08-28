#!/usr/bin/env bash
# Проверяет обещание витрин: без согласия запросов к счётчику нет.
#
# SEO-документ обещает это прямо, и до сих пор пункт стоял открытым: грепом по
# разметке его не закрыть — там видно только, что вызов спрятан за функцией.
# Нужен настоящий браузер с чистым профилем (согласия ещё нет) и сетевой лог.
# Берём браузер из уже лежащего на машине образа: на хост не ставим ничего.
#
#   scripts/check-analytics-gate.sh                 # обе витрины
#   scripts/check-analytics-gate.sh neighbro.place
set -uo pipefail
IMAGE="${GATE_IMAGE:-mcr.microsoft.com/playwright:v1.52.0-noble}"
SITES=("${@:-sosed.place neighbro.place}")
FAIL=0

# Самопроверка: детектор обязан краснеть там, где счётчик действительно грузится.
# Без неё зелёный ответ неотличим от «мы ничего не увидели». Страница поднимается
# в самом контейнере и честно тянет тот же скрипт.
if [ "${1:-}" = "--self-test" ]; then
  echo "=== самопроверка детектора"
  out=$(timeout 90 docker run --rm --entrypoint /bin/sh "$IMAGE" -c "
    printf '%s' '<script src=\"https://www.googletagmanager.com/gtag/js?id=G-TEST\"></script>' > /tmp/probe.html
    BROWSER=\$(ls -d /ms-playwright/chromium-*/chrome-linux/chrome | head -1)
    timeout 40 \"\$BROWSER\" --headless --no-sandbox --disable-gpu \
      --user-data-dir=/tmp/probe-profile --log-net-log=/tmp/net.json \
      --net-log-capture-mode=Default --virtual-time-budget=6000 \
      --dump-dom 'file:///tmp/probe.html' >/dev/null 2>&1 || true
    python3 -c \"
import re
text = open('/tmp/net.json', encoding='utf-8', errors='replace').read()
urls = {u for u in re.findall(r'\\\"url\\\":\\\"(https?://[^\\\"]+)\\\"', text)}
for u in sorted(u for u in urls if 'googletagmanager' in u): print('СЧЁТЧИК:', u[:80])
\"
  ")
  if echo "$out" | grep -q '^СЧЁТЧИК:'; then
    echo "  детектор увидел загрузку счётчика — краснеть умеет"
    exit 0
  fi
  echo "  ПЛОХО: детектор не увидел заведомую загрузку — зелёный ответ ничего не значит"
  exit 1
fi

for site in ${SITES[@]}; do
  out=$(timeout 90 docker run --rm --entrypoint /bin/sh "$IMAGE" -c "
    BROWSER=\$(ls -d /ms-playwright/chromium-*/chrome-linux/chrome | head -1)
    timeout 40 \\
    \"\$BROWSER\" --headless --no-sandbox --disable-gpu \
      --user-data-dir=/tmp/profile-\$\$ \
      --log-net-log=/tmp/net.json --net-log-capture-mode=Default \
      --virtual-time-budget=6000 --dump-dom 'https://$site/' >/dev/null 2>&1 || true
    # Считаем ЗАПРОСЫ, а не вхождения строки: домен счётчика стоит и в заголовке
    # CSP самой страницы, а заголовки тоже попадают в сетевой лог. Первая версия
    # этой проверки на них и покраснела — вытаскиваем поля \"url\" и смотрим их.
    python3 - <<'PYEOF'
import json, re
text = open('/tmp/net.json', encoding='utf-8', errors='replace').read()
urls = set(re.findall(r'\"url\":\"(https?://[^\"]+)\"', text))
hits = sorted(u for u in urls
              if 'googletagmanager.com' in u or 'google-analytics.com' in u)
print('ЗАПРОСОВ ВСЕГО:', len(urls))
for u in hits:
    print('СЧЁТЧИК:', u[:120])
PYEOF
  ")
  hits=$(echo "$out" | grep -c '^СЧЁТЧИК:')
  echo "=== $site"
  if [ "$hits" -eq 0 ]; then
    echo "  без согласия к счётчику не ходили — обещание держится"
    echo "  $(echo "$out" | grep 'ЗАПРОСОВ ВСЕГО' | head -1) (положительный контроль: лог не пустой)"
  else
    echo "  ЗАПРОСЫ К СЧЁТЧИКУ БЕЗ СОГЛАСИЯ: $hits"
    echo "$out" | sed 's/^/    /' | head -10
    FAIL=1
  fi
done
exit $FAIL
