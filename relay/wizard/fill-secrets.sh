#!/usr/bin/env bash
# Fill the empty generated secrets of secrets.env (owner /go 07.11.2026: "нужен генератор енв файлов").
#
# Only keys this node generates itself: SESSION_SECRET_<ENV> and VAULT_SHARE_KEY_<ENV>.
# A key with a value is never touched; a missing key is appended. Nothing is printed
# but the names filled. VAULT_SHARE_KEY_PREVIOUS_* is never generated: it holds an old value.
# Usage: fill-secrets.sh [file] [env ...]   (default secrets.env, dev staging prod)
set -euo pipefail
file="${1:-secrets.env}"; shift || true
envs=("$@"); [ ${#envs[@]} -gt 0 ] || envs=(dev staging prod)
[ -f "$file" ] || { cp "$(dirname "$0")/secrets.env.example" "$file"; }
chmod 600 "$file"
gen() { head -c 32 /dev/urandom | base64 | tr -d '\n'; }
filled=()
for env in "${envs[@]}"; do
  up=$(printf '%s' "$env" | tr '[:lower:]' '[:upper:]')
  for name in "SESSION_SECRET_$up" "VAULT_SHARE_KEY_$up"; do
    if grep -qE "^$name=.+" "$file"; then continue; fi
    value=$(gen)
    if grep -qE "^$name=$" "$file"; then
      NAME="$name" VALUE="$value" python3 - "$file" <<'PY'
import os, sys
p = sys.argv[1]; n = os.environ["NAME"]; v = os.environ["VALUE"]
lines = open(p).read().split("\n")
lines = [f"{n}={v}" if l == f"{n}=" else l for l in lines]
open(p, "w").write("\n".join(lines))
PY
    else
      printf '%s=%s\n' "$name" "$value" >> "$file"
    fi
    filled+=("$name")
  done
done
echo "filled: ${filled[*]:-nothing}"
