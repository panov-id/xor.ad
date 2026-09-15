#!/usr/bin/env bash
# Проба batch-edit.py: каждое правило отказа обязано покраснеть, а честная пачка — лечь.
#
#   scripts/test_batch-edit.sh
#
# Стенд — временная группа из трёх каталогов, настоящие репозитории не трогаются.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tool="$here/batch-edit.py"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
failed=0

pass() { printf '  ok   %s\n' "$1"; }
fail() { failed=$((failed + 1)); printf '  FAIL %s — %s\n' "$1" "$2"; }

stand() {
  rm -rf "$work/g"; mkdir -p "$work/g/xor.ad/docs" "$work/g/sosed.place/docs" "$work/g/neighbro.place/docs" \
    "$work/g/sosed.place/landing/legal" "$work/g/neighbro.place/landing/legal"
  printf 'Пауза пять минут.\n' > "$work/g/xor.ad/docs/chat_RU.md"
  printf 'A five-minute pause.\n' > "$work/g/xor.ad/docs/chat_EN.md"
  printf 'дубль и дубль\n' > "$work/g/xor.ad/docs/dup_RU.md"
  printf 'no pair here\n' > "$work/g/xor.ad/docs/dup_EN.md"
  for f in sosed.place neighbro.place; do printf 'Экран: старое.\n' > "$work/g/$f/docs/11-x_RU.md"; printf 'Screen: old.\n' > "$work/g/$f/docs/11-x_EN.md"; done
  printf 'Write to support@sosed.place.\n' > "$work/g/sosed.place/landing/legal/terms_EN.md"
  printf 'Write to support@neighbro.place.\n' > "$work/g/neighbro.place/landing/legal/terms_EN.md"
  printf '# registry\nстарое правило | chat_RU.md | новое, 01.01.2026\n' > "$work/g/xor.ad/docs/retired-terms.txt"
}

run() { python3 "$tool" "$1" --root "$work/g" >"$work/out" 2>&1; echo $?; }

# 1. честная пачка ложится целиком: пара, зеркало, бренд, реестр
stand
cat > "$work/ok.json" <<'JSON'
{"edits": [{"file": "xor.ad/docs/chat_RU.md", "old": "пять минут", "new": "15 минут"},
           {"file": "xor.ad/docs/chat_EN.md", "old": "five-minute", "new": "15-minute"}],
 "screens": [{"file": "docs/11-x_RU.md", "old": "старое", "new": "новое"},
             {"file": "docs/11-x_EN.md", "old": "old", "new": "new"}],
 "legal": [{"file": "landing/legal/terms_EN.md", "old": "support@{domain}.", "new": "support@{domain} — {brand}."}],
 "retired": [{"phrase": "пять минут паузы", "files": "chat_RU.md", "why": "15 минут, 15.09.2026"}],
 "unpaired": {"sosed.place/landing/legal/terms_EN.md": "у юр-текстов нет RU", "neighbro.place/landing/legal/terms_EN.md": "у юр-текстов нет RU"}}
JSON
code=$(run "$work/ok.json")
[ "$code" = 0 ] && grep -q "15 минут" "$work/g/xor.ad/docs/chat_RU.md" && grep -q "новое" "$work/g/neighbro.place/docs/11-x_RU.md" \
  && grep -q "support@neighbro.place — Neighbro." "$work/g/neighbro.place/landing/legal/terms_EN.md" \
  && grep -q "пять минут паузы" "$work/g/xor.ad/docs/retired-terms.txt" \
  && pass "honest batch applies: pair, mirror, brand, registry" || fail "honest batch applies" "code $code: $(cat "$work/out")"

# 2. повтор той же фразы в реестр не дублируется
code=$(run "$work/ok.json")
[ "$code" = 1 ] && [ "$(grep -c 'пять минут паузы' "$work/g/xor.ad/docs/retired-terms.txt")" = 1 ] \
  && pass "a second run refuses (text already replaced) and does not duplicate the registry" || fail "second run" "code $code"

# 3. два совпадения — отказ, и ничего не записано
stand
echo '{"edits": [{"file": "xor.ad/docs/dup_RU.md", "old": "дубль", "new": "x"}], "unpaired": {"xor.ad/docs/dup_RU.md": "проба"}}' > "$work/dup.json"
code=$(run "$work/dup.json")
[ "$code" = 1 ] && grep -q "совпадений 2" "$work/out" && grep -q "дубль и дубль" "$work/g/xor.ad/docs/dup_RU.md" \
  && pass "two matches refuse the batch and write nothing" || fail "two matches" "code $code: $(cat "$work/out")"

# 4. RU без EN — отказ, и соседняя честная правка тоже не легла
stand
echo '{"edits": [{"file": "xor.ad/docs/chat_RU.md", "old": "пять минут", "new": "15 минут"}, {"file": "sosed.place/docs/11-x_EN.md", "old": "old", "new": "new"}], "unpaired": {"sosed.place/docs/11-x_EN.md": "проба"}}' > "$work/nopair.json"
code=$(run "$work/nopair.json")
[ "$code" = 1 ] && grep -q "без пары" "$work/out" && grep -q "Screen: old" "$work/g/sosed.place/docs/11-x_EN.md" \
  && pass "a Russian half without its English twin refuses everything" || fail "missing pair" "code $code: $(cat "$work/out")"

# 5. нет файла — отказ
stand
echo '{"edits": [{"file": "xor.ad/docs/none_RU.md", "old": "a", "new": "b"}]}' > "$work/nofile.json"
code=$(run "$work/nofile.json")
[ "$code" = 1 ] && grep -q "нет файла" "$work/out" && pass "a missing file refuses" || fail "missing file" "code $code"

# 6. сухой прогон ничего не пишет
stand
python3 "$tool" "$work/ok.json" --root "$work/g" --dry-run >"$work/out" 2>&1
grep -q "^+Пауза 15 минут" "$work/out" && grep -q "Пауза пять минут" "$work/g/xor.ad/docs/chat_RU.md" \
  && pass "dry run shows the diff and writes nothing" || fail "dry run" "$(cat "$work/out")"

# 7. нечитаемая пачка — код 2
echo '{' > "$work/bad.json"
code=$(run "$work/bad.json")
[ "$code" = 2 ] && pass "an unreadable batch exits 2" || fail "unreadable batch" "code $code"

[ "$failed" = 0 ] && { echo "batch-edit: every case passed"; exit 0; }
echo "FAILED: $failed"; exit 1
