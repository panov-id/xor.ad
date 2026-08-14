#!/usr/bin/env python3
"""Check what the wizard writes to a node, without touching one.

    python3 relay/wizard/test_wizard.py

The sftp client is a stand-in that records what was written and with what mode,
so the two things that matter here can be asserted offline: that a file carrying
secrets is created 0600, and that a missing per-environment session secret stops
the deploy instead of shipping a node whose panel rejects every sign-in.

Both were real: the environment files went out with the remote umask, usually
0644, on a box where any local account could read them; and every environment
signed panel sessions with the same secret, so a token minted by the dev node
verified on prod byte for byte.
"""

import io
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import wizard  # noqa: E402

failed = 0


def check(name, condition, detail=""):
    global failed
    if condition:
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name} — {detail}")


class FakeSftp:
    """Records writes and chmods. The mode is captured per path, in order, so a
    chmod that lands after the content can be told from one that lands before."""

    def __init__(self):
        self.events = []
        self.contents = {}

    def file(self, path, _mode):
        sftp = self

        class Handle(io.StringIO):
            def write(self, data):
                sftp.events.append(("write", path))
                sftp.contents[path] = sftp.contents.get(path, "") + data
                return len(data)

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

        self.events.append(("open", path))
        self.contents.setdefault(path, "")
        return Handle()

    def chmod(self, path, mode):
        self.events.append(("chmod", path, mode))


# --- the mode is set before the content lands --------------------------------

sftp = FakeSftp()
wizard._write_remote(sftp, "/opt/relay/compose/dev.env", "SECRET=abc\n", mode=0o600)
order = [event[0] for event in sftp.events]
check("a secret file is chmodded before it is written",
      order.index("chmod") < order.index("write"), str(order))
check("the mode is 0600",
      any(e[0] == "chmod" and e[2] == 0o600 for e in sftp.events), str(sftp.events))
check("the content still lands", sftp.contents["/opt/relay/compose/dev.env"] == "SECRET=abc\n",
      repr(sftp.contents))

# A compose file and a systemd unit are read by other users; 0600 would break
# them, so a call without a mode must not chmod at all.
sftp = FakeSftp()
wizard._write_remote(sftp, "/opt/relay/compose/docker-compose.yml", "services: {}\n")
check("a file with no mode is left alone",
      not any(e[0] == "chmod" for e in sftp.events), str(sftp.events))

# --- the call sites that carry secrets ask for the mode -----------------------
#
# Testing the helper alone would leave the hole open: dropping `mode=0o600` at a
# call site puts the secrets back on 0644 while every case above stays green. So
# the source is read, and each file that carries a secret has to ask.

import ast  # noqa: E402

source = (pathlib.Path(__file__).parent / "wizard.py").read_text(encoding="utf-8")
tree = ast.parse(source)

MUST_BE_PRIVATE = ("caddy.env", "{env}.env", "backup.env", "postgres.env")

writes = {}
for node in ast.walk(tree):
    if not (isinstance(node, ast.Call) and getattr(node.func, "id", "") == "_write_remote"):
        continue
    path_argument = ast.get_source_segment(source, node.args[1]) or ""
    has_mode = any(keyword.arg == "mode" for keyword in node.keywords)
    mode = next((ast.literal_eval(k.value) for k in node.keywords if k.arg == "mode"), None)
    writes[path_argument] = (has_mode, mode)

check("every write to a node was found", len(writes) >= 10, f"{len(writes)} found")

for name in MUST_BE_PRIVATE:
    matching = [(path, value) for path, value in writes.items() if name in path]
    check(f"{name} is written 0600",
          bool(matching) and all(value == (True, 0o600) for _, value in matching),
          str(matching))

# And the ones that must stay readable are not swept up by a blanket change.
for name in ("docker-compose.yml", "Caddyfile", "relay-backup.service"):
    matching = [(path, value) for path, value in writes.items() if name in path]
    check(f"{name} keeps its default mode",
          bool(matching) and all(value == (False, None) for _, value in matching),
          str(matching))

# --- a missing per-environment secret stops the deploy ------------------------

saved = dict(os.environ)
try:
    os.environ.pop("SESSION_SECRET_PROD", None)
    try:
        wizard.require_secret("SESSION_SECRET_PROD", "prod")
        check("a missing secret stops the deploy", False, "it returned instead of exiting")
    except SystemExit as exit_signal:
        message = str(exit_signal.code)
        check("a missing secret stops the deploy", True)
        check("the message names the variable and the environment",
              "SESSION_SECRET_PROD" in message and "prod" in message, message)

    os.environ["SESSION_SECRET_PROD"] = "s3cret"
    check("a present secret is returned",
          wizard.require_secret("SESSION_SECRET_PROD", "prod") == "s3cret")

    # The point of the change: each environment asks for its own variable, so
    # one value cannot end up signing sessions on all three.
    os.environ.pop("SESSION_SECRET_DEV", None)
    os.environ["SESSION_SECRET"] = "the-old-shared-one"
    try:
        wizard.require_secret("SESSION_SECRET_DEV", "dev")
        check("the old shared variable no longer satisfies an environment", False,
              "SESSION_SECRET was accepted for dev")
    except SystemExit:
        check("the old shared variable no longer satisfies an environment", True)

    # …and the file that goes to the node has to be the thing that asks. Testing
    # require_secret alone left the hole open: putting os.environ["SESSION_SECRET"]
    # back into env_file kept every case above green.
    inventory = {"env": {"dev": {"database": False}, "prod": {"database": False}}}
    box = {"id": "n1", "envs": ["dev", "prod"], "region": "test"}

    os.environ["SESSION_SECRET_DEV"] = "dev-only"
    os.environ["SESSION_SECRET_PROD"] = "prod-only"
    dev_file = wizard.env_file(inventory, box, "dev")
    prod_file = wizard.env_file(inventory, box, "prod")
    check("each environment file carries its own secret",
          "SESSION_SECRET=dev-only" in dev_file and "SESSION_SECRET=prod-only" in prod_file,
          f"{dev_file[:0]}dev={'dev-only' in dev_file}, prod={'prod-only' in prod_file}")
    check("the old shared value reaches neither",
          "the-old-shared-one" not in dev_file and "the-old-shared-one" not in prod_file)

    os.environ.pop("SESSION_SECRET_PROD", None)
    try:
        wizard.env_file(inventory, box, "prod")
        check("a node file cannot be built without that environment's secret", False,
              "it produced a file with an empty secret")
    except SystemExit:
        check("a node file cannot be built without that environment's secret", True)
finally:
    os.environ.clear()
    os.environ.update(saved)

# --- acting on one environment of a box that hosts two ------------------------
#
# n1 hosts dev and staging. The wizard had no way to say "just dev", so deploying
# dev rewrote staging's environment file, migrated its database and restarted its
# container. What it must not do instead is narrow the compose file: rendering it
# from a filtered list would drop the other service, and `up -d` would then stop
# a running environment. So the filter is on the actions, and box["envs"] stays
# the box's full composition.

box = {"id": "n1", "envs": ["dev", "staging"], "region": "test"}

wizard.SELECTED_ENVS = None
check("without a filter, every environment is acted on",
      wizard.acting_envs(box) == ["dev", "staging"], str(wizard.acting_envs(box)))

wizard.SELECTED_ENVS = ["dev"]
check("with --env dev, only dev is acted on",
      wizard.acting_envs(box) == ["dev"], str(wizard.acting_envs(box)))

wizard.SELECTED_ENVS = ["prod"]
check("an environment the box does not host yields nothing to act on",
      wizard.acting_envs(box) == [], str(wizard.acting_envs(box)))

# The compose file is rendered from the box, not from the selection: a filtered
# render would delete the other service.
wizard.SELECTED_ENVS = ["dev"]
inventory = {"env": {"dev": {"database": False}, "staging": {"database": False}}}
composed = wizard.render_compose(inventory, box)
# The service block, not the name: "node-staging" also appears in caddy's
# depends_on, so looking for the bare name passed even with the render filtered —
# which is how this check first went green against a deliberately broken copy.
services = [line for line in composed.split("\n") if line.startswith("  node-")]
check("the compose file still defines a service for each environment",
      services == ["  node-dev:", "  node-staging:"], str(services))
wizard.SELECTED_ENVS = None

print()
if failed:
    print(f"FAILED: {failed}")
    sys.exit(1)
print("wizard: every case passed")
