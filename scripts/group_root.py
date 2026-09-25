"""The group root for Python gates: a thin wrapper over group-root.sh, so the rule
lives in one place. See group-root.sh for why ROOT.parent is wrong from a worktree."""
import pathlib
import subprocess

HELPER = pathlib.Path(__file__).resolve().parent / "group-root.sh"


def _ask(*args: str) -> pathlib.Path:
    out = subprocess.run(["bash", str(HELPER), *args],
                         check=True, capture_output=True, text=True).stdout
    return pathlib.Path(out.strip())


def group_root(root: pathlib.Path) -> pathlib.Path:
    """Directory where siblings sit beside this checkout under their own names."""
    return _ask(str(root))


def main_checkout(root: pathlib.Path) -> pathlib.Path:
    """The main working tree; the checkout itself outside git."""
    return _ask("--main", str(root))
