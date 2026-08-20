#!/usr/bin/env python3
"""What the manifest guard does with a build it was not told about.

    python3 deploy/test_check_shipped_files.py

The guard itself was written because five design sheets and three fonts were
served from the production panel for months. Until now it had no test of its
own: `test_deploy_panel_ci.sh` stubs it out with an exit code, which proves the
deploy calls something, not that the something can tell a stranger from a
bundle.

What is worth pinning is the distinction the guard exists for: a file nobody
allowed stops the deploy, and a rule that matches nothing does not — the first
is an undecided publication, the second is only a list going stale.
"""

import pathlib
import subprocess
import sys
import tempfile

GUARD = pathlib.Path(__file__).with_name("check-shipped-files.py")
REAL_MANIFEST = pathlib.Path(__file__).with_name("panel-shipped.manifest")

failed = 0


def check(name, condition, detail=""):
    global failed
    if condition:
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name} — {detail}")


def run(files, manifest_text):
    """Build a directory and a manifest, then ask the guard about them."""
    with tempfile.TemporaryDirectory() as work:
        root = pathlib.Path(work)
        dist = root / "dist"
        for name in files:
            path = dist / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("x", encoding="utf-8")
        dist.mkdir(exist_ok=True)
        manifest = root / "manifest"
        manifest.write_text(manifest_text, encoding="utf-8")
        done = subprocess.run(
            [sys.executable, str(GUARD), str(dist), str(manifest)],
            capture_output=True, text=True,
        )
        return done.returncode, done.stdout, done.stderr


MANIFEST = """
# what the panel is expected to serve
index.html
favicon.ico
assets/index-*.js
assets/index-*.css
fonts/*.woff2
"""

BUILD = ["index.html", "favicon.ico", "assets/index-a1b2.js",
         "assets/index-a1b2.css", "fonts/mono.woff2"]

code, out, err = run(BUILD, MANIFEST)
check("a build that matches the manifest passes", code == 0, f"код {code}: {err}")
check("and it says what it looked at", "файлов 5" in out, out)

# The case the guard was written for: a design mockup sitting in public/ and
# shipping with everything else.
code, out, err = run(BUILD + ["mockups/panel-logs.svg"], MANIFEST)
check("a stranger stops the deploy", code == 1, f"код {code}")
check("and it is named", "mockups/panel-logs.svg" in err, err)
check("and the message explains rather than orders",
      "впишите правило" in err and "manifest" in err, err)

# A font is the second half of the same story: three shipped because fonts/
# shipped whole. A *.woff2 rule must not become permission for any font-ish file.
code, _, err = run(BUILD + ["fonts/display.ttf"], MANIFEST)
check("a font outside the rule is a stranger too",
      code == 1 and "fonts/display.ttf" in err, f"код {code}: {err}")

# Not fatal on purpose: some environments build fewer files, and a deploy that
# refused here would break on a legitimate build. But it has to be said out loud.
code, out, err = run(["index.html", "assets/index-a1b2.js"], MANIFEST)
check("a rule matching nothing does not stop the deploy", code == 0, f"код {code}: {err}")
check("and the unused rules are printed",
      "правила без совпадений" in out and "fonts/*.woff2" in out, out)

# A guard that accepts an empty list accepts everything the day the manifest is
# emptied by a bad merge.
code, out, err = run(BUILD, "# only comments\n\n")
check("an empty manifest is refused, not treated as 'all allowed'",
      code != 0 and "пуст" in (out + err), f"код {code}: {out}{err}")

# An empty dist means the build produced nothing; publishing that would empty
# the zone through the prune that runs later.
code, out, err = run([], MANIFEST)
check("an empty directory is refused",
      code != 0 and "нет файлов" in (out + err), f"код {code}: {out}{err}")

# Nested files are matched by the same rules — fnmatch's * crosses '/', so a
# stranger cannot hide in a subdirectory of an allowed one.
code, _, err = run(BUILD + ["assets/vendor/old-mockup.js"], MANIFEST)
check("a stranger nested under an allowed prefix is still caught",
      code == 1 and "assets/vendor/old-mockup.js" in err, f"код {code}: {err}")

# The manifest that actually ships has to be readable by the same loader, or the
# tests above describe a file nobody uses.
code, out, err = run(BUILD, REAL_MANIFEST.read_text(encoding="utf-8"))
check("the real panel manifest accepts a canonical build", code == 0, f"код {code}: {err}")

print()
if failed:
    print(f"FAILED: {failed}")
    sys.exit(1)
print("check-shipped-files: every case passed")
