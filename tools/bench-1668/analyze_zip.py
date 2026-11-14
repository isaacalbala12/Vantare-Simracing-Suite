"""Recompute a game-PC result ZIP offline, without trusting packaged summaries."""
import argparse
import hashlib
import json
import statistics
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from summarize import summarize


def extract(archive, destination):
    with zipfile.ZipFile(archive) as source:
        entries = source.infolist()
        if len(entries) > 5000 or sum(entry.file_size for entry in entries) > 2 * 1024**3:
            raise ValueError('ZIP exceeds evidence size limits')
        paths = set()
        for entry in entries:
            name = entry.filename.replace('\\', '/')
            path = PurePosixPath(name)
            normalized = path.as_posix().casefold()
            if path.is_absolute() or '..' in path.parts or ':' in name or normalized in paths:
                raise ValueError('Unsafe or duplicate ZIP path')
            paths.add(normalized)
            if (entry.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('ZIP symlink refused')
            if not entry.is_dir() and (path.suffix.lower() not in ('.csv', '.json', '.log', '.txt')
                                       or entry.file_size > 512 * 1024**2):
                raise ValueError('Unexpected evidence file')
        for entry in entries:
            source.extract(entry, destination)


def clean(value):
    return str(value).replace('|', '/').replace('\r', ' ').replace('\n', ' ')


def analyze(archive, output):
    archive, output = Path(archive), Path(output)
    with archive.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    output.mkdir(parents=True, exist_ok=True)
    folder = output / ('pc-juego-' + digest[:16])
    # A repeated import gets a fresh extraction, without deleting prior evidence.
    if folder.exists():
        folder = output / (folder.name + '-' + datetime.now(timezone.utc).strftime('%H%M%S%f'))
    folder.mkdir()
    extract(archive, folder)
    manifests = list(folder.rglob('campaign.json'))
    if len(manifests) != 1:
        raise ValueError('ZIP must contain exactly one campaign.json')
    campaign = manifests[0].parent
    manifest = json.loads(manifests[0].read_text(encoding='utf-8-sig'))
    expected = ['Base', 'Vantare', 'RaceLab', 'TinyPedal', 'TinyPedal', 'RaceLab',
                'Vantare', 'Base', 'RaceLab', 'Base', 'TinyPedal', 'Vantare']
    if manifest.get('schema') != 1 or manifest.get('order') != expected:
        raise ValueError('Unknown campaign schema/order')
    runs = []
    for position, scenario in enumerate(expected, 1):
        directory = campaign / f'{position:02}-{scenario}'
        meta_file = directory / 'run.json'
        if not meta_file.exists():
            runs.append(dict(scenario=scenario, position=position, valid=False, reason='No realizada'))
            continue
        metadata = json.loads(meta_file.read_text(encoding='utf-8-sig'))
        if metadata.get('scenario') != scenario or metadata.get('position') != position:
            raise ValueError('Run identity does not match prescribed order')
        if metadata.get('status') != 'complete':
            runs.append(metadata | dict(valid=False, reason=metadata.get('reason', metadata['status'])))
            continue
        try:
            result = summarize(directory)
            if metadata.get('seconds') != 180 or manifest.get('seconds') != 180:
                result['valid'] = False
                result['reason'] = 'Duración de prueba distinta de 180 s'
            if not result['valid'] and 'reason' not in result:
                result['reason'] = 'Revisar foco, builds, duración observada y procesos'
            runs.append(result)
        except (ValueError, KeyError, OSError) as error:
            runs.append(metadata | dict(valid=False, reason='CSV no utilizable: ' + str(error)))
    (folder / 'reviewed-summary.json').write_text(json.dumps(runs, indent=2), encoding='utf-8')
    lines = ['# VANTA-89 / #1668 — medición en el PC de juego', '',
             'Importado UTC: ' + datetime.now(timezone.utc).isoformat(),
             'ZIP SHA-256: `' + digest + '`', '',
             '**Resultado de una campaña local; no generalizar a otros equipos ni usar como promesa comercial.**', '',
             '| Escenario | Válidas / 3 | FPS medios (rango entre pasadas) | FT medio ms | p1 FT ms | p99 FT ms | CPU overlay % | WS overlay MiB | CPU total % | RAM total usada MiB |',
             '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
    keys = ['frametime_mean_ms', 'frametime_p1_ms', 'frametime_p99_ms',
            'overlay_cpu_percent', 'overlay_working_set_mib', 'system_cpu_percent', 'system_used_mib']
    complete = True
    for scenario in ('Base', 'Vantare', 'RaceLab', 'TinyPedal'):
        accepted = [run for run in runs if run['scenario'] == scenario and run['valid']]
        if len(accepted) != 3:
            complete = False
        if not accepted:
            lines.append('| ' + scenario + ' | 0 | ' + ' | '.join(['N/D'] * 8) + ' |')
            continue
        fps = [run['fps'] for run in accepted]
        cells = [f'{statistics.mean(fps):.2f} ({min(fps):.2f}–{max(fps):.2f})']
        cells += [f'{statistics.mean(run[key] for run in accepted):.2f}' for key in keys]
        lines.append('| ' + ' | '.join([scenario, str(len(accepted)), *cells]) + ' |')
    lines += ['', '**Cobertura: ' + ('12/12 pasadas aceptadas por guardas automáticas; requiere revisión humana del contexto.' if complete else 'PARCIAL. No comparar como campaña completa; N/D no es consumo cero.') + '**', '',
              'Las cifras agregadas son medias con igual peso por pasada válida; p1/p99 agregados son medias de los percentiles de cada pasada, no percentiles de una distribución combinada. El rango de FPS es dispersión observada, no intervalo de confianza.', '',
              '## Pasadas y trazabilidad', '',
              '| Orden | Escenario | Estado | FPS | FT medio / p1 / p99 ms | Motivo o muestras |',
              '| ---: | --- | --- | ---: | --- | --- |']
    for run in runs:
        measured = 'fps' in run
        lines.append('| ' + ' | '.join([str(run['position']), run['scenario'],
                     'Aceptada' if run['valid'] else 'NO válida / omitida',
                     f"{run['fps']:.2f}" if measured else 'N/D',
                     ' / '.join(f'{run[key]:.2f}' for key in keys[:3]) if measured else 'N/D',
                     clean(run.get('reason', f"{run.get('frames', 0)} frames; {run.get('resource_samples', 0)} muestras"))]) + ' |')
    lines += ['', '## Equipo y condiciones declaradas', '',
              'Datos del PC de juego (no del servidor):', '', '```json',
              json.dumps(manifest.get('hardware', {}), indent=2, ensure_ascii=False), '```', '',
              'Modo: ' + clean(manifest.get('mode')) + '; pista: ' + clean(manifest.get('track')),
              'Resolución: ' + clean(manifest.get('resolution')) + '; widgets: ' + clean(manifest.get('widgets')),
              'Configuración declarada: ' + clean(manifest.get('notes')), '',
              '## Método y límites', '',
              '- Tres tomas de 180 s por escenario, 30 s de calentamiento; orden alternado conservado arriba. Misma sesión de práctica Hypercar. Conducción constante o boxes según modo declarado; no mezclar ambos. Incidentes comunicados por Isaac invalidan esa toma.',
              '- PresentMon 2.6.0, CSV v1 por PID LMU. Cadena de swap con más muestras; se excluye su primer intervalo, que comenzó antes de capturar. FPS = 1000/media de msBetweenPresents. p1/p99 de frametime con interpolación lineal. Incluye presents descartados: no acredita FPS visibles ni latencia input→pantalla; revisar dropped/PresentMode y otras cadenas en CSV.',
              '- CPU por diferencia de tiempo de proceso, normalizada por hilos lógicos del PC (100% = todo el equipo), sumada por prefijo de producto. Working set agregado, no memoria privada: puede duplicar páginas compartidas. CPU total GetSystemTimes; RAM física total menos libre. Muestra aproximada cada segundo; primer delta excluido. ETW y recursos tienen un pequeño desfase de arranque.',
              '- Guardas: builds/compilador, foco ajeno, juego ausente, overlay sin memoria registrada, duración capturada inferior al 90% o estado humano inválido. Procesos protegidos/terminados pueden faltar. No se certifican automáticamente equivalencia visual, cadencia, frescura de datos, carga térmica, tráfico ni gráficos; esas condiciones requieren revisión de Isaac.',
              '- Si el plugin RaceLab está instalado, permanece en LMU también durante las demás tomas: la base incluye su coste en reposo. CPU de plugin dentro de LMU no figura en CPU de procesos RaceLab. No crear cuentas/pagos; RaceLab inaccesible se conserva omitido.', '',
              '## Versiones y hashes', '',
              'Vantare 0.0.0 Release, fuente nightly `' + clean(manifest.get('vantare_source')) + '`; TinyPedal 2.51.0; PresentMon 2.6.0. RaceLab: versión ejecutada declarada por el archivo y hash, sin asumir que coincide con el instalador investigado en servidor.', '',
              '```json', (campaign / 'hashes.json').read_text(encoding='utf-8-sig') if (campaign / 'hashes.json').exists() else 'Hashes ausentes: limita trazabilidad.', '```', '',
              'Fuente de descargas: [RaceLab](https://racelab.app/), [TinyPedal oficial](https://github.com/TinyPedal/TinyPedal/releases/tag/v2.51.0), [PresentMon oficial](https://github.com/GameTechDev/PresentMon/releases/tag/v2.6.0).', '',
              'CSV originales, layouts y JSON revisados: `' + str(folder) + '`. Los summaries se recalculan desde los CSV; no se confía en summaries aportados por el ZIP. Sin capturas de pantalla ni secretos.']
    report = output / 'RESULTADOS.md'
    report.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(report)
    return runs


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('zip')
    parser.add_argument('--output', default='C:/VantareServer/evidence/bench-1668')
    args = parser.parse_args()
    analyze(args.zip, args.output)
