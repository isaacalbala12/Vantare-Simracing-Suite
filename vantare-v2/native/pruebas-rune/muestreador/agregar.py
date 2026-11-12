"""Pure aggregation for the pinned PresentMon 2.6 CSV and Windows samples.

One native layer per monitor; widget copies must never be counted as windows
or combined into artificial FPS. No graphics APIs are imported here.
"""
import csv
import io
import math
import statistics
from collections import defaultdict


def finite(value, field):
    try:
        number = float(value)
    except (ValueError, TypeError) as error:
        raise ValueError(f"{field}: dato no numerico") from error
    if not math.isfinite(number) or number < 0:
        raise ValueError(f"{field}: dato no finito o negativo")
    return number


def integer(value, field):
    if isinstance(value, bool) or not str(value).isascii() or not str(value).isdecimal():
        raise ValueError(f"{field}: entero invalido")
    return int(value)


def percentile(values, fraction):
    if not values or not 0 <= fraction <= 1:
        raise ValueError("Percentil sin datos")
    values = sorted(finite(value, "percentil") for value in values)
    position = (len(values) - 1) * fraction
    low = int(position)
    high = min(low + 1, len(values) - 1)
    return values[low] + (values[high] - values[low]) * (position - low)


def presentmon(text, process_ids, frequency, start_qpc, end_qpc):
    if frequency <= 0 or start_qpc >= end_qpc or not process_ids:
        raise ValueError("Reloj, ventana o procesos invalidos")
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")))
    required = {"ProcessID", "SwapChainAddress", "CPUStartQPC", "MsCPUBusy",
                "DisplayLatency", "DisplayedTime", "MsBetweenPresents"}
    if not required.issubset(reader.fieldnames or []):
        raise ValueError("Faltan las columnas PresentMon 2.6 en QPC; no inferir otro reloj")
    result, seen = [], set()
    for row in reader:
        process_id = integer(row["ProcessID"], "ProcessID")
        if process_id not in process_ids:
            continue
        cpu = integer(row["CPUStartQPC"], "CPUStartQPC")
        busy = finite(row["MsCPUBusy"], "MsCPUBusy")
        submit = cpu + round(busy * frequency / 1000)
        if not start_qpc <= submit < end_qpc:
            continue
        chain = row["SwapChainAddress"].strip()
        if not chain:
            raise ValueError("Cadena de presentacion ausente")
        identity = (process_id, chain, submit)
        if identity in seen:
            raise ValueError("Present duplicado")
        seen.add(identity)
        dropped = row["DisplayedTime"].strip() == "NA"
        display = None
        if not dropped:
            finite(row["DisplayedTime"], "DisplayedTime")
            display = cpu + round(finite(row["DisplayLatency"], "DisplayLatency") * frequency / 1000)
            if display < submit:
                raise ValueError("Pantalla anterior al Present: reloj o datos incompatibles")
        result.append({"process_id": process_id, "chain": chain, "submit_qpc": submit,
                       "display_qpc": display, "dropped": dropped,
                       "frame_ms": finite(row["MsBetweenPresents"], "MsBetweenPresents")})
    if not result:
        raise ValueError("No hay fotogramas del proceso declarado")
    return sorted(result, key=lambda row: (row["submit_qpc"], row["process_id"], row["chain"]))


def frame_metrics(rows, expected_windows=1):
    chains = defaultdict(list)
    for row in rows:
        chains[(row["process_id"], row["chain"])].append(row)
    if len(chains) != expected_windows:
        raise ValueError("El numero de cadenas no coincide con las ventanas declaradas")
    # Keep per-chain intervals. Summing interleaved chains would manufacture FPS.
    intervals = []
    for chain in chains.values():
        chain.sort(key=lambda row: row["submit_qpc"])
        for index, row in enumerate(chain):
            value = row["frame_ms"]
            if value == 0 and index == 0:
                continue  # PresentMon has no previous frame for the first row.
            if value <= 0:
                raise ValueError("Intervalo de fotograma ausente")
            intervals.append(value)
    return {"frame_p50_ms": percentile(intervals, .50), "frame_p95_ms": percentile(intervals, .95),
            "frame_p99_ms": percentile(intervals, .99), "dropped_frames": sum(row["dropped"] for row in rows),
            "frames": len(rows), "windows": len(chains)}


def process_metrics(rows, root_process_id, frequency, start_qpc, end_qpc):
    if frequency <= 0 or start_qpc >= end_qpc:
        raise ValueError("Ventana de muestreo invalida")
    groups, identities = defaultdict(dict), {}
    for row in rows:
        clock = integer(row["qpc"], "qpc")
        if not start_qpc <= clock <= end_qpc:
            continue
        process_id = integer(row["process_id"], "process_id")
        created = row["created_utc"]
        if not created or (process_id in identities and identities[process_id] != created):
            raise ValueError("PID reutilizado o identidad ausente")
        identities[process_id] = created
        if process_id in groups[clock]:
            raise ValueError("Muestra de proceso duplicada")
        groups[clock][process_id] = {key: integer(row[key], key) for key in
                                   ("cpu_cycles", "cpu_time_100ns", "private_bytes", "working_set_bytes")}
    clocks = sorted(groups)
    if len(clocks) < 2 or clocks[0] - start_qpc > 1.5 * frequency or end_qpc - clocks[-1] > 1.5 * frequency:
        raise ValueError("Muestreo incompleto en los extremos")
    pids = set(groups[clocks[0]])
    if root_process_id not in pids or any(set(groups[clock]) != pids for clock in clocks):
        raise ValueError("La familia cambio durante la ventana estable; no estimar CPU ausente")
    rates, times = [], []
    for before, after in zip(clocks, clocks[1:]):
        seconds = (after - before) / frequency
        if not .25 <= seconds <= 1.75:
            raise ValueError("Cadencia de muestreo incompleta")
        deltas = []
        for field in ("cpu_cycles", "cpu_time_100ns"):
            delta = sum(groups[after][pid][field] - groups[before][pid][field] for pid in pids)
            if any(groups[after][pid][field] < groups[before][pid][field] for pid in pids):
                raise ValueError("Contador de CPU retrocedio")
            deltas.append(delta)
        rates.append(deltas[0] / seconds)
        times.append(deltas[1] / 10_000_000 / seconds * 100)
    private = [sum(value["private_bytes"] for value in groups[clock].values()) / 2**20 for clock in clocks]
    working = [sum(value["working_set_bytes"] for value in groups[clock].values()) / 2**20 for clock in clocks]
    return {"cpu_cycles_s": statistics.median(rates), "cpu_percent_one_core": statistics.median(times),
            "private_mib": statistics.median(private), "private_peak_mib": max(private),
            "working_set_mib": statistics.median(working), "samples": len(clocks), "family_processes": len(pids)}
