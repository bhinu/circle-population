#!/usr/bin/env bash
# Download GTFS feeds and Census ACS block-group data for the SF Bay Area.
# All sources are free & public. No API keys required.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$ROOT/data/raw"
mkdir -p "$RAW"

ua="Mozilla/5.0 (compatible; CirclePopulationETL/0.1)"

fetch() {
  local url="$1"
  local out="$2"
  if [[ -f "$out" && -s "$out" ]]; then
    echo "  ✓ $(basename "$out") (cached)"
    return 0
  fi
  echo "  → fetching $(basename "$out")"
  if ! curl -fL -A "$ua" --max-time 120 -o "$out" "$url"; then
    echo "  ✗ failed to fetch $url"
    rm -f "$out"
    return 1
  fi
}

echo
echo "==> GTFS feeds"
# SFMTA / Muni — current canonical URL (per Mobility Database entry 2886).
# Falls back to the Mobility Database snapshot mirror if the live feed times out.
if ! fetch "https://muni-gtfs.apps.sfmta.com/data/muni_gtfs-current.zip" "$RAW/sfmta.zip"; then
  echo "  → primary SFMTA URL failed, trying Mobility Database mirror"
  fetch "https://storage.googleapis.com/storage/v1/b/mdb-latest/o/us-san-francisco-san-francisco-m-gtfs-2886.zip?alt=media" "$RAW/sfmta.zip" || true
fi
fetch "https://www.bart.gov/dev/schedules/google_transit.zip" "$RAW/bart.zip" || true
fetch "https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip" "$RAW/caltrain.zip" || true

echo
echo "==> Census ACS 5-yr (2022) block-group population"
echo "    (Bay Area + adjacent counties, ~1.6 MB pre-built CSV)"
# We ship a pre-built CSV under data/bg_pop.csv so the importer works offline.
# If you want to re-pull from the live Census API, run:
#     CENSUS_API_KEY=... npm run build:db -- --refresh-census
if [[ ! -f "$ROOT/data/bg_pop.csv" ]]; then
  echo "  ! data/bg_pop.csv is missing. The repo should include this file."
  echo "    Re-fetch with the Census API (free key at https://api.census.gov/data/key_signup.html):"
  echo "      CENSUS_API_KEY=YOURKEY npm run build:db -- --refresh-census"
else
  echo "  ✓ data/bg_pop.csv (committed)"
fi

echo
echo "Done. Now build the SQLite DB:  npm run build:db"
