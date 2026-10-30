#!/usr/bin/env bash
# Build botsync_walkthrough.zip, unzip it into a brand-new folder, and rerun tests 1-3 and 6 there (acceptance test 16).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f botsync_walkthrough.zip
zip -q -r -X botsync_walkthrough.zip botsync_walkthrough
SIZE=$(stat -c %s botsync_walkthrough.zip)
FRESH=$(mktemp -d "${TMPDIR:-/tmp}/fresh_unzip.XXXXXX")
unzip -q botsync_walkthrough.zip -d "$FRESH"
echo "=== Test 16: Zip test"
echo "zip size: $SIZE bytes ($(awk "BEGIN{printf \"%.2f\", $SIZE/1048576}") MB)"
if [ "$SIZE" -lt 5242880 ]; then echo "  PASS zip is under 5 MB"; else echo "  FAIL zip is 5 MB or more"; fi
echo "unzipped into a new folder: $FRESH"
unzip -l botsync_walkthrough.zip
node tools/run_tests.js "$FRESH/botsync_walkthrough" --zip-only --out evidence
