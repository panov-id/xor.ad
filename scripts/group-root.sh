#!/usr/bin/env bash
# Корень группы репозиториев — один на все ворота.
#
#   source scripts/group-root.sh; group="$(group_root "$root")"
#   bash scripts/group-root.sh <корень-репозитория>          печатает корень группы
#   bash scripts/group-root.sh --main <корень-репозитория>   печатает основное дерево
#
# Зачем. Ворота искали соседние репозитории как `$root/..`. Из основного дерева
# это panov-id/, а из рабочего дерева .claude/worktrees/<имя> — это
# .claude/worktrees/, где нет ни sosed.place, ни neighbro.place, ни xor.ad.
# Замер 26.09.2026: check-all из рабочего дерева давал 12 красных, из них 11 —
# «файла нет» по этой причине, и настоящее красное среди них не различалось.
#
# Как. В основном дереве корень группы — родитель, как было. В рабочем дереве
# корень группы — вид: каталог ссылок (~/.cache/group-view/<путь дерева>), где
# соседи ведут к настоящим соседям, а имя
# основного дерева — к ЭТОМУ рабочему дереву. Не к основному: адрес
# «xor.ad/docs/chat_RU.md», прочитанный из основного дерева, проверял бы чужую
# ветку и зеленел бы за неё.
#
# Вне git и в копии скриптов (пробы ворот кладут scripts/ в пустую песочницу)
# ответ прежний — родитель: песочница сама строит себе группу рядом.
group_root__toplevel() {  # печатает корень git, только если он и есть $1
  local root="$1" top
  top="$(git -C "$root" rev-parse --show-toplevel 2>/dev/null)" || return 1
  [ "$(cd "$top" && pwd -P)" = "$(cd "$root" && pwd -P)" ] || return 1
  printf '%s\n' "$top"
}

group_root__main() {  # основное дерево для $1; вне git — сам $1
  local root="$1" top common
  if top="$(group_root__toplevel "$root")" \
     && common="$(git -C "$top" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"; then
    dirname "$common"
  else
    (cd "$root" && pwd)
  fi
}

group_root() {
  local root; root="$(cd "$1" && pwd)" || return 1
  local main; main="$(group_root__main "$root")"
  local parent; parent="$(dirname "$main")"
  if [ "$(cd "$main" && pwd -P)" = "$(cd "$root" && pwd -P)" ]; then
    printf '%s\n' "$(dirname "$root")"
    return
  fi
  # Вне .git и вне дерева: ворота отбрасывают пути с «/.git/» (check-docs-pairing
  # так терял все пары витрин), а каталог в дереве стоял бы в git status.
  local view="${XDG_CACHE_HOME:-$HOME/.cache}/group-view/${root//\//-}"
  mkdir -p "$view" || return 1
  local entry name
  for entry in "$parent"/* "$parent"/.[!.]*; do
    [ -e "$entry" ] || continue
    name="$(basename "$entry")"
    [ "$entry" = "$main" ] && continue
    ln -sfn "$entry" "$view/$name"
  done
  ln -sfn "$root" "$view/$(basename "$main")"
  printf '%s\n' "$view"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -uo pipefail
  if [ "${1:-}" = --main ]; then
    [ -n "${2:-}" ] || { echo "usage: $0 --main <root>" >&2; exit 2; }
    group_root__main "$2"
  else
    [ -n "${1:-}" ] || { echo "usage: $0 [--main] <root>" >&2; exit 2; }
    group_root "$1"
  fi
fi
