#!/usr/bin/env bash
# Проба ворот сроков хранения: каждое расхождение обязано покраснеть.
#
#   scripts/test_check-retention.sh
#
# Ворота, чьё падение никто не видел, ничего не доказывают (правило проекта).
# Каждая поломка делается на копии нужных файлов — живые реестр и код только читаются.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
gate="$here/check-retention.sh"

files=(docs/facts/limits.tsv relay/node/tools/prune_objects.ts relay/node/tools/prune_dsa_records.ts
       relay/node/tools/prune_pageviews.ts relay/node/src/lib/support_sweeper.ts
       relay/node/src/lib/identity_sweeper.ts relay/node/src/lib/advertiser_sweeper.ts relay/wizard/backup-postgres.sh relay/wizard/wizard.py)
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

fresh() {
  rm -rf "$work/copy"
  for f in "${files[@]}"; do mkdir -p "$work/copy/$(dirname "$f")"; cp "$root/$f" "$work/copy/$f"; done
}
edit() {  # edit <файл> <было> <стало>
  python3 - "$work/copy/$1" "$2" "$3" <<'EOF'
import sys; p, a, b = sys.argv[1:]; s = open(p).read()
if s.count(a) != 1: sys.exit(f"не найдено ровно одно «{a}» в {p}")
open(p, "w").write(s.replace(a, b, 1))
EOF
}

failures=0; number=0
expect() {  # expect <код> <подстрока> <описание>
  number=$((number + 1))
  local out code
  out=$(RETENTION_ROOT="$work/copy" bash "$gate" 2>&1); code=$?
  if [ "$code" = "$1" ] && printf '%s' "$out" | grep -qF -- "$2"; then
    printf '  ✓ %s\n' "$3"
  else
    failures=$((failures + 1))
    printf '  ✗ %s — ждали код %s и «%s», получили %s:\n%s\n' "$3" "$1" "$2" "$code" "$out"
  fi
}

fresh; expect 0 "сходятся" "живые файлы сходятся"
fresh; edit relay/node/tools/prune_objects.ts 'directory: "server-logs",
    days: 30,' 'directory: "server-logs",
    days: 31,'
expect 1 "logs.retention: реестр обещает 30 дн., а relay/node/tools/prune_objects.ts держит 31" "логи держатся дольше обещанного"
fresh; edit relay/node/tools/prune_objects.ts 'directory: "audit",
    days: 365,' 'directory: "audit",
    days: 365 * 2,'
expect 1 "audit.log.retention: в relay/node/tools/prune_objects.ts место срока найдено 0 раз" "срок записан выражением, а не числом"
fresh; edit relay/node/tools/prune_dsa_records.ts "const YEAR_DAYS = 365;" "const YEAR_DAYS = 400;"
expect 1 "dsa.records.retention: реестр обещает 365 дн." "запись DSA держится дольше года"
fresh; edit relay/wizard/backup-postgres.sh "keep_days=14" "keep_days=21"
expect 1 "backup.retention: реестр обещает 14 дн., а relay/wizard/backup-postgres.sh держит 21" "бэкап держится три недели"
fresh; edit relay/node/src/lib/support_sweeper.ts "interval '1 year'" "interval '2 year'"
expect 1 "support.retention: реестр обещает 365 дн." "поддержка держится два года"
fresh; edit relay/node/tools/prune_pageviews.ts "const DEFAULT_DAYS = 14;" "const DAYS = 14;"
expect 1 "найдено 0 раз — привязка устарела" "место срока переименовали — привязка молчит не молча"
fresh; printf 'mail.log.retention\t30\tдней\tчто-то новое\tузел\txor.ad/docs/chat_RU.md\tprune_objects\n' >> "$work/copy/docs/facts/limits.tsv"
expect 1 "mail.log.retention: срок в реестре без привязки к коду" "новый срок в реестре без привязки"

echo
if [ "$failures" -gt 0 ]; then echo "случаев: $number, провалено: $failures"; exit 1; fi
echo "случаев: $number — каждое расхождение видно"
