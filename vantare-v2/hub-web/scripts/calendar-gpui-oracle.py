"""Run the frozen pure GPUI oracle in an isolated QA crate, never in hub-host."""

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import tomllib


def check_boundaries(root: Path, temporary: Path) -> None:
    """Execute the exact canonical boundary test and its std-only helpers."""
    source = (root / "native/hub/tests/architecture.rs").read_text(encoding="utf-8")
    functions = []
    for name in ("crate_root", "path_attributes", "native_path_attributes_never_cross_crate_boundaries"):
        match = re.search(r"(?ms)^fn " + name + r"\b.*?^\}", source)
        if match is None:
            raise RuntimeError("canonical boundary test changed; review the QA runner")
        functions.append(("#[test]\n" if name.startswith("native_") else "") + match[0])
    harness = temporary / "boundaries.rs"
    harness.write_text("\n\n".join(functions) + "\n", encoding="utf-8", newline="\n")
    binary = temporary / "boundaries.exe"
    previous = os.environ.get("CARGO_MANIFEST_DIR")
    os.environ["CARGO_MANIFEST_DIR"] = str(root / "native/hub")
    try:
        subprocess.run(["rustc", "--edition=2024", "--test", str(harness), "-o", str(binary)], check=True, cwd=root)
    finally:
        if previous is None:
            del os.environ["CARGO_MANIFEST_DIR"]
        else:
            os.environ["CARGO_MANIFEST_DIR"] = previous
    subprocess.run([str(binary), "--exact", "native_path_attributes_never_cross_crate_boundaries"], check=True, cwd=root)


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    if not os.environ.get("CARGO_TARGET_DIR"):
        raise RuntimeError("run through native/scripts/compilar.ps1")
    qa = Path(os.environ["VANTARE_HUB_QA_ROOT"]).resolve()
    namespace = Path("D:/VantareServer/qa").resolve()
    if qa == namespace or not qa.is_relative_to(namespace):
        raise RuntimeError("the oracle requires its own QA namespace")
    qa.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix="calendar-oracle-", dir=qa))
    check_boundaries(root, temporary)
    source_directory = temporary / "src"
    source_directory.mkdir()
    hashes = {}
    for name in ("model", "clock", "alerts"):
        source = root / f"native/hub/src/calendar/{name}.rs"
        shutil.copy2(source, source_directory / f"{name}.rs")
        hashes[name] = hashlib.sha256(source.read_bytes().replace(b"\r\n", b"\n")).hexdigest()
    shutil.copy2(root / "hub-web/scripts/calendar-gpui-oracle.rs", source_directory / "main.rs")
    lock_path = root / "native/Cargo.lock"
    packages = tomllib.loads(lock_path.read_text(encoding="utf-8"))["package"]
    pins = {}
    for name in ("chrono", "serde", "serde_json"):
        versions = {package["version"] for package in packages if package["name"] == name}
        if len(versions) != 1:
            raise RuntimeError(f"review the existing {name} lock version")
        pins[name] = versions.pop()
    manifest = f'''[package]
name = "vantare-calendar-gpui-oracle-qa"
version = "0.0.0"
edition = "2024"
[dependencies]
chrono = {{ version = "={pins['chrono']}", default-features = false, features = ["std", "serde", "clock"] }}
serde = {{ version = "={pins['serde']}", features = ["derive"] }}
serde_json = {{ version = "={pins['serde_json']}", features = ["raw_value"] }}
[workspace]
'''
    (temporary / "Cargo.toml").write_text(manifest, encoding="utf-8", newline="\n")
    shutil.copy2(lock_path, temporary / "Cargo.lock")
    os.environ["VANTARE_ORACLE_ROOT"] = str(root)
    os.environ["VANTARE_ORACLE_SOURCE_HASHES"] = json.dumps(hashes)
    # Offline and exact existing lock versions: no new repository dependency or lock.
    subprocess.run(["cargo", "run", "--offline", "--manifest-path", str(temporary / "Cargo.toml")], check=True, cwd=root)
    print(f"QA oracle retained at {temporary}")


if __name__ == "__main__":
    main()
