#!/usr/bin/env bash
# Send one phrase to the local stand the way a person sends it — register an
# identity with the depth core, say the phrase — so it lands in the feed queue
# through POST /feed and not through a side door into the database.
#
#   scripts/seed-local-phrase.sh "текст фразы" [name]
#
# Requires relay/local (node on :62080, postgres on :62432) to be up. The
# storefront key it needs is created on first use; the identity is a fresh
# test-only registration each time (the PIN and paper code are placeholders,
# depth-core panel 2026-09-21), so the stand gains one identity per phrase.
#
# Prints the phrase's id from the queue, for a test to act on.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
text="${1:?phrase text}"
name="${2:-Аня}"
key_id="ak_pub_localseedphrase0001"
db="edge-node-local-postgres-1"
deno_image="denoland/deno:alpine-2.1.4"

docker exec "$db" psql -q -U relay -d relay -c \
  "INSERT INTO api_keys (id, brand, origins) VALUES ('$key_id', 'sosed', '{}') ON CONFLICT DO NOTHING" >/dev/null

# --network host: the node listens on the host's :62080. Deno's cache is a named
# volume so the second run does not fetch std again.
docker run --rm --network host -v "$root/depth":/depth -w /depth -v local-seed-deno-cache:/deno-dir \
  -e DENO_DIR=/deno-dir -e SEED_TEXT="$text" -e SEED_NAME="$name" -e DEPTH_API_KEY="$key_id" \
  "$deno_image" run --allow-net --allow-env tools/seed_phrase.ts
docker exec "$db" psql -qtA -U relay -d relay -c \
  "SELECT id FROM feed_messages WHERE visible_at IS NULL AND text = \$\$${text}\$\$ ORDER BY created_at DESC LIMIT 1"
