#!/usr/bin/env bash
# Upload frontend ke R2 bucket "zxaionverse" (binding Zxaion_B yang dibaca Worker).
# Worker menyajikan frontend dari R2, jadi file harus ada di key yang sama dengan path lokal.
set -euo pipefail

BUCKET="zxaionverse"
cd "$(dirname "$0")/../frontend"

find . -type f | sed 's|^\./||' | while read -r key; do
  case "$key" in
    *.html) ct="text/html; charset=utf-8" ;;
    *.css)  ct="text/css; charset=utf-8" ;;
    *.js)   ct="application/javascript; charset=utf-8" ;;
    *.json) ct="application/json" ;;
    *)      ct="application/octet-stream" ;;
  esac
  echo "upload $key"
  npx --yes wrangler r2 object put "$BUCKET/$key" --file "$key" --content-type "$ct" --remote
done
echo "Selesai."
