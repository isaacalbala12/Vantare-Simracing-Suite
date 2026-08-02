"""Lifecycle/overhead harness for the ENG-11 test-only voice host."""

from __future__ import annotations

import argparse
import json
import math
import os
import socket
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from voice_host_controller import VoiceHostController


def _inside_git(path: Path) -> bool:
    current = path
    while True:
        if (current / ".git").exists():
            return True
        if current.parent == current:
            return False
        current = current.parent


def _percentile(values: list[float], percentile: float) -> float:
    ordered = sorted(values)
    index = max(0, math.ceil(len(ordered) * percentile) - 1)
    return ordered[index]


def _port_closed(port: int) -> bool:
    with socket.socket() as probe:
        probe.settimeout(0.1)
        return probe.connect_ex(("127.0.0.1", port)) != 0


def run_harness(
    *,
    host_script: Path,
    manifest_path: Path,
    artifact_root: Path,
    required_artifacts: tuple[str, ...],
    storage_limit_bytes: int,
    iterations: int,
    output: Path,
) -> dict[str, object]:
    if not 1 <= iterations <= 1000:
        raise ValueError("iterations must be between 1 and 1000")
    output = Path(os.path.abspath(output))
    if _inside_git(output.parent):
        raise ValueError("benchmark output must remain outside Git")
    if output.exists() and (output.is_symlink() or not output.is_file()):
        raise ValueError("benchmark output path is unsafe")
    output.parent.mkdir(parents=True, exist_ok=True)

    host = VoiceHostController(
        host_script=host_script,
        manifest_path=manifest_path,
        artifact_root=artifact_root,
        required_artifacts=required_artifacts,
        storage_limit_bytes=storage_limit_bytes,
        start_timeout_seconds=15,
        request_timeout_seconds=2,
        shutdown_timeout_seconds=2,
    )
    started = time.perf_counter()
    host.start()
    load_ms = (time.perf_counter() - started) * 1000
    port = host.port
    latencies: list[float] = []
    try:
        for index in range(iterations):
            request_started = time.perf_counter()
            host.request("probe", request_id=f"probe-{index}")
            latencies.append((time.perf_counter() - request_started) * 1000)
    finally:
        host.stop()

    remaining_leases = len(list((Path(artifact_root) / ".tmp").glob("host-*.lease")))
    result: dict[str, object] = {
        "schema": "vantare.engineer.voice-host-lifecycle.v1",
        "captured_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "protocol": "vantare.engineer.voice-host.v1",
        "probe_only": True,
        "inference_executed": False,
        "command_readiness": "NO-GO",
        "required_artifacts": sorted(required_artifacts),
        "iterations": iterations,
        "start_ms": round(load_ms, 3),
        "latency_ms": {
            "p50": round(_percentile(latencies, 0.50), 3),
            "p95": round(_percentile(latencies, 0.95), 3),
            "max": round(max(latencies), 3),
        },
        "clean_shutdown": not host.running and _port_closed(port),
        "remaining_leases": remaining_leases,
    }
    temporary = output.with_name(f".{output.name}.{uuid.uuid4().hex}.tmp")
    try:
        with temporary.open("x", encoding="utf-8", newline="\n") as target:
            json.dump(result, target, indent=2, sort_keys=True)
            target.write("\n")
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)
    return result


def main() -> None:
    here = Path(__file__).parent
    parser = argparse.ArgumentParser(description="Benchmark the ENG-11 lifecycle-only voice host")
    parser.add_argument("--artifact-root", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--iterations", type=int, default=50)
    parser.add_argument("--storage-limit-bytes", type=int, default=512 * 1024 * 1024)
    args = parser.parse_args()
    result = run_harness(
        host_script=here / "voice_host.py",
        manifest_path=here / "voice-artifacts.v1.json",
        artifact_root=Path(args.artifact_root),
        required_artifacts=("whisper-cpp-server-windows-x64", "whisper-base-multilingual"),
        storage_limit_bytes=args.storage_limit_bytes,
        iterations=args.iterations,
        output=Path(args.output),
    )
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
