#!/bin/sh
# Prediction add-on test 1: runs the spec's test_calc.js unchanged. The spec's file requires
# './assets/js/predict-data.js' and './predict-calc.js', so both are laid out that way in a temp folder.
set -e
HERE=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d)
mkdir -p "$T/assets/js"
cp "$HERE/botsync_walkthrough/assets/js/predict-data.js" "$T/assets/js/"
cp "$HERE/botsync_walkthrough/assets/js/predict-calc.js" "$T/"
cp "$HERE/tools/test_calc.js" "$T/"
(cd "$T" && node test_calc.js)
rm -rf "$T"
