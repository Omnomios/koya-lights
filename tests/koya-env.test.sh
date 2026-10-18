#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/koya-env.sh"

test_dir="$(mktemp -d)"
trap 'rm -rf -- "$test_dir"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
make_runtime() {
  mkdir -p "$(dirname "$1")"
  printf '#!/usr/bin/env bash\nprintf "Koya %s (build 909, Helix 0.5.1)\\n"\n' "$2" > "$1"
  chmod +x "$1"
}
make_assets() {
  mkdir -p "$1/std"
  touch "$1/std/koya-ui.js" "$1/std/koya-controls.js"
}
make_plugins() {
  mkdir -p "$1"
  touch "$1/libhx-http.so" "$1/libhx-ws.so" "$1/libhx-process.so"
}

for version in 0.3.1 0.6.1 0.7.0; do
  make_runtime "$test_dir/old" "$version"
  if koya_is_supported "$test_dir/old"; then fail "accepted $version"; fi
done
for version in 0.7.1 0.7.2 0.8.0 1.0.0; do
  make_runtime "$test_dir/current" "$version"
  koya_is_supported "$test_dir/current" || fail "rejected $version"
done
make_runtime "$test_dir/bin/koya" 0.7.1
make_runtime "$test_dir/old" 0.6.1

# An explicit choice must be honored, including rejection; never silently fall back.
if KOYA_BIN="$test_dir/old" resolve_koya_bin 2>/dev/null; then fail 'accepted explicit old runtime'; fi
if KOYA_BIN="$test_dir/missing" resolve_koya_bin 2>/dev/null; then fail 'accepted missing runtime'; fi
[[ "$(KOYA_BIN="$test_dir/bin/koya" resolve_koya_bin)" == "$test_dir/bin/koya" ]] || fail 'explicit runtime'
[[ "$(KOYA_BIN= PATH="$test_dir/bin:$PATH" resolve_koya_bin)" == "$test_dir/bin/koya" ]] || fail 'PATH priority'
[[ "$(KOYA_BIN=koya PATH="$test_dir/bin:$PATH" resolve_koya_bin)" == "$test_dir/bin/koya" ]] || fail 'command name override'

# Directory layouts used by runtime tarballs, monorepo builds and distro packages.
for layout in archive monorepo prefix rpm; do
  case "$layout" in
    archive)
      binary="$test_dir/archive/koya"
      assets="$test_dir/archive/assets"
      plugins="$test_dir/archive" ;;
    monorepo)
      binary="$test_dir/checkout/build/koya-base/koya"
      assets="$test_dir/checkout/koya-base/assets"
      plugins="$test_dir/checkout/build/helix-plugin" ;;
    prefix)
      binary="$test_dir/prefix/bin/koya"
      assets="$test_dir/prefix/share/koya"
      plugins="$test_dir/prefix/lib" ;;
    rpm)
      binary="$test_dir/rpm/usr/bin/koya"
      assets="$test_dir/rpm/usr/share/koya/assets"
      plugins="$test_dir/rpm/usr/lib64" ;;
  esac
  make_runtime "$binary" 0.7.1
  make_assets "$assets"
  make_plugins "$plugins"
  [[ "$(KOYA_ASSETS= resolve_koya_assets "$binary")" == "$assets" ]] || fail "$layout assets"
  [[ "$(SHELLYHUB_PLUGINS= resolve_koya_plugins "$binary")" == "$plugins" ]] || fail "$layout plugins"
done

mkdir -p "$test_dir/incomplete"
if KOYA_ASSETS="$test_dir/incomplete" resolve_koya_assets "$binary" 2>/dev/null; then fail 'accepted missing std'; fi
if SHELLYHUB_PLUGINS="$test_dir/incomplete" resolve_koya_plugins "$binary" 2>/dev/null; then fail 'accepted missing plugins'; fi
[[ "$(KOYA_ASSETS="$assets" resolve_koya_assets "$binary")" == "$assets" ]] || fail 'asset override'
[[ "$(SHELLYHUB_PLUGINS="$plugins" resolve_koya_plugins "$binary")" == "$plugins" ]] || fail 'plugin override'

# Symlinked binaries must resolve resources from the actual installation.
ln -s "$binary" "$test_dir/bin/linked-koya"
[[ "$(KOYA_ASSETS= resolve_koya_assets "$test_dir/bin/linked-koya")" == "$assets" ]] || fail 'symlink assets'
[[ "$(SHELLYHUB_PLUGINS= resolve_koya_plugins "$test_dir/bin/linked-koya")" == "$plugins" ]] || fail 'symlink plugins'

# Verify the launcher's real argument boundaries, including installation paths with spaces.
runtime_dir="$test_dir/runtime with spaces"
make_runtime "$runtime_dir/koya" 0.7.1
make_assets "$runtime_dir/assets"
make_plugins "$runtime_dir"
cat > "$runtime_dir/koya" <<'RUNTIME'
#!/usr/bin/env bash
if [[ "${1:-}" == --version || "${1:-}" == --help ]]; then echo 'Koya 0.7.1 (build 909)'; exit; fi
printf '%s\n' "$@" > "$SHELLYHUB_TEST_ARGS"
RUNTIME
SHELLYHUB_TEST_ARGS="$test_dir/args" KOYA_BIN="$runtime_dir/koya" \
  KOYA_ASSETS= SHELLYHUB_PLUGINS= "$ROOT/scripts/run.sh" --no-setcursor 2>/dev/null
mapfile -t args < "$test_dir/args"
[[ "${args[0]}" == -m && "${args[1]}" == "$runtime_dir/assets" ]] || fail 'assets mount'
[[ "${args[2]}" == -m && "${args[3]}" == "$ROOT/app" ]] || fail 'app mount'
[[ "${args[4]}" == -n && "${args[5]}" == "$runtime_dir" ]] || fail 'plugin path'
[[ "${args[6]}" == -i && "${args[7]}" == shellyhub.js && "${args[8]}" == --no-setcursor ]] || fail 'entry and forwarded args'
echo 'PASS: Koya version checks, runtime selection, resource resolution and launcher arguments'
