"""Agrupa los crates del workspace para repartir la compilación de CI.

`--verify` falla si un miembro no está en exactamente un grupo: un crate nuevo
no puede quedar fuera de la cobertura por olvido.
"""
from __future__ import annotations

import argparse
import sys
import tomllib
from pathlib import Path

GROUPS: dict[str, tuple[str, ...]] = {
    "core": (
        "build-support",
        "domain",
        "ipc",
        "launcher",
        "profiling",
        "services",
        "runtime",
        "engineer",
        "strategy",
    ),
    # Hub y Admin prueban contra el binario de storage; storage viaja con ellos
    # para que el job surface lo compile en el mismo target (#1993).
    "surface": ("ui", "installer", "hub-host", "hub", "admin", "storage"),
}


def workspace_members(native: Path) -> list[dict]:
    """Lee los miembros del workspace sin invocar Cargo.

    `--verify` corre en el trabajo `policy`, que no instala Rust: los manifiestos
    son la fuente de verdad y basta con leerlos.
    """
    manifest = tomllib.loads((native / "Cargo.toml").read_text(encoding="utf-8"))
    members: list[dict] = []
    for pattern in manifest["workspace"]["members"]:
        for directory in sorted(native.glob(pattern)):
            crate = directory / "Cargo.toml"
            if not crate.is_file():
                continue
            package = tomllib.loads(crate.read_text(encoding="utf-8"))
            if "package" not in package:
                continue
            members.append({"name": package["package"]["name"], "manifest_path": str(crate)})
    if not members:
        raise ValueError("el workspace no declara miembros legibles")
    return members


def directory(package: dict) -> str:
    return Path(package["manifest_path"]).parent.name


def verify(members: list[dict]) -> None:
    seen: dict[str, str] = {}
    for group, directories in GROUPS.items():
        for name in directories:
            if name in seen:
                raise ValueError(f"{name} está en los grupos {seen[name]} y {group}")
            seen[name] = group
    actual = {directory(package): package["name"] for package in members}
    missing = sorted(set(actual) - set(seen))
    extra = sorted(set(seen) - set(actual))
    if missing or extra:
        raise ValueError(f"grupos incompletos: faltan={missing} sobran={extra}")


def group_names(members: list[dict], group: str) -> list[str]:
    wanted = set(GROUPS[group])
    return sorted(package["name"] for package in members if directory(package) in wanted)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--group", choices=sorted(GROUPS))
    parser.add_argument("--packages", help="lista separada por comas; vacía = todos")
    parser.add_argument("--members", action="store_true", help="todos los miembros del grupo")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    native = Path(__file__).resolve().parents[1]
    members = workspace_members(native)
    try:
        verify(members)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1
    if args.verify:
        print("grupos completos")
        return 0
    if not args.group:
        if args.members:
            print(",".join(sorted(package["name"] for package in members)))
            return 0
        parser.error("--group o --verify requerido")
    names = group_names(members, args.group)
    if args.packages is not None:
        requested = {name.strip() for name in args.packages.split(",") if name.strip()}
        names = [name for name in names if name in requested]
    if args.members:
        names = group_names(members, args.group)
    print(",".join(names))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
