#!/usr/bin/env bash
# Workshop en vivo: mismo renderer GPUI, solo valores visuales en JSON.
set -eu
workshop_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$workshop_dir/.."
cargo build --locked --offline -p vantare-ui --bin vantare-workshop --profile prueba -j 2
printf 'Workshop en vivo: edita %s/styles/standings.json o standings-vantare.json y guarda.\n' "$workshop_dir"
export VANTARE_WORKSHOP_STYLES="$workshop_dir/styles"
exec "${CARGO_TARGET_DIR:-target}/prueba/vantare-workshop" --dev "$@"
