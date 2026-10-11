#!/usr/bin/env bash
# Rebuild web/src/geo/cities.json from GeoNames cities15000 (CC BY 4.0). Downloads into a temporary dir.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
curl -sSL --http1.1 --retry 3 --max-time 300 -o "$tmp/c.zip" https://download.geonames.org/export/dump/cities15000.zip
python3 -I -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extract('cities15000.txt', sys.argv[2])" "$tmp/c.zip" "$tmp"
mkdir -p "$root/web/src/geo"
python3 -I "$root/scripts/geo/build-cities.py" "$tmp/cities15000.txt" "$root/web/src/geo/cities.json"
ls -la "$root/web/src/geo/cities.json" | awk '{print $5, "bytes"}'
