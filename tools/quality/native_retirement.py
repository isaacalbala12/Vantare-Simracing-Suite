"""Integrity gate after retirement; native analysis belongs to Rust gates."""
import hashlib
import importlib.util
import json
from pathlib import Path


def errors(root):
    scope = json.loads((root / "tools/quality/scope.json").read_text(encoding="utf-8"))["retired_product"]
    failures = []
    for folder in scope["directories"]:
        directory = root / "vantare-v2" / folder
        if directory.exists() and any(not p.name.startswith(".env") for p in directory.iterdir()):
            failures.append(f"retired product directory returned: {folder}")
    for name, expected in scope["baseline_hashes"].items():
        path = root / name
        if not path.is_file() or hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest() != expected:
            failures.append(f"historical baseline changed: {name}")
    return failures


def check(root):
    failures = errors(root)
    if failures:
        print("FAIL: " + "; ".join(failures))
        return 1
    source = root / "vantare-v2/native/retirement/verify.py"
    spec = importlib.util.spec_from_file_location("retained_evidence", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        module.verify(root / "vantare-v2")
    except (OSError, ValueError) as error:
        print(f"FAIL retained evidence: {error}")
        return 1
    print("PASS retirement integrity; Go/React analyzers NOT_APPLICABLE. Native fmt/Clippy/Nextest/lifecycle/telemetry run in their own jobs.")
    return 0
