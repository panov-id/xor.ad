#!/usr/bin/env python3
"""The prune's refusals, without a key and without a network.

    python3 deploy/test_prune_storage_zone.py

Deleting is the dangerous direction, and every guard here was added after a real
hour of damage: a locally built directory pruned a CI-deployed zone and blanked
the panel; a bare `--force` typed out of habit wiped the dev zone; a deletion
left no record of what it deleted. Guards that only exist in a deploy get
exercised for the first time by a deploy.

`request` is replaced so nothing leaves the machine: the zone's listing, its
index.html and every DELETE are answered from a dictionary, and the DELETEs are
recorded rather than sent.
"""

import importlib.util
import io
import json
import os
import pathlib
import sys
import tempfile
from contextlib import redirect_stderr, redirect_stdout

MODULE = pathlib.Path(__file__).with_name("prune-storage-zone.py")
spec = importlib.util.spec_from_file_location("prune_storage_zone", MODULE)
prune = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prune)

ZONE = "panel-prod"
failed = 0


def check(name, condition, detail=""):
    global failed
    if condition:
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name} — {detail}")


def fake_zone(stored, index_html=""):
    """Answer as Bunny Storage would, and record what would have been deleted."""
    deleted = []
    seen = []

    def request(method, url, key):
        prefix = f"{prune.STORAGE}/{ZONE}/"
        if not url.startswith(prefix):
            raise AssertionError(f"чужой адрес: {url}")
        path = url[len(prefix):]
        seen.append((method, path))
        if method == "DELETE":
            deleted.append(path)
            return 200, b""
        if path == "" or path.endswith("/"):
            children, directories = [], set()
            for name, size in stored.items():
                if not name.startswith(path):
                    continue
                rest = name[len(path):]
                if "/" in rest:
                    directories.add(rest.split("/", 1)[0])
                else:
                    children.append({"ObjectName": rest, "IsDirectory": False,
                                     "Length": size})
            children += [{"ObjectName": d, "IsDirectory": True, "Length": 0}
                         for d in sorted(directories)]
            return 200, json.dumps(children).encode()
        if path == "index.html" and "index.html" in stored:
            return 200, index_html.encode()
        return 404, b""

    return request, deleted, seen


def run(argv, stored, local_files, index_html="", ledger_dir=None):
    """Run main() against a fake zone and a temporary local directory."""
    request, deleted, seen = fake_zone(stored, index_html)
    prune.request = request
    with tempfile.TemporaryDirectory() as work:
        directory = pathlib.Path(work) / "dist"
        directory.mkdir()
        for name in local_files:
            path = directory / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("x", encoding="utf-8")
        environment = dict(os.environ, BUNNY_STORAGE_API_KEY="k")
        if ledger_dir is not None:
            environment["PRUNE_LEDGER_DIR"] = str(ledger_dir)
        else:
            environment["PRUNE_LEDGER_DIR"] = work
        old_environ, old_argv = os.environ, sys.argv
        os.environ = environment
        sys.argv = ["prune-storage-zone.py", ZONE, str(directory), *argv]
        out, err = io.StringIO(), io.StringIO()
        try:
            with redirect_stdout(out), redirect_stderr(err):
                code = prune.main()
        except SystemExit as stop:
            code = stop.code
        finally:
            os.environ, sys.argv = old_environ, old_argv
        ledger = pathlib.Path(environment["PRUNE_LEDGER_DIR"]) / f"pruned-{ZONE}.txt"
        text = ledger.read_text(encoding="utf-8") if ledger.exists() else None
        return code, out.getvalue(), err.getvalue(), deleted, seen, text


# A zone holding a live build plus four leftovers. Half the zone is stale, which
# is under the threshold, so an ordinary prune proceeds.
STORED = {"index.html": 500, "assets/index-a1.js": 900, "assets/index-a1.css": 300,
          "assets/index-old.js": 900, "mockups/panel.svg": 400}
LOCAL = ["index.html", "assets/index-a1.js", "assets/index-a1.css"]
INDEX = '<script src="/assets/index-a1.js"></script><link href="/assets/index-a1.css">'

# --- the habit guard ---------------------------------------------------------
# The dev zone was wiped by a bare --force. Naming a different zone must refuse
# before anything is read: a refusal that needs the network is a refusal that
# can crash instead.
code, out, err, deleted, seen, _ = run(
    ["--apply", "--force", "panel-dev"], STORED, LOCAL, INDEX)
check("--force naming another zone refuses", code == 2, f"код {code}: {err}")
check("and it names both the zone and what was typed",
      "panel-dev" in err and ZONE in err, err)
check("and it refuses before touching the network", seen == [], str(seen))
check("and nothing was deleted", deleted == [], str(deleted))

# --- the threshold -----------------------------------------------------------
MOSTLY_STALE = {"index.html": 500, "a.js": 1, "b.js": 1, "c.js": 1, "d.js": 1}
code, out, err, deleted, seen, _ = run(["--apply"], MOSTLY_STALE, ["index.html"], "")
check("a plan over half the zone refuses", code == 2, f"код {code}: {err}")
check("and the message spells out --force with the zone name",
      f"--force {ZONE}" in err, err)
check("and nothing was deleted", deleted == [], str(deleted))

code, out, err, deleted, seen, _ = run(
    ["--apply", "--force", ZONE], MOSTLY_STALE, ["index.html"], "")
check("naming the same zone gets through the threshold",
      code == 0 and sorted(deleted) == ["a.js", "b.js", "c.js", "d.js"],
      f"код {code}: {deleted} {err}")

# --- what index.html points at ------------------------------------------------
# The hour that blanked the panel: a locally built directory hashes bundles
# differently, so the live bundle looks stale.
code, out, err, deleted, seen, _ = run(
    ["--apply"], STORED, ["index.html", "assets/index-DIFFERENT.js"], INDEX)
check("a plan that would delete a live bundle refuses", code == 2, f"код {code}: {err}")
check("and it names the file being served",
      "assets/index-a1.js" in err, err)
check("and nothing was deleted", deleted == [], str(deleted))

# --- the ledger ---------------------------------------------------------------
code, out, err, deleted, seen, ledger = run(["--apply"], STORED, LOCAL, INDEX)
check("an ordinary prune deletes the leftovers",
      code == 0 and sorted(deleted) == ["assets/index-old.js", "mockups/panel.svg"],
      f"код {code}: {deleted} {err}")
check("and the ledger lists exactly what went",
      ledger is not None
      and sorted(line.split("\t")[0] for line in ledger.splitlines())
      == ["assets/index-old.js", "mockups/panel.svg"],
      repr(ledger))
check("and the ledger carries the sizes too",
      ledger is not None and "\t900" in ledger and "\t400" in ledger, repr(ledger))
check("and the deploy is told where the record went",
      "список удаляемого записан" in out, out)

# A ledger that cannot be written means a deletion nobody could describe
# afterwards, so the deletion does not happen at all.
code, out, err, deleted, seen, _ = run(
    ["--apply"], STORED, LOCAL, INDEX, ledger_dir="/proc/nonexistent-directory")
check("an unwritable ledger cancels the deletion", code == 1, f"код {code}: {err}")
check("and says so", "не смог записать список удаляемого" in err, err)
check("and nothing was deleted", deleted == [], str(deleted))

# --- the plan is still only a plan --------------------------------------------
code, out, err, deleted, seen, ledger = run([], STORED, LOCAL, INDEX)
check("without --apply nothing is deleted", code == 0 and deleted == [], str(deleted))
check("and no ledger is written for a plan", ledger is None, repr(ledger))
check("and it says how to actually delete", "повторите с --apply" in out, out)

print()
if failed:
    print(f"FAILED: {failed}")
    sys.exit(1)
print("prune-storage-zone: every case passed")
