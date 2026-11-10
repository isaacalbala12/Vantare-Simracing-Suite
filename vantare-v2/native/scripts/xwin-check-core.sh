#!/usr/bin/env bash
# Optional Mac check, independent of the Windows worker queue and hosted CI.
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo 'Solo macOS.' >&2; exit 1; }
target="$(python3 -c 'from pathlib import Path; import sys; print(Path(sys.argv[1]).expanduser().resolve())' "${1:?Indica ~/target-<worker>}")"
[[ "$target" == "$HOME"/target-* ]] || { echo 'Usa un target propio bajo ~/target-<worker>.' >&2; exit 1; }
script_dir="$(cd "$(dirname "$0")" && pwd)"
command -v llvm-rc >/dev/null || { echo 'Añade LLVM a PATH.' >&2; exit 1; }
sdk="$target/windows-sdk"
mkdir -p "$sdk/bin/10/x64"
printf '#!/bin/sh\nexec python3 "%s/xwin-resource-compiler.py" "$@"\n' "$script_dir" > "$sdk/bin/10/x64/rc.exe"
chmod +x "$sdk/bin/10/x64/rc.exe"
export WindowsSdkDir="$sdk"
export XWIN_CACHE_DIR="${XWIN_CACHE_DIR:-$target/sdk-cache}"
export XWIN_ACCEPT_LICENSE=1
export CARGO_TARGET_DIR="$target/build"
export CARGO_BUILD_JOBS=4
cd "$script_dir/.."
workspace="$(pwd -P)"
# Cargo freshness alone is insufficient when another checkout reuses this path.
if [[ -f "$target/.workspace" && "$(cat "$target/.workspace")" != "$workspace" ]]; then
  cargo +1.95.0 clean --target-dir "$CARGO_TARGET_DIR" --locked
fi
printf '%s\n' "$workspace" > "$target/.workspace"
cargo +1.95.0 xwin check --target x86_64-pc-windows-msvc --locked -j 4 --lib \
  -p vantare-domain -p vantare-ipc -p vantare-strategy -p vantare-runtime
