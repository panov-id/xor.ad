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


def is_published_release(repo: str, tag: str) -> bool:
    """True iff `tag` is a published (non-draft) Release of `repo` (owner/name)."""
    token = os.environ.get("GITHUB_TOKEN", "")
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "edge-nodes-wizard"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/releases/tags/{tag}", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
            return not data.get("draft", False)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        raise RuntimeError(f"github release check {repo}@{tag}: {e.code} {e.read()[:200]!r}")
