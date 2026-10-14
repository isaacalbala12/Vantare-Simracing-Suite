"""Fail-closed preflight; no borrado ni aumento de presupuesto de cuenta."""
import argparse
import json
import os
import pathlib
import urllib.request

LIMIT = 450 * 1024**2  # Margen de 50 MiB bajo Free 500 MiB; cuota de cuenta aparte.


def fits(existing_bytes, paths):
    if existing_bytes < 0:
        raise ValueError('Inventario inválido')
    # Estimación conservadora: tamaño sin comprimir más overhead de ZIP.
    proposed = sum(p.stat().st_size for p in paths) + 1024**2
    return existing_bytes + proposed <= LIMIT


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('paths', type=pathlib.Path, nargs='+')
    args = parser.parse_args()
    allowed = False
    try:
        total = 0
        page = 1
        while True:
            request = urllib.request.Request(
                f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}/actions/artifacts?per_page=100&page={page}",
                headers={'Authorization': f"Bearer {os.environ['GH_TOKEN']}", 'Accept': 'application/vnd.github+json'},
            )
            with urllib.request.urlopen(request, timeout=20) as response:
                batch = json.load(response)['artifacts']
            total += sum(a['size_in_bytes'] for a in batch if not a['expired'])
            if len(batch) < 100:
                break
            page += 1
        allowed = fits(total, args.paths)
    except (OSError, ValueError, KeyError):
        print('Inventario no verificable: se omite upload; no se borra nada.')
    with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
        output.write(f"allowed={'true' if allowed else 'false'}\n")
    print('Upload permitido' if allowed else 'Upload omitido por presupuesto; exportar evidencia antes de cualquier borrado')


if __name__ == '__main__':
    main()
