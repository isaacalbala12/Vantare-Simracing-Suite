"""Resolve Vantare-Ingeniero/shared-telemetry for LMU Python tools."""

from __future__ import annotations

import os
import sys


def _has_lmu_data(shared_telemetry_dir: str) -> bool:
    lmu_data = os.path.join(
        shared_telemetry_dir,
        "shared_telemetry",
        "pyLMUSharedMemory",
        "lmu_data.py",
    )
    return os.path.isfile(lmu_data)


def resolve_shared_telemetry_path() -> str:
    tools_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(tools_dir)

    env = os.environ.get("VANTARE_INGENIERO_PATH") or os.environ.get("VANTARE_INGENIERO_ROOT")
    if env:
        env_path = os.path.abspath(env)
        if os.path.basename(env_path) == "shared-telemetry" and _has_lmu_data(env_path):
            return env_path
        nested = os.path.join(env_path, "shared-telemetry")
        if _has_lmu_data(nested):
            return nested

    candidates = [
        os.path.join(repo_root, "Vantare-Ingeniero", "shared-telemetry"),
        os.path.join(repo_root, "..", "Vantare-Ingeniero", "shared-telemetry"),
    ]

    for candidate in candidates:
        normalized = os.path.normpath(candidate)
        if _has_lmu_data(normalized):
            return normalized

    tried = "\n  - ".join(os.path.normpath(p) for p in candidates)
    print("Error: Cannot find Vantare-Ingeniero shared-telemetry with lmu_data.py.")
    print("Tried:")
    print(f"  - {tried}")
    print("Set VANTARE_INGENIERO_PATH to the shared-telemetry folder, or clone")
    print("Vantare-Ingeniero as a sibling of Vantare-Overlays on your machine.")
    sys.exit(1)


def add_shared_telemetry_to_path() -> str:
    path = resolve_shared_telemetry_path()
    if path not in sys.path:
        sys.path.insert(0, path)
    return path
