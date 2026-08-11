"""
GitHub release check — prod may only run a PUBLISHED release. The wizard calls
this before deploying a public (prod) box, so an untested/unreleased build can't
reach prod. Publishing the GitHub Release IS the approval.

Auth: GITHUB_TOKEN from the wizard env (the repo is private). Plain REST.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


class CannotCheck(RuntimeError):
    """We could not find out whether the release exists.

    Separate from "it does not exist", because the two send an operator to
    different places and only one of them is their fault. A private repository
    answers 404 to an unauthenticated caller, so a missing token used to be
    reported as "publish the release first" — about a release that was already
    published. Whoever read that went looking in the wrong place, at the one
    moment when they are deploying production.
    """


def is_published_release(repo: str, tag: str) -> bool:
    """True iff `tag` is a published (non-draft) Release of `repo` (owner/name).

    Raises CannotCheck when the answer is unknown rather than negative.
    """
    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        raise CannotCheck(
            "GITHUB_TOKEN is not set, and this repository is private — an "
            "unauthenticated check cannot tell a missing release from a hidden "
            "one. Add GITHUB_TOKEN to the wizard's secrets.env (it already lives "
            "in deploy/.env.deploy) and run again."
        )
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "relay-wizard",
        "Authorization": f"Bearer {token}",
    }
    req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/releases/tags/{tag}", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
            return not data.get("draft", False)
    except urllib.error.HTTPError as e:
        # With a token in hand, 404 is an answer: no such release.
        if e.code == 404:
            return False
        if e.code in (401, 403):
            raise CannotCheck(
                f"GitHub rejected the token ({e.code}) — it is expired, or lacks "
                f"read access to {repo}. The release cannot be verified, so the "
                f"deploy stops here rather than guessing."
            )
        raise RuntimeError(f"github release check {repo}@{tag}: {e.code} {e.read()[:200]!r}")
    except urllib.error.URLError as e:
        raise CannotCheck(f"GitHub is unreachable ({e.reason}) — the release cannot be verified.")
