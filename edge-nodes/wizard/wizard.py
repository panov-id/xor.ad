#!/usr/bin/env python3
"""
Edge-nodes wizard — brings up and manages the decentralized VPS pool.

Runs inside the launchpad Docker image (see run.sh) — nothing installed on the
host. Reads inventory.toml, then per node:
  provision  create the VPS via the provider API (mode = "provision")   [stub]
  configure  harden + install Docker + deploy the node stack over SSH   [done]
  dns        register the node in Bunny geo-steering                     [stub]
  deploy     roll the latest node image to already-configured nodes      [stub]
  status     show the pool
  up         full flow for one/all nodes: provision? -> configure -> dns

Secrets come from the wizard's environment (run.sh passes secrets.env):
  BUNNY_STORAGE_ZONE, BUNNY_STORAGE_KEY, BUNNY_STORAGE_HOST?, RESEND_API_KEY,
  WELCOME_FROM?  (provider tokens land here later for provision).
Idempotent by design.
"""
from __future__ import annotations

import argparse
import os
import shlex
import sys
import tomllib
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
NODE_DIR = ROOT / "node"
COMPOSE_DIR = ROOT / "compose"
INVENTORY = HERE / "inventory.toml"
REMOTE_ROOT = "/opt/edge-node"


# --- inventory --------------------------------------------------------------

def load_inventory(path: Path) -> dict:
    if not path.exists():
        sys.exit(f"no {path.name} — copy inventory.example.toml and fill it in")
    with path.open("rb") as fh:
        return tomllib.load(fh)


def nodes(inv: dict, only: str | None) -> list[dict]:
    return [n for n in inv.get("node", []) if only in (None, n["id"], n.get("env"))]


def render_node_env(node: dict, env_cfg: dict) -> str:
    """Build the per-node env from inventory + secrets (from os.environ)."""
    missing = [k for k in ("BUNNY_STORAGE_ZONE", "BUNNY_STORAGE_KEY") if not os.environ.get(k)]
    if missing:
        print(f"      [warn] secrets missing (storage disabled on node): {', '.join(missing)}")
    values = {
        "NODE_ENV_NAME": node.get("env", "dev"),
        "NODE_ID": node["id"],
        "NODE_REGION": node.get("region", "unknown"),
        "NODE_ROLE": node.get("role", "relay"),
        "PORT": "8080",
        "ALLOWED_ORIGINS": ",".join(env_cfg.get("allowed_origins", [])),
        "BUNNY_STORAGE_HOST": os.environ.get("BUNNY_STORAGE_HOST", "storage.bunnycdn.com"),
        "BUNNY_STORAGE_ZONE": os.environ.get("BUNNY_STORAGE_ZONE", ""),
        "BUNNY_STORAGE_KEY": os.environ.get("BUNNY_STORAGE_KEY", ""),
        "RESEND_API_KEY": os.environ.get("RESEND_API_KEY", ""),
        "WELCOME_FROM": os.environ.get("WELCOME_FROM", "sosed <hey@sosed.place>"),
        "NODE_HOSTNAME": node["hostname"],
    }
    return "".join(f"{k}={v}\n" for k, v in values.items())


# --- ssh helpers ------------------------------------------------------------

def ssh_connect(node: dict):
    host = node.get("ssh_host")
    if not host:
        raise RuntimeError(f"{node['id']}: no ssh_host (provision first, or set it in inventory)")
    import paramiko  # lazy — status/dns work without it
    user = node.get("ssh_user", "root")
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=host, username=user, allow_agent=True, look_for_keys=True, timeout=20)
    return client, user


def sh(client, cmd: str, sudo: bool = False, check: bool = True) -> int:
    wrapped = ("sudo -n " if sudo else "") + "bash -lc " + shlex.quote(cmd)
    _stdin, stdout, stderr = client.exec_command(wrapped)
    out = stdout.read().decode(errors="replace")
    code = stdout.channel.recv_exit_status()
    err = stderr.read().decode(errors="replace")
    for line in (out + err).splitlines():
        if line.strip():
            print(f"        {line}")
    if code != 0 and check:
        raise RuntimeError(f"remote command failed ({code}): {cmd[:70]}")
    return code


def _sftp_mkdirs(sftp, remote: str) -> None:
    cur = ""
    for part in remote.strip("/").split("/"):
        cur += "/" + part
        try:
            sftp.stat(cur)
        except IOError:
            sftp.mkdir(cur)


def _sftp_put_tree(sftp, local: Path, remote: str) -> None:
    _sftp_mkdirs(sftp, remote)
    for item in sorted(local.rglob("*")):
        rpath = remote + "/" + item.relative_to(local).as_posix()
        if item.is_dir():
            try:
                sftp.stat(rpath)
            except IOError:
                sftp.mkdir(rpath)
        else:
            sftp.put(str(item), rpath)


def _write_remote(sftp, path: str, content: str) -> None:
    with sftp.file(path, "w") as fh:
        fh.write(content)


def _verify_health(client, hostname: str, sudo: bool) -> None:
    for _ in range(6):
        if sh(client, f"curl -fsS -m 5 https://{hostname}/health", sudo=sudo, check=False) == 0:
            print("      /health ok ✓")
            return
        sh(client, "sleep 5", check=False)
    print("      [warn] /health not green yet (Let's Encrypt cert may still be issuing) — recheck later")


# --- actions ----------------------------------------------------------------

def provision(node: dict) -> None:
    """Create the VPS via the provider API and set node['ssh_host'] in memory."""
    if node.get("mode") != "provision":
        print(f"  · {node['id']}: manual box (mode=configure) — skip provision")
        return
    from providers import provision_server  # lazy — keeps status/dns import-free
    print(f"  · {node['id']}: provision {node['provider']}/{node.get('location', '?')} "
          f"({node.get('server_type') or node.get('plan') or 'default'})")
    ip = provision_server(node)
    node["ssh_host"] = ip  # so a chained configure() in `up` can reach it
    node.setdefault("ssh_user", "root")
    print(f"  · {node['id']}: ready at {ip}")


def configure(node: dict, inv: dict) -> None:
    """SSH in and bring the node up (harden -> docker -> deploy -> verify)."""
    print(f"  · {node['id']}: configure {node.get('ssh_host', '<no ssh_host>')}")
    env_cfg = inv.get("env", {}).get(node.get("env", ""), {})
    node_env = render_node_env(node, env_cfg)
    client, user = ssh_connect(node)
    sudo = user != "root"
    try:
        print("      harden: apt + ufw + fail2ban + unattended-upgrades")
        sh(client, "export DEBIAN_FRONTEND=noninteractive; apt-get update -y && "
                   "apt-get install -y ca-certificates curl ufw fail2ban unattended-upgrades", sudo=sudo)
        sh(client, "ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable", sudo=sudo)
        sh(client, "systemctl enable --now fail2ban", sudo=sudo, check=False)
        sh(client, "systemctl enable --now unattended-upgrades", sudo=sudo, check=False)

        print("      docker: install (if missing) + enable")
        sh(client, "command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh", sudo=sudo)
        sh(client, "systemctl enable --now docker", sudo=sudo)

        print(f"      upload node + compose -> {REMOTE_ROOT}")
        sh(client, f"mkdir -p {REMOTE_ROOT}", sudo=sudo)
        if sudo:
            sh(client, f"chown -R {user} {REMOTE_ROOT}", sudo=True)
        sftp = client.open_sftp()
        _sftp_put_tree(sftp, NODE_DIR, f"{REMOTE_ROOT}/node")
        _sftp_mkdirs(sftp, f"{REMOTE_ROOT}/compose")
        sftp.put(str(COMPOSE_DIR / "docker-compose.yml"), f"{REMOTE_ROOT}/compose/docker-compose.yml")
        sftp.put(str(COMPOSE_DIR / "Caddyfile"), f"{REMOTE_ROOT}/compose/Caddyfile")
        _write_remote(sftp, f"{REMOTE_ROOT}/compose/node.env", node_env)
        _write_remote(sftp, f"{REMOTE_ROOT}/compose/.env", f"NODE_HOSTNAME={node['hostname']}\n")
        sftp.close()

        print("      docker compose up -d --build")
        sh(client, f"cd {REMOTE_ROOT}/compose && docker compose up -d --build", sudo=sudo)

        print("      verify /health")
        _verify_health(client, node["hostname"], sudo)
        print(f"  · {node['id']}: configured ✓")
    finally:
        client.close()


def dns(node: dict, inv: dict) -> None:
    """Register the node's OWN hostname (A -> node IP). Needed before configure so
    Let's Encrypt can validate. Does NOT touch the live api.* pool (see `pool`)."""
    import bunny  # lazy
    ip = node.get("ssh_host")
    if not ip:
        raise RuntimeError(f"{node['id']}: no ip yet (run provision first, or set ssh_host)")
    zone = bunny.find_zone(node["hostname"])
    name = bunny.subdomain(node["hostname"], zone["Domain"])
    action = bunny.set_a(zone, name, ip)
    print(f"  · {node['id']}: dns {node['hostname']} -> {ip} ({action})")


def pool(node: dict, inv: dict) -> None:
    """CUTOVER: add this node to the geo-steered api.* pool for its env. Only run
    when you intend to move live traffic onto the pool."""
    import bunny  # lazy
    ip = node.get("ssh_host")
    if not ip:
        raise RuntimeError(f"{node['id']}: no ip (run provision first, or set ssh_host)")
    pool_host = inv.get("env", {}).get(node.get("env", ""), {}).get("pool_hostname")
    if not pool_host:
        raise RuntimeError(f"{node['id']}: env has no pool_hostname")
    zone = bunny.find_zone(pool_host)
    name = bunny.subdomain(pool_host, zone["Domain"])
    action = bunny.pool_add(zone, name, ip, node.get("lat"), node.get("lon"))
    print(f"  · {node['id']}: pool {pool_host} += {ip} geo=({node.get('lat')},{node.get('lon')}) ({action})")


def deploy(node: dict) -> None:
    """Roll the latest node image to an already-configured node. TODO."""
    print(f"  · {node['id']}: [todo] upload latest, docker compose up -d --build, healthcheck")


def status(inv: dict) -> None:
    ns = inv.get("node", [])
    print(f"pool: {len(ns)} node(s)")
    for n in ns:
        print(f"  {n['id']:4} {n.get('env',''):4} {n['provider']:12} {n['region']:12} "
              f"{n.get('mode','?'):9} {n.get('role','relay'):6} {n['hostname']}")


# --- cli --------------------------------------------------------------------

def run_each(inv: dict, only: str | None, fn) -> None:
    ns = nodes(inv, only)
    if not ns:
        print("no matching nodes")
    for n in ns:
        try:
            fn(n)
        except Exception as e:  # one node's failure must not abort the pool run
            print(f"  · {n['id']}: ERROR {e}")


def main() -> None:
    p = argparse.ArgumentParser(prog="wizard", description="edge-nodes pool wizard")
    p.add_argument("--inventory", type=Path, default=INVENTORY)
    p.add_argument("--node", help="limit to a node id or an env name")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("status", "provision", "configure", "dns", "pool", "deploy", "up"):
        sub.add_parser(name)

    args = p.parse_args()
    inv = load_inventory(args.inventory)

    if args.cmd == "status":
        status(inv)
    elif args.cmd == "provision":
        run_each(inv, args.node, provision)
    elif args.cmd == "configure":
        run_each(inv, args.node, lambda n: configure(n, inv))
    elif args.cmd == "dns":
        run_each(inv, args.node, lambda n: dns(n, inv))
    elif args.cmd == "pool":
        run_each(inv, args.node, lambda n: pool(n, inv))
    elif args.cmd == "deploy":
        run_each(inv, args.node, deploy)
    elif args.cmd == "up":
        # dns before configure so Let's Encrypt can validate the node hostname.
        for n in nodes(inv, args.node):
            print(f"[{n['id']}] up")
            try:
                provision(n)
                dns(n, inv)
                configure(n, inv)
            except Exception as e:
                print(f"  · {n['id']}: ERROR {e}")


if __name__ == "__main__":
    main()
