"""VANTA-141, INFORME-FABLE §8. Solo analiza evidencia; nunca abre interfaces."""
import argparse
import json
import math
import statistics
from pathlib import Path

PRIMARY = {"copies": 10, "hz": 60, "load": False}
CHECKLIST = ("click_through", "no_focus", "topmost_borderless", "dpi_100", "dpi_150",
             "second_monitor", "obs_transparency", "exclude_from_capture")
METRICS = ("cpu_cycles_s", "private_mib", "vram_mib", "gpu_percent", "frame_p99_ms",
           "dropped_frames", "latency_p95_ms", "load_p99_ms", "visible_s",
           "clean_build_s", "incremental_build_s")
# Intervalo t bilateral del 95 %, df 7..23 (8..24 rondas), método de PR #2013.
T95 = {7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179,
       13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101,
       19: 2.093, 20: 2.086, 21: 2.080, 22: 2.074, 23: 2.069}


class InvalidEvidence(ValueError):
    pass


def number(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise InvalidEvidence(f"{name}: dato ausente o inválido")
    return value


def interval(ratios):
    if not 8 <= len(ratios) <= 24 or any(not math.isfinite(r) or r <= 0 for r in ratios):
        raise InvalidEvidence("Se necesitan entre 8 y 24 rondas completas")
    logs = [math.log(r) for r in ratios]
    mean = statistics.mean(logs)
    half = T95[len(logs) - 1] * statistics.stdev(logs) / math.sqrt(len(logs))
    return {"median": statistics.median(ratios), "ci95": [math.exp(mean - half), math.exp(mean + half)],
            "rounds": len(ratios), "ratios": ratios}


def block_ratio(observations, metric):
    """Ajusta log(coste) por punto medio QPC y papel B en un bloque ABBA/BAAB."""
    if len(observations) != 4 or "".join(o["role"] for o in observations) not in ("ABBA", "BAAB"):
        raise InvalidEvidence("Bloque incompleto o sin contrabalancear")
    times = [number(o.get("midpoint_qpc"), "midpoint_qpc") for o in observations]
    if times != sorted(set(times)):
        raise InvalidEvidence("Instantes de ronda repetidos o desordenados")
    values = [number(o["metrics"].get(metric), metric) for o in observations]
    if min(values) <= 0:
        raise InvalidEvidence(f"{metric}: no se puede calcular un cociente con cero")
    x = [t - statistics.mean(times) for t in times]
    b = [float(o["role"] == "B") - 0.5 for o in observations]
    y = [math.log(v) for v in values]
    xx, bb, xb = sum(t*t for t in x), sum(t*t for t in b), sum(a*c for a, c in zip(x, b))
    xy, by = sum(a*c for a, c in zip(x, y)), sum(a*c for a, c in zip(b, y))
    determinant = xx * bb - xb * xb
    if determinant <= 0:
        raise InvalidEvidence("No se puede separar tiempo y variante")
    return math.exp((by * xx - xy * xb) / determinant)


def validate_observation(row):
    if row.get("valid") is not True or row.get("telemetry_complete") is not True:
        raise InvalidEvidence("Ronda fallida o con fotos perdidas")
    if row.get("duration_s", 0) < 60 or row.get("warmup_s", 0) < 10:
        raise InvalidEvidence("Duración o calentamiento incompletos")
    if row.get("noise_ok") is not True or row.get("environment_ok") is not True:
        raise InvalidEvidence("Ruido o entorno sin verificar")
    if row.get("trace_overflow") != 0 or row.get("trace_complete") is not True:
        raise InvalidEvidence("Traza incompleta o desbordada")
    for name in METRICS:
        number(row.get("metrics", {}).get(name), name)


def compare(baseline, candidate, candidate_name):
    """Medianas por ronda ya verificadas; no sustituye los controles A/A."""
    for metrics in (baseline, candidate):
        for name in METRICS:
            number(metrics.get(name), name)
    frame = 1000 / PRIMARY["hz"]
    limits = {
        "cpu_cycles_s": baseline["cpu_cycles_s"] * (0.9 if candidate_name == "gpui_fast" else 1.1),
        "private_mib": min(baseline["private_mib"] * 1.25, 150),
        "vram_mib": baseline["vram_mib"] * 1.5,
        "gpu_percent": baseline["gpu_percent"] + 1,
        "frame_p99_ms": frame,
        "dropped_frames": baseline["dropped_frames"],
        "latency_p95_ms": baseline["latency_p95_ms"] + frame,
        "load_p99_ms": baseline["load_p99_ms"] * 1.03,
        "visible_s": min(baseline["visible_s"] * 1.5, 1.5),
        "clean_build_s": baseline["clean_build_s"],
        "incremental_build_s": baseline["incremental_build_s"],
    }
    # El texto de §8 exige al fast un 10 % de CPU y no empeorar el resto.
    if candidate_name == "gpui_fast":
        for name in METRICS:
            if name != "cpu_cycles_s":
                limits[name] = min(limits[name], baseline[name])
    results = {name: {"value": candidate[name], "limit": limit, "pass": candidate[name] <= limit}
               for name, limit in limits.items()}
    return results


def endurance_pass(data):
    return (data.get("complete") is True and data.get("duration_s", 0) >= 4 * 3600
            and data.get("crashes") == 0 and data.get("bugchecks") == 0
            and data.get("monitor_sleep_resume") is True and data.get("hide_show") is True
            and data.get("resolution_change") is True and data.get("minidump_enabled") is True
            and 0 <= number(data.get("memory_drift_fraction"), "deriva de memoria") < 0.05)


def evaluate(document):
    if document.get("schema") != 1 or document.get("configuration") != PRIMARY:
        raise InvalidEvidence("Falta el escenario principal declarado: 10 ventanas, 60 Hz, sin carga")
    output = {"source": "INFORME-FABLE.md §8", "hub": "pendiente", "overlays": {}, "adopted": False}
    for name in ("rune", "gpui_fast"):
        data = document.get("comparisons", {}).get(name)
        if not data:
            output["overlays"][name] = {"verdict": "pendiente", "reason": "comparación ausente"}
            continue
        rounds = data.get("rounds", [])
        if not 8 <= len(rounds) <= 24:
            raise InvalidEvidence("Faltan rondas completas")
        aa, ab, observed = [], [], {"gpui": [], name: []}
        observation_ids = set()
        for round_index, round_ in enumerate(rounds, 1):
            if round_.get("id") != round_index:
                raise InvalidEvidence("Rondas repetidas o desordenadas")
            controls, comparison = round_.get("aa", []), round_.get("ab", [])
            for row in controls + comparison:
                validate_observation(row)
                identity = row.get("id")
                if not identity or identity in observation_ids:
                    raise InvalidEvidence("Observación reutilizada")
                observation_ids.add(identity)
                expected_hash = document.get("binaries", {}).get(row.get("variant"))
                if (not isinstance(expected_hash, str) or len(expected_hash) != 64
                        or any(c not in "0123456789abcdef" for c in expected_hash)
                        or row.get("binary_sha256") != expected_hash):
                    raise InvalidEvidence("Binario distinto de la declaración")
            if any(row.get("variant") != "gpui" for row in controls):
                raise InvalidEvidence("A/A debe usar el mismo GPUI")
            if len({row.get("binary_sha256") for row in controls}) != 1 or not controls[0].get("binary_sha256"):
                raise InvalidEvidence("A/A no comparte binario verificado")
            for row in comparison:
                expected = "gpui" if row["role"] == "A" else name
                if row.get("variant") != expected:
                    raise InvalidEvidence("Variante distinta de la declaración")
                observed[expected].append(row["metrics"])
            aa.append(block_ratio(controls, "cpu_cycles_s"))
            ab.append(block_ratio(comparison, "cpu_cycles_s"))
            first, second = (controls, comparison) if round_index % 2 else (comparison, controls)
            if max(row["midpoint_qpc"] for row in first) >= min(row["midpoint_qpc"] for row in second):
                raise InvalidEvidence("Los bloques no están intercalados en el orden declarado")
        stats = interval(ab)
        if max(abs(math.log(r)) for r in aa) >= math.log(1.025):
            output["overlays"][name] = {"verdict": "invalido_ruido", "aa_ratios": aa, "cpu": stats}
            continue
        medians = {variant: {metric: statistics.median(row[metric] for row in rows) for metric in METRICS}
                   for variant, rows in observed.items()}
        checks = compare(medians["gpui"], medians[name], name)
        cpu_limit = 0.9 if name == "gpui_fast" else 1.1
        checks["cpu_cycles_s"].update(normalized_ratio=stats["median"], ratio_limit=cpu_limit,
                                       **{"pass": stats["median"] <= cpu_limit})
        manual = data.get("manual", {})
        correctness = all(manual.get(check) is True for check in CHECKLIST)
        endurance = endurance_pass(data.get("endurance", {}))
        failed = [key for key, value in checks.items() if not value["pass"]]
        verdict = "cumple_umbrales" if not failed and correctness and endurance else "no_adoptar"
        manual_pending = any(manual.get(check) is None for check in CHECKLIST)
        manual_failed = any(manual.get(check) is False for check in CHECKLIST)
        endurance_pending = data.get("endurance", {}).get("complete") is not True
        if manual_pending or endurance_pending:
            verdict = "pendiente_validacion_fisica"
        if manual_failed or (not endurance_pending and not endurance):
            verdict = "no_adoptar"
        if "load_p99_ms" in failed:
            verdict = "no_adoptar"
        if name == "rune" and correctness and endurance and failed and set(failed) <= {"private_mib", "vram_mib"}:
            if all(checks[key]["value"] < checks[key]["limit"] * 1.15 for key in failed):
                verdict = "consultar_isaac_solo_memoria"
        if verdict == "cumple_umbrales" and stats["ci95"][1] > cpu_limit:
            verdict = "inconcluso_intervalo_cpu"
        output["overlays"][name] = {"verdict": verdict, "cpu": stats, "aa_ratios": aa,
                                    "checks": checks, "correctness": correctness, "endurance": endurance}
    electron = document.get("hub", {}).get("electron")
    if electron:
        interactive = number(electron.get("interactive_median_s"), "Electron interactivo")
        memory = number(electron.get("private_family_median_mib"), "Electron memoria de toda la familia")
        if electron.get("cold_starts") != 10 or electron.get("warm_starts") != 10 or electron.get("interaction_rounds") != 5:
            raise InvalidEvidence("Prueba A incompleta")
        output["hub"] = "revisar_ADR_0107_con_Isaac" if interactive > 3 or memory > 600 else "mantener_Electron"
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        result = evaluate(json.loads(args.input.read_text(encoding="utf-8-sig")))
    except (ValueError, KeyError, TypeError) as error:
        result = {"adopted": False, "verdict": "evidencia_invalida", "reason": str(error)}
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 2 if result.get("verdict") == "evidencia_invalida" else 0


if __name__ == "__main__":
    raise SystemExit(main())
