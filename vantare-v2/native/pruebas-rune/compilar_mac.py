#!/usr/bin/env python3
"""Compilación de VANTA-141 en Mac, con límite de disco y cancelación del grupo propio."""
import argparse
import json
import os
from pathlib import Path
import platform
import resource
import shutil
import signal
import socket
import subprocess
import time

GIB = 1024 ** 3
STOP_FREE = 18 * GIB  # Margen de 3 GiB antes del mínimo de Isaac: 15 GiB.
TARGET = Path.home() / "target-isa-2213-rune"


def free_bytes():
    return shutil.disk_usage(Path.home()).free


def other_cargo():
    output = subprocess.check_output(["ps", "-axo", "pid=,comm="], text=True)
    return [int(line.split(None, 1)[0]) for line in output.splitlines()
            if line.strip() and Path(line.split(None, 1)[1]).name in ("cargo", "cargo-xwin", "rustc")]


def stop_group(process):
    for sig, timeout in ((signal.SIGINT, 20), (signal.SIGTERM, 5), (signal.SIGKILL, 5)):
        if process.poll() is not None:
            return
        try:
            os.killpg(process.pid, sig)
        except ProcessLookupError:
            process.wait()
            return
        try:
            process.wait(timeout=timeout)
            return
        except subprocess.TimeoutExpired:
            pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--log", required=True, type=Path)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    def requested_stop(_signal, _frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, requested_stop)
    signal.signal(signal.SIGHUP, requested_stop)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if platform.system() != "Darwin" or not command:
        parser.error("Solo Mac; indicar comando tras --")
    if TARGET.is_symlink():
        raise SystemExit("El target no puede ser un enlace")
    if free_bytes() < STOP_FREE:
        raise SystemExit("PARADA: menos de 18 GiB libres; no acercarse al mínimo de 15 GiB")
    busy = other_cargo()
    if busy:
        raise SystemExit(f"PARADA: hay otro Cargo/Rust activo ({busy}); coordinar con worker G")
    args.log.parent.mkdir(parents=True, exist_ok=True)
    if args.log.exists():
        raise SystemExit("No sobrescribir un intento anterior")
    env = os.environ.copy()
    env.update(CARGO_BUILD_JOBS="4", CARGO_TARGET_DIR=str(TARGET),
               CARGO_PROFILE_DEV_DEBUG="0", CARGO_PROFILE_TEST_DEBUG="0",
               CARGO_PROFILE_RELEASE_OPT_LEVEL="3", CARGO_PROFILE_RELEASE_DEBUG="0",
               CARGO_PROFILE_RELEASE_LTO="false", CARGO_PROFILE_RELEASE_CODEGEN_UNITS="16",
               CARGO_PROFILE_RELEASE_INCREMENTAL="false", XWIN_ARCH="x86_64",
               XWIN_CACHE_DIR=str(Path.home() / "orq/vanta141/xwin-cache"))
    env.update(RUSTC_WRAPPER="", RUSTC_WORKSPACE_WRAPPER="", SCCACHE_DISABLE="1")
    env["PATH"] = str(Path.home() / "orq/vanta141/tools") + ":/opt/homebrew/opt/llvm/bin:" + env["PATH"]
    source_head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    source_status = subprocess.check_output(["git", "status", "--porcelain"], text=True)
    initial_free = free_bytes()
    minimum_free = initial_free
    start = time.monotonic()
    process = None
    reason = None
    with args.log.open("xb") as log:
        try:
            process = subprocess.Popen(command, env=env, stdout=log, stderr=subprocess.STDOUT,
                                       start_new_session=True)
            while process.poll() is None:
                minimum_free = min(minimum_free, free_bytes())
                if minimum_free < STOP_FREE:
                    reason = "disk_approaching_15_gib"
                    stop_group(process)
                    break
                time.sleep(2)
        except KeyboardInterrupt:
            reason = "cancelled_by_operator"
            if process is not None:
                stop_group(process)
        finally:
            if process is not None and process.poll() is None:
                stop_group(process)
    final_head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    final_status = subprocess.check_output(["git", "status", "--porcelain"], text=True)
    if (final_head, final_status) != (source_head, source_status):
        reason = "source_changed_during_build"
    result = {"source_head": source_head, "source_dirty": bool(source_status), "machine": socket.gethostname(), "platform": platform.platform(),
              "architecture": platform.machine(), "target": str(TARGET), "command": command,
              "elapsed_s": time.monotonic() - start, "exit": process.returncode if process else None,
              "reason": reason, "initial_free_gib": initial_free / GIB,
              "minimum_free_gib": minimum_free / GIB,
              "max_child_rss_mib": resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss / 1024 ** 2,
              "debug": False, "jobs": 4}
    args.log.with_suffix(args.log.suffix + ".json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2), flush=True)
    return 72 if reason else result["exit"]


if __name__ == "__main__":
    raise SystemExit(main())
