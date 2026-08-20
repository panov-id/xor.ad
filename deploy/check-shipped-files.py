#!/usr/bin/env python3
"""Refuse to publish a file nobody decided to publish.

The prune added to the deploy removes what the build dropped. It never asks
whether what the build *contains* belongs there, and that is the half that let
the mockups and the tooling out: five design sheets and five check scripts went
to production not by decision but because they sat in a directory that ships
whole.

So the deploy states what it expects to serve, as patterns, and anything else
stops it. Not "delete the stranger" — explain it. A new kind of file is a
decision, and this is where the decision gets made rather than discovered.

    check-shipped-files.py <directory> <manifest>

The manifest is one glob per line; blank lines and #-comments ignored. A pattern
that matches nothing is reported too: an allowance for a file that no longer
exists is how a list rots into permission for anything.
"""

import fnmatch
import os
import pathlib
import sys


def load_patterns(path):
    patterns = []
    for line in pathlib.Path(path).read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            patterns.append(line)
    return patterns


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    directory = pathlib.Path(sys.argv[1])
    manifest = pathlib.Path(sys.argv[2])
    if not directory.is_dir():
        raise SystemExit(f"нет каталога {directory}")
    if not manifest.is_file():
        raise SystemExit(f"нет манифеста {manifest}")

    patterns = load_patterns(manifest)
    if not patterns:
        raise SystemExit(f"манифест {manifest} пуст — так проверять нечем")

    files = sorted(
        str(path.relative_to(directory)).replace(os.sep, "/")
        for path in directory.rglob("*") if path.is_file()
    )
    if not files:
        raise SystemExit(f"в {directory} нет файлов — проверять нечего")

    used = set()
    strangers = []
    for name in files:
        matched = next((p for p in patterns if fnmatch.fnmatch(name, p)), None)
        if matched:
            used.add(matched)
        else:
            strangers.append(name)

    unused = [p for p in patterns if p not in used]

    print(f"{directory}: файлов {len(files)}, правил {len(patterns)}")
    if strangers:
        print(f"\nНЕЗНАКОМЫЕ ФАЙЛЫ — {len(strangers)}:", file=sys.stderr)
        for name in strangers:
            print(f"    {name}", file=sys.stderr)
        print(
            "\nЭто не «удалить лишнее», а «объясните новое». Если файл должен\n"
            f"публиковаться — впишите правило в {manifest}. Если нет — уберите его\n"
            "из того, что собирается.",
            file=sys.stderr,
        )
    if unused:
        # Not fatal: a rule can legitimately cover a file that only some
        # environments build. It is printed because a list nobody prunes stops
        # describing anything.
        print(f"\nправила без совпадений ({len(unused)}): {', '.join(unused)}")

    return 1 if strangers else 0


if __name__ == "__main__":
    sys.exit(main())
