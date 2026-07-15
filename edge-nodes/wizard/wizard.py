#!/usr/bin/env python3
"""
Edge-nodes wizard — brings up and manages the decentralized VPS pool.

Runs inside the launchpad Docker image (see run.sh) — nothing installed on the
host. Reads inventory.toml, then per node:
  provision  create the VPS via the provider API (mode = "provision")
  configure  harden + install Docker + deploy the node stack over SSH
  dns        register the node in Bunny geo-steering for its pool hostname
  deploy     roll the latest node image to already-configured nodes
  status     show the pool
  up         full flow for one/all nodes: provision? -> configure -> dns

This is the step-1 skeleton: orchestration, inventory and status are real; the
provider/SSH/DNS actions are structured stubs (they print the intended steps)
to be filled in next. Idempotent by design.
"""
from __future__ import annotations

import argparse
import sys
import tomllib
from pathlib import Path

INVENTORY = Path(__file__).parent / "inventory.toml"


def load_inventory(path: Path) -> dict:
    if not path.exists():
        sys.exit(f"no {path.name} — copy inventory.example.toml and fill it in")
    with path.open("rb") as fh:
        return tomllib.load(fh)


def nodes(inv: dict, only: str | None) -> list[dict]:
    ns = inv.get("node", [])
    return [n for n in ns if only in (None, n["id"], n.get("env"))]


# --- actions (stubs to fill in next) ----------------------------------------

def provision(node: dict) -> None:
    """Create the VPS via the provider API and record its IP. TODO."""
    if node.get("mode") != "provision":
        print(f"  · {node['id']}: manual box (mode=configure) — skip provision")
        return
    print(f"  · {node['id']}: [todo] provision {node['provider']}/{node['region']} "
          f"({node.get('server_type', 'default')}) via API")
    # TODO: hetzner (hcloud API) / vultr / digitalocean create server, SSH key,
    # firewall; write the resulting IP back so configure() can reach it.


def configure(node: dict) -> None:
    """SSH in and bring the node up. TODO."""
    print(f"  · {node['id']}: [todo] configure {node.get('ssh_host', '<ip>')}")
    for step in (
        "harden: ufw (22,80,443), ssh keys only, fail2ban, unattended-upgrades",
        "install Docker + compose plugin",
        "copy compose/ (docker-compose.yml, Caddyfile) + rendered node.env",
        "docker compose up -d  (Caddy gets Let's Encrypt on NODE_HOSTNAME)",
        "verify GET https://<hostname>/health",
    ):
        print(f"      - {step}")
    # TODO: implement over paramiko; render node.env from inventory + secrets.


def dns(node: dict, inv: dict) -> None:
    """Register the node in Bunny geo-steering for its env's pool hostname. TODO."""
    env = inv.get("env", {}).get(node.get("env", ""), {})
    pool = env.get("pool_hostname", "<pool>")
    print(f"  · {node['id']}: [todo] add to Bunny geo-steering {pool} "
          f"(A -> node IP, health check /health)")
    # TODO: Bunny DNS API — add/refresh the geo-steered record + health check.
    # Live api.* stays on the current backend until an explicit cutover.


def deploy(node: dict) -> None:
    """Roll the latest node image to an already-configured node. TODO."""
    print(f"  · {node['id']}: [todo] pull image, docker compose up -d --build, healthcheck")


def status(inv: dict) -> None:
    ns = inv.get("node", [])
    print(f"pool: {len(ns)} node(s)")
    for n in ns:
        print(f"  {n['id']:4} {n.get('env',''):4} {n['provider']:12} "
              f"{n['region']:12} {n.get('role','relay'):6} {n['hostname']}")


# --- cli --------------------------------------------------------------------

def run_each(inv: dict, only: str | None, fn) -> None:
    for n in nodes(inv, only):
        fn(n)


def main() -> None:
    p = argparse.ArgumentParser(prog="wizard", description="edge-nodes pool wizard")
    p.add_argument("--inventory", type=Path, default=INVENTORY)
    p.add_argument("--node", help="limit to a node id or an env name")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("status", "provision", "configure", "dns", "deploy", "up"):
        sub.add_parser(name)

    args = p.parse_args()
    inv = load_inventory(args.inventory)

    if args.cmd == "status":
        status(inv)
    elif args.cmd == "provision":
        run_each(inv, args.node, provision)
    elif args.cmd == "configure":
        run_each(inv, args.node, configure)
    elif args.cmd == "dns":
        run_each(inv, args.node, lambda n: dns(n, inv))
    elif args.cmd == "deploy":
        run_each(inv, args.node, deploy)
    elif args.cmd == "up":
        for n in nodes(inv, args.node):
            print(f"[{n['id']}] up")
            provision(n)
            configure(n)
            dns(n, inv)


if __name__ == "__main__":
    main()
