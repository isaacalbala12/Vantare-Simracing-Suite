"""Normaliza evidencia cruda del kit; no abre ventanas ni dispositivos.

Junto a este archivo se empaquetan latencia.py (pieza 3), agregar.py (pieza 7),
cruce_rune.py y analizar.py. Los hashes de esos archivos quedan en kit.json.
"""
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path

from agregar import frame_metrics, gpu_metrics, noise_metrics, percentile, presentmon, process_metrics
from analizar import PRIMARY, block_ratio
from cruce_rune import cross_encoded, first_display
from latencia import complete_replay, cross_display, read_trace
from normalizar_inicio import normalize_home
from resumir_aguante import summarize as summarize_endurance


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def normalize_observation(folder):
    meta = read_json(folder / "observacion.json")
    require(meta.get("schema") == 1 and meta.get("status") == "complete", "Observación incompleta")
    require(meta.get("windows") == 1 and meta.get("observed_windows") == 1,
            "Se exige una ventana nativa realmente observada")
    require(meta.get("warmup_s", 0) >= 10 and meta.get("duration_s") == 60, "Ventana temporal incorrecta")
    sample = folder / "muestreo"
    require(not (sample / "INVALIDA.txt").exists(), "El muestreador anuló la ronda")
    complete = read_json(sample / "completo.json")
    environment = read_json(sample / "entorno.json")
    root = read_json(folder / "raiz.json")
    require(complete.get("complete") is True and environment.get("capture_precedes_root") is True,
            "Captura incompleta o iniciada después de la interfaz")
    require(root["image_sha256"] == meta["binary_sha256"], "La imagen no coincide con la variante declarada")
    require(environment["root_process_id"] == root["process_id"], "PID raíz discordante")
    family = {int(value) for value in complete["family"]}
    require(root["process_id"] in family, "Familia sin proceso raíz")
    frequency, origin = read_trace((folder / "nucleo.csv").read_text(encoding="utf-8-sig"))
    ui_frequency, ui = read_trace((folder / "interfaz.csv").read_text(encoding="utf-8-sig"))
    require(frequency == ui_frequency == environment["qpc_frequency"] == complete["qpc_frequency"],
            "Relojes QPC incompatibles")
    published = [row for row in origin if row["phase"] == "origin"]
    require(len(published) == 3840, "La grabación LMU de 60 s no produjo todas sus publicaciones")
    start = min(row["qpc"] for row in published)
    end = start + 60 * frequency
    identities = {(row["epoch"], row["sequence"]) for row in published}
    received = []
    active = False
    for row in ui:
        if row["phase"] != "received":
            continue
        if (row["epoch"], row["sequence"]) in identities:
            active = True
            received.append(row)
        else:
            require(not active, "Reaparece una foto de calentamiento después del replay principal")
    sent_count = complete_replay(origin, received)
    pm_file = sample / "presentmon.csv"
    all_presents = presentmon(pm_file.read_text(encoding="utf-8-sig"), family, frequency, 0, 2**63-1)
    main_presents = [row for row in all_presents if start <= row["submit_qpc"] < end]
    metrics = frame_metrics(main_presents, expected_windows=1)
    if meta["variant"] == "rune":
        mapping = cross_encoded(origin, ui, all_presents, frequency, start, end)
        latency = mapping["first_display"]
    else:
        stamps = [row for row in ui if row["phase"] == "submit" and start <= row["qpc"] < end
                  and (row["epoch"], row["sequence"]) in identities]
        mapping = cross_display(origin, stamps, main_presents, frequency)
        latency = first_display(mapping)
    require(bool(latency), "No existe latencia hasta pantalla verificable")
    metrics["latency_p95_ms"] = percentile([row["latency_ms"] for row in latency], .95)
    visible = [row["display_qpc"] for row in all_presents if row["display_qpc"] is not None]
    require(bool(visible) and min(visible) >= root["start_qpc"], "No se verificó el primer frame mostrado")
    metrics["visible_s"] = (min(visible) - root["start_qpc"]) / frequency
    processes = read_csv(sample / "procesos.csv")
    counters = read_csv(sample / "contadores.csv")
    metrics.update(process_metrics(processes, root["process_id"], frequency, start, end))
    metrics.update(gpu_metrics(counters, family, frequency, start, end))
    exclusions = {int(row["process_id"]) for row in read_json(sample / "ruido-exclusiones.json")}
    exclusions.update(family)
    exclusions.update((int(complete["sampler_id"]), int(complete["presentmon_id"])))
    noise = noise_metrics(counters, exclusions, environment["logical_processors"], frequency, start, end)
    thermal = read_json(folder / "termica.json")
    require(thermal.get("start_qpc") == start and thermal.get("end_qpc") == end
            and thermal.get("frequency") == frequency, "Control térmico fuera del intervalo medido")
    for name in ("contadores.csv", "temperaturas.csv"):
        require(thermal["source_sha256"][name] == sha256(sample / name), "Cambió evidencia térmica")
    require(thermal.get("valid") is True, "Limitación CPU o temperatura GPU: ronda inválida")
    require(noise["noise_ok"] is True and meta.get("environment_ok") is True,
            "Ruido o condiciones de entorno no válidas")
    if meta["load"]:
        load_root = read_json(folder / "carga-raiz.json")
        load_presents = presentmon(pm_file.read_text(encoding="utf-8-sig"), {load_root["process_id"]}, frequency, start, end)
        metrics["load_p99_ms"] = frame_metrics(load_presents, expected_windows=1)["frame_p99_ms"]
        load = (folder / "carga.csv").read_text(encoding="utf-8-sig").splitlines()
        require(load and load[0].startswith("# carga-v1,") and load[-1].endswith(",valid=1"), "Carga incompleta")
        parameters = dict(value.split("=", 1) for value in load[0].split(",")[1:])
        require(parameters.get("adaptive") == "0" and int(parameters["frozen_iterations"]) == meta["load_iterations"],
                "La carga no mantuvo el trabajo fijado antes de comparar motores")
    row = {key: meta[key] for key in ("id", "round", "block", "role", "variant", "comparison", "copies", "windows", "hz", "load", "binary_sha256")}
    row.update(valid=True, telemetry_complete=True, duration_s=60, warmup_s=meta["warmup_s"],
               midpoint_qpc=(start+end)//2, noise_ok=True, environment_ok=True,
               trace_overflow=0, trace_complete=True, metrics=metrics,
               source_folder=str(folder), sent_photos=sent_count, source_publications=len(published),
               first_display_photos=len(latency), thermal=thermal)
    return row


def normalize(root):
    campaign = read_json(root / "campana.json")
    require(campaign.get("schema") == 1, "Campaña sin esquema reconocido")
    records = [json.loads(line) for line in (root / "intentos.jsonl").read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    selected = {}
    for record in records:
        if record.get("event") == "end" and record.get("status") == "complete":
            selected.setdefault(record["family"], record["attempt"])
    observations = []
    for descriptor in sorted(root.rglob("observacion.json")):
        meta = read_json(descriptor)
        if selected.get(meta["family"]) == meta["attempt"]:
            observations.append(normalize_observation(descriptor.parent))
    output = {"schema": 1, "configuration": PRIMARY, "binaries": campaign["binaries"],
              "compilation": {"status": "pending_authorized", "plan": campaign["compilation_plan"]},
              "comparisons": {}, "additional_observations": [], "failed_attempts": [row for row in records if row.get("status") in ("invalid", "cancelled")]}
    for comparison in ("rune", "gpui_fast"):
        primary = [row for row in observations if row["comparison"] == comparison
                   and all(row[key] == value for key, value in PRIMARY.items())]
        if not primary:
            continue
        loaded = [row for row in observations if row["comparison"] == comparison and row["load"]
                  and row["copies"] == 10 and row["windows"] == 1 and row["hz"] == 60]
        require(len(primary) == len(loaded), "Falta la comparación emparejada con carga, no sustituirla por cero")
        rounds = []
        for index in sorted({row["round"] for row in primary}):
            round_ = {"id": index}
            for block in ("aa", "ab"):
                base = sorted((row for row in primary if row["round"] == index and row["block"] == block), key=lambda row: row["midpoint_qpc"])
                companion = sorted((row for row in loaded if row["round"] == index and row["block"] == block), key=lambda row: row["midpoint_qpc"])
                require(len(base) == len(companion) == 4, "Bloque con carga incompleto")
                if block == "aa":
                    require(abs(math.log(block_ratio(companion, "load_p99_ms"))) < math.log(1.025), "Control A/A de la carga supera 2,5%")
                for row, load in zip(base, companion):
                    require(row["role"] == load["role"] and row["variant"] == load["variant"]
                            and row["binary_sha256"] == load["binary_sha256"], "Pareja de carga distinta")
                    row["metrics"]["load_p99_ms"] = load["metrics"]["load_p99_ms"]
                    row["load_measurement"] = {"id": load["id"], "source_folder": load["source_folder"],
                                               "configuration": {**PRIMARY, "load": True}}
                round_[block] = base
            rounds.append(round_)
        manual_path = root / "correccion" / (comparison + ".json")
        endurance_path = root / "aguante" / comparison / "resumen.json"
        output["comparisons"][comparison] = {"rounds": rounds,
            "manual": read_json(manual_path) if manual_path.exists() else {},
            "endurance": (read_json(endurance_path) if endurance_path.exists() else
                          summarize_endurance(endurance_path.parent)
                          if (endurance_path.parent / "ejecucion.json").exists() else {})}
    output["additional_observations"] = [row for row in observations if not all(row[key] == value for key, value in PRIMARY.items())]
    hub = root / "hub-resumen.json"
    if (root / "inicio").exists():
        output["hub"] = normalize_home(root)
    elif hub.exists():
        output["hub"] = read_json(hub)
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = normalize(args.root)
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(result, stream, indent=2, ensure_ascii=False, allow_nan=False)
