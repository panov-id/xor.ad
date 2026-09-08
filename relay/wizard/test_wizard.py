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

    def close(self):
        self.events.append(("close",))


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

    # The tag a node runs is the only thing a deploy can honestly ask about
    # afterwards, and it gets there through this file: the container keeps the
    # environment it started with, so a roll that failed before the container was
    # recreated goes on reporting the previous tag. Without this line the probe
    # in scripts/deploy-relay-dev.sh has nothing to compare and every deploy
    # reports success — which is what happened on 2026-08-31.
    pinned = {"env": {"dev": {"database": False, "image_tag": "sha-abc1234"},
                      "prod": {"database": False}}}
    tagged = wizard.env_file(pinned, box, "dev")
    check("the node is told which image tag it runs",
          "RELAY_IMAGE_TAG=sha-abc1234" in tagged,
          [line for line in tagged.splitlines() if "IMAGE_TAG" in line] or "no such line")
    untagged = wizard.env_file(pinned, box, "prod")
    check("an environment with no pin still names one, rather than nothing",
          "RELAY_IMAGE_TAG=dev" in untagged)

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

# --- every service caps its own log --------------------------------------------
#
# Docker's default keeps every line until the disk says otherwise, and the log
# viewer on the box reads those same files: an unbounded log takes down the node
# and the only way to look at it, together. Checked per service rather than once
# for the file, because the policy is repeated in five places and four of them
# are string concatenation - exactly the shape that loses a line in an edit.
import yaml as _yaml

_inv = {"pool": {}, "env": {"dev": {"image_tag": "sha-x", "mail": "mailpit", "database": True}},
        "dns": {"zone": "relay.panov.id"}}
_box = {"id": "n1", "envs": ["dev"], "database": True}
_services = _yaml.safe_load(wizard.render_compose(_inv, _box))["services"]
_without = sorted(name for name, svc in _services.items() if not svc.get("logging"))
check("every service in the compose file caps its own log",
      _without == [], f"no logging policy on: {_without}")
_limits = {name: svc["logging"]["options"]["max-size"] for name, svc in _services.items()}
check("the cap is a size, not a promise",
      set(_limits.values()) == {"50m"}, str(_limits))
check("without a filter, every environment is acted on",
      wizard.acting_envs(box) == ["dev", "staging"], str(wizard.acting_envs(box)))

wizard.SELECTED_ENVS = ["dev"]
check("with --env dev, only dev is acted on",
      wizard.acting_envs(box) == ["dev"], str(wizard.acting_envs(box)))

# It used to yield an empty list, and this test used to assert that. An empty
# list is not "no environments" downstream: the services list comes out empty and
# `docker compose up -d` with no services recreates every container on the box.
# So `--env prod` against a box that hosts dev and staging asked for the
# narrowest thing and did the widest, running no migrations at all. Refusing is
# the only safe reading of a name that matches nothing (2026-09-08).
wizard.SELECTED_ENVS = ["prod"]
try:
    wizard.acting_envs(box)
    _refused = ""
except SystemExit as stop:
    _refused = str(stop)
check("an environment the box does not host is refused, not silently widened",
      "matches nothing on this box" in _refused, _refused or "no refusal at all")
check("the refusal says what the box does host",
      "dev, staging" in _refused, _refused)

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

# --- a failed migration must stop the deploy ---------------------------------
#
# It did not. `check=False` let the failure scroll past and the next line brought
# the node up anyway — green, because the database is optional to the node and
# /health answers from storage. The environment then ran without the schema its
# code expects, and that surfaced at the first attempt to mint a key.
#
# Read from the source rather than by running a deploy: the assertion is about
# which arguments the call carries, and that is exactly what the source says.

migrate_calls = []
create_calls = []
pull_calls = []
for node in ast.walk(tree):
    if not (isinstance(node, ast.Call) and getattr(node.func, "id", "") == "sh"):
        continue
    rendered = ast.get_source_segment(source, node) or ""
    if "migrate_db.ts" in rendered:
        migrate_calls.append((node, rendered))
    if "createdb" in rendered:
        create_calls.append((node, rendered))
    if "compose pull" in rendered:
        pull_calls.append((node, rendered))

check("the migration is run", len(migrate_calls) == 1, f"{len(migrate_calls)} calls")
if migrate_calls:
    node, _ = migrate_calls[0]
    swallowed = any(
        keyword.arg == "check" and keyword.value.value is False for keyword in node.keywords
    )
    check("a failed migration stops the deploy", not swallowed,
          "sh(..., check=False) — the failure would be swallowed again")

check("the database is created if missing", len(create_calls) == 1, f"{len(create_calls)} calls")
if create_calls and migrate_calls:
    # Order matters: creating it after the migration would help nobody.
    check("it is created before the migration runs",
          create_calls[0][0].lineno < migrate_calls[0][0].lineno,
          f"createdb at line {create_calls[0][0].lineno}, "
          f"migrate at {migrate_calls[0][0].lineno}")
    check("creating it is idempotent",
          "pg_database" in create_calls[0][1],
          "no existence check — Postgres has no CREATE DATABASE IF NOT EXISTS")

print()

# Migrations run out of the image, through `docker compose run node-<env>`. Pull
# it afterwards and they are applied by the image already on the box — the
# previous release — while the new code comes up against a schema without its
# columns. That is a 503 on every Article 16 notice until someone runs the wizard
# again, and it is invisible in a green deploy.
check("the image is pulled", len(pull_calls) >= 1, f"{len(pull_calls)} calls")
if pull_calls and migrate_calls:
    check("it is pulled before the migration runs",
          pull_calls[0][0].lineno < migrate_calls[0][0].lineno,
          f"pull at line {pull_calls[0][0].lineno}, "
          f"migrate at {migrate_calls[0][0].lineno}")

print()

# --- the firewall is never left down ------------------------------------------
#
# `firewall()` used to be one `&&` chain over the ssh channel that began with
# `ufw --force reset` — which disables the firewall — and re-enabled it at the
# end. Two ways to leave a public box open, and no check would have seen either:
# lose the connection in between, or have one rule rejected (a typo in a
# whitelist address does it) so `&&` never reaches the enable.
#
# The box is not touched here. What is asserted is what gets *written* and *run*,
# because that is where both failures lived.


class FakeChannel:
    def recv_exit_status(self):
        return 0


class FakeStream(io.BytesIO):
    """Bytes, because paramiko's streams are bytes and the wizard decodes them."""

    channel = FakeChannel()


class FakeClient:
    """Records commands and answers reads with whatever the box would say."""

    def __init__(self, answer=""):
        self.commands = []
        self.answer = answer
        self.sftp = FakeSftp()

    def exec_command(self, command):
        self.commands.append(command)
        return None, FakeStream(self.answer.encode()), FakeStream(b"")

    def open_sftp(self):
        return self.sftp


INVENTORY = {
    "pool": {"ssh_whitelist": ["203.0.113.5"]},
    "env": {"dev": {"access": "private", "whitelist_ips": ["198.51.100.7"]}},
}
BOX = {"id": "n1", "envs": ["dev"]}

client = FakeClient("Status: active\nTo  Action  From\n")
wizard.firewall(client, INVENTORY, BOX, sudo=True)

script = client.sftp.contents.get("/tmp/relay-firewall.sh", "")
check("the rules are written as a script on the box", bool(script), repr(client.sftp.contents))
trap_lines = [line for line in script.splitlines() if line.startswith("trap ")]
check("the script always reaches the enable",
      len(trap_lines) == 1 and "ufw --force enable" in trap_lines[0],
      "a rejected rule must cost that rule, not the whole firewall; "
      f"trap lines: {trap_lines}")
check("the reset is inside the script, not on the ssh channel",
      "ufw --force reset" in script
      and not any("ufw --force reset" in c for c in client.commands),
      str(client.commands))
check("both whitelists reach the rules",
      "203.0.113.5" in script and "198.51.100.7" in script, script)
check("a private box does not open 443 to everybody",
      "ufw allow 443/tcp" not in script, script)
check("the script is detached from the ssh session",
      any("setsid" in c and "nohup" in c for c in client.commands), str(client.commands))

# And the wizard refuses to call it a success on a box whose firewall did not
# come back — silence there was the whole defect.
refused = False
try:
    wizard.firewall(FakeClient("Status: inactive"), INVENTORY, BOX, sudo=True)
except RuntimeError:
    refused = True
check("a firewall that stayed down is an error, not a quiet success", refused)

public_client = FakeClient("Status: active")
wizard.firewall(public_client,
                {"pool": {"ssh_whitelist": []}, "env": {"prod": {"access": "public"}}},
                {"id": "p1", "envs": ["prod"]}, sudo=True)
check("a public box still opens 443",
      "ufw allow 443/tcp" in public_client.sftp.contents.get("/tmp/relay-firewall.sh", ""))

print()

# --- the dumps do not share a key with the thing they back up -----------------
#
# They lived in the same storage zone as the node's working objects, reachable
# with the same key: one leaked key, or one mistaken prune with a wrong prefix,
# took the data and the backups together. That is a second copy, not a backup.
#
# The zone itself is a person's action. What is checked here is that the script
# uses it when it exists, falls back loudly when it does not, and — the part that
# broke while this was being written — that the fallback still names a real key.

import re  # noqa: E402
import subprocess  # noqa: E402
import tempfile  # noqa: E402

backup = (pathlib.Path(__file__).parent / "backup-postgres.sh").read_text(encoding="utf-8")

check("the uploads read the chosen zone, not a hardcoded one",
      "${BUNNY_STORAGE_ZONE}/backups" not in backup,
      "an upload path still names the working zone directly")
check("nothing addresses the working key directly any more",
      len(re.findall(r'AccessKey: \$\{BUNNY_STORAGE_KEY\}', backup)) == 0, backup[:200])

# The fallback branch assigning key="${key}" is a real edit that happened here,
# and it would have sent every dump with an empty AccessKey — a nightly failure
# that looks like a provider problem.
check("the fallback names the working key, not itself",
      'key="${BUNNY_STORAGE_KEY}"' in backup and 'key="${key}"' not in backup,
      "the fallback assignment is circular")

# And run the selection for real, both ways, with the rest of the script cut off:
# a shell reading is not a check.
selection = backup.split("stamp=")[0].replace("cd /opt/relay/compose", "")
selection = selection.replace("set -a; . ./backup.env; set +a", "")
for label, env, expect_zone in [
    ("its own zone", {"BACKUP_STORAGE_ZONE": "relay-backups", "BACKUP_STORAGE_KEY": "k2",
                      "BUNNY_STORAGE_ZONE": "relay-live", "BUNNY_STORAGE_KEY": "k1"}, "relay-backups"),
    ("the working zone", {"BUNNY_STORAGE_ZONE": "relay-live", "BUNNY_STORAGE_KEY": "k1"}, "relay-live"),
]:
    with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False) as handle:
        handle.write(selection + '\necho "ZONE=$zone KEY=$key"\n')
        path = handle.name
    result = subprocess.run(["bash", path], capture_output=True, text=True,
                            env={**os.environ, **env})
    os.unlink(path)
    check(f"it picks {label}", f"ZONE={expect_zone}" in result.stdout,
          f"stdout={result.stdout!r} stderr={result.stderr!r}")
    check(f"and a key to go with it ({label})",
          "KEY=" in result.stdout and "KEY=\n" not in result.stdout
          and result.stdout.split("KEY=")[1].strip() != "",
          f"stdout={result.stdout!r}")

check("a shared zone is reported, not passed over in silence",
      "WARNING: no BACKUP_STORAGE_ZONE" in backup)
check("the wizard puts the variables in backup.env",
      all(name in (pathlib.Path(__file__).parent / "wizard.py").read_text(encoding="utf-8")
          for name in ("BACKUP_STORAGE_ZONE", "BACKUP_STORAGE_KEY")))

if failed:
    print(f"FAILED: {failed}")
    sys.exit(1)
print("wizard: every case passed")

