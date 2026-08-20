#!/usr/bin/env python3
"""Delete from a Bunny Storage zone whatever the local directory no longer has.

The deploy only ever uploads. A file dropped from the build therefore stays
served forever: the panel zone held sixteen superseded bundles and five design
mockups that no code referenced, and the mockups kept answering 200 after the
commit that removed them was deployed. Purging the CDN does not help — the
objects are in storage, not in the cache.

    BUNNY_STORAGE_API_KEY=… prune-storage-zone.py <zone> <directory>          # plan
    BUNNY_STORAGE_API_KEY=… prune-storage-zone.py <zone> <directory> --apply  # delete

**Run it against the directory that was just uploaded to that zone, nothing
else.** On 2026-08-18 it was run with a locally built `panel/dist` against a
zone deployed by CI. The two builds hash their bundles differently, so the live
`index-otzjI_ZF.js` looked stale and was deleted; the panel went blank until the
deploy was re-run. The third guard below exists because of that hour.

Deleting is the dangerous direction, so three things stand in the way of a bad
run: nothing happens without --apply; a plan that would remove more than half of
what the zone holds stops instead of proceeding; and nothing referenced by the
zone's own index.html is ever deleted, whatever the plan says. A build that
produced nothing, or a different build than the one deployed, must not be able
to empty a live site.
"""

import argparse
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request

STORAGE = "https://storage.bunnycdn.com"
# Above this share of the zone, a prune is likelier to be a broken build than a
# cleanup. Overridable, but only on purpose.
REFUSE_ABOVE = 0.5


def request(method, url, key):
    call = urllib.request.Request(url, method=method, headers={
        "AccessKey": key,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(call, timeout=60) as response:
        return response.status, response.read()


def listing(zone, key, path=""):
    """Bunny lists one directory at a time, so walk the tree."""
    status, body = request("GET", f"{STORAGE}/{zone}/{path}", key)
    if status != 200:
        raise SystemExit(f"хранилище ответило {status} на список /{path}")
    return json.loads(body or b"[]")


def stored_files(zone, key):
    found, pending = [], [""]
    while pending:
        path = pending.pop()
        for entry in listing(zone, key, path):
            full = f"{path}{entry['ObjectName']}"
            if entry["IsDirectory"]:
                pending.append(full + "/")
            else:
                found.append((full, entry.get("Length", 0)))
    return found


def referenced_by_index(zone, key):
    """Assets the zone's own index.html points at — the set that must survive.

    Read from the zone rather than from disk: the question is what the page
    being served right now needs, and that is the one thing a prune must not
    take away. A zone with no index.html (a landing zone) simply protects
    nothing here and relies on the other two guards.
    """
    try:
        status, body = request("GET", f"{STORAGE}/{zone}/index.html", key)
    except urllib.error.HTTPError:
        return set()
    if status != 200:
        return set()
    text = body.decode("utf-8", "replace")
    found = set()
    for match in re.finditer(r"""(?:src|href)\s*=\s*["']([^"']+)["']""", text):
        target = match.group(1)
        if target.startswith(("http://", "https://", "//", "data:", "#", "mailto:")):
            continue
        found.add(target.split("?")[0].split("#")[0].lstrip("/"))
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("zone")
    parser.add_argument("directory")
    parser.add_argument("--apply", action="store_true", help="удалять, а не только показывать план")
    # --force takes the zone name rather than being a bare flag. On 2026-08-18 the
    # dev zone was wiped with a bare --force typed out of habit, because dev felt
    # cheap; the same care had been taken with production an hour later. Having to
    # write the zone out again is the difference between overriding a guard and
    # noticing that you are.
    parser.add_argument("--force", metavar="ZONE",
                        help="перебить порог: назовите ту же зону ещё раз")
    arguments = parser.parse_args()

    # Checked before anything is read or written: a refusal that only arrives
    # after the zone has been listed is a refusal that depends on the network
    # working, and it crashed instead of refusing the first time it was tried.
    if arguments.force and arguments.force != arguments.zone:
        print(
            f"ОТКАЗ: --force назван «{arguments.force}», а зона «{arguments.zone}».\n"
            "Перебить порог можно только назвав ту же зону — привычка так не срабатывает.",
            file=sys.stderr,
        )
        return 2

    key = os.environ.get("BUNNY_STORAGE_API_KEY", "")
    if not key:
        raise SystemExit("BUNNY_STORAGE_API_KEY не задан")

    directory = pathlib.Path(arguments.directory)
    if not directory.is_dir():
        raise SystemExit(f"нет каталога {directory}")
    local = {
        str(path.relative_to(directory)).replace(os.sep, "/")
        for path in directory.rglob("*") if path.is_file()
    }
    if not local:
        raise SystemExit(f"в {directory} нет ни одного файла — уборка отменена")

    stored = stored_files(arguments.zone, key)
    stale = sorted((name, size) for name, size in stored if name not in local)

    # The guard that was missing: whatever index.html points at is being served
    # right now, and a plan that would take it away is a plan built against the
    # wrong directory — not a cleanup.
    live = referenced_by_index(arguments.zone, key)
    doomed = sorted({name for name, _ in stale} & live)
    if doomed:
        print(
            "ОТКАЗ: под удаление попало то, на что ссылается index.html самой зоны:\n"
            + "".join(f"    {name}\n" for name in doomed)
            + "Почти наверняка каталог собран не тем, чем выкачена зона — у сборок\n"
            "разные хэши в именах. Уборку запускают в самом выкате, сразу после\n"
            "заливки того же каталога.",
            file=sys.stderr,
        )
        return 2

    print(f"зона {arguments.zone}: {len(stored)} файлов; локально: {len(local)}; лишних: {len(stale)}")
    if not stale:
        print("убирать нечего")
        return 0

    freed = sum(size for _, size in stale)
    for name, size in stale:
        print(f"  {size / 1024:9.1f} КБ  {name}")
    print(f"  ─────────  {freed / 1024 / 1024:.2f} МБ")

    share = len(stale) / len(stored)
    if share > REFUSE_ABOVE and not arguments.force:
        print(
            f"\nОТКАЗ: удалению подлежит {share:.0%} зоны — это больше похоже на сломанную\n"
            f"сборку, чем на уборку. Если так и задумано, повторите с --force {arguments.zone}.",
            file=sys.stderr,
        )
        return 2

    if not arguments.apply:
        print("\nэто план. Чтобы удалить, повторите с --apply")
        return 0

    # A deletion with no record of what it deleted can only be undone from memory.
    # The plan goes to a file beside the zone name before the first DELETE, so a
    # wrong prune can at least be described afterwards.
    ledger = pathlib.Path(os.environ.get("PRUNE_LEDGER_DIR", ".")) / f"pruned-{arguments.zone}.txt"
    try:
        ledger.write_text("".join(f"{name}\t{size}\n" for name, size in stale), encoding="utf-8")
        print(f"\nсписок удаляемого записан: {ledger}")
    except OSError as error:
        print(f"\nне смог записать список удаляемого ({error}) — удаление отменено", file=sys.stderr)
        return 1

    failed = 0
    for name, _ in stale:
        try:
            status, _body = request("DELETE", f"{STORAGE}/{arguments.zone}/{name}", key)
            ok = 200 <= status < 300
        except urllib.error.HTTPError as error:
            status, ok = error.code, False
        print(f"  {'удалён ' if ok else 'ОШИБКА'} {name}" + ("" if ok else f" — HTTP {status}"))
        if not ok:
            failed += 1

    if failed:
        print(f"\nне удалось удалить: {failed}", file=sys.stderr)
        return 1
    print(f"\nудалено файлов: {len(stale)}, освобождено {freed / 1024 / 1024:.2f} МБ")
    return 0


if __name__ == "__main__":
    sys.exit(main())
