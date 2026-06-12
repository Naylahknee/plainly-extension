#!/usr/bin/env bash
# Assemble Plainly Web (the PWA) into dist/web/ — a self-contained static
# site that reuses the extension's services and glossary unchanged.
# Deploy dist/web/ to any HTTPS host, then wrap into an APK with
# PWABuilder or Bubblewrap (see store/ANDROID.md).
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="dist/web"
rm -rf "$OUT"
mkdir -p "$OUT/services" "$OUT/prompts" "$OUT/icons"

# Web app shell
cp web/index.html web/app.js web/shim.js web/styles.css \
   web/manifest.webmanifest web/sw.js "$OUT/"

# Shared engine — the exact same files the extension ships
cp services/storageService.js services/glossaryService.js services/translator.js \
   "$OUT/services/"
cp glossary.json "$OUT/"
cp prompts/*.txt "$OUT/prompts/"

# Icons (192/512 for PWA installs + favicons)
python3 scripts/make_icons.py --sizes 192,512 --out "$OUT/icons"

echo "Built $OUT"
find "$OUT" -type f | sort
