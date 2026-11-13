"""Inicio desde CSV de toda la familia; no consulta dispositivos."""
import csv
import json
import statistics
from agregar import presentmon, frame_metrics, process_metrics, gpu_metrics


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def observation(folder):
    meta = read_json(folder / "observacion-inicio.json")
    sample = folder / "muestreo"
    complete, environment, root = (read_json(path) for path in
        (sample / "completo.json", sample / "entorno.json", folder / "raiz.json"))
    if meta.get("status") != "complete" or complete.get("complete") is not True or environment.get("capture_precedes_root") is not True or root["image_sha256"] != meta["binary_sha256"]:
        raise ValueError("Captura o imagen de Inicio inválida")
    frequency = meta["frequency"]
    family = {int(value) for value in complete["family"]}
    if frequency != complete["qpc_frequency"] or frequency != environment["qpc_frequency"] or root["process_id"] not in family:
        raise ValueError("Reloj o familia de Inicio inválidos")
    frames = presentmon((sample / "presentmon.csv").read_text(encoding="utf-8-sig"), family, frequency, 0, 2**63-1)
    shown = [frame["display_qpc"] for frame in frames if frame["display_qpc"] is not None]
    if not shown or min(shown) < root["start_qpc"]:
        raise ValueError("No se verificó el primer frame visible")
    # Rune's opaque window can show its CPU-painted scene before a GPU Present.
    # Its first-drawn hook blits/uncloaks before DwmFlush and writing the marker.
    if meta["variant"] == "rune":
        marker = read_json(folder / "visible.json")
        if marker.get("ready") is not True or marker.get("source") != "post_draw_dwm_flush":
            raise ValueError("Falta la primera composición de Inicio Rune")
    visible = meta["visible_observed_qpc"] if meta["variant"] == "rune" else min(shown)
    interactive = max(visible, meta["ready_observed_qpc"])
    result = {key: meta[key] for key in ("variant", "phase", "index", "binary_sha256")}
    if visible < root["start_qpc"]:
        raise ValueError("Visible anterior al arranque")
    result.update(visible_s=(visible-root["start_qpc"])/frequency,
                  interactive_s=(interactive-root["start_qpc"])/frequency,
                  visible_is_upper_bound=meta["variant"] == "rune",
                  visible_source="post_draw_dwm_flush_parent_qpc" if meta["variant"] == "rune" else "PresentMon_display_qpc",
                  first_presentmon_display_s=(min(shown)-root["start_qpc"])/frequency,
                  readiness_is_upper_bound=True, source_folder=str(folder))
    if meta["phase"] == "interaction":
        stages = meta["stages"]
        if [stage["name"] for stage in stages] != ["idle", "scroll", "navigation", "resize"] or stages[2].get("transitions") != 30:
            raise ValueError("Guion de interacción incompleto")
        processes, counters = read_csv(sample / "procesos.csv"), read_csv(sample / "contadores.csv")
        result["stages"] = {}
        for stage in stages:
            start, end = stage["start_qpc"], stage["end_qpc"]
            if end <= start or start < interactive or end > max(int(row["qpc"]) for row in processes):
                raise ValueError("Interacción fuera de captura")
            if stage["name"] in ("idle", "scroll", "resize") and (end-start)/frequency < (20 if stage["name"] == "idle" else 10):
                raise ValueError("Fase demasiado corta")
            metrics = process_metrics(processes, root["process_id"], frequency, start, end)
            metrics.update(gpu_metrics(counters, family, frequency, start, end))
            if stage["name"] in ("scroll", "resize"):
                metrics.update(frame_metrics([frame for frame in frames if start <= frame["submit_qpc"] < end], expected_windows=1))
            result["stages"][stage["name"]] = metrics
    return result


def normalize_home(root):
    rows = [observation(path.parent) for path in sorted(root.rglob("observacion-inicio.json"))]
    result = {}
    for variant in ("electron", "gpui_fast", "rune"):
        selected = [row for row in rows if row["variant"] == variant]
        groups = {phase: [row for row in selected if row["phase"] == phase] for phase in ("cold", "warm", "interaction")}
        if any(sorted(row["index"] for row in groups[phase]) != list(range(1, count+1)) for phase, count in (("cold",10),("warm",10),("interaction",5))):
            raise ValueError("Faltan arranques o interacciones de " + variant)
        if len({row["binary_sha256"] for row in selected}) != 1:
            raise ValueError("No mezclar binarios de Inicio")
        result[variant] = {"cold_starts":10, "warm_starts":10, "interaction_rounds":5,
            "interactive_median_s":statistics.median(row["interactive_s"] for row in groups["cold"]),
            "warm_interactive_median_s":statistics.median(row["interactive_s"] for row in groups["warm"]),
            "cold_visible_median_s":statistics.median(row["visible_s"] for row in groups["cold"]),
            "warm_visible_median_s":statistics.median(row["visible_s"] for row in groups["warm"]),
            "private_family_median_mib":statistics.median(row["stages"]["idle"]["private_mib"] for row in groups["interaction"]),
            "observations":selected,
            "first_after_reboot": [row for row in selected if row["phase"] == "boot"],
            "cache_limit":"Perfiles QA nuevos/reutilizados; no purga del sistema. Primer arranque tras reinicio aparte."}
    return result
