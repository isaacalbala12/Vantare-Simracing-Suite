"""Resumen de cuatro horas desde muestras crudas; no abre dispositivos."""
import argparse
import csv
import json
import statistics
from collections import defaultdict
from pathlib import Path


def memory_drift(rows, frequency, start, end, root_pid):
    if frequency <= 0 or end - start < 14400 * frequency:
        raise ValueError("Faltan cuatro horas medidas")
    samples = defaultdict(dict)
    identities = {}
    for row in rows:
        qpc, pid = int(row["qpc"]), int(row["process_id"])
        if not start <= qpc <= end:
            continue
        identity = row["created_utc"]
        if pid in identities and identities[pid] != identity:
            raise ValueError("Reutilización de PID")
        identities[pid] = identity
        if pid in samples[qpc]:
            raise ValueError("Proceso duplicado en una muestra")
        value = int(row["private_bytes"])
        if value < 0:
            raise ValueError("Memoria negativa")
        samples[qpc][pid] = value
    clocks = sorted(samples)
    if len(clocks) < 1000 or clocks[0] - start > 20 * frequency or end - clocks[-1] > 20 * frequency:
        raise ValueError("Muestreo incompleto")
    if any(b-a > 20 * frequency for a, b in zip(clocks, clocks[1:])):
        raise ValueError("Huecos en el muestreo")
    if any(root_pid not in samples[qpc] for qpc in clocks):
        raise ValueError("Falta la raíz medida")
    first = [sum(samples[qpc].values()) for qpc in clocks if start + 600*frequency <= qpc < start + 1200*frequency]
    last = [sum(samples[qpc].values()) for qpc in clocks if end - 600*frequency <= qpc <= end]
    if len(first) < 55 or len(last) < 55 or min(first) <= 0:
        raise ValueError("Ventanas estables incompletas")
    initial, final = statistics.median(first), statistics.median(last)
    signed = final / initial - 1
    return {"memory_drift_fraction": abs(signed), "signed_memory_drift_fraction": signed,
            "initial_private_bytes": initial, "final_private_bytes": final,
            "method": "mediana familiar minutos 10–20 frente a últimos 10 minutos; variación absoluta sobre base"}


def summarize(folder):
    run = json.loads((folder / "ejecucion.json").read_text(encoding="utf-8-sig"))
    result = {key: run.get(key) for key in ("duration_s", "crashes", "bugchecks", "monitor_sleep_resume", "hide_show", "resolution_change", "minidump_enabled")}
    result.update(complete=False, cpu_temperature=None, cpu_temperature_status="no_disponible")
    result['resolution_observed']=run.get('resolution_observed') is True
    result['action_evidence'] = {'monitor_sleep_resume':'declarativo: M del usuario',
        'resolution_change':'R del usuario + cambio/restauración observados por Windows',
        'resolution_observed':run.get('resolution_observed') is True}
    # Un fallo observado nunca se convierte en pendiente por faltar muestras.
    if run.get("crashes", 0) or run.get("bugchecks", 0):
        result["reason"] = "Caída o incidente del sistema observado"
        return result
    try:
        if run.get("finished") is not True or run["duration_s"] < 14400:
            raise ValueError("Prueba interrumpida o duración insuficiente")
        with (folder / "muestreo/procesos.csv").open(encoding="utf-8-sig", newline="") as stream:
            result.update(memory_drift(csv.DictReader(stream), run["frequency"], run["start_qpc"], run["end_qpc"], run["root_process_id"]))
        sample = json.loads((folder / "muestreo/completo.json").read_text(encoding="utf-8-sig"))
        thermal = json.loads((folder / "termica.json").read_text(encoding="utf-8-sig"))
        if sample.get("complete") is not True or thermal.get("valid") is not True:
            raise ValueError("Muestreo incompleto o control térmico inválido")
        result["complete"] = run.get('resolution_observed') is True and all(result[key] is True for key in ("monitor_sleep_resume", "hide_show", "resolution_change", "minidump_enabled"))
        result["thermal"] = thermal
    except (KeyError, ValueError, OSError) as error:
        result["reason"] = str(error)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", type=Path)
    args = parser.parse_args()
    result = summarize(args.folder)
    with (args.folder / "resumen.json").open("x", encoding="utf-8") as stream:
        json.dump(result, stream, indent=2, ensure_ascii=False, allow_nan=False)
