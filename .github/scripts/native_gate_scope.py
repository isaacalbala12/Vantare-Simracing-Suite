#!/usr/bin/env python3
"""Clasifica si un PR puede saltarse los gates nativos sin perder protección.

Devuelve dos decisiones cerradas sobre el mismo conjunto de rutas cambiadas:

- ``native``: *todos* los cambios caen en zonas sin efecto sobre el producto
  nativo (documentación, app web retirada, Supabase y tooling) ⇒ no hacen falta
  los gates nativos. Cualquier ruta desconocida, vacía o ambigua ⇒ ``true``.
- ``telemetria``: *algún* cambio toca ``native/runtime/``, ``native/domain/``,
  ``native/ipc/`` o ``testdata/``, que son las zonas que obligan a repetir el
  corpus de grabaciones reales (AGENTS.md, #1498). Sin rutas o con cualquier
  duda ⇒ ``true``; solo responde ``false`` cuando ninguna ruta cambiada está en
  esas cuatro zonas. No toca ``native``: es un filtro sobre un gate que ya
  corría, nunca una excusa para saltarse los gates.

Lo usa ``branch-channel-gates.yml``: el trabajo que reporta los checks
requeridos sigue existiendo y reportando «success», pero sus pasos pesados se
saltan. Filtrar en el disparador (``on.pull_request.paths``) dejaría los checks
requeridos en «Pending» y bloquearía la fusión; ver la documentación de GitHub,
«Workflow syntax» → ``on.<push|pull_request>.<paths|paths-ignore>``.

En la salida estándar imprime dos líneas, en este orden: ``native`` y
``telemetria``. El flujo de trabajo las lee por número de línea y valida cada
una contra ``true``/``false`` antes de usarla.
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
# Zonas que obligan a repetir el corpus de grabaciones reales (#1498): el código
# del runtime y TODO lo que compila dentro de él (Cargo.toml de runtime: domain,
# ipc, launcher, profiling, services) y las fixtures de `testdata/`. Si runtime
# cambia de dependencias, ampliar esta lista con ellas.
TELEMETRY_PREFIXES = (
    "vantare-v2/native/domain/",
    "vantare-v2/native/ipc/",
    "vantare-v2/native/launcher/",
    "vantare-v2/native/profiling/",
    "vantare-v2/native/runtime/",
    "vantare-v2/native/services/",
    "vantare-v2/testdata/",
)
WINDOWS_ABSOLUTE = re.compile(r"^[A-Za-z]:[/\\]")


@dataclass(frozen=True)
class NativeGateScope:
    """Decisión cerrada: `native`, `telemetria` y las rutas que las justifican."""

    native: bool
    telemetria: bool
    reasons: tuple[str, ...]
    native_paths: tuple[str, ...]
    telemetria_paths: tuple[str, ...]


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


def _needs_telemetry(path: str) -> bool:
    """¿Esta ruta obliga a repetir el corpus de telemetría? (AGENTS.md, #1498)."""
    return path.startswith(TELEMETRY_PREFIXES)


def classify_paths(paths: Iterable[str]) -> NativeGateScope:
    """Devuelve la decisión determinista o rechaza el conjunto de rutas."""
    ordered = _validated(paths)
    if not ordered:
        return NativeGateScope(
            native=True,
            telemetria=True,
            reasons=("no changed paths: fail closed",),
            native_paths=(),
            telemetria_paths=(),
        )
    native_paths = tuple(path for path in ordered if not _is_ignored(path))
    telemetria_paths = tuple(path for path in native_paths if _needs_telemetry(path))
    if native_paths:
        return NativeGateScope(
            native=True,
            telemetria=bool(telemetria_paths),
            reasons=("changed paths require the native gates",),
            native_paths=native_paths,
            telemetria_paths=telemetria_paths,
        )
    return NativeGateScope(
        native=False,
        telemetria=False,
        reasons=("every changed path is outside the native product",),
        native_paths=(),
        telemetria_paths=(),
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
    # El flujo de trabajo lee estas dos líneas; el JSON queda como explicación.
    print("true" if scope.native else "false")
    print("true" if scope.telemetria else "false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
