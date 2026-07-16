#!/usr/bin/env python3
"""
Edge-nodes wizard — brings up and manages the decentralized VPS pool.

Model: BOXES host one or more env STACKS (multi-stand). dev+staging share the same
boxes (private, IP-whitelisted); prod uses its own boxes (public). Per box: one
node container per env + a shared Caddy (TLS via DNS-01/Bunny, routes by
hostname "<box>-<env>.<dns_zone>").

Runs in the launchpad Docker image (run.sh) — nothing on the host. Commands:
  status                 show the pool
  provision  [--node id] create the box VM via the provider API (mode=provision)
  dns        [--node id] A records "<box>-<env>" -> box IP for each env
  configure  [--node id] harden ssh + whitelist firewall + deploy all env stacks
  deploy     [--node id] re-sync + rebuild the stacks (rolling)
  pool       [--node id] CUTOVER: add public-env nodes to the geo-steered record
  up         [--node id] provision -> dns -> configure

Secrets from the wizard env (run.sh passes secrets.env): BUNNY_STORAGE_ZONE/KEY,
BUNNY_STORAGE_HOST?, RESEND_API_KEY, WELCOME_FROM?, BUNNY_API_KEY (dns),
provider tokens, SSH_PUBLIC_KEY. Idempotent.
"""
from __future__ import annotations

import argparse
import os
import re
import shlex
import sys
import tomllib
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
NODE_DIR = ROOT / "node"
CADDY_DIR = ROOT / "caddy"
INVENTORY = HERE / "inventory.toml"
REMOTE_ROOT = "/opt/relay"
CONFIRM_PROD = False  # set from --confirm-prod; gates deploys to public (prod) boxes


# --- inventory --------------------------------------------------------------

def load_inventory(path: Path) -> dict:
    if not path.exists():
        sys.exit(f"no {path.name} — copy inventory.example.toml and fill it in")
    with path.open("rb") as fh:
        return tomllib.load(fh)


def boxes(inv: dict, only: str | None) -> list[dict]:
    return [b for b in inv.get("box", []) if only in (None, b["id"])]


def dns_zone(inv: dict) -> str:
    return inv.get("pool", {}).get("dns_zone", "pool.panov.id")


def host_for(inv: dict, box: dict, env: str) -> str:
    return f"{box['id']}-{env}.{dns_zone(inv)}"


def box_public(inv: dict, box: dict) -> bool:
    return any(inv["env"][e].get("access") == "public" for e in box["envs"])


def _guard_prod(inv: dict, box: dict) -> None:
    """A public (prod) box needs --confirm-prod AND each public env must run a
    PUBLISHED GitHub Release (vX.Y.Z). Publishing the release is the approval."""
    if not box_public(inv, box):
        return
    if not CONFIRM_PROD:
        raise RuntimeError(f"{box['id']} hosts a PUBLIC (prod) env — pass --confirm-prod to deploy")
    import github
    repo = inv.get("pool", {}).get("release_repo", "panov-id/xor.ad")
    for env in box["envs"]:
        if inv["env"][env].get("access") != "public":
            continue
        tag = inv["env"][env].get("image_tag", "")
        if not re.match(r"^v\d+\.\d+\.\d+", tag):
            raise RuntimeError(f"{box['id']}/{env}: image_tag '{tag}' is not a release version "
                               f"(vX.Y.Z) — bump it to the release before deploying prod")
        if not github.is_published_release(repo, tag):
            raise RuntimeError(f"{box['id']}/{env}: {tag} is not a published GitHub Release of "
                               f"{repo} — publish the release first (that's the approval)")


def env_file(inv: dict, box: dict, env: str) -> str:
    e = inv["env"][env]
    vals = {
        "NODE_ENV_NAME": env,
        "NODE_ID": f"{box['id']}-{env}",
        "NODE_REGION": box.get("region", "unknown"),
        "NODE_ROLE": "relay",
        "PORT": "8080",
        "ALLOWED_ORIGINS": ",".join(e.get("allowed_origins", [])),
        "BUNNY_STORAGE_HOST": os.environ.get("BUNNY_STORAGE_HOST", "storage.bunnycdn.com"),
        "BUNNY_STORAGE_ZONE": os.environ.get("BUNNY_STORAGE_ZONE", ""),
        "BUNNY_STORAGE_KEY": os.environ.get("BUNNY_STORAGE_KEY", ""),
        "RESEND_API_KEY": os.environ.get("RESEND_API_KEY", ""),
        "WELCOME_FROM": os.environ.get("WELCOME_FROM", ""),
    }
    if e.get("mail") == "mailpit":
        vals.update({"MAIL_TRANSPORT": "smtp", "MAIL_SMTP_HOST": "mailpit", "MAIL_SMTP_PORT": "1025"})
    else:
        vals["MAIL_TRANSPORT"] = "resend"
    if os.environ.get("BRANDS"):  # extra/override brands (e.g. an Asia brand); default = sosed+neighbro
        vals["BRANDS"] = os.environ["BRANDS"]
    return "".join(f"{k}={v}\n" for k, v in vals.items())


def uses_mailpit(inv: dict, box: dict) -> bool:
    return any(inv["env"][e].get("mail") == "mailpit" for e in box["envs"])


def aux_hosts(inv: dict, box: dict) -> list[str]:
    # logs viewer (Dozzle) always; mail catcher (Mailpit) if any env uses it.
    hosts = [f"logs-{box['id']}.{dns_zone(inv)}"]
    if uses_mailpit(inv, box):
        hosts.append(f"mail-{box['id']}.{dns_zone(inv)}")
    return hosts


def render_compose(inv: dict, box: dict) -> str:
    pool = inv.get("pool", {})
    node_repo = pool.get("node_repo", "ghcr.io/panov-id/edge-node")
    caddy_repo = pool.get("caddy_repo", "ghcr.io/panov-id/edge-caddy")
    caddy_tag = pool.get("caddy_tag", "dev")
    caddy_image = f"{caddy_repo}:{caddy_tag}"
    nodes = "".join(
        f"""  node-{env}:
    image: {node_repo}:{inv["env"][env].get("image_tag", "dev")}
    restart: unless-stopped
    env_file: [{env}.env]
    expose: ["8080"]
""" for env in box["envs"])
    extra = ""
    if uses_mailpit(inv, box):
        extra += ('  mailpit:\n    image: axllent/mailpit:latest\n'
                  '    restart: unless-stopped\n    expose: ["1025", "8025"]\n')
    extra += ('  dozzle:\n    image: amir20/dozzle:latest\n    restart: unless-stopped\n'
              '    volumes: ["/var/run/docker.sock:/var/run/docker.sock:ro"]\n    expose: ["8080"]\n')
    deps = ", ".join([f"node-{e}" for e in box["envs"]]
                     + (["mailpit"] if uses_mailpit(inv, box) else []) + ["dozzle"])
    return f"""services:
{nodes}{extra}  caddy:
    image: {caddy_image}
    restart: unless-stopped
    depends_on: [{deps}]
    ports: ["443:443"]
    env_file: [caddy.env]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
volumes:
  caddy_data:
  caddy_config:
"""


def render_caddyfile(inv: dict, box: dict) -> str:
    out = "{\n\tauto_https disable_redirects\n}\n\n"
    for env in box["envs"]:
        host = host_for(inv, box, env)
        out += (f"{host} {{\n"
                f"\ttls {{ dns bunny {{env.BUNNY_API_KEY}} }}\n"
                f"\tencode zstd gzip\n"
                f"\treverse_proxy node-{env}:8080\n"
                f"}}\n\n")
    for host in aux_hosts(inv, box):
        target = "dozzle:8080" if host.startswith("logs-") else "mailpit:8025"
        out += (f"{host} {{\n"
                f"\ttls {{ dns bunny {{env.BUNNY_API_KEY}} }}\n"
                f"\treverse_proxy {target}\n"
                f"}}\n\n")
    return out


# --- ssh helpers ------------------------------------------------------------

def ssh_connect(box: dict):
    host = box.get("ssh_host")
    if not host:
        raise RuntimeError(f"{box['id']}: no ssh_host (provision first, or set it in inventory)")
    import paramiko  # lazy — status/dns work without it
    user = box.get("ssh_user", "root")
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


def sh_out(client, cmd: str) -> str:
    _stdin, stdout, _stderr = client.exec_command("bash -lc " + shlex.quote(cmd))
    return stdout.read().decode(errors="replace").strip()


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


def _verify_health(client, host: str, sudo: bool) -> None:
    for _ in range(6):
        if sh(client, f"curl -fsS -m 5 https://{host}/health", sudo=sudo, check=False) == 0:
            print(f"      {host}/health ok ✓")
            return
        sh(client, "sleep 5", check=False)
    print(f"      [warn] {host}/health not green yet (DNS-01 cert may still be issuing)")


# --- box operations ---------------------------------------------------------

def harden_ssh(client, sudo: bool) -> None:
    conf = ("PasswordAuthentication no\nPermitRootLogin no\nPubkeyAuthentication yes\n"
            "KbdInteractiveAuthentication no\n")
    sftp = client.open_sftp()
    try:
        sh(client, "mkdir -p /etc/ssh/sshd_config.d", sudo=sudo)
        if sudo:
            # write via a temp file we own, then move with sudo
            _write_remote(sftp, "/tmp/60-edge.conf", conf)
            sh(client, "mv /tmp/60-edge.conf /etc/ssh/sshd_config.d/60-edge.conf", sudo=True)
        else:
            _write_remote(sftp, "/etc/ssh/sshd_config.d/60-edge.conf", conf)
    finally:
        sftp.close()
    sh(client, "systemctl reload ssh 2>/dev/null || systemctl reload sshd", sudo=sudo, check=False)


def firewall(client, inv: dict, box: dict, sudo: bool) -> None:
    ssh_wl = list(inv.get("pool", {}).get("ssh_whitelist", []))
    # never lock ourselves out: allow 22 from the IP we're connected from
    src = sh_out(client, "echo $SSH_CONNECTION | awk '{print $1}'")
    if src and src not in ssh_wl:
        ssh_wl.append(src)
    public = any(inv["env"][e].get("access") == "public" for e in box["envs"])
    allow443 = sorted({ip for e in box["envs"] if inv["env"][e].get("access") != "public"
                       for ip in inv["env"][e].get("whitelist_ips", [])})

    cmds = ["ufw --force reset", "ufw default deny incoming", "ufw default allow outgoing"]
    for ip in ssh_wl:
        cmds.append(f"ufw allow from {ip} to any port 22 proto tcp")
    if public:
        cmds.append("ufw allow 443/tcp")
    else:
        for ip in allow443:
            cmds.append(f"ufw allow from {ip} to any port 443 proto tcp")
    cmds.append("ufw --force enable")
    sh(client, " && ".join(cmds), sudo=sudo)
    print(f"      firewall: ssh<-{ssh_wl}  443<-{'ANY' if public else allow443}")


def _sync_and_up(client, inv: dict, box: dict, sudo: bool, user: str) -> None:
    print(f"      sync stacks -> {REMOTE_ROOT}")
    sh(client, f"mkdir -p {REMOTE_ROOT}", sudo=sudo)
    if sudo:
        sh(client, f"chown -R {user} {REMOTE_ROOT}", sudo=True)
    sftp = client.open_sftp()
    try:
        # Images are pulled from the registry, so only the generated compose bits
        # go on the box — no source trees.
        _sftp_mkdirs(sftp, f"{REMOTE_ROOT}/compose")
        _write_remote(sftp, f"{REMOTE_ROOT}/compose/docker-compose.yml", render_compose(inv, box))
        _write_remote(sftp, f"{REMOTE_ROOT}/compose/Caddyfile", render_caddyfile(inv, box))
        _write_remote(sftp, f"{REMOTE_ROOT}/compose/caddy.env",
                      f"BUNNY_API_KEY={os.environ.get('BUNNY_API_KEY', '')}\n")
        for env in box["envs"]:
            _write_remote(sftp, f"{REMOTE_ROOT}/compose/{env}.env", env_file(inv, box, env))
    finally:
        sftp.close()
    print("      docker compose pull + up -d")
    sh(client, f"cd {REMOTE_ROOT}/compose && docker compose pull && docker compose up -d", sudo=sudo)
    for env in box["envs"]:
        _verify_health(client, host_for(inv, box, env), sudo)


def provision(box: dict, inv: dict) -> None:
    if box.get("mode") != "provision":
        print(f"  · {box['id']}: manual box (mode=configure) — skip provision")
        return
    from providers import provision_server
    print(f"  · {box['id']}: provision {box['provider']}/{box.get('location', '?')} "
          f"({box.get('server_type') or box.get('plan') or 'default'})")
    srv = {**box, "hostname": f"{box['id']}.{dns_zone(inv)}"}
    ip = provision_server(srv)
    box["ssh_host"] = ip
    box.setdefault("ssh_user", "root")
    print(f"  · {box['id']}: ready at {ip}")


def dns(box: dict, inv: dict) -> None:
    import bunny
    ip = box.get("ssh_host")
    if not ip:
        raise RuntimeError(f"{box['id']}: no ip yet (run provision first, or set ssh_host)")
    zone = bunny.find_zone(f"x.{dns_zone(inv)}")
    hosts = [host_for(inv, box, e) for e in box["envs"]] + aux_hosts(inv, box)
    for host in hosts:
        name = bunny.subdomain(host, zone["Domain"])
        action = bunny.set_a(zone, name, ip)
        print(f"  · {box['id']}: dns {host} -> {ip} ({action})")


def configure(box: dict, inv: dict) -> None:
    _guard_prod(inv, box)
    print(f"  · {box['id']}: configure {box.get('ssh_host', '<no ssh_host>')}  envs={box['envs']}")
    client, user = ssh_connect(box)
    sudo = user != "root"
    try:
        print("      harden ssh (key-only, no root)")
        harden_ssh(client, sudo)
        print("      firewall (default-deny + whitelist)")
        firewall(client, inv, box, sudo)
        print("      docker: install (if missing) + enable")
        sh(client, "export DEBIAN_FRONTEND=noninteractive; apt-get update -y && "
                   "apt-get install -y ca-certificates curl ufw fail2ban unattended-upgrades", sudo=sudo)
        sh(client, "systemctl enable --now fail2ban unattended-upgrades", sudo=sudo, check=False)
        sh(client, "command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh", sudo=sudo)
        sh(client, "systemctl enable --now docker", sudo=sudo)
        _sync_and_up(client, inv, box, sudo, user)
        print(f"  · {box['id']}: configured ✓")
    finally:
        client.close()


def deploy(box: dict, inv: dict) -> None:
    _guard_prod(inv, box)
    print(f"  · {box['id']}: deploy {box.get('ssh_host', '<no ssh_host>')}")
    client, user = ssh_connect(box)
    sudo = user != "root"
    try:
        _sync_and_up(client, inv, box, sudo, user)
        print(f"  · {box['id']}: deployed ✓")
    finally:
        client.close()


def pool(box: dict, inv: dict) -> None:
    import bunny
    ip = box.get("ssh_host")
    if not ip:
        raise RuntimeError(f"{box['id']}: no ip (run provision first, or set ssh_host)")
    public_envs = [e for e in box["envs"] if inv["env"][e].get("access") == "public"]
    if not public_envs:
        print(f"  · {box['id']}: no public env on this box — skip pool (cutover is prod-only)")
        return
    for env in public_envs:
        ph = inv["env"][env].get("pool_hostname")
        if not ph:
            continue
        zone = bunny.find_zone(ph)
        name = bunny.subdomain(ph, zone["Domain"])
        action = bunny.pool_add(zone, name, ip, box.get("lat"), box.get("lon"))
        print(f"  · {box['id']}: pool {ph} += {ip} ({action})")


def status(inv: dict) -> None:
    bs = inv.get("box", [])
    print(f"pool: {len(bs)} box(es), dns_zone={dns_zone(inv)}")
    for b in bs:
        print(f"  {b['id']:4} {b['provider']:10} {b.get('region',''):14} "
              f"{b.get('mode','?'):9} envs={','.join(b.get('envs', []))}")


# --- cli --------------------------------------------------------------------

def run_each(inv: dict, only: str | None, fn) -> None:
    bs = boxes(inv, only)
    if not bs:
        print("no matching boxes")
    for b in bs:
        try:
            fn(b)
        except Exception as e:  # one box's failure must not abort the run
            print(f"  · {b['id']}: ERROR {e}")


def main() -> None:
    p = argparse.ArgumentParser(prog="wizard", description="relay pool wizard")
    p.add_argument("--inventory", type=Path, default=INVENTORY)
    p.add_argument("--node", "--box", dest="box", help="limit to a box id")
    p.add_argument("--confirm-prod", action="store_true",
                   help="required to deploy a box that hosts a public (prod) env")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("status", "provision", "configure", "dns", "pool", "deploy", "up"):
        sub.add_parser(name)

    args = p.parse_args()
    global CONFIRM_PROD
    CONFIRM_PROD = args.confirm_prod
    inv = load_inventory(args.inventory)

    if args.cmd == "status":
        status(inv)
    elif args.cmd == "provision":
        run_each(inv, args.box, lambda b: provision(b, inv))
    elif args.cmd == "configure":
        run_each(inv, args.box, lambda b: configure(b, inv))
    elif args.cmd == "dns":
        run_each(inv, args.box, lambda b: dns(b, inv))
    elif args.cmd == "pool":
        run_each(inv, args.box, lambda b: pool(b, inv))
    elif args.cmd == "deploy":
        run_each(inv, args.box, lambda b: deploy(b, inv))
    elif args.cmd == "up":
        # dns before configure so DNS-01 can validate the hostnames.
        for b in boxes(inv, args.box):
            print(f"[{b['id']}] up")
            try:
                provision(b, inv)
                dns(b, inv)
                configure(b, inv)
            except Exception as e:
                print(f"  · {b['id']}: ERROR {e}")


if __name__ == "__main__":
    main()
