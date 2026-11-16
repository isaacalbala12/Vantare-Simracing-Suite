"""CPU/memoria/Presents de 50 s centrales; solo CSV, sin consultas al sistema."""
import csv
import json
import statistics
import re
import sys
from datetime import datetime
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "vantare-v2/native/pruebas-rune/muestreador"))
from agregar import presentmon


def birth(value):
    return datetime.fromisoformat(re.sub(r"(\.\d{6})\d+", r"\1", value).replace("Z", "+00:00"))


def rows(path):
    with Path(path).open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def median(values):
    return statistics.median(values)


def measure(directory, identity, replay_start_qpc=0):
    root = Path(directory)
    if (root / "INVALIDA.txt").exists():
        raise ValueError("El muestreador invalidó la captura")
    complete = json.loads((root / "completo.json").read_text(encoding="utf-8-sig"))
    environment = json.loads((root / "entorno.json").read_text(encoding="utf-8-sig"))
    ready = json.loads((root / "CAPTURA-LISTA.json").read_text(encoding="utf-8-sig"))
    if not complete["complete"] or not ready["ready"] or complete["health_only"]:
        raise ValueError("Captura PresentMon incompleta")
    frequency = int(complete["qpc_frequency"])
    if frequency <= 0 or frequency != int(ready["frequency"]):
        raise ValueError("Relojes incompatibles")
    pid = str(identity["process_id"])
    family = complete["family"]
    if pid not in family or birth(family[pid]) != birth(identity["created_utc"]):
        raise ValueError("PID o fecha de creación distintos")
    if str(environment["root_process_id"]) != pid:
        raise ValueError("PID de entorno distinto")
    # Corpus de 60 s: segundos 5–55; Waiting usa el inicio de captura.
    start = (int(replay_start_qpc) or int(ready["qpc"])) + 5 * frequency
    end = start + 50 * frequency
    grouped = {}
    all_rows = rows(root / "procesos.csv")
    for row in all_rows:
        key = row["process_id"]
        if key not in family:
            continue
        if birth(row["created_utc"]) != birth(family[key]):
            raise ValueError("PID reutilizado en CSV")
        grouped.setdefault(key, []).append(row)
    if pid not in grouped:
        raise ValueError("Faltan muestras de raíz")
    cpu_ticks = 0.0
    memory = {}
    for key, samples in grouped.items():
        samples.sort(key=lambda row: int(row["qpc"]))
        times = [int(row["qpc"]) for row in samples]
        if len(times) != len(set(times)):
            raise ValueError("Muestras duplicadas")
        # Familia nativa persistente. No fabricar CPU de hijos que nacen/mueren
        # dentro de la ventana: esa captura se declara no soportada/inválida.
        if times[0] > start or times[-1] < end:
            raise ValueError("Cobertura de proceso insuficiente para 50 s")
        for left, right in zip(samples, samples[1:]):
            a, b = int(left["qpc"]), int(right["qpc"])
            if b <= start or a >= end:
                continue
            if b - a > 3 * frequency:
                raise ValueError("Hueco de muestreo superior a 3 s")
            delta = int(right["cpu_time_100ns"]) - int(left["cpu_time_100ns"])
            if delta < 0:
                raise ValueError("CPU acumulada retrocede")
            cpu_ticks += delta * (min(b, end) - max(a, start)) / (b - a)
        for row in samples:
            at = int(row["qpc"])
            if start <= at <= end:
                total = memory.setdefault(at, [0, 0, set()])
                total[0] += int(row["private_bytes"])
                total[1] += int(row["working_set_bytes"])
                total[2].add(key)
    if not memory or any(value[2] != set(grouped) for value in memory.values()):
        raise ValueError("Memoria sin muestras comunes de familia")
    # Parser compartido: CPUStartQPC + MsCPUBusy, no otro reloj inferido.
    # Reposo permite cero presents; conserva validación de columnas/filas.
    presents = len(presentmon((root / "presentmon.csv").read_text(encoding="utf-8-sig"),
                             {int(key) for key in grouped}, frequency, start, end,
                             count_only=True))
    cpu_ms_s = cpu_ticks / 10_000 / 50
    return {"start_qpc": start, "end_qpc": end, "seconds": 50,
            "identity": identity, "cpu_ms_s": cpu_ms_s, "cpu_one_core_percent": cpu_ms_s / 10,
            "private_median_mib": median([v[0] for v in memory.values()]) / 2**20,
            "private_max_mib": max(v[0] for v in memory.values()) / 2**20,
            "working_set_median_mib": median([v[1] for v in memory.values()]) / 2**20,
            "working_set_max_mib": max(v[1] for v in memory.values()) / 2**20,
            "presents": presents, "presents_s": presents / 50}


if __name__ == "__main__":
    import sys
    result = measure(sys.argv[1], json.loads(Path(sys.argv[2]).read_text(encoding="utf-8-sig")), int(sys.argv[4]) if len(sys.argv) > 4 else 0)
    Path(sys.argv[3]).write_text(json.dumps(result, indent=2), encoding="utf-8")
