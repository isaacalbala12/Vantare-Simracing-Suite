"""Audit locked metadata without compiling or creating a graphics device.

All resolved platforms are checked, including build dependencies. SPDX OR may
choose a permissive branch; AND requires both. MPL is explicitly forbidden even
when offered as an alternative. Unknown expressions and external missing licenses
fail closed. The existing first-party crates have no SPDX declaration; only their
exact repository paths are exempt from the external license check.
"""

import argparse
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PERMISSIVE = {
    "0BSD", "Apache-2.0", "BSD-1-Clause", "BSD-2-Clause", "BSD-3-Clause",
    "BSL-1.0", "CC0-1.0", "ISC", "MIT", "MIT-0", "Unicode-3.0",
    "Unlicense", "Zlib",
}
LOCAL_CRATES = {
    "build-support", "domain", "hub-host", "installer", "ipc", "launcher",
    "profiling", "services",
}
FORBIDDEN_PACKAGES = {
    "vantare-runtime", "vantare-ui", "vantare-hub", "gpui", "gpui_platform",
}


def permissive(expression):
    if not expression or "MPL" in expression.upper():
        return False
    # Old Cargo manifests used '/' for a choice between licenses.
    tokens = re.findall(r"[A-Za-z0-9.+-]+|[()/]", expression)
    if re.sub(r"\s+", "", expression) != "".join(tokens):
        return False
    tokens = ["OR" if token == "/" else token for token in tokens]
    position = 0

    def atom():
        nonlocal position
        if position >= len(tokens):
            raise ValueError("missing license")
        token = tokens[position]
        position += 1
        if token == "(":
            value = choice()
            if position >= len(tokens) or tokens[position] != ")":
                raise ValueError("unclosed expression")
            position += 1
            return value
        if token in {"AND", "OR", "WITH", ")"}:
            raise ValueError("unexpected operator")
        value = token in PERMISSIVE
        if position < len(tokens) and tokens[position] == "WITH":
            position += 1
            if position >= len(tokens):
                raise ValueError("missing exception")
            value = token == "Apache-2.0" and tokens[position] == "LLVM-exception"
            position += 1
        return value

    def conjunction():
        nonlocal position
        value = atom()
        while position < len(tokens) and tokens[position] == "AND":
            position += 1
            right = atom()
            value = value and right
        return value

    def choice():
        nonlocal position
        value = conjunction()
        while position < len(tokens) and tokens[position] == "OR":
            position += 1
            right = conjunction()
            value = value or right
        return value

    try:
        return choice() and position == len(tokens)
    except ValueError:
        return False


def audit(metadata):
    first_party = {
        (ROOT.parent / "native" / crate / "Cargo.toml").resolve()
        for crate in LOCAL_CRATES
    } | {(ROOT / "Cargo.toml").resolve()}
    errors = []
    for package in metadata["packages"]:
        name = package["name"]
        if name in FORBIDDEN_PACKAGES or name.startswith("gpui_"):
            errors.append(f"forbidden dependency: {name}")
        local = package.get("source") is None and Path(package["manifest_path"]).resolve() in first_party
        license_id = package.get("license")
        if not ((local and not license_id) or permissive(license_id)):
            errors.append(f"{name} {package['version']}: license {license_id!r}")
    for node in metadata["resolve"]["nodes"]:
        if "rune?" in node["id"] and "ogg-audio" in node["features"]:
            errors.append("Rune ogg-audio must remain disabled")
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    metadata = json.loads(subprocess.check_output([
        "cargo", "metadata", "--locked", "--format-version", "1",
        "--manifest-path", str(ROOT / "Cargo.toml"),
    ], cwd=ROOT, text=True, encoding="utf-8"))
    errors = audit(metadata)
    if args.report:
        rows = sorted(metadata["packages"], key=lambda p: (p["name"], p["version"]))
        report = "# Licencias · Hub Rune\n\nGenerado con cargo metadata --locked. Todas las plataformas.\n\n"
        report += "Los crates locales existentes sin declaración SPDX conservan su licencia del repositorio; no son dependencias externas aprobadas por este informe.\n\n"
        report += "| Paquete | Versión | Licencia declarada |\n| --- | --- | --- |\n"
        report += "".join(f"| {p['name']} | {p['version']} | {p.get('license') or 'Local: licencia del repositorio'} |\n" for p in rows)
        args.report.write_text(report, encoding="utf-8")
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"PASS: {len(metadata['packages'])} packages; permissive external licenses; no MPL, ogg-audio or product UI/runtime")


if __name__ == "__main__":
    main()
