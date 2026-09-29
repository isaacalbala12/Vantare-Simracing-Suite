"""Measure an idle egui window under each Windows wgpu backend."""

import os
from pathlib import Path
import subprocess
import time

import psutil


EXE = Path(__file__).resolve().parents[1] / "target/debug/examples/idle_window.exe"


for backend in ("opengl", "vulkan", "dx12"):
    with subprocess.Popen(
        [str(EXE)],
        env={**os.environ, "WGPU_BACKEND": backend},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    ) as child:
        try:
            time.sleep(4)
            if child.poll() is not None:
                print(backend, "exited", child.returncode, flush=True)
                continue
            process = psutil.Process(child.pid)
            first = process.cpu_times()
            time.sleep(5)
            last = process.cpu_times()
            print(
                backend,
                "cpu_core_percent",
                round(100 * (last.user + last.system - first.user - first.system) / 5, 2),
                "uss_mib",
                round(process.memory_full_info().uss / 1048576, 2),
                flush=True,
            )
        finally:
            if child.poll() is None:
                child.terminate()
