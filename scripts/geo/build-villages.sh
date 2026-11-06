#!/usr/bin/env bash
# Rebuild app/src/screens/me/villages-cy.json from GeoNames CY (CC BY 4.0). Downloads into a temporary dir.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
curl -sSL --http1.1 --retry 3 --max-time 300 -o "$tmp/c.zip" https://download.geonames.org/export/dump/CY.zip
python3 -I -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extract('CY.txt', sys.argv[2])" "$tmp/c.zip" "$tmp"
python3 -I "$root/scripts/geo/build-villages.py" "$tmp/CY.txt" "$root/web/src/geo/cities.json" "$root/app/src/screens/me/villages-cy.json"
