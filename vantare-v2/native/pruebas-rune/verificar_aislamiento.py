"""Comprueba que el kit no modifica producto ni participa en su workspace."""
import json
from pathlib import Path
import subprocess
import tomllib

BENCH = Path(__file__).resolve().parent
REPO = BENCH.parents[2]
PREFIX = 'vantare-v2/native/pruebas-rune/'
EXCEPTIONS = {
    'vantare-v2/hub-rune/scripts/check_dependencies.py',
    'vantare-v2/docs/vantare-program/handoffs/overlays-launcher-hub.md',
    '.github/workflows/rune-measurement.yml',
}


def unexpected_paths(paths):
    return [path for path in paths if not path.startswith(PREFIX) and path not in EXCEPTIONS]


def validate():
    provenance = json.loads((BENCH/'fuentes-medicion.json').read_text(encoding='utf-8'))
    base = subprocess.check_output(['git', 'merge-base', 'HEAD', 'origin/nightly'],
                                   cwd=REPO, text=True).strip()
    changed = subprocess.check_output(['git', 'diff', '--name-only', base],
                                      cwd=REPO, text=True).splitlines()
    unexpected = unexpected_paths(changed)
    if unexpected:
        raise ValueError('El kit modifica producto u otra ruta no autorizada: '+', '.join(unexpected))
    product = tomllib.loads((BENCH.parent/'Cargo.toml').read_text(encoding='utf-8'))
    if any('pruebas-rune' in member or 'fuentes-generadas' in member
           for member in product['workspace']['members']):
        raise ValueError('El workspace de producto incluye el banco')
    bench = tomllib.loads((BENCH/'Cargo.toml').read_text(encoding='utf-8'))
    if set(bench['workspace']['members']) != {'hola', 'contador', 'relative', 'inicio'}:
        raise ValueError('La integración perdió una pieza del workspace de medición')
    patches = bench['patch']['crates-io']
    if set(patches) != {'wgpu-hal', 'winit', 'parley_engine', 'accesskit_windows'}:
        raise ValueError('Los cuatro patches Rune deben seguir solo en el banco')
    if any(row['rev'] != 'd5338988a7c1b3377adb60853815b6d0843dae7c' for row in patches.values()):
        raise ValueError('Cambió el SHA de Rune')
    for crate in ('contador', 'relative'):
        manifest = tomllib.loads((BENCH/crate/'Cargo.toml').read_text(encoding='utf-8'))
        for name, dependency in manifest['dependencies'].items():
            if name.startswith('vantare-'):
                path = (BENCH/crate/dependency['path']).resolve()
                if not path.is_relative_to(BENCH/'fuentes-generadas/gpui'):
                    raise ValueError('Dependencia sobre el producto real: '+name)
    return {'product_diff': [], 'integration_base': provenance['integration_base'],
            'comparison_base': base, 'workspace_members': bench['workspace']['members'],
            'measurement_only': True, 'fast_applies_to': 'fuentes-generadas/gpui-fast'}


if __name__ == '__main__':
    print(json.dumps(validate(), ensure_ascii=False))
