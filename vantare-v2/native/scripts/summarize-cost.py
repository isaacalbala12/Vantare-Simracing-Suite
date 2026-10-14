"""Resume solo campañas completas; los contadores por fase no son muestreo."""
import argparse
import json
import re
import statistics
from pathlib import Path

MODES = ("normal", "no-flows", "no-validation", "no-both")


def load_campaign(root):
    if (root / "INCOMPLETE.txt").exists() or not (root / "complete.txt").exists():
        raise ValueError("Campaña incompleta: no calcular medias")
    results = {}
    for round_number in range(1, 4):
        for mode in MODES:
            result = json.loads((root / f"{round_number}-{mode}-result.json").read_text(encoding="utf-8-sig"))
            if not result["Valid"] or result["Seconds"] < 90 or result["ProfileOnly"] or result["PhaseOnly"]:
                raise ValueError("Brazo inválido o instrumentado")
            results[round_number, mode] = result
    return results


def cpu(result, name):
    return next(process["CPUOneCore"] for process in result["Processes"] if process["Name"] == name)


def paired_delta(results, before, after):
    return [cpu(results[r, before], "vantare-core") - cpu(results[r, after], "vantare-core") for r in range(1, 4)]


def phases(root, result, log, process_name):
    process = next(p for p in result["Processes"] if p["Name"] == process_name)
    totals = {}
    report_qpc = 0
    for line in (root / log).read_text(encoding="utf-8-sig", errors="replace").splitlines():
        header = re.search(r"perf process_cycles=.* clock=Some\((\d+)\)", line)
        if header:
            report_qpc = int(header[1])
        stage = re.search(r"perf stage=(\w+) calls=(\d+) wall_ns=(\d+) cpu_cycles=(\d+) cycle_errors=(\d+)", line)
        if stage and result["StartQpc"] <= report_qpc <= result["EndQpc"]:
            counts = totals.setdefault(stage[1], [0, 0, 0, 0])
            for i in range(4):
                counts[i] += int(stage[i + 2])
    rows = [{"Stage": name, "CallsPerSecond": counts[0] / result["Seconds"],
             "WallMsPerSecond": counts[1] / 1e6 / result["Seconds"],
             "ThreadCycles": counts[2], "CycleShareInclusivePct": 100 * counts[2] / process["CycleDelta"] if process["CycleDelta"] else None,
             "CycleErrors": counts[3]} for name, counts in totals.items()]
    return sorted(rows, key=lambda row: row["ThreadCycles"], reverse=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("live", type=Path)
    parser.add_argument("--phases", type=Path)
    args = parser.parse_args()
    results = load_campaign(args.live)
    summary = {"arms": {}, "paired_deltas": {}}
    print("CPU: % de un núcleo lógico; tres rondas completas. Capturas requieren revisión visual.")
    print("| Brazo | Core media [mín–máx] | UI media [mín–máx] |")
    print("|---|---:|---:|")
    for mode in MODES:
        values = [[cpu(results[r, mode], name) for r in range(1, 4)] for name in ("vantare-core", "vantare-overlays")]
        summary["arms"][mode] = values
        columns = [f"{statistics.mean(v):.4f} [{min(v):.4f}–{max(v):.4f}]" for v in values]
        print(f"| {mode} | {' | '.join(columns)} |")
    for label, before, after in (("journal+Series", "normal", "no-flows"), ("validación", "normal", "no-validation"), ("ambos", "normal", "no-both")):
        values = paired_delta(results, before, after)
        summary["paired_deltas"][label] = values
        print(f"{label}: {statistics.mean(values):.4f} puntos; parejas [{min(values):.4f}, {max(values):.4f}].")
    extra = statistics.mean(summary["paired_deltas"]["ambos"])
    if extra >= 0:
        # Escenarios de transferencia, no intervalo de confianza ni Go implementado.
        ratio = 0.5476 / 3.3061  # #1466 live-split250/attribution.json, histórico.
        print(f"Go equivalente (escenarios, NO medido): {0.5476 + extra * ratio:.4f}–{0.5476 + extra:.4f}%; ratio histórico {ratio:.4f}.")
    else:
        print("Extra conjunto negativo: no sustenta estimación de Go equivalente.")
    if args.phases:
        result = json.loads((args.phases / "1-normal-result.json").read_text(encoding="utf-8-sig"))
        if not result["PhaseOnly"] or not result["Valid"] or result["Seconds"] < 90 or (args.phases / "INCOMPLETE.txt").exists():
            raise ValueError("Pasada de fases inválida")
        summary["phases"] = {"core": phases(args.phases, result, "1-normal-core.err.log", "vantare-core"),
                             "ui": phases(args.phases, result, "1-normal-ui.err.log", "vantare-overlays")}
        print("Fases: participación de ciclos inclusiva; no sumar. QPC mide wall, no CPU. Bordes~1s.")
        for process_name, rows in summary["phases"].items():
            print(process_name + ": " + "; ".join(f"{row['Stage']}={row['CycleShareInclusivePct']:.1f}%/{row['CallsPerSecond']:.1f}Hz" for row in rows[:15] if row["CycleShareInclusivePct"] is not None))
    (args.live / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
