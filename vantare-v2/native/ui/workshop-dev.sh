#!/usr/bin/env bash
# Workshop con recarga en el Mac (equivalente de dev.ps1).
#
# - Estilos (ui/styles/*.json) y escenas se recargan dentro del proceso.
# - Al guardar Rust en ui/src o domain/src recompila (-j 2) y sustituye la
#   ventana: la nueva se abre antes de cerrar la vieja y recupera escena,
#   fase y ajustes del estado guardado. Si no compila, sigue la anterior.
# - Si la ventana estaba a la vista, la nueva vuelve a la vista y se devuelve
#   el foco a la app que lo tenía; si estaba en la tira de Stage Manager,
#   se queda en la tira.
#
# Uso, desde native/:  bash ui/workshop-dev.sh [--widget standings] [--escena ruta]
set -u
workshop_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$workshop_dir/.."
export VANTARE_WORKSHOP_STYLES="$workshop_dir/styles"
bin="${CARGO_TARGET_DIR:-target}/prueba/vantare-workshop"
logs="$(mktemp -d)"
marker="$logs/ultima-compilacion"
pid=""

build() {
    cargo build --locked --offline -p vantare-ui --bin vantare-workshop --profile prueba -j 2
}

# 'visible' si la ventana del proceso está en pantalla a tamaño normal.
visibility() {
    osascript -l JavaScript - "$1" <<'JS' 2>/dev/null || echo oculta
ObjC.import('CoreGraphics');
function run(argv) {
  const pid = parseInt(argv[0]);
  const list = ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0));
  for (let i = 0; i < list.count; i++) {
    const w = list.objectAtIndex(i);
    if (w.objectForKey('kCGWindowOwnerPID').js !== pid) continue;
    const b = w.objectForKey('kCGWindowBounds');
    if (b.objectForKey('Width').js > 300 && b.objectForKey('X').js >= 0) return 'visible';
  }
  return 'oculta';
}
JS
}

# Abre una instancia y espera a su ventana. $1 = activar (1/0); resto, argumentos.
launch() {
    local activate=$1
    shift
    local log; log=$(mktemp "$logs/workshop-XXXXXX")
    if [ "$activate" = 1 ]; then
        VANTARE_WORKSHOP_ACTIVATE=1 "$bin" --dev "$@" >"$log" 2>&1 &
    else
        "$bin" --dev "$@" >"$log" 2>&1 &
    fi
    local next=$!
    for _ in $(seq 1 200); do
        if grep -q 'ventana abierta' "$log"; then
            printf '%s' "$next"
            return 0
        fi
        if ! kill -0 "$next" 2>/dev/null; then
            cat "$log" >&2
            return 1
        fi
        sleep 0.1
    done
    cat "$log" >&2
    kill "$next" 2>/dev/null
    return 1
}

finish() {
    [ -n "$pid" ] && kill "$pid" 2>/dev/null
    rm -rf "$logs"
    exit 0
}
trap finish INT TERM

build || exit 1
touch "$marker"
pid=$(launch 0 "$@") || exit 1
printf 'Workshop con recarga: guarda Rust en ui/src o domain/src; estilos y escenas se ven al momento. Ctrl+C para salir.\n'

while sleep 0.5; do
    if ! kill -0 "$pid" 2>/dev/null; then
        printf 'Workshop cerrado.\n'
        finish
    fi
    changed=$(find ui/src domain/src -name '*.rs' -newer "$marker" -print -quit)
    [ -z "$changed" ] && continue
    touch "$marker"
    printf '%s · cambio en %s · compilando…\n' "$(date +%H:%M:%S)" "$changed"
    if ! build; then
        printf 'No compila: sigue abierta la versión anterior.\n'
        continue
    fi
    front=$(lsappinfo info -only bundleid "$(lsappinfo front)" | sed -n 's/.*="\(.*\)"/\1/p')
    shown=$(visibility "$pid")
    # Sin argumentos: la nueva instancia recupera el estado guardado por la anterior.
    if next=$(launch "$([ "$shown" = visible ] && echo 1 || echo 0)"); then
        kill "$pid" 2>/dev/null
        pid=$next
        if [ "$shown" = visible ] && [ -n "$front" ] && [ "$front" != "null" ]; then
            open -b "$front" 2>/dev/null || true
        fi
        printf '%s · recargado.\n' "$(date +%H:%M:%S)"
    else
        printf 'La nueva versión no abrió: sigue la anterior.\n'
    fi
done
