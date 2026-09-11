#!/usr/bin/env python3
"""The secrets config, checked against the workflows that have to read it.

    python3 deploy/test_set_github_secrets.py

What is worth pinning is the mismatch that has no symptom. Secrets written to an
environment are invisible to a job that declares no `environment:`, and nothing
anywhere says so: the tool prints a tick per secret, the workflow reads an empty
string, and the step it feeds does nothing while the run stays green. The blog
spent weeks unable to purge its cache exactly that way — not because a secret was
wrong, but because it was never given, and nothing was watching for the gap.

So the check is: every environment named in the config must be declared by some
workflow of that repository, and a repository whose workflows declare no
environment at all must use the reserved "repository" scope.

Needs neither a token nor the network — it reads the example config and the
workflow files in the sibling checkouts.
"""

import importlib.util
import json
import os
import pathlib
import re
import sys

DEPLOY = pathlib.Path(__file__).resolve().parent
ROOT = DEPLOY.parent
GROUP = ROOT.parent

spec = importlib.util.spec_from_file_location("setter", DEPLOY / "set-github-secrets.py")
setter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setter)

CONFIG = DEPLOY / "github-secrets.example.json"
DECLARED = re.compile(r"^\s*environment:\s*(\S.*)?$")

failed = 0


def check(name, condition, detail=""):
    global failed
    if condition:
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name} — {detail}")


def environments_declared(checkout):
    """Environment names any workflow of this checkout enters.

    A name behind an expression (`${{ inputs.environment }}`) cannot be resolved
    from here, so it is reported separately rather than guessed: treating it as
    "no environments" would fail a repository that is in fact fine.
    """
    names, dynamic = set(), False
    workflows = checkout / ".github/workflows"
    if not workflows.is_dir():
        return names, dynamic
    for path in sorted(workflows.glob("*.yml")) + sorted(workflows.glob("*.yaml")):
        for line in path.read_text().splitlines():
            match = DECLARED.match(line)
            if not match:
                continue
            value = (match.group(1) or "").strip()
            if not value:
                continue          # a block form: `environment:` with `name:` under it
            if "${{" in value:
                dynamic = True
            else:
                names.add(value.strip("\"'"))
    return names, dynamic


config = json.loads(CONFIG.read_text())
check("пример конфига разбирается", isinstance(config.get("repos"), dict))
check("зарезервированная область названа «repository»",
      setter.REPOSITORY == "repository", setter.REPOSITORY)

blog = config["repos"].get("panov-id/www.panov.id")
check("блог есть в конфиге", blog is not None)
check("и стоит в области репозитория, а не окружения",
      blog is not None and list(blog) == ["repository"], str(list(blog or {})))
# .get, not [...]: with the blog moved to an environment this line raised KeyError
# and took the whole run down before the general guard below could speak. A check
# that crashes on the defect it describes reports one line instead of two, and the
# louder line is the one it swallowed.
check("и несёт оба секрета, которых не хватало для сброса кэша",
      blog is not None
      and {"BUNNY_ACCOUNT_API_KEY", "BUNNY_PULLZONE_ID"} <= set(blog.get("repository", {})),
      str(list((blog or {}).get("repository", {}))))

# The guard proper, over every repository in the config.
checked_repos = 0
for repo, scopes in config["repos"].items():
    checkout = GROUP / repo.split("/", 1)[1]
    if not checkout.is_dir():
        print(f"  ·    {repo}: чекаута нет рядом — область не сверена")
        continue
    checked_repos += 1
    declared, dynamic = environments_declared(checkout)

    for scope in scopes:
        if scope == setter.REPOSITORY:
            continue
        check(f"{repo}: окружение «{scope}» объявлено воркфлоу",
              scope in declared or dynamic,
              f"воркфлоу объявляют {sorted(declared) or 'ничего'}")

    if not declared and not dynamic:
        check(f"{repo}: без окружений — область только «repository»",
              list(scopes) == [setter.REPOSITORY],
              f"а в конфиге {list(scopes)} — секреты уйдут туда, где их никто не прочтёт")

check("сверено репозиториев больше одного", checked_repos > 1, str(checked_repos))

# plan() counts what would actually be written, not what is listed: an empty value
# is skipped by the writer, and a plan that counted it would promise more than the
# run delivers.
counted = setter.plan({"repos": {"o/r": {"repository": {"A": "x", "B": ""}}}})
check("сухой прогон считает только заполненные", counted == 1, str(counted))

print()
if failed:
    print(f"FAILED: {failed}")
    sys.exit(1)
print(f"set-github-secrets: всё сошлось, репозиториев сверено {checked_repos}")
