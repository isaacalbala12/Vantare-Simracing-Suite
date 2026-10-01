#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
native_dir="$(cd -- "$script_dir/.." && pwd)"
evidence_root="${VANTARE_EVIDENCE_DIR:-$HOME/evidence/isa-1437-cierre}"
mkdir -p "$evidence_root"
run_dir="$(mktemp -d "$evidence_root/ipc-smoke.XXXXXX")"
core_log="$run_dir/core.log"
hub_log="$run_dir/hub.log"
build_log="$run_dir/build.log"
core_pid=""
hub_pid=""

close_hub_stdin() {
    if [[ ${hub_stdin_fd:-} =~ ^[0-9]+$ ]]; then
        exec {hub_stdin_fd}>&-
        unset hub_stdin_fd
    fi
}

close_core_stdin() {
    if [[ ${core_stdin_fd:-} =~ ^[0-9]+$ ]]; then
        exec {core_stdin_fd}>&-
        unset core_stdin_fd
    fi
}

cleanup() {
    set +e
    close_hub_stdin
    close_core_stdin
    for child_pid in "$hub_pid" "$core_pid"; do
        if [[ $child_pid =~ ^[0-9]+$ ]] && kill -0 "$child_pid" 2>/dev/null; then
            kill "$child_pid" 2>/dev/null
            wait "$child_pid" 2>/dev/null
        fi
    done
}
trap cleanup EXIT INT TERM

if [[ -z ${XDG_RUNTIME_DIR:-} && -d "/run/user/$(id -u)" ]]; then
    export XDG_RUNTIME_DIR="/run/user/$(id -u)"
fi
if [[ -z ${WAYLAND_DISPLAY:-} && -z ${DISPLAY:-} && -n ${XDG_RUNTIME_DIR:-} ]]; then
    for socket in "$XDG_RUNTIME_DIR"/wayland-*; do
        if [[ -S $socket ]]; then
            export WAYLAND_DISPLAY="${socket##*/}"
            break
        fi
    done
fi
if [[ -z ${WAYLAND_DISPLAY:-} && -z ${DISPLAY:-} ]]; then
    echo "Hub requiere una sesión gráfica X11 o Wayland accesible." >&2
    exit 2
fi
if [[ -n ${WAYLAND_DISPLAY:-} ]]; then
    if [[ $WAYLAND_DISPLAY = /* ]]; then
        wayland_socket="$WAYLAND_DISPLAY"
    else
        wayland_socket="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/$WAYLAND_DISPLAY"
    fi
    if [[ -z ${DISPLAY:-} && ! -S $wayland_socket ]]; then
        echo "No existe el socket Wayland de la sesión: $wayland_socket" >&2
        exit 2
    fi
fi
if [[ -z ${DBUS_SESSION_BUS_ADDRESS:-} && -n ${XDG_RUNTIME_DIR:-} && -S "$XDG_RUNTIME_DIR/bus" ]]; then
    export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
fi
if ! command -v ss >/dev/null 2>&1; then
    echo "Falta ss (paquete iproute2), necesario para confirmar el socket conectado." >&2
    exit 2
fi

fixture="$native_dir/../testdata/lmu-fixture.bin"
core_bin="$native_dir/target/debug/vantare-core"
hub_bin="$native_dir/target/debug/vantare-hub"
if [[ ! -f $fixture ]]; then
    echo "No existe el fixture de replay: $fixture" >&2
    exit 2
fi
if ! (
    cd "$native_dir"
    cargo build -j 4 -p vantare-runtime --bin vantare-core -p vantare-hub --bin vantare-hub
) >"$build_log" 2>&1; then
    tail -n 80 "$build_log" >&2
    exit 1
fi

pipe_name="vantare-1437-smoke-$(id -u)-$$"
runtime_root="${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}"
socket_path="$runtime_root/vantare-ipc-$(id -u)/$pipe_name.sock"
mkfifo "$run_dir/core.stdin"
"$core_bin" --replay "$fixture" --build 1.3.0.0 --pipe "$pipe_name" \
    <"$run_dir/core.stdin" >"$core_log" 2>&1 &
core_pid=$!
exec {core_stdin_fd}>"$run_dir/core.stdin"

for attempt in {1..100}; do
    [[ -S $socket_path ]] && break
    if ! kill -0 "$core_pid" 2>/dev/null; then
        echo "vantare-core terminó antes de crear el socket IPC." >&2
        tail -n 80 "$core_log" >&2
        exit 1
    fi
    sleep 0.1
done
if [[ ! -S $socket_path ]]; then
    echo "vantare-core no creó el socket esperado: $socket_path" >&2
    tail -n 80 "$core_log" >&2
    exit 1
fi

mkfifo "$run_dir/hub.stdin"
"$hub_bin" --demo --pipe "$pipe_name" --control-stdin \
    --data-dir "$run_dir/data" --layout "$run_dir/layout.json" \
    --engineer-settings "$run_dir/engineer.json" \
    --launcher-file "$run_dir/launcher.json" \
    <"$run_dir/hub.stdin" >"$hub_log" 2>&1 &
hub_pid=$!
exec {hub_stdin_fd}>"$run_dir/hub.stdin"

connected=false
for attempt in {1..100}; do
    if ss -xH | grep -F "$socket_path" | grep -q 'ESTAB'; then
        connected=true
        break
    fi
    if ! kill -0 "$hub_pid" 2>/dev/null; then
        echo "vantare-hub --demo terminó durante el arranque." >&2
        tail -n 80 "$hub_log" >&2
        exit 1
    fi
    sleep 0.1
done
if [[ $connected != true ]]; then
    echo "El Hub no estableció IPC con el socket del núcleo: $socket_path" >&2
    tail -n 80 "$core_log" "$hub_log" >&2
    exit 1
fi

sleep 2
if ! kill -0 "$core_pid" 2>/dev/null || ! kill -0 "$hub_pid" 2>/dev/null; then
    echo "Uno de los procesos terminó antes de la captura." >&2
    tail -n 80 "$core_log" "$hub_log" >&2
    exit 1
fi

screenshot="$run_dir/hub-demo-ipc.png"
captured=false
: >"$run_dir/screenshot.log"
if command -v gnome-screenshot >/dev/null 2>&1 && gnome-screenshot -f "$screenshot" >"$run_dir/screenshot.log" 2>&1; then
    captured=true
elif command -v grim >/dev/null 2>&1 && [[ -n ${WAYLAND_DISPLAY:-} ]] && grim "$screenshot" >"$run_dir/screenshot.log" 2>&1; then
    captured=true
elif command -v gdbus >/dev/null 2>&1 && [[ -n ${DBUS_SESSION_BUS_ADDRESS:-} ]] && \
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Screenshot \
        --method org.gnome.Shell.Screenshot.Screenshot false false "$screenshot" \
        >"$run_dir/screenshot.log" 2>&1; then
    captured=true
else
    echo "IPC confirmado; la sesión no permitió capturar la pantalla. Detalle: $run_dir/screenshot.log" >&2
fi
if [[ ! -s $screenshot ]]; then
    captured=false
fi

smoke_seconds="${VANTARE_SMOKE_SECONDS:-3}"
if [[ ! $smoke_seconds =~ ^[0-9]+$ ]]; then
    echo "VANTARE_SMOKE_SECONDS debe ser un entero no negativo." >&2
    exit 2
fi
sleep "$smoke_seconds"

close_hub_stdin
for attempt in {1..50}; do
    if ! kill -0 "$hub_pid" 2>/dev/null; then
        break
    fi
    sleep 0.1
done
if kill -0 "$hub_pid" 2>/dev/null; then
    echo "vantare-hub no cerró al recibir EOF por stdin." >&2
    tail -n 80 "$hub_log" >&2
    exit 1
fi
if wait "$hub_pid"; then
    hub_status=0
else
    hub_status=$?
fi
hub_pid=""
if [[ $hub_status -ne 0 ]]; then
    echo "vantare-hub salió con código $hub_status." >&2
    tail -n 80 "$hub_log" >&2
    exit 1
fi

close_core_stdin
for attempt in {1..50}; do
    if ! kill -0 "$core_pid" 2>/dev/null; then
        break
    fi
    sleep 0.1
done
if kill -0 "$core_pid" 2>/dev/null; then
    echo "vantare-core no cerró al recibir EOF por stdin." >&2
    tail -n 80 "$core_log" >&2
    exit 1
fi
if wait "$core_pid"; then
    core_status=0
else
    core_status=$?
fi
core_pid=""
if [[ $core_status -ne 0 ]]; then
    echo "vantare-core salió con código $core_status." >&2
    tail -n 80 "$core_log" >&2
    exit 1
fi

printf 'IPC Unix conectado: %s\n' "$socket_path"
printf 'Hub y Core cerraron correctamente; evidencia: %s\n' "$run_dir"
if [[ $captured == true ]]; then
    printf 'Captura: %s\n' "$screenshot"
else
    printf 'Captura no disponible; detalle: %s/screenshot.log\n' "$run_dir"
fi
