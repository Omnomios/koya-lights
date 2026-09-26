# Shared Koya binary / assets resolution for run.sh and dist/package.sh.
# Packaging requires Koya 0.3.1+ (self-discovering appended ZIP + mountAdjacent).

koya_is_packaging_capable() {
  local bin="$1"
  [[ -x "$bin" ]] || return 1
  # 0.3.1+ exposes --default-mounts (ambient mounts off by default).
  # Older builds expose --no-default-mounts instead.
  "$bin" --help 2>&1 | grep -q -- '--default-mounts'
}

koya_version_line() {
  local bin="$1"
  "$bin" --help 2>&1 | head -n 1 || true
}

resolve_koya_bin() {
  local require_packaging="${1:-0}"
  local candidates=()
  local home="${HOME:-}"
  local c

  if [[ -n "${KOYA_BIN:-}" ]]; then
    candidates+=("$KOYA_BIN")
  fi

  # Prefer local Helix/Koya monorepo builds (0.3.1 lives here on this machine).
  candidates+=(
    "$home/projects/helix/build/koya-base/koya"
    "$home/projects/helix/koya-base/build/koya-base/koya"
  )
  if [[ -n "${ROOT:-}" ]]; then
    candidates+=(
      "$ROOT/../helix/build/koya-base/koya"
      "$ROOT/../helix/koya-base/build/koya-base/koya"
    )
  fi

  candidates+=(
    "$(command -v koya 2>/dev/null || true)"
    /usr/local/bin/koya
    /usr/bin/koya
  )

  local first_found=""
  for c in "${candidates[@]}"; do
    [[ -n "$c" && -x "$c" ]] || continue
    if [[ -z "$first_found" ]]; then
      first_found="$c"
    fi
    if koya_is_packaging_capable "$c"; then
      printf '%s\n' "$c"
      return 0
    fi
  done

  if [[ "$require_packaging" == "1" ]]; then
    echo "Koya 0.3.1+ required for packaging (polyglot ZIP + mountAdjacent)." >&2
    if [[ -n "$first_found" ]]; then
      echo "Found incompatible runtime: $first_found ($(koya_version_line "$first_found"))" >&2
    fi
    echo "Build Koya from helix (…/build/koya-base/koya) or set KOYA_BIN to a 0.3.1+ binary." >&2
    return 1
  fi

  if [[ -n "$first_found" ]]; then
    printf '%s\n' "$first_found"
    return 0
  fi

  printf '%s\n' "koya"
  return 0
}

resolve_koya_assets() {
  local bin="${1:-${KOYA_BIN:-}}"

  if [[ -n "${KOYA_ASSETS:-}" ]]; then
    if [[ -d "$KOYA_ASSETS" ]]; then
      (cd "$KOYA_ASSETS" && pwd)
      return 0
    fi
    echo "KOYA_ASSETS is set but not a directory: $KOYA_ASSETS" >&2
    return 1
  fi

  local bin_dir=""
  if [[ -n "$bin" && -x "$bin" ]]; then
    bin_dir="$(cd "$(dirname "$(readlink -f "$bin" 2>/dev/null || echo "$bin")")" && pwd)"
  fi

  local home="${HOME:-}"
  local candidates=()
  if [[ -n "$bin_dir" ]]; then
    candidates+=(
      "$bin_dir/assets"
      "$bin_dir/../assets"
      "$bin_dir/../../assets"
      "$bin_dir/../share/koya"
      "$bin_dir/../../share/koya"
      "$bin_dir/../koya-base/assets"
      "$bin_dir/../../koya-base/assets"
      "$bin_dir/../../../koya-base/assets"
    )
  fi
  candidates+=(
    "$home/projects/helix/koya-base/assets"
    /usr/local/share/koya
    /usr/share/koya
  )

  local c
  for c in "${candidates[@]}"; do
    [[ -d "$c" ]] || continue
    if [[ -d "$c/shaders" || -d "$c/fonts" || -d "$c/std" ]]; then
      # Prefer trees that actually contain shader binaries / fonts.
      if compgen -G "$c/shaders/*.spv" >/dev/null 2>&1 || compgen -G "$c/fonts/*" >/dev/null 2>&1 || [[ -d "$c/std" ]]; then
        (cd "$c" && pwd)
        return 0
      fi
    fi
  done

  echo "Koya assets folder not found (needed for shaders/fonts)." >&2
  echo "Set KOYA_ASSETS to the Koya assets directory (e.g. …/koya-base/assets)." >&2
  return 1
}
