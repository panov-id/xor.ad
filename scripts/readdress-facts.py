#!/usr/bin/env python3
"""Re-address the line numbers the fact registries carry.

    scripts/readdress-facts.py            # say what would change
    scripts/readdress-facts.py --write    # change it

Two registries hold `file:line` addresses that documents outgrow the moment a
paragraph is inserted above them.  The line number is a convenience for jumping;
what actually identifies the target is something else, and each registry says so
in its own way:

    open.tsv    an `anchor` column — a unique fragment of the target line.
    schema.tsv  the table name — `CREATE TABLE <name>` is unique per document.

check-facts-open.sh and check-facts-schema.sh compare the two and go red on
drift.  Fixing that by hand is transcription work, and transcription work done by
hand is how the addresses drifted in the first place: on 03.09.2026 fifteen of
eighteen schema addresses and thirteen of twenty-nine open addresses pointed at
the wrong line, all filled in once and never touched again.

This script does not invent an address.  Where the identifier is missing or
ambiguous it refuses that row and says so — that is a gate failure to be fixed by
a human, not a number to be rewritten.

Without --write it is a gate, and a gate that finds drift goes red: exit code 1
means either something was refused, or an address has drifted and nobody has
written the new number down yet.  With --write drift is not a failure — it is the
work being done — and only a refusal is left to report.
"""

import argparse
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GROUP = ROOT.parent


def resolve(rel: str) -> Path | None:
    """Registries address the repository first, then the sibling repositories."""
    for base in (ROOT, GROUP):
        candidate = base / rel
        if candidate.is_file():
            return candidate
    return None


def lines_of(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8").splitlines()


def find_by_anchor(path: Path, anchor: str) -> list[int]:
    return [i for i, line in enumerate(lines_of(path), 1) if anchor in line]


def find_by_table(path: Path, table: str) -> list[int]:
    pattern = re.compile(rf"CREATE TABLE (IF NOT EXISTS )?{re.escape(table)}\b")
    return [i for i, line in enumerate(lines_of(path), 1) if pattern.search(line)]


class Registry:
    """One TSV whose rows carry an address plus a way to find it again."""

    def __init__(self, name, rel, address_column, locate, env):
        self.name = name
        # The gates take their registry from the environment so a test can run
        # them on a copy; this takes it from the same place, for the same reason.
        self.path = Path(os.environ.get(env) or ROOT / rel)
        self.address_column = address_column
        self.locate = locate  # (row) -> (target file, [line numbers]) or None


def open_locate(fields: dict, address: str):
    anchor = fields.get("anchor", "")
    if not anchor:
        return None, "адрес с номером строки, а якоря нет"
    target = resolve(address.rsplit(":", 1)[0])
    if target is None:
        return None, "адрес указывает на файл, которого нет"
    return (target, find_by_anchor(target, anchor)), None


def schema_locate(fields: dict, address: str):
    target = resolve(address.rsplit(":", 1)[0])
    if target is None:
        return None, "адрес указывает на файл, которого нет"
    return (target, find_by_table(target, fields["table"])), None


REGISTRIES = [
    Registry("open", "docs/facts/open.tsv", "where", open_locate, "FACTS_OPEN"),
    Registry("schema", "docs/facts/schema.tsv", "declared_in", schema_locate, "FACTS_SCHEMA"),
]


def process(registry: Registry, write: bool) -> tuple[int, int]:
    raw = registry.path.read_text(encoding="utf-8").splitlines(keepends=True)
    header = None
    fixed = refused = 0
    out = []

    for raw_line in raw:
        line = raw_line.rstrip("\n")
        if not line or line.startswith("#"):
            out.append(raw_line)
            continue
        cells = line.split("\t")
        if header is None:
            header = cells
            out.append(raw_line)
            continue

        fields = dict(zip(header, cells))
        column = registry.address_column
        address = fields.get(column, "")
        # No colon means the address is the whole file — nothing to re-address.
        if ":" not in address or not address.rsplit(":", 1)[1].isdigit():
            out.append(raw_line)
            continue

        rel, current = address.rsplit(":", 1)
        located, problem = registry.locate(fields, address)
        row_id = fields.get("id") or fields.get("table") or "?"
        if problem:
            print(f"  ✗ {row_id}: {problem} — {rel}")
            refused += 1
            out.append(raw_line)
            continue

        target, hits = located
        if len(hits) == 0:
            print(f"  ✗ {row_id}: не нашлось в {rel} — чинить руками, не номером")
            refused += 1
            out.append(raw_line)
            continue
        if len(hits) > 1:
            found = " ".join(str(h) for h in hits)
            print(f"  ✗ {row_id}: найдено {len(hits)} раз в {rel} ({found}) — адрес неоднозначен")
            refused += 1
            out.append(raw_line)
            continue

        actual = hits[0]
        if str(actual) == current:
            out.append(raw_line)
            continue

        print(f"  · {row_id}: {rel}:{current} → {actual}")
        cells[header.index(column)] = f"{rel}:{actual}"
        out.append("\t".join(cells) + "\n")
        fixed += 1

    if write and fixed:
        registry.path.write_text("".join(out), encoding="utf-8")
    return fixed, refused


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="записать, а не только показать")
    args = parser.parse_args()

    total_fixed = total_refused = 0
    for registry in REGISTRIES:
        print(f"{registry.name}:")
        fixed, refused = process(registry, args.write)
        total_fixed += fixed
        total_refused += refused
        verb = "переадресовано" if args.write else "переадресовалось бы"
        print(f"  {verb}: {fixed}, отказано: {refused}")

    if total_refused:
        print(f"\nотказов: {total_refused} — номер тут не поможет, чинить руками")
        return 1
    if total_fixed and not args.write:
        # Sitting inside check-all, a dry run is a gate: a drifted address that
        # nobody has written down is exactly what the run is looking for.
        print(f"\nразошлось адресов: {total_fixed} — чинится: {sys.argv[0]} --write")
        return 1
    verb = "переадресовано" if args.write else "сходится, переадресовывать нечего"
    print(f"\nвсего: {total_fixed} — {verb}" if args.write else f"\n{verb}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
