#!/usr/bin/env python3
"""Fail when a Rust `include_*!` reads a path that the slot invalidation does not cover.

The slot target is shared between checkouts with the same package names. Cargo
treats those packages as the same unit, so `slot-workspace.ps1` hashes every
workspace member and a declared list of external inputs. If a new `include_str!`,
`include_bytes!` or `include!` reads a file outside both sets, a stale artifact
could survive a checkout switch. This test closes that gap.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

MACRO = re.compile(r'include(?:_str|_bytes)?!\s*\(')
STRING = re.compile(r'"((?:[^"\\]|\\.)*)"')
ENV = re.compile(r'env!\((?:[^()]|\([^()]*\))*\)')
OUT_DIR = re.compile(r'env!\(\s*"OUT_DIR"\s*\)')
MANIFEST_DIR = re.compile(r'env!\(\s*"CARGO_MANIFEST_DIR"\s*\)')


def parse_argument(text: str, start: int) -> str:
    depth = 1
    index = start
    while index < len(text):
        char = text[index]
        if char == '(':
            depth += 1
        elif char == ')':
            depth -= 1
            if depth == 0:
                return text[start:index]
        elif char == '"':
            index += 1
            while index < len(text) and text[index] != '"':
                if text[index] == '\\':
                    index += 1
                index += 1
        index += 1
    raise ValueError('include! sin paréntesis de cierre')


def unquote(value: str) -> str:
    return value.replace('\\\\', '\\').replace('\\"', '"')


def git(*arguments: str, cwd: Path) -> str:
    result = subprocess.run(['git', *arguments], cwd=cwd, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or 'git falló')
    return result.stdout


def workspace_members(native: Path) -> list[Path]:
    out = subprocess.run(
        ['cargo', 'metadata', '--manifest-path', str(native / 'Cargo.toml'), '--no-deps',
         '--locked', '--offline', '--format-version', '1'],
        check=True, capture_output=True, text=True).stdout
    data = json.loads(out)
    ids = set(data['workspace_members'])
    return [Path(package['manifest_path']).parent.resolve()
            for package in data['packages'] if package['id'] in ids]


def manifest_root(source: Path) -> Path:
    current = source.parent
    while current != current.parent:
        if (current / 'Cargo.toml').is_file():
            return current
        current = current.parent
    raise RuntimeError(f'sin Cargo.toml por encima de {source}')


def resolve(source: Path, argument: str) -> Path | None:
    if OUT_DIR.search(argument):
        return None
    cleaned = ENV.sub('', argument)
    if 'env!(' in cleaned:
        raise RuntimeError(f'env! desconocido en {source}: {argument.strip()}')
    literals = [unquote(match.group(1)) for match in STRING.finditer(cleaned)]
    if not literals:
        raise RuntimeError(f'sin ruta literal en {source}: {argument.strip()}')
    relative = ''.join(literals)
    if MANIFEST_DIR.search(argument):
        return (manifest_root(source) / relative.lstrip('/')).resolve()
    return (source.parent / relative).resolve()


def inside(path: Path, roots: list[Path]) -> bool:
    return any(path == root or root in path.parents for root in roots)


def masked(text: str) -> list[bool]:
    """Positions inside string literals or comments (macros there are data, not code)."""
    mask = [False] * len(text)
    index = 0
    while index < len(text):
        if text.startswith('//', index):
            end = text.find('\n', index)
            end = len(text) if end < 0 else end
            for position in range(index, end):
                mask[position] = True
            index = end
        elif text.startswith('/*', index):
            end = text.find('*/', index + 2)
            end = len(text) if end < 0 else end + 2
            for position in range(index, end):
                mask[position] = True
            index = end
        elif text[index] == 'r' and index + 1 < len(text) and text[index + 1] in '#"':
            cursor = index + 1
            hashes = 0
            while cursor < len(text) and text[cursor] == '#':
                hashes += 1
                cursor += 1
            if cursor < len(text) and text[cursor] == '"':
                end = text.find('"' + '#' * hashes, cursor + 1)
                end = len(text) if end < 0 else end + 1 + hashes
                for position in range(index, end):
                    mask[position] = True
                index = end
                continue
            index += 1
        elif text[index] == '"':
            cursor = index + 1
            while cursor < len(text):
                if text[cursor] == '\\':
                    cursor += 2
                    continue
                if text[cursor] == '"':
                    cursor += 1
                    break
                cursor += 1
            for position in range(index, cursor):
                mask[position] = True
            index = cursor
        else:
            index += 1
    return mask


def main() -> int:
    native = Path(__file__).resolve().parents[1]
    repo = Path(git('rev-parse', '--show-toplevel', cwd=native).strip())
    config = json.loads((native / 'scripts/slot-inputs.json').read_text(encoding='utf-8'))
    external_paths = config.get('external', []) + config.get('rootFiles', [])
    external = [(repo / item).resolve() for item in external_paths]
    missing = [item for item in external if not item.exists()]
    if missing:
        print('Rutas externas declaradas que no existen:', *(str(item.relative_to(repo)) for item in missing), sep='\n  ')
        return 1
    members = workspace_members(native)
    errors: list[str] = []
    checked = 0
    for source in sorted(native.rglob('*.rs')):
        if '.git' in source.parts or 'target' in source.parts:
            continue
        text = source.read_text(encoding='utf-8', errors='replace')
        mask = masked(text)
        for match in MACRO.finditer(text):
            if mask[match.start()]:
                continue
            line = text.count('\n', 0, match.start()) + 1
            try:
                target = resolve(source, parse_argument(text, match.end()))
            except (RuntimeError, ValueError) as error:
                errors.append(f'{source.relative_to(repo)}:{line}: {error}')
                continue
            if target is None:
                continue
            checked += 1
            if not inside(target, members) and not inside(target, external):
                errors.append(f'{source.relative_to(repo)}:{line}: fuera de la lista: {target.relative_to(repo)}')
    print(f'{checked} rutas incluidas comprobadas contra {len(members)} paquetes y {len(external)} rutas externas')
    if errors:
        print('\n'.join(errors))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
