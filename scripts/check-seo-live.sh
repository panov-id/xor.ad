#!/usr/bin/env bash
# Сверяет то, что SEO-документы витрин объявляют сделанным, с живыми адресами.
#
# Документы утверждают: sitemap отдаётся и содержит N адресов, robots ссылается
# на sitemap, www уезжает на апекс 301-м, html кешируется 300 секунд вместо
# тридцати дней, счётчик стоит в разметке и без согласия не грузится.
#
#   scripts/check-seo-live.sh                 # обе витрины
#   scripts/check-seo-live.sh neighbro.place  # одна
#
# До 01.09.2026 этот скрипт печатал числа и **всегда выходил нулём**: тридцать
# четыре строки без единого сравнения. В общем списке он стоял среди ворот, и
# «прогнали, зелено» означало ровно то, что curl отработал. Ворота, которые не
# умеют покраснеть, хуже отсутствующих: отсутствующие никого не успокаивают.
#
# Ожидаемые числа берутся из docs/facts/limits.tsv, а не пишутся здесь. Иначе у
# числа стало бы два дома, и разошлись бы они молча — ровно та беда, ради которой
# реестр и заведён. Реестр против документов держит check-facts-limits.sh, реестр
# против живого адреса — этот файл; вместе цепочка замкнута.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
registry="${FACTS_LIMITS:-$root/docs/facts/limits.tsv}"
[ -f "$registry" ] || { echo "нет реестра: $registry" >&2; exit 2; }

if [ "$#" -gt 0 ]; then
  SITES=("$@")
else
  SITES=(sosed.place neighbro.place)
fi

failed=0
checked=0

limit() {  # limit <id> — значение из реестра или пусто
  awk -F'\t' -v id="$1" '$1 == id { print $2; exit }' "$registry"
}

# printf выравнивает по байтам, а метки кириллические: «%-22s» на них разъезжает
# колонку на длину имени. awk в UTF-8 локали считает символы, поэтому добивка идёт
# через него.
pad() { awk -v text="$1" -v width=22 'BEGIN {
          printf "%s", text
          for (i = length(text); i < width; i++) printf " "
        }'; }

ok() {   checked=$((checked + 1)); printf '  ✓ %s %s\n' "$(pad "$1")" "$2"; }
bad() {  checked=$((checked + 1)); failed=$((failed + 1))
         printf '  ✗ %s %s\n' "$(pad "$1")" "$2"; }

# Короткое имя витрины для ключей реестра: sosed.place → sosed.
key_of() { printf '%s' "${1%%.*}"; }

for site in "${SITES[@]}"; do
  echo "=== $site"
  key=$(key_of "$site")

  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$site/")
  [ "$code" = 200 ] && ok "апекс" "HTTP $code" || bad "апекс" "HTTP $code, ожидалось 200"

  read -r www_code www_target < <(curl -s -o /dev/null \
    -w '%{http_code} %{redirect_url}' --max-time 15 "https://www.$site/")
  if [ "$www_code" = 301 ] && [ "$www_target" = "https://$site/" ]; then
    ok "www → апекс" "301 → $www_target"
  else
    bad "www → апекс" "$www_code → ${www_target:-никуда}, ожидалось 301 → https://$site/"
  fi

  robots=$(curl -s --max-time 15 "https://$site/robots.txt")
  refs=$(printf '%s' "$robots" | grep -ci sitemap || true)
  [ "$refs" -ge 1 ] && ok "robots.txt" "ссылок на sitemap: $refs" \
    || bad "robots.txt" "нет ссылки на sitemap"

  # Ожидание из реестра. Нет строки — это не «пропустим», а отказ: молчаливый
  # пропуск вернул бы ровно то состояние, из-за которого файл переписан.
  expected_urls=$(limit "seo.sitemap.$key")
  sitemap=$(curl -s --max-time 15 "https://$site/sitemap.xml")
  urls=$(printf '%s' "$sitemap" | grep -co '<loc>' || true)
  if [ -z "$expected_urls" ]; then
    bad "sitemap.xml" "в реестре нет seo.sitemap.$key — сверять не с чем"
  elif [ "$urls" = "$expected_urls" ]; then
    ok "sitemap.xml" "адресов: $urls"
  else
    bad "sitemap.xml" "адресов: $urls, реестр обещает $expected_urls"
  fi

  cache=$(curl -sI --max-time 15 "https://$site/" | tr -d '\r' \
    | grep -i '^cache-control' | head -1)
  case "$cache" in
    *max-age=300*) ok "кеш html" "${cache#*: }" ;;
    *) bad "кеш html" "${cache:-заголовка нет}, ожидалось max-age=300" ;;
  esac

  html=$(curl -s --max-time 15 "https://$site/")

  hits=$(printf '%s' "$html" | grep -ci 'googletagmanager\|gtag(' || true)
  [ "$hits" -ge 1 ] && ok "счётчик в разметке" "совпадений: $hits" \
    || bad "счётчик в разметке" "не найден — без него считать нечем"

  expected_alternates=$(limit "seo.hreflang.$key")
  alternates=$(printf '%s' "$html" | grep -co 'hreflang=' || true)
  if [ -z "$expected_alternates" ]; then
    bad "hreflang в шапке" "в реестре нет seo.hreflang.$key — сверять не с чем"
  elif [ "$alternates" = "$expected_alternates" ]; then
    ok "hreflang в шапке" "альтернатив: $alternates"
  else
    bad "hreflang в шапке" "альтернатив: $alternates, реестр обещает $expected_alternates"
  fi
done

echo
if [ "$failed" -gt 0 ]; then
  echo "проверок сделано: $checked, провалено: $failed — живое разошлось с обещанным"
  exit 1
fi
echo "проверок сделано: $checked — живое сходится с тем, что обещают документы"
