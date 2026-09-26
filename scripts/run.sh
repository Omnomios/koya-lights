#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT/app"
PLUGIN_DIR="${SHELLYHUB_PLUGINS:-$HOME/projects/helix/build/helix-plugin}"

# shellcheck source=scripts/koya-env.sh
source "$ROOT/scripts/koya-env.sh"

KOYA_BIN="$(resolve_koya_bin 0)" || exit 1

if [[ ! -x "$KOYA_BIN" ]]; then
  echo "koya binary not found: $KOYA_BIN" >&2
  echo "Install/build Koya (or set KOYA_BIN). See https://developer.koya-ui.com/install/" >&2
  exit 1
fi

if ! koya_is_packaging_capable "$KOYA_BIN"; then
  echo "warning: $KOYA_BIN ($(koya_version_line "$KOYA_BIN")) is older than 0.3.1; prefer helix/build/koya-base/koya" >&2
fi

KOYA_ASSETS_DIR="$(resolve_koya_assets "$KOYA_BIN")" || exit 1

if [[ ! -f "$PLUGIN_DIR/libhx-http.so" ]]; then
  echo "Module/http not found at $PLUGIN_DIR/libhx-http.so" >&2
  echo "Build helix plugins or set SHELLYHUB_PLUGINS to the directory containing libhx-http.so." >&2
  exit 1
fi

if [[ ! -f "$PLUGIN_DIR/libhx-ws.so" ]]; then
  echo "Module/ws not found at $PLUGIN_DIR/libhx-ws.so" >&2
  echo "Build helix plugins or set SHELLYHUB_PLUGINS to the directory containing libhx-ws.so." >&2
  exit 1
fi

if [[ ! -f "$PLUGIN_DIR/libhx-process.so" ]]; then
  echo "Module/process not found at $PLUGIN_DIR/libhx-process.so" >&2
  echo "Build helix plugins or set SHELLYHUB_PLUGINS to the directory containing libhx-process.so." >&2
  exit 1
fi

MOUNT_ARGS=(-m "$KOYA_ASSETS_DIR" -m "$APP_DIR")

echo "Using koya: $KOYA_BIN ($(koya_version_line "$KOYA_BIN"))" >&2
echo "Using assets: $KOYA_ASSETS_DIR" >&2
echo "Using plugins: $PLUGIN_DIR" >&2

exec "$KOYA_BIN" \
  "${MOUNT_ARGS[@]}" \
  -n "$PLUGIN_DIR" \
  -i shellyhub.js \
  "$@"
