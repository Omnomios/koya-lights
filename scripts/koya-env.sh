# Shared Koya runtime, assets and native-plugin resolution.
KOYA_MIN_VERSION=0.7.1

koya_version_line() {
  local output
  # --help also works on old releases that treat --version as an app argument.
  output="$("$1" --help 2>&1)" || return 1
  printf '%s\n' "${output%%$'\n'*}"
}

koya_is_supported() {
  local version
  [[ -x "$1" ]] || return 1
  version="$(koya_version_line "$1")"
  [[ "$version" =~ ^Koya[[:space:]]+([0-9]+)\.([0-9]+)\.([0-9]+)([[:space:]]|$) ]] || return 1
  local major="${BASH_REMATCH[1]}" minor="${BASH_REMATCH[2]}" patch="${BASH_REMATCH[3]}"
  (( 10#$major > 0 || 10#$minor > 7 || (10#$minor == 7 && 10#$patch >= 1) ))
}

resolve_koya_bin() {
  local candidate
  if [[ -n "${KOYA_BIN:-}" ]]; then
    candidate="$(command -v -- "$KOYA_BIN" 2>/dev/null || true)"
    if [[ -z "$candidate" ]] || ! koya_is_supported "$candidate"; then
      echo "KOYA_BIN must point to Koya $KOYA_MIN_VERSION or newer: $KOYA_BIN" >&2
      return 1
    fi
    printf '%s\n' "$candidate"
    return 0
  fi

  local candidates=(
    "$(command -v koya 2>/dev/null || true)"
    /usr/local/bin/koya
    /usr/bin/koya
    "${HOME:-}/projects/helix/build/koya-base/koya"
    "${HOME:-}/projects/helix/koya-base/build/koya-base/koya"
  )
  if [[ -n "${ROOT:-}" ]]; then
    candidates+=(
      "$ROOT/../helix/build/koya-base/koya"
      "$ROOT/../helix/koya-base/build/koya-base/koya"
    )
  fi
  for candidate in "${candidates[@]}"; do
    [[ -n "$candidate" ]] || continue
    if koya_is_supported "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  echo "Koya $KOYA_MIN_VERSION or newer is required. Install it or set KOYA_BIN." >&2
  echo "See https://developer.koya-ui.com/install/" >&2
  return 1
}

koya_bin_dir() {
  dirname "$(readlink -f "$1")"
}

resolve_koya_assets() {
  if [[ -n "${KOYA_ASSETS:-}" ]]; then
    if [[ -f "$KOYA_ASSETS/std/koya-ui.js" && -f "$KOYA_ASSETS/std/koya-controls.js" ]]; then
      (cd "$KOYA_ASSETS" && pwd)
      return 0
    fi
    echo "KOYA_ASSETS must contain the matching Koya standard library: $KOYA_ASSETS" >&2
    return 1
  fi

  local bin_dir candidate
  bin_dir="$(koya_bin_dir "$1")"
  local candidates=(
    "$bin_dir/assets"
    "$bin_dir/../assets"
    "$bin_dir/../share/koya/assets"
    "$bin_dir/../share/koya"
    "$bin_dir/../../share/koya/assets"
    "$bin_dir/../../share/koya"
    "$bin_dir/../../koya-base/assets"
    "$bin_dir/../../../koya-base/assets"
  )
  for candidate in "${candidates[@]}"; do
    if [[ -f "$candidate/std/koya-ui.js" && -f "$candidate/std/koya-controls.js" ]]; then
      (cd "$candidate" && pwd)
      return 0
    fi
  done

  echo "Matching Koya assets not found. Set KOYA_ASSETS to this runtime's assets directory." >&2
  return 1
}

resolve_koya_plugins() {
  local bin_dir candidate plugin complete
  bin_dir="$(koya_bin_dir "$1")"
  local candidates=()
  if [[ -n "${SHELLYHUB_PLUGINS:-}" ]]; then
    candidates+=("$SHELLYHUB_PLUGINS")
  else
    candidates+=(
      "$bin_dir"
      "$bin_dir/../helix-plugin"
      "$bin_dir/../lib"
      "$bin_dir/../lib64"
      "$bin_dir/../lib/$(uname -m)-linux-gnu"
    )
  fi
  for candidate in "${candidates[@]}"; do
    complete=1
    for plugin in http ws process; do
      [[ -f "$candidate/libhx-$plugin.so" ]] || complete=0
    done
    if (( complete )); then
      (cd "$candidate" && pwd)
      return 0
    fi
  done

  echo "Matching HTTP, WebSocket and Process plugins not found." >&2
  echo "Install helix-plugin-http, helix-plugin-ws and helix-plugin-process for this Koya release," >&2
  echo "or set SHELLYHUB_PLUGINS to the directory containing their libhx-*.so files." >&2
  return 1
}
