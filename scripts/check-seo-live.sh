#!/usr/bin/env bash
# Сверяет то, что SEO-документы витрин объявляют сделанным, с живыми адресами.
#
# Документы утверждают: sitemap отдаётся и содержит N адресов, robots ссылается
# на sitemap, www уезжает на апекс 301-м, html кешируется 300 секунд вместо
# тридцати дней, счётчик без согласия не грузится. Всё это проверяется запросом,
# а не чтением — и до сих пор не проверялось ни разу после выката.
#
#   scripts/check-seo-live.sh                 # обе витрины
#   scripts/check-seo-live.sh neighbro.place  # одна
set -uo pipefail
SITES=("${@:-sosed.place neighbro.place}")

for site in ${SITES[@]}; do
  echo "=== $site"
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$site/")
  echo "  апекс                 HTTP $code"

  www=$(curl -s -o /dev/null -w '%{http_code} → %{redirect_url}' --max-time 15 "https://www.$site/")
  echo "  www                   $www"

  robots=$(curl -s --max-time 15 "https://$site/robots.txt")
  echo "  robots.txt            $(echo "$robots" | grep -ci sitemap) ссылок на sitemap, строк: $(echo "$robots" | wc -l)"

  sitemap=$(curl -s --max-time 15 "https://$site/sitemap.xml")
  echo "  sitemap.xml           адресов: $(echo "$sitemap" | grep -co '<loc>')"

  cache=$(curl -sI --max-time 15 "https://$site/" | grep -i '^cache-control' | tr -d '\r')
  echo "  кеш html              ${cache:-заголовка нет}"

  html=$(curl -s --max-time 15 "https://$site/")
  echo "  счётчик в разметке    $(echo "$html" | grep -ci 'googletagmanager\|gtag(') совпадений"
  echo "  hreflang в шапке      $(echo "$html" | grep -co 'hreflang=')"
done
