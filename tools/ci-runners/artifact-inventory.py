"""Inventario/exportación reversible de Actions. Nunca borra artifacts."""
import argparse
import hashlib
import json
import pathlib
import subprocess
import zipfile

REPO = 'isaacalbala12/Vantare-Simracing-Suite'


def inventory():
    items = []
    page = 1
    while True:
        result = subprocess.run(['gh', 'api', f'repos/{REPO}/actions/artifacts?per_page=100&page={page}'], check=True, capture_output=True, text=True, encoding='utf-8')
        batch = json.loads(result.stdout)['artifacts']
        items.extend(batch)
        if len(batch) < 100:
            return items
        page += 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=pathlib.Path, required=True)
    parser.add_argument('--export', action='store_true', help='Guardar todos los artifacts vigentes, sin borrarlos')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    items = inventory()
    records = []
    for item in items:
        record = {k: item[k] for k in ['id', 'name', 'size_in_bytes', 'expired', 'created_at', 'expires_at']}
        if args.export and not item['expired']:
            target = args.output / f"artifact-{item['id']}.zip"
            if target.exists():
                raise RuntimeError('Exportación previa existente; no sobrescribir')
            with target.open('xb') as stream:
                result = subprocess.run(['gh', 'api', f"repos/{REPO}/actions/artifacts/{item['id']}/zip"], stdout=stream, stderr=subprocess.PIPE)
            if result.returncode:
                raise RuntimeError(f"No se pudo exportar artifact {item['id']}; no se ha borrado nada")
            with zipfile.ZipFile(target) as archive:
                if archive.testzip():
                    raise RuntimeError('CRC incorrecto; no se ha borrado nada')
            with target.open('rb') as stream:
                record['export_sha256'] = hashlib.file_digest(stream, 'sha256').hexdigest()
            record['export_path'] = str(target)
        records.append(record)
    total = sum(x['size_in_bytes'] for x in items if not x['expired'])
    report = {'total_bytes': total, 'free_limit_bytes': 500 * 1024**2, 'excess_bytes': max(0, total-500*1024**2), 'artifacts': records, 'deletions': 'NONE; DUDA obligatoria con lista y exportación verificada'}
    (args.output / 'inventory.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f"Inventario: {len(items)} artifacts, {total} bytes. No se ha borrado nada.")


if __name__ == '__main__':
    main()
