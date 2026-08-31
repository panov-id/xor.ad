#!/usr/bin/env bash
# Roll the dev environment onto the image CI built from the current origin/dev.
#
# CI builds and signs the images; nothing deploys the node — deploy-dev.yml only
# ships the panel to the CDN. This is that missing half, and it runs here rather
# than on a runner because the boxes only accept SSH from the whitelisted admin
# addresses (relay/wizard/inventory.toml), and a runner's address is not one.
#
#   bash scripts/deploy-relay-dev.sh            # roll dev to origin/dev's sha
#   bash scripts/deploy-relay-dev.sh 43f36ba    # or to a specific commit
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
box="n1"
environment="dev"
image="ghcr.io/panov-id/relay-node"
environments_file="$root/relay/wizard/environments.toml"
secrets_file="$root/relay/wizard/secrets.env"

# The sha of what is on dev, not of what is checked out: the image exists because
# CI built that commit, and a local branch can be anywhere.
git -C "$root" fetch origin dev --quiet
commit="$(git -C "$root" rev-parse --short=7 "${1:-origin/dev}")"
tag="sha-$commit"
echo "== rolling $environment on $box to $tag"

[ -f "$secrets_file" ] || { echo "no relay/wizard/secrets.env — the wizard needs it" >&2; exit 1; }
[ -n "${SSH_AUTH_SOCK:-}" ] || { echo "no SSH agent — the wizard connects as the deploy user" >&2; exit 1; }

# Wait for the image rather than fail on it: this is normally run right after a
# push, and the build takes a few minutes.
echo "== waiting for $image:$tag in ghcr"
registry_token="$(curl -fsS "https://ghcr.io/token?service=ghcr.io&scope=repository:panov-id/relay-node:pull" |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')"
for attempt in $(seq 40); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' -H "authorization: Bearer $registry_token" \
    -H "accept: application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json" \
    "https://ghcr.io/v2/panov-id/relay-node/manifests/$tag")"
  [ "$code" = "200" ] && { echo "   present"; break; }
  echo "   not yet (HTTP $code), attempt $attempt"
  sleep 30
done
[ "$code" = "200" ] || { echo "$image:$tag never appeared — did the relay CI pass?" >&2; exit 1; }

# Pinned in the tracked file, so "which image is on which environment" stays a
# question history can answer. Only the dev block: staging and prod run releases.
echo "== pinning [env.$environment].image_tag = $tag"
python3 - "$environments_file" "$environment" "$tag" <<'PYTHON'
import re, sys
path, environment, tag = sys.argv[1:4]
text = open(path).read()
block = re.compile(rf'(\[env\.{re.escape(environment)}\][^\[]*?image_tag = ")[^"]*(")', re.S)
new_text, count = block.subn(rf'\g<1>{tag}\g<2>', text)
if count != 1:
    raise SystemExit(f"expected one image_tag under [env.{environment}], changed {count}")
open(path, "w").write(new_text)
PYTHON
git -C "$root" --no-pager diff -- relay/wizard/environments.toml

# The wizard runs in Docker (nothing installed here) and rolls every stack on the
# box; staging keeps its own pinned release, so only dev moves.
#
# --node before the subcommand: it belongs to the top-level parser, and argparse
# rejects it after `deploy`.
echo "== wizard --node $box deploy"
SECRETS_ENV="$secrets_file" bash "$root/relay/wizard/run.sh" --node "$box" deploy

# Health says a node answers; this says it is THIS build. It used to ask whether
# /v1/client-error existed, on the reasoning that the route was new — which
# stopped identifying anything the moment the route landed in an older image. On
# 2026-08-31 that probe reported "the new build is live" over a node whose image
# pull had been denied, and the run before it had reported the same. Now the node
# names its own tag (RELAY_IMAGE_TAG, handed in by the wizard and kept by the
# running container), and the probe compares it with the tag being rolled.
base="https://$box-$environment.relay.panov.id"
echo "== probe $base"
curl -fsS -m 10 "$base/health" | grep -q '"status":"ok"' || { echo "FAIL: health"; exit 1; }
running="$(curl -fsS -m 10 "$base/health" |
  python3 -c 'import json,sys; print(json.load(sys.stdin).get("image", ""))')"
case "$running" in
  "$tag")   echo "   /health image -> $running: this build is live" ;;
  ""|unknown)
    echo "FAIL: the node does not report an image tag — it predates RELAY_IMAGE_TAG," >&2
    echo "      which means it is older than this probe and certainly not $tag" >&2
    exit 1 ;;
  *)  echo "FAIL: the node is running $running, not $tag — the roll did not take" >&2
      exit 1 ;;
esac

echo
echo "dev is on $tag. Commit relay/wizard/environments.toml so history records it."
