#!/usr/bin/env python3
"""Clasifica si un PR puede saltarse los gates nativos sin perder protección.

Fail-closed por diseño: solo responde ``false`` cuando *todas* las rutas
cambiadas están en la lista explícita de zonas que no afectan al producto
nativo (documentación, app web retirada, Supabase y tooling). Cualquier ruta
desconocida, vacía o ambigua obliga a ejecutar los gates.

Lo usan ``branch-channel-gates.yml`` y ``quality.yml``: el trabajo que reporta
los checks requeridos sigue existiendo y reportando «success», pero sus pasos
pesados se saltan. Filtrar en el disparador (``on.pull_request.paths``) dejaría
los checks requeridos en «Pending» y bloquearía la fusión; ver la documentación
de GitHub, «Workflow syntax» → ``on.<push|pull_request>.<paths|paths-ignore>``.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath
from typing import Iterable

# Zonas sin efecto sobre el producto nativo (Rust). El orden no importa.
IGNORED_PREFIXES = (
    ".github/scripts/",
    "apps/",
    "docs/",
    "mockups/",
    "packages/",
    "scripts/",
    "shared/",
    "supabase/",
    "tools/",
    "vantare-v2/docs/",
)
# Excepciones dentro de las zonas ignoradas: el trabajo de Windows ejecuta los
# tests de `tools/ci-runners` y no puede saltárselos.
NEVER_IGNORED_PREFIXES = ("tools/ci-runners/",)
IGNORED_SUFFIXES = (".md",)
WINDOWS_ABSOLUTE = re.compile(r"^[A-Za-z]:[/\\]")


@dataclass(frozen=True)
class NativeGateScope:
    """Decisión cerrada: `native` y las rutas que la justifican."""

    native: bool
    reasons: tuple[str, ...]
    native_paths: tuple[str, ...]


def _validated(paths: Iterable[str]) -> tuple[str, ...]:
    """Normaliza y rechaza rutas ambiguas (mismo contrato que el lint de TC)."""
    normalized: list[str] = []
    exact: set[str] = set()
    folded: set[str] = set()
    for raw in paths:
        if not isinstance(raw, str) or not raw or "\x00" in raw:
            raise ValueError("changed path must be a non-empty string")
        if raw.startswith(("/", "-")) or WINDOWS_ABSOLUTE.match(raw) or "\\" in raw:
            raise ValueError(f"unsafe changed path: {raw!r}")
        if unicodedata.normalize("NFC", raw) != raw:
            raise ValueError(f"non-canonical changed path: {raw!r}")
        path = PurePosixPath(raw)
        if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
            raise ValueError(f"unsafe changed path: {raw!r}")
        canonical = path.as_posix()
        if canonical != raw or canonical in exact or canonical.casefold() in folded:
            raise ValueError(f"ambiguous changed path: {raw!r}")
        exact.add(canonical)
        folded.add(canonical.casefold())
        normalized.append(canonical)
    return tuple(sorted(normalized))


def _is_ignored(path: str) -> bool:
    if path.startswith(NEVER_IGNORED_PREFIXES):
        return False
    if path.startswith(IGNORED_PREFIXES):
        return True
    return PurePosixPath(path).suffix.casefold() in IGNORED_SUFFIXES


def classify_paths(paths: Iterable[str]) -> NativeGateScope:
    """Devuelve la decisión determinista o rechaza el conjunto de rutas."""
    ordered = _validated(paths)
    if not ordered:
        return NativeGateScope(
            native=True,
            reasons=("no changed paths: fail closed",),
            native_paths=(),
        )
    native_paths = tuple(path for path in ordered if not _is_ignored(path))
    if native_paths:
        return NativeGateScope(
            native=True,
            reasons=("changed paths require the native gates",),
            native_paths=native_paths,
        )
    return NativeGateScope(
        native=False,
        reasons=("every changed path is outside the native product",),
        native_paths=(),
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--nul-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    raw = args.nul_file.read_bytes()
    if raw and not raw.endswith(b"\0"):
        raise SystemExit("changed path input must be NUL terminated")
    try:
        paths = tuple(part.decode("utf-8", errors="strict") for part in raw.split(b"\0")[:-1])
        scope = classify_paths(paths)
    except (UnicodeDecodeError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc
    args.output.write_text(
        json.dumps(asdict(scope), sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    # El flujo de trabajo lee esta línea; el JSON queda como explicación.
    print("true" if scope.native else "false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
