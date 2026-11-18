"""Regenera el corpus de Análisis con 25 fotos SHM sintéticas, sin LMU."""
from datetime import datetime, timedelta, timezone
import gzip
import io
import json
from pathlib import Path
import struct
import tarfile


def frame(lap, distance, lap_elapsed, source_time):
    """Layout LMU 1.3.0.0 según runtime/src/adapter/lmu/frame.rs."""
    body = bytearray(324_820)
    scoring, telemetry = 2_192, 128_468
    body[1632:1643] = b"Circuito QA"
    body[scoring + 4:scoring + 12] = b"Piloto Q"
    body[scoring + 36:scoring + 44] = b"Coche QA"
    body[scoring + 200:scoring + 203] = b"GT3"
    struct.pack_into("<i", body, 1696, 1)  # Practice
    struct.pack_into("<i", body, 1736, 1)  # Un coche, slot 0 en scoring y telemetría.
    struct.pack_into("<d", body, 1700, source_time)
    struct.pack_into("<d", body, 1720, 4000)
    body[scoring + 196] = 1  # Jugador
    body[scoring + 199] = 1  # Posición
    body[scoring + 506] = 2  # Vuelta válida
    struct.pack_into("<h", body, scoring + 100, lap)
    struct.pack_into("<d", body, scoring + 104, distance)
    struct.pack_into("<d", body, scoring + 144, (0, 91, 89)[lap])  # mBestLapTime
    struct.pack_into("<d", body, scoring + 168, (0, 91, 89)[lap])  # mLastLapTime
    struct.pack_into("<d", body, scoring + 464, lap_elapsed)
    struct.pack_into("<d", body, telemetry + 12, source_time)
    struct.pack_into("<d", body, telemetry + 184, (50, 40, 50)[lap])
    struct.pack_into("<d", body, telemetry + 420, (0.75, 0.5, 0.75)[lap])
    struct.pack_into("<d", body, telemetry + 428, (0.25, 0.5, 0.25)[lap])
    return body


def add(archive, name, data):
    entry = tarfile.TarInfo(name)
    entry.size = len(data)
    archive.addfile(entry, io.BytesIO(data))


def main():
    frames = []
    for lap, (start, elapsed_at_finish) in enumerate(((10, 90.990), (101, 88.990))):
        for index in range(12):
            elapsed = elapsed_at_finish * index / 11
            frames.append(frame(lap, 350 * index, elapsed, start + elapsed))
    frames.append(frame(2, 0, 0, 190))

    clock = datetime(2026, 1, 1, tzinfo=timezone.utc)
    manifest = {
        "schema": "vantare.lmu-temporal-high-rate.v1",
        "build": "1.3.0.0",
        "events": [
            {
                "kind": "shm",
                "atUtc": (clock + timedelta(milliseconds=150 * index))
                .isoformat(timespec="milliseconds")
                .replace("+00:00", "Z"),
            }
            for index in range(len(frames))
        ],
    }
    with Path(__file__).with_name("two-laps.tar.gz").open("wb") as output:
        with gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as archive:
                add(archive, "manifest.json", json.dumps(manifest).encode("utf-8"))
                for index, body in enumerate(frames):
                    add(archive, f"shm-{index:03}.bin", body)


if __name__ == "__main__":
    main()
