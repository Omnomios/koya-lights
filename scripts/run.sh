#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT/app"

# shellcheck source=scripts/koya-env.sh
source "$ROOT/scripts/koya-env.sh"

KOYA_BIN="$(resolve_koya_bin)" || exit 1
KOYA_ASSETS_DIR="$(resolve_koya_assets "$KOYA_BIN")" || exit 1
PLUGIN_DIR="$(resolve_koya_plugins "$KOYA_BIN")" || exit 1

echo "Using koya: $KOYA_BIN ($(koya_version_line "$KOYA_BIN"))" >&2
echo "Using assets: $KOYA_ASSETS_DIR" >&2
echo "Using plugins: $PLUGIN_DIR" >&2

exec "$KOYA_BIN" \
  -m "$KOYA_ASSETS_DIR" -m "$APP_DIR" \
  -n "$PLUGIN_DIR" \
  -i shellyhub.js \
  "$@"
