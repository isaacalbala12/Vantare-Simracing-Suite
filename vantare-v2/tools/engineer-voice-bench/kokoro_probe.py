"""Reproducible, non-product Kokoro benchmark for ENG-09.

This probe deliberately lives under tools/: it is not imported by Vantare and
does not add a product dependency. Model and voice paths are supplied by the
operator and must point outside the Git worktree.
"""

from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
import json
import importlib.metadata
import os
import platform
import sys
import time
from pathlib import Path


PROMPTS = (
    {
        "locale": "en",
        "engine_locale": "en-us",
        "voice": "af_heart",
        "text": "Car on the left. Hold your line.",
    },
    {
        "locale": "es",
        "engine_locale": "es",
        "voice": "ef_dora",
        "text": "Coche a la izquierda. Mantén tu línea.",
    },
    {
        "locale": "it",
        "engine_locale": "it",
        "voice": "if_sara",
        "text": "Auto a sinistra. Mantieni la traiettoria.",
    },
    {
        "locale": "pt-BR",
        "engine_locale": "pt-br",
        "voice": "pf_dora",
        "text": "Carro à esquerda. Mantenha sua linha.",
    },
)


def working_set_bytes() -> int | None:
    """Return this process' current working set on Windows using only stdlib."""
    if os.name != "nt":
        return None

    class ProcessMemoryCounters(ctypes.Structure):
        _fields_ = [
            ("cb", wintypes.DWORD),
            ("PageFaultCount", wintypes.DWORD),
            ("PeakWorkingSetSize", ctypes.c_size_t),
            ("WorkingSetSize", ctypes.c_size_t),
            ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
            ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
            ("PagefileUsage", ctypes.c_size_t),
            ("PeakPagefileUsage", ctypes.c_size_t),
        ]

    counters = ProcessMemoryCounters()
    counters.cb = ctypes.sizeof(counters)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    kernel32.K32GetProcessMemoryInfo.argtypes = [
        wintypes.HANDLE,
        ctypes.POINTER(ProcessMemoryCounters),
        wintypes.DWORD,
    ]
    kernel32.K32GetProcessMemoryInfo.restype = wintypes.BOOL
    handle = kernel32.GetCurrentProcess()
    ok = kernel32.K32GetProcessMemoryInfo(handle, ctypes.byref(counters), counters.cb)
    return int(counters.WorkingSetSize) if ok else None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--voices", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--result", required=True, type=Path)
    parser.add_argument("--warm-runs", type=int, default=3)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.warm_runs < 1:
        raise SystemExit("--warm-runs must be at least 1")
    for artifact in (args.model, args.voices):
        if not artifact.is_file():
            raise SystemExit(f"missing benchmark artifact: {artifact}")

    # Optional research-only dependencies are imported after argument checks so
    # the probe fails clearly on an unprepared machine.
    import soundfile as sf
    from kokoro_onnx import Kokoro

    args.output_dir.mkdir(parents=True, exist_ok=True)
    started_wall = time.perf_counter()
    started_cpu = time.process_time()
    engine = Kokoro(str(args.model), str(args.voices))
    load_wall_ms = (time.perf_counter() - started_wall) * 1000
    load_cpu_ms = (time.process_time() - started_cpu) * 1000

    cases: list[dict[str, object]] = []
    for prompt in PROMPTS:
        runs: list[dict[str, object]] = []
        for run_index in range(args.warm_runs + 1):
            run_wall = time.perf_counter()
            run_cpu = time.process_time()
            samples, sample_rate = engine.create(
                prompt["text"],
                voice=prompt["voice"],
                speed=1.0,
                lang=prompt["engine_locale"],
            )
            wall_ms = (time.perf_counter() - run_wall) * 1000
            cpu_ms = (time.process_time() - run_cpu) * 1000
            audio_seconds = len(samples) / sample_rate
            output = args.output_dir / f"{prompt['locale']}.wav"
            if run_index == 0:
                sf.write(output, samples, sample_rate, subtype="PCM_16")
            runs.append(
                {
                    "kind": "first" if run_index == 0 else "warm",
                    "wall_ms": round(wall_ms, 3),
                    "cpu_ms": round(cpu_ms, 3),
                    "audio_seconds": round(audio_seconds, 3),
                    "real_time_factor": round((wall_ms / 1000) / audio_seconds, 4),
                    "working_set_bytes": working_set_bytes(),
                }
            )
        cases.append({**prompt, "audio_file": output.name, "runs": runs})

    result = {
        "schema": "vantare.engineer.voice-bench.kokoro.v1",
        "captured_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "platform": platform.platform(),
        "python": sys.version,
        "kokoro_onnx": importlib.metadata.version("kokoro-onnx"),
        "model": str(args.model),
        "voices": str(args.voices),
        "load_wall_ms": round(load_wall_ms, 3),
        "load_cpu_ms": round(load_cpu_ms, 3),
        "working_set_after_load_bytes": working_set_bytes(),
        "cases": cases,
        "limitations": [
            "This is an intelligibility and performance probe, not a human quality score.",
            "Current working set is sampled after each call; it is not peak RSS.",
            "The probe uses research-only Python dependencies and is not product wiring.",
        ],
    }
    args.result.parent.mkdir(parents=True, exist_ok=True)
    args.result.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
