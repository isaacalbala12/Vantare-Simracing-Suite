"""Scope del workspace aislado de ADR 0110; una entrada inválida activa el gate."""

import argparse
from pathlib import Path

from native_gate_scope import _validated

INPUTS = (
    "vantare-v2/native/overlays-rune/",
    "vantare-v2/native/domain/",
    "vantare-v2/native/ipc/",
    "vantare-v2/native/profiling/",
    "vantare-v2/native/.cargo/",
    ".cargo/",
)
FILES = {
    "vantare-v2/native/Cargo.toml",
    "vantare-v2/native/Cargo.lock",
    "vantare-v2/native/rust-toolchain.toml",
    ".github/workflows/overlays-rune.yml",
    ".github/scripts/overlays_rune_scope.py",
    ".github/scripts/test_overlays_rune_scope.py",
    ".github/scripts/native_gate_scope.py",
}


def needs_rune(paths):
    try:
        checked = _validated(paths)
    except (TypeError, ValueError):
        return True
    return not checked or any(p in FILES or p.startswith(INPUTS) for p in checked)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--nul-file", type=Path, required=True)
    args = parser.parse_args()
    try:
        data = args.nul_file.read_bytes()
        # git diff -z termina cada ruta con NUL, incluidas las eliminaciones.
        result = needs_rune(data[:-1].decode("utf-8").split("\0")) if data.endswith(b"\0") else True
    except (OSError, UnicodeError):
        result = True
    print(str(result).lower())
