"""Closed source allowlist for the isolated Rune lock (Python 3.11+, no network)."""
import sys
import tomllib
from pathlib import Path

RUNE_REVISION = "d5338988a7c1b3377adb60853815b6d0843dae7c"
SOURCES = {
    f"git+https://github.com/isaacalbala12/rune?rev={RUNE_REVISION}#{RUNE_REVISION}",
    "registry+https://github.com/rust-lang/crates.io-index",
}


def validate(path: str) -> None:
    with Path(path).open("rb") as stream:
        lock = tomllib.load(stream)
    if lock.get("version") != 4 or not isinstance(lock.get("package"), list) or not lock["package"]:
        raise ValueError("expected nonempty Cargo lock v4")
    for package in lock["package"]:
        # Workspace/path dependencies have no source field.
        if "source" in package and package["source"] not in SOURCES:
            raise ValueError(f"unauthorized source: {package['source']!r}")


if __name__ == "__main__":
    try:
        validate(sys.argv[1])
    except (OSError, ValueError, TypeError, IndexError) as error:
        sys.exit(f"Rune lock rejected: {error}")
