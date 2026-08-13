#!/usr/bin/env python3
"""Classify trusted changed paths for the automatic Nightly CI gate."""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath
from typing import Iterable


FRONTEND_PREFIX = "vantare-v2/frontend/"
TESTING_CENTER_PREFIX = FRONTEND_PREFIX + "src/hub/testing-center/"
LINT_SUFFIXES = {".js", ".jsx", ".ts", ".tsx"}
VISUAL_SUFFIXES = {".css", ".scss", ".sass", ".less", ".tsx", ".jsx"}
WINDOWS_ABSOLUTE = re.compile(r"^[A-Za-z]:[/\\]")


@dataclass(frozen=True)
class ChangedScope:
    eligible: bool
    reasons: tuple[str, ...]
    lint_paths: tuple[str, ...]
    visual_required: bool


def classify_paths(paths: Iterable[str]) -> ChangedScope:
    """Return a deterministic closed scope or reject ambiguous path input."""
    normalized: list[str] = []
    exact: set[str] = set()
    folded: set[str] = set()
    for raw in paths:
        if not isinstance(raw, str) or not raw or "\x00" in raw:
            raise ValueError("changed path must be a non-empty string")
        if raw.startswith(("/", "-")) or WINDOWS_ABSOLUTE.match(raw) or "\\" in raw:
            raise ValueError(f"unsafe changed path: {raw!r}")
        path = PurePosixPath(raw)
        if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
            raise ValueError(f"unsafe changed path: {raw!r}")
        canonical = path.as_posix()
        if canonical != raw or canonical in exact or canonical.casefold() in folded:
            raise ValueError(f"ambiguous changed path: {raw!r}")
        exact.add(canonical)
        folded.add(canonical.casefold())
        normalized.append(canonical)

    ordered = tuple(sorted(normalized))
    lint_paths = tuple(
        path
        for path in ordered
        if path.startswith(FRONTEND_PREFIX) and PurePosixPath(path).suffix in LINT_SUFFIXES
    )
    visual_paths = tuple(
        path
        for path in ordered
        if path.startswith(FRONTEND_PREFIX) and PurePosixPath(path).suffix in VISUAL_SUFFIXES
    )
    unsupported_visual = any(
        not path.startswith(TESTING_CENTER_PREFIX) for path in visual_paths
    )
    reasons = ("unsupported_visual_scope",) if unsupported_visual else ()
    return ChangedScope(
        eligible=not reasons,
        reasons=reasons,
        lint_paths=lint_paths,
        visual_required=bool(visual_paths) and not unsupported_visual,
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
        decision = classify_paths(paths)
    except (UnicodeDecodeError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc
    args.output.write_text(
        json.dumps(asdict(decision), sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    return 0 if decision.eligible else 1


if __name__ == "__main__":
    raise SystemExit(main())
