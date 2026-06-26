#!/usr/bin/env bash
# Build the Chrome Web Store upload zip.
# Includes only what the extension needs at runtime — no dev tooling,
# no docs, no git metadata.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
OUT="dist/plainly-${VERSION}.zip"

mkdir -p dist
rm -f "$OUT"

zip -r "$OUT" \
  manifest.json \
  background.js \
  content.js \
  popup.html popup.js \
  sidepanel.html sidepanel.js \
  styles.css \
  glossary.json \
  glossary \
  services \
  prompts \
  assets \
  -x "*.DS_Store"

echo "Built $OUT"
unzip -l "$OUT" | tail -2
