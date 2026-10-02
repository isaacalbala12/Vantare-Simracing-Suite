#!/usr/bin/env python3
"""Migra tokens de color Orbit a accesores GPUI (ISA-1430).

Sin dependencias. --check lista usos pendientes, --write los sustituye.
Solo procesa código Rust, preserva comentarios/strings y las constantes históricas
que el test de paridad usa como contrato. La propagación de cx en helpers exige
revisión y cargo check: el script no inventa contexto ni altera widgets native/ui.
Reaplicar después de merges:
  python3 native/hub/tools/temas-migrar.py --write
  cargo check -p vantare-hub --all-targets -j 4 --message-format=json > cx.jsonl
  python3 hub/tools/temas-migrar.py --repair-context cx.jsonl
Repetir check/repair hasta cerrar el grafo. Revisar callbacks de canvas: usan su
propio cx, nunca capturan un App prestado. --repair-context solo repara los
argumentos GPUI ausentes que el compilador demuestra; no es un parser Rust general.
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
TOKENS = "CORAL EMBER RED CYAN BRONZE SILVER INK_4 WHITE LINE_CHIP LINE_PILL PRIMARY_BG MENU_SHADOW_COLOR PALETTE_SHADOW_COLOR CANVAS SURFACE_1 SURFACE_2 SURFACE_3 COLUMN_BG INK INK_2 INK_3 INK_MUTED CARMINE CARMINE_DARK GREEN LINE LINE_STRONG LINE_ROW RAIL_BG PALETTE_BACKDROP".split()
TOKEN = re.compile(r"\b(?:(?:crate::)?orbit::)?(" + "|".join(TOKENS) + r")\b")

def code_mask(source):
    # Preserve offsets; Rust lifetimes are not character literals.
    pattern = r'//[^\n]*|/\*[\s\S]*?\*/|r(#+)?"[\s\S]*?"\1|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])\''
    return re.sub(pattern, lambda m: re.sub(r'[^\n]', ' ', m.group()), source)

def pair(mask, start, opening='(', closing=')'):
    level = 0
    for i in range(start, len(mask)):
        if mask[i] == opening:
            level += 1
        elif mask[i] == closing:
            level -= 1
            if level == 0:
                return i
    return None


def functions(source):
    mask = code_mask(source)
    for match in re.finditer(r'\bfn\s+\w+(?:\s*<[^{};]*?>)?\s*\(', mask):
        start = mask.index('(', match.start())
        end = pair(mask, start)
        if end is None:
            continue
        body = mask.find('{', end)
        semi = mask.find(';', end)
        if body < 0 or (semi >= 0 and semi < body):
            continue
        close = pair(mask, body, '{', '}')
        if close is not None:
            yield start, end, body, close


def repair_context(diagnostics):
    edits = {}
    workspace = ROOT.parent.parent
    for line in diagnostics.read_text().splitlines():
        try:
            item = json.loads(line)
        except ValueError:
            continue
        if item.get('reason') != 'compiler-message':
            continue
        error = item['message']
        code = (error.get('code') or {}).get('code')
        primary = next((span for span in error['spans'] if span['is_primary']), None)
        if primary is None:
            continue
        path = (workspace / primary['file_name']).resolve()
        if not path.is_relative_to(ROOT) or not path.exists() or 'tests' in path.name:
            continue
        source = path.read_text()
        # Reject stale diagnostics rather than applying their offsets to edited code.
        current_lines = source.splitlines()
        if any(current_lines[primary['line_start'] - 1 + i] != data['text']
               for i, data in enumerate(primary['text'])
               if primary['line_start'] - 1 + i < len(current_lines)):
            continue
        mask = code_mask(source)
        start = len(source.encode()[:primary['byte_start']].decode())
        end = len(source.encode()[:primary['byte_end']].decode())
        if code == 'E0425' and error['message'].startswith('cannot find value `cx`'):
            enclosing = [f for f in functions(source) if f[2] < start < f[3]]
            if not enclosing:
                continue
            a, b, _, _ = min(enclosing, key=lambda f: f[3] - f[2])
            if re.search(r'\bcx\s*:', mask[a:b]):
                continue
            unnamed = re.search(r'_\s*:\s*&mut\s*(?:gpui::)?Context', mask[a:b])
            if unnamed:
                pos = a + unnamed.start()
                edits.setdefault(path, set()).add((pos, pos + 1, 'cx'))
            else:
                prefix = ' ' if source[a+1:b].rstrip().endswith(',') or not source[a+1:b].strip() else ', '
                edits.setdefault(path, set()).add((b, b, prefix + 'cx: &gpui::App'))
        elif code == 'E0061' and ('gpui::App' in error['rendered'] or '&App' in error['rendered']):
            opening = mask.find('(', end)
            if opening < 0:
                continue
            closing = pair(mask, opening)
            if closing is None:
                continue
            args = source[opening+1:closing].rstrip()
            prefix = ' ' if args.endswith(',') or not args else ', '
            edits.setdefault(path, set()).add((closing, closing, prefix + 'cx'))
    for path, replacements in edits.items():
        source = path.read_text()
        for start, end, replacement in sorted(replacements, reverse=True):
            source = source[:start] + replacement + source[end:]
        path.write_text(source)
    print(f'{sum(map(len, edits.values()))} ajustes de contexto; revisar y compilar')


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
    parser.add_argument('--repair-context', type=Path)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        source = '// orbit::INK\nfn a() { let _ = "orbit::INK"; rgb(orbit::INK); }'
        result, count = migrate(source, ROOT / 'home.rs')
        assert count == 1 and 'rgb(orbit::ink(cx))' in result
        assert '// orbit::INK' in result and '"orbit::INK"' in result
        assert migrate(result, ROOT / 'home.rs') == (result, 0)
        source = 'pub const INK: u32 = 1; fn a() { rgb(INK); }'
        result, count = migrate(source, ROOT / 'orbit.rs')
        assert count == 1 and result.startswith('pub const INK:')
        assert pair('(f(1), 2)', 0) == 8
        print('self-test OK')
        return 0
    if args.repair_context:
        repair_context(args.repair_context)
        return 0
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
