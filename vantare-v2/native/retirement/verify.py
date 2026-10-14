"""Verify every corpus/reference retained before the Wails retirement."""
import hashlib
import json
from pathlib import Path


def verify(root=None):
    root = root or Path(__file__).resolve().parents[2]
    manifest = json.loads((root / "native/retirement/manifest.json").read_text(encoding="utf-8"))
    for name, entry in manifest["files"].items():
        digest = hashlib.sha256((root / name).read_bytes()).hexdigest()
        if digest != entry["sha256"]:
            raise ValueError(f"retained bytes changed: {name}")
    print(f"PASS: {len(manifest['files'])} retained files match their pinned SHA-256 (original or documented DTO migration)")


if __name__ == "__main__":
    verify()
