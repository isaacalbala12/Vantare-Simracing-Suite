"""VANTA-141, INFORME-FABLE §8. Solo analiza evidencia; nunca abre interfaces."""
import argparse
import json
import math
import statistics
from pathlib import Path

PRIMARY = {"copies": 10, "windows": 1, "hz": 60, "load": False}
CHECKLIST = ("click_through", "no_focus", "topmost_borderless", "dpi_100", "dpi_150",
             "second_monitor", "obs_transparency", "exclude_from_capture")
METRICS = ("cpu_cycles_s", "private_mib", "vram_mib", "gpu_percent", "frame_p99_ms",
           "dropped_frames", "latency_p95_ms", "load_p99_ms", "visible_s",
           "clean_build_s", "incremental_build_s")
BUILD_METRICS = ("clean_build_s", "incremental_build_s")
ABS_NOISE = dict(cpu_cycles_s=0, private_mib=.5, vram_mib=.5, gpu_percent=.1,
                 frame_p99_ms=.1, dropped_frames=1, latency_p95_ms=.1,
                 load_p99_ms=.1, visible_s=.01, clean_build_s=.05, incremental_build_s=.05)


def noise_margin(metric, baseline):
    return max(.025*baseline, ABS_NOISE[metric])


def aa_check(rows, metric):
    """Same detrending for every metric; linear contrast also permits zero drops."""
    if len(rows) != 4 or ''.join(row['role'] for row in rows) not in ('ABBA','BAAB'):
        raise InvalidEvidence('Control A/A incompleto')
    times=[number(row['midpoint_qpc'],'midpoint_qpc') for row in rows]
    if times != sorted(set(times)):
        raise InvalidEvidence('Control A/A fuera de orden')
    values=[number(row['metrics'].get(metric),metric) for row in rows]
    x=[value-statistics.mean(times) for value in times]
    b=[float(row['role']=='B')-.5 for row in rows]
    y=[value-statistics.mean(values) for value in values]
    xx,bb,xb=sum(v*v for v in x),sum(v*v for v in b),sum(a*c for a,c in zip(x,b))
    determinant=xx*bb-xb*xb
    if determinant<=0:raise InvalidEvidence('Control A/A sin separación temporal verificable')
    beta=(sum(a*c for a,c in zip(b,y))*xx-sum(a*c for a,c in zip(x,y))*xb)/determinant
    baseline=statistics.mean(row['metrics'][metric] for row in rows if row['role']=='A')
    margin=noise_margin(metric,baseline)
    return {'effect':beta,'tolerance':margin,'pass':abs(beta)<=margin+1e-12}
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


def validate_observation(row, compilation_pending=False):
    if row.get("windows") != 1:
        raise InvalidEvidence("La comparacion exige una ventana overlay, no N ventanas")
    if row.get("valid") is not True or row.get("telemetry_complete") is not True:
        raise InvalidEvidence("Ronda fallida o con fotos perdidas")
    if row.get("duration_s", 0) < 60 or row.get("warmup_s", 0) < 10:
        raise InvalidEvidence("Duración o calentamiento incompletos")
    if row.get("noise_ok") is not True or row.get("environment_ok") is not True:
        raise InvalidEvidence("Ruido o entorno sin verificar")
    if row.get("trace_overflow") != 0 or row.get("trace_complete") is not True:
        raise InvalidEvidence("Traza incompleta o desbordada")
    for name in METRICS:
        if not compilation_pending or name not in BUILD_METRICS:
            number(row.get("metrics", {}).get(name), name)


def compare(baseline, candidate, candidate_name, compilation_pending=False):
    """Medianas por ronda ya verificadas; no sustituye los controles A/A."""
    for metrics in (baseline, candidate):
        for name in METRICS:
            if not compilation_pending or name not in BUILD_METRICS:
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
    }
    if not compilation_pending:
        limits.update({name: baseline[name] for name in BUILD_METRICS})
    # El texto de §8 exige al fast un 10 % de CPU y no empeorar el resto.
    if candidate_name == "gpui_fast":
        for name in limits:
            if name != "cpu_cycles_s":
                limits[name] = min(limits[name], baseline[name])
    results = {name: {"value": candidate[name], "limit": limit,
                      "noise_tolerance":noise_margin(name,baseline[name]),
                      "nominal_exceeded":candidate[name]>limit,
                      "pass": candidate[name] <= limit+noise_margin(name,baseline[name])}
               for name, limit in limits.items()}
    if compilation_pending:
        results.update({name: {"value": None, "limit": None, "pass": None, "status": "pendiente_autorizado"}
                        for name in BUILD_METRICS})
    return results


def endurance_pass(data):
    return (data.get("complete") is True and data.get("duration_s", 0) >= 4 * 3600
            and data.get("crashes") == 0 and data.get("bugchecks") == 0
            and data.get("monitor_sleep_resume") is True and data.get("hide_show") is True
            and data.get("resolution_change") is True and data.get("minidump_enabled") is True
            and data.get('resolution_observed') is True
            and 0 <= number(data.get("memory_drift_fraction"), "deriva de memoria") < 0.05)


def evaluate(document):
    if document.get("schema") != 1 or document.get("configuration") != PRIMARY:
        raise InvalidEvidence("Falta el escenario principal declarado: 1 ventana con 10 Relative, 60 Hz, sin carga")
    output = {"source": "INFORME-FABLE.md §8, corregido por Isaac: una capa por monitor", "scenario": "1 ventana con 10 Relative, 60 Hz, sin carga", "hub": "pendiente", "overlays": {}, "adopted": False}
    output["measurement_contract"] = {"relative_demand_ms": 33,
        "cpu_scope":"measured process family only; dwm.exe CPU is NOT counted",
        "ipc_loss_comparison": "actual pipe sends versus subscriber receives; all origin publications retained",
        "fonts": ["Inter", "Rajdhani", "Space Mono"],
        "frame_time": "PresentMon MsBetweenPresents; presentation intervals, including on-demand cadence",
        "synthetic_load_limit": "does not measure live-game FPS or physical G-Sync"}
    output['outlier_policy']='No numeric outliers removed or winsorized. All valid samples/rounds retained; medians and detrended blocks. Only predeclared validity failures trigger whole paired-block retries, max 3; first complete attempt, never best.'
    output['endurance_method']={'M':'declarativo: confirmación del usuario, no prueba automática de suspensión',
        'R':'confirmación declarativa más cambio real de resolución y restauración observados por Windows'}
    output['noise_policy']={'relative':.025,'absolute':ABS_NOISE,'aa':'every available metric; failed round pairs requested again, variant not rejected'}
    output['retry_request']={'schema':1,'manifest_sha256':document.get('manifest_sha256'),'blocks':[]}
    output["thermal_control"] = {"cpu_temperature": None, "cpu_temperature_status": "no_disponible",
        "signals": "GPU temperature and CPU active nominal performance, performance limit and limit flags",
        "limitation": "CPU limit signals can also reflect power or policy; they do not identify heat exclusively"}
    compilation = document.get("compilation", {})
    compilation_pending = compilation.get("status") == "pending_authorized"
    output["compilation"] = {"status": "pendiente_autorizado" if compilation_pending else "sin_verificar",
                             "plan": compilation.get("plan")}
    for name in ("rune", "gpui_fast"):
        data = document.get("comparisons", {}).get(name)
        if not data:
            output["overlays"][name] = {"verdict": "pendiente", "reason": "comparación ausente"}
            continue
        if not compilation_pending:
            machines = compilation.get("machines", {})
            if (compilation.get("status") != "verified" or not machines.get("gpui")
                    or machines.get(name) != machines["gpui"]):
                raise InvalidEvidence("Compilaciones sin verificar en la misma maquina")
            output["compilation"]["status"] = "verificada_misma_maquina"
        rounds = data.get("rounds", [])
        if not 8 <= len(rounds) <= 24:
            raise InvalidEvidence("Faltan rondas completas")
        aa, ab, observed = [], [], {"gpui": [], name: []}
        aa_metrics=[];repeat=[]
        observation_ids = set();loaded_ids=set()
        for round_index, round_ in enumerate(rounds, 1):
            if round_.get("id") != round_index:
                raise InvalidEvidence("Rondas repetidas o desordenadas")
            controls, comparison = round_.get("aa", []), round_.get("ab", [])
            loaded_rows=round_.get('aa_loaded', [])
            for row in loaded_rows:
                validate_observation(row, compilation_pending)
                identity=row.get('id')
                if not identity or identity in loaded_ids:
                    raise InvalidEvidence('Observación con carga reutilizada')
                loaded_ids.add(identity)
                expected_hash=document.get('binaries',{}).get('gpui')
                if row.get('variant')!='gpui' or not isinstance(expected_hash,str) or len(expected_hash)!=64 or any(c not in '0123456789abcdef' for c in expected_hash) or row.get('binary_sha256')!=expected_hash:
                    raise InvalidEvidence('A/A con carga: hash o variante distintos')
            for row in controls + comparison:
                validate_observation(row, compilation_pending)
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
            control={metric:aa_check(controls,metric) for metric in METRICS if not compilation_pending or metric not in BUILD_METRICS}
            aa_metrics.append(control)
            failed_controls=[metric for metric,value in control.items() if not value['pass']]
            if round_.get('aa_loaded'):
                loaded_control={metric:aa_check(round_['aa_loaded'],metric) for metric in METRICS if metric in round_['aa_loaded'][0]['metrics']}
                control['loaded']=loaded_control
                failed_controls.extend('loaded.'+metric for metric,value in loaded_control.items() if not value['pass'])
            if failed_controls:
                attempts=round_.get('repair_attempts',{})
                exhausted=any(attempts.get('loaded' if metric.startswith('loaded.') else 'unloaded',0)>=2 for metric in failed_controls)
                repeat.append({'comparison':name,'round':round_index,'metrics':failed_controls,'exhausted':exhausted})
            ab.append(block_ratio(comparison, "cpu_cycles_s"))
            first, second = (controls, comparison) if round_index % 2 else (comparison, controls)
            if max(row["midpoint_qpc"] for row in first) >= min(row["midpoint_qpc"] for row in second):
                raise InvalidEvidence("Los bloques no están intercalados en el orden declarado")
        stats = interval(ab)
        if repeat:
            known_failure=any(number(data.get('endurance',{}).get(key,0),key)>0 for key in ('crashes','bugchecks')) or any(data.get('manual',{}).get(key) is False for key in CHECKLIST)
            exhausted=any(row['exhausted'] for row in repeat)
            if not known_failure and not exhausted:output['retry_request']['blocks'].extend(repeat)
            output["overlays"][name] = {"verdict": "no_adoptar" if known_failure else "inconcluso: A/A agotado" if exhausted else "repetir_bloques", "aa_ratios": aa, "aa_metrics":aa_metrics,"retry_blocks":repeat,"cpu":stats}
            continue
        medians = {variant: {metric: statistics.median(row[metric] for row in rows) for metric in METRICS if not compilation_pending or metric not in BUILD_METRICS}
                   for variant, rows in observed.items()}
        checks = compare(medians["gpui"], medians[name], name, compilation_pending)
        cpu_limit = 0.9 if name == "gpui_fast" else 1.1
        checks["cpu_cycles_s"].update(normalized_ratio=stats["median"], ratio_limit=cpu_limit,
                                       **{"pass": stats["median"] <= cpu_limit+.025})
        manual = data.get("manual", {})
        correctness = all(manual.get(check) is True for check in CHECKLIST)
        endurance = endurance_pass(data.get("endurance", {}))
        failed = [key for key, value in checks.items() if value["pass"] is False]
        verdict = "cumple_umbrales" if not failed and correctness and endurance else "no_adoptar"
        manual_pending = any(manual.get(check) is None for check in CHECKLIST)
        manual_failed = any(manual.get(check) is False for check in CHECKLIST)
        endurance_pending = data.get("endurance", {}).get("complete") is not True or data.get('endurance',{}).get('resolution_observed') is not True
        observed_crash = any(number(value, key) > 0
                             for key in ("crashes", "bugchecks")
                             if (value := data.get("endurance", {}).get(key)) is not None)
        memory_exception = (name == "rune" and bool(failed)
                            and set(failed) <= {"private_mib", "vram_mib"}
                            and all(checks[key]["value"] < checks[key]["limit"] * 1.15 for key in failed))
        if manual_pending or endurance_pending:
            verdict = "pendiente_validacion_fisica"
        if manual_failed or observed_crash or (not endurance_pending and not endurance):
            verdict = "no_adoptar"
        if failed and not memory_exception:
            verdict = "no_adoptar"
        if memory_exception and correctness and endurance:
            verdict = "consultar_isaac_solo_memoria"
        if verdict == "cumple_umbrales" and stats["ci95"][1] > cpu_limit:
            verdict = "inconcluso_intervalo_cpu"
        if verdict == "cumple_umbrales" and compilation_pending:
            verdict = "cumple_runtime_compilacion_pendiente"
        output["overlays"][name] = {"verdict": verdict, "cpu": stats, "aa_ratios": aa, "aa_metrics":aa_metrics,
                                    "endurance_action_evidence":data.get('endurance',{}).get('action_evidence',{'monitor_sleep_resume':'declarativo','resolution_change':'R declarativa; cambio/restauración debe estar observado por Windows'}),
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
    except (ValueError, KeyError, TypeError, AttributeError) as error:
        result = {"adopted": False, "verdict": "evidencia_invalida", "reason": str(error)}
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 2 if result.get("verdict") == "evidencia_invalida" else 0


if __name__ == "__main__":
    raise SystemExit(main())
