#!/usr/bin/env python3
"""Genera `grabaciones-reales.zip`: dos grabaciones del grabador real (#2815).

Uso, desde esta carpeta:
    python grabaciones-reales.py <ruta a vantare-storage.exe>

El helper tiene que poder cargar DuckDB 1.5.5 (la `duckdb.dll` oficial junto al
`.exe` o en PATH; ver «DuckDB precompilado» en native/README.md). Cada
grabación se escribe con el protocolo del helper (`--create`, `--resume`,
`append`, `session-open`, `lap`, `session-close`, `finish`): es lo mismo que
hace el núcleo al grabar, con datos de una vuelta sintética y suave para que el
zip pese poco. Cada apertura cierra con un CHECKPOINT de DuckDB, así que
quedan bloques libres de 256 KiB.

- `recortada.duckdb`: tres aperturas. DuckDB escribe la cabecera y después
  recorta del final los bloques libres: el archivo tiene menos bloques de los
  que cuenta su cabecera más reciente.
- `completa.duckdb`: dos aperturas; el archivo tiene todos los bloques que
  cuenta su cabecera.

El script comprueba esas dos formas y falla si DuckDB deja otra.
"""
from __future__ import annotations

import json
import struct
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

HEADER = 4096


def record(exe: Path, db: Path, openings: int, chunks: int) -> None:
    index = 0
    for opening in range(openings):
        mode = '--create' if opening == 0 else '--resume'
        helper = subprocess.Popen([str(exe), str(db), mode], stdin=subprocess.PIPE,
                                  stdout=subprocess.PIPE, text=True)

        def send(message):
            helper.stdin.write(json.dumps(message) + '\n')
            helper.stdin.flush()
            reply = json.loads(helper.stdout.readline())
            if reply[0] in ('error', 'rejected'):
                raise SystemExit(f'el helper rechazó {message[0]}: {reply}')
            return reply

        if json.loads(helper.stdout.readline())[0] != 'ready':
            raise SystemExit('el helper no está listo')
        epoch, session = 1_700_000_000 + opening, opening + 1
        send(['session-open', {
            'epoch': epoch, 'session': session, 'kind': 'race', 'kindText': 'Race',
            'trackName': 'Prueba', 'vehicle': 'GT3', 'className': 'GT3',
            'startedAtMs': 1000 * opening}])
        for chunk in range(chunks):
            index += 1
            lap, step = 1 + chunk // 10, (chunk % 10) * 60
            samples = [[index * 100 + k + 1, [1, (step + k) * 2.0], [1, (step + k) * 0.016],
                        [1, round(50 + 0.25 * k, 2)], [2, 0.5], [1, 0.0]] for k in range(60)]
            block = ['vantare.player-lap.v1', epoch, session, 7, lap, None, False, samples]
            reply = send(['append', ['vantare.series-chunk.v1', index, 0, step, block]])
            if reply[0] != 'ack':
                raise SystemExit(f'sin ACK: {reply}')
            if chunk % 10 == 9:
                send(['lap', {'epoch': epoch, 'session': session, 'car': 7, 'lap': lap,
                              'officialMs': 90_000 + chunk, 'sectorMs': [30_000, 30_000, 30_000]}])
        send(['session-close', {
            'epoch': epoch, 'session': session, 'endedAtMs': 1000 * opening + 500,
            'simElapsedS': 99.5, 'finalPosition': 3, 'finalClassPosition': 2,
            'lapsCompleted': lap, 'bestLapMs': 90_000, 'endReason': 'sessionChanged'}])
        if opening == openings - 1 and send(['finish', index])[0] != 'finished':
            raise SystemExit('finish sin confirmar')
        helper.stdin.close()
        if helper.wait() != 0:
            raise SystemExit(f'el helper salió con {helper.returncode}')


def shape(db: Path) -> tuple[int, int]:
    """(bloques que cuenta la cabecera más reciente, bloques del archivo)."""
    data = db.read_bytes()
    word = lambda at: struct.unpack_from('<Q', data, at)[0]
    newest = 2 * HEADER if word(2 * HEADER + 8) > word(HEADER + 8) else HEADER
    count, size = word(newest + 32), word(newest + 40)
    if size != 256 * 1024:
        raise SystemExit(f'{db.name}: bloque de {size} bytes, se esperaban 256 KiB')
    return count, (len(data) - 3 * HEADER) // size


def main() -> None:
    exe = Path(sys.argv[1]).resolve()
    with tempfile.TemporaryDirectory() as folder:
        made = {}
        for name, openings, chunks, trimmed in [('recortada.duckdb', 3, 20, True),
                                                ('completa.duckdb', 2, 20, False)]:
            db = Path(folder) / name
            record(exe, db, openings, chunks)
            count, present = shape(db)
            if (present < count) != trimmed:
                raise SystemExit(f'{name}: {present} de {count} bloques, forma inesperada')
            made[name] = db
        target = Path(__file__).with_name('grabaciones-reales.zip')
        with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name, db in made.items():
                archive.write(db, name)
        print(f'{target.name}: {target.stat().st_size} bytes')


if __name__ == '__main__':
    main()
