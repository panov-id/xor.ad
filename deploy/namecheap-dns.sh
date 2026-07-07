#!/usr/bin/env bash
# Add dev/uat CNAME records to panov.id via the Namecheap API.
# Runs in a throwaway Python container; reads creds from deploy/.env.deploy.
#   deploy/namecheap-dns.sh <dev|uat> [--apply]
# Default is a dry-run (prints the plan); pass --apply to actually write.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$DEPLOY_DIR/.env.deploy"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (copy from .env.deploy.example and fill Namecheap keys)"; exit 1; }

# Source in the shell (strips inline comments) and pass only the needed vars via -e.
set -a; . "$ENV_FILE"; set +a

docker run --rm \
  -e NAMECHEAP_API_USER -e NAMECHEAP_API_KEY -e NAMECHEAP_USERNAME \
  -e NAMECHEAP_CLIENT_IP -e NAMECHEAP_SANDBOX \
  -v "$DEPLOY_DIR/namecheap-dns.py:/app/namecheap-dns.py:ro" \
  -w /app python:3.12-alpine \
  sh -c "pip install -q requests && python3 namecheap-dns.py $*"
