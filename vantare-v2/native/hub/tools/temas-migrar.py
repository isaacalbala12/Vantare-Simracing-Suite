#!/usr/bin/env python3
"""Migra tokens de color Orbit a accesores GPUI (ISA-1430).

Sin dependencias. --check lista usos pendientes, --write los sustituye.
Solo procesa código Rust, preserva comentarios/strings y las constantes históricas
que el test de paridad usa como contrato. La propagación de cx en helpers exige
revisión y cargo check: el script no inventa contexto ni altera widgets native/ui.
Reaplicar después de merges: python3 native/hub/tools/temas-migrar.py --write
"""
import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
TOKENS = "CORAL EMBER RED CYAN BRONZE SILVER INK_4 WHITE LINE_CHIP LINE_PILL PRIMARY_BG MENU_SHADOW_COLOR PALETTE_SHADOW_COLOR CANVAS SURFACE_1 SURFACE_2 SURFACE_3 COLUMN_BG INK INK_2 INK_3 INK_MUTED CARMINE CARMINE_DARK GREEN LINE LINE_STRONG LINE_ROW RAIL_BG PALETTE_BACKDROP".split()
TOKEN = re.compile(r"\b(?:(?:crate::)?orbit::)?(" + "|".join(TOKENS) + r")\b")

def code_mask(source):
    # Preserve offsets; Rust lifetimes are not character literals.
    pattern = r'//[^\n]*|/\*[\s\S]*?\*/|r(#+)?"[\s\S]*?"\1|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])\''
    return re.sub(pattern, lambda m: re.sub(r'[^\n]', ' ', m.group()), source)

def migrate(source, path):
    if path.name == "theme.rs" or path.name.endswith("tests.rs"):
        return source, 0
    mask = code_mask(source)
    changes = []
    orbit_module = path == ROOT / "orbit.rs" or path.parent.name == "orbit"
    for match in TOKEN.finditer(mask):
        before = mask[:match.start()]
        if re.search(r'\bconst\s*$', before):
            continue
        line = before[before.rfind(';') + 1:]
        if re.search(r'\buse\s+', line) and '{' in line:
            continue
        token = match.group(1)
        qualified = 'orbit::' in match.group()
        if not qualified and not orbit_module:
            continue
        prefix = match.group()[:-len(token)]
        changes.append((match.start(), match.end(), prefix + token.lower() + '(cx)'))
    for start, end, replacement in reversed(changes):
        source = source[:start] + replacement + source[end:]
    return source, len(changes)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    total = 0
    for path in sorted(ROOT.rglob('*.rs')):
        source, count = migrate(path.read_text(), path)
        if count:
            print(f'{path.relative_to(ROOT)}: {count}')
            total += count
            if args.write:
                path.write_text(source)
    print(f'{total} usos {"migrados" if args.write else "pendientes"}')
    return int(args.check and total > 0)

if __name__ == '__main__':
    raise SystemExit(main())
