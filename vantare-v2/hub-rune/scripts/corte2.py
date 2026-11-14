#!/usr/bin/env python3
"""Mac offscreen preflight. Default prepares evidence; never launches on Windows."""
import argparse
import csv
import hashlib
import html
import json
import math
import os
from pathlib import Path
import platform
import queue
import re
import shutil
import signal
import statistics
import subprocess
import threading
import time

SCREENS = ("home", "studio", "launcher")
METRICS = ("startup_ms", "rss_idle_mib", "rss_after_navigation_mib", "switch_ms", "cpu_idle_percent_one_core", "qa_bytes")


def schedule(n):
    if n < 1:
        raise ValueError("N must be positive")
    # Each cold run has its paired warm process immediately afterwards.
    return [dict(repetition=i + 1, client=client, screen=screen, cache=cache)
            for i in range(n) for screen in SCREENS
            for client in (("rune", "electron") if i % 2 == 0 else ("electron", "rune"))
            for cache in ("cold-process", "warm-process")]


def cpu_seconds(value):
    days, clock = value.split("-", 1) if "-" in value else ("0", value)
    parts = clock.split(":")
    if len(parts) not in (2, 3):
        raise ValueError(f"Invalid ps CPU counter: {value!r}")
    seconds = float(parts[-1]) + 60 * int(parts[-2])
    if len(parts) == 3:
        seconds += 3600 * int(parts[0])
    if not math.isfinite(seconds) or seconds < 0:
        raise ValueError("Invalid CPU counter")
    return 86400 * int(days) + seconds


def processes(output):
    result = {}
    for line in output.splitlines():
        fields = line.split()
        if len(fields) != 9:
            raise ValueError(f"Unexpected ps fields: {line!r}")
        pid, parent, rss = map(int, fields[:3])
        result[pid] = dict(parent=parent, rss_mib=rss / 1024, cpu_s=cpu_seconds(fields[3]), birth=" ".join(fields[4:]))
    return result


def family(table, pid):
    selected = {pid}
    while True:
        grown = selected | {p for p, v in table.items() if v["parent"] in selected}
        if selected == grown:
            break
        selected = grown
    if pid not in table:
        raise ValueError("Hub process exited before measurement")
    return {p: table[p] for p in selected if p in table}


def cpu_percent(first, last, duration):
    if duration <= 0 or set(first) != set(last):
        raise ValueError("Process family changed during idle interval; retain invalid sample")
    delta = 0
    for pid, old in first.items():
        new = last[pid]
        if old["birth"] != new["birth"] or new["cpu_s"] < old["cpu_s"]:
            raise ValueError("PID reused or CPU counter regressed")
        delta += new["cpu_s"] - old["cpu_s"]
    return 100 * delta / duration


def footprint(path):
    paths = [path] if path.is_file() else path.rglob("*")
    seen, total = set(), 0
    for file in paths:
        if file.is_symlink() or not file.is_file():
            continue
        stat = file.stat()
        identity = (stat.st_dev, stat.st_ino)
        if identity not in seen:
            total += stat.st_size
            seen.add(identity)
    return total


def summary(rows, n):
    result = []
    for client in ("rune", "electron"):
        for screen in SCREENS:
            for cache in ("cold-process", "warm-process"):
                group = [r for r in rows if r["client"] == client and r["screen"] == screen and r["cache"] == cache]
                complete = len(group) == n and {r["repetition"] for r in group} == set(range(1, n+1)) and all(r.get("status") == "pass" and all(isinstance(r.get(metric), (int, float)) and math.isfinite(r[metric]) and r[metric] >= 0 for metric in METRICS) for r in group)
                row = dict(client=client, screen=screen, cache=cache, valid=sum(r.get("status") == "pass" for r in group), expected=n, status="PASS" if complete else "PENDIENTE / INVALIDO")
                for metric in METRICS:
                    values = [r[metric] for r in group if r.get("status") == "pass" and isinstance(r.get(metric), (int, float)) and math.isfinite(r[metric]) and r[metric] >= 0]
                    row[metric] = statistics.median(values) if complete and len(values) == n else None
                result.append(row)
    return result


def report(output, rows, n):
    result = summary(rows, n)
    (output / "summary.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    with (output / "summary.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(result[0]))
        writer.writeheader()
        writer.writerows(result)
    table = ["| Cliente / pantalla / caché | Resultado verificado | Arranque ms | RSS reposo MiB | RSS tras navegar MiB | Cambio ms | CPU % (1 núcleo) | Tamaño QA bytes |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for row in result:
        cells = [f"{row['client']} / {row['screen']} / {row['cache']}", f"{row['status']} ({row['valid']}/{n})"]
        cells += ["PENDIENTE" if row[m] is None else f"{row[m]:.3f}" for m in METRICS]
        table.append("| " + " | ".join(cells) + " |")
    text = "# Corte 2 · premedición Mac offscreen\n\nSin decisión ADR: primer frame enviado/offscreen, no presentado; CPU del modo headless continuo y tamaños QA. Frío = proceso/datos nuevos; caché del SO sin purgar.\n\n" + "\n".join(table) + "\n\nPendiente: prueba A en PC de juego, Windows 10/11, equivalencia visual/datos aceptada, coste de producción <=1,5× y demás requisitos del ADR 0108 §4. Solo con esos gates y 10 fríos/10 calientes: RSS <=0,5× Electron y arranque no más lento. Inconcluso: Electron.\n"
    (output / "CORTE-2.md").write_text(text, encoding="utf-8")
    (output / "index.html").write_text('<!doctype html><meta charset="utf-8"><title>Corte 2</title><pre>' + html.escape(text) + "</pre>", encoding="utf-8")


def ps():
    return processes(subprocess.check_output(["ps", "-axo", "pid=,ppid=,rss=,time=,lstart="], text=True, env={**os.environ, "LC_ALL": "C"}))


def session(args, cell, directory):
    directory.mkdir()
    screen = cell["screen"]
    order = list(SCREENS[SCREENS.index(screen):] + SCREENS[:SCREENS.index(screen)]) + [screen]
    env = {**os.environ, "VANTARE_HUB_HOST": "mock", "VANTARE_HUB_SCENE": {"home":"inicio-base", "studio":"studio-base", "launcher":"launcher-base"}[screen], "VANTARE_HUB_CAPTURE": f"{screen}-dark", "VANTARE_HUB_CUT2":"1", "VANTARE_HUB_CUT2_SCENE":str(args.output / f"scene-{screen}" / "shared-scene.json")}
    for key in ("VANTARE_HUB_TOKEN", "VANTARE_HUB_PIPE", "RUNE_HEADLESS_WAIT"):
        env.pop(key, None)
    if cell["client"] == "rune":
        events = []
        for i, target in enumerate(order[1:], 1):
            events += [dict(t=12*i, type="mark", name=f"nav-{target}"), dict(t=12*i, type="down", key=f"nav-{target}"), dict(t=12*i, type="up", key=f"nav-{target}")]
        script = directory / "input.json"
        script.write_text(json.dumps(events), encoding="utf-8")
        command = [str(args.rune), "--scene", "capture", "--frames", "2701", "--fps", "60", "--realtime", "--script", str(script), "--size", "1440x900", "--scale", "1", "--theme", "dark"]
    else:
        command = ["bun", str(Path(__file__).with_name("electron-corte2.mjs")), str(args.checkout / "vantare-v2/hub-web"), str(directory / "qa-data"), screen]
    t0 = time.monotonic()
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, text=True, start_new_session=True)
    messages = queue.Queue()
    def read():
        for line in process.stdout:
            messages.put((time.monotonic(), line.rstrip()))
    reader = threading.Thread(target=read, name="cut2-output")
    reader.start()
    pid = process.pid if cell["client"] == "rune" else None
    row, ready, navigation, idle, raw = {**cell, "status":"failed"}, [], None, [], []
    deadline = t0 + 120
    try:
        with (directory / "process.log").open("w", encoding="utf-8") as log:
            while time.monotonic() < deadline:
                try:
                    at, line = messages.get(timeout=0.25)
                    log.write(line + "\n"); log.flush()
                    event = json.loads(line[5:]) if line.startswith("cut2 ") else None
                    if line.startswith("rune-mark nav-"):
                        event = dict(kind="nav", screen=line.split()[1][4:])
                    if event:
                        if event["kind"] == "start":
                            t0 = at
                        elif event["kind"] == "pid":
                            pid = event["pid"]
                        elif event["kind"] == "nav":
                            if idle:
                                raise ValueError("Navigation before idle interval completed")
                            navigation = (at, event["screen"])
                        elif event["kind"] == "ready":
                            if len(ready) >= 4 or event["screen"] != order[len(ready)]:
                                raise ValueError("Unexpected useful-frame order")
                            if not ready:
                                row["startup_ms"] = 1000 * (at - t0)
                            else:
                                if not navigation or navigation[1] != event["screen"]:
                                    raise ValueError("Useful frame without matching navigation")
                                ready[-1]["switch_ms"] = 1000 * (at-navigation[0])
                            ready.append(dict(screen=event["screen"], at=at))
                            idle = [at, []]
                except queue.Empty:
                    pass
                now = time.monotonic()
                if idle and now >= idle[0] + 2:
                    table = family(ps(), pid)
                    snap = dict(at=time.monotonic(), screen=ready[-1]["screen"], family=table)
                    idle[1].append(snap); raw.append(snap)
                    if snap["at"] >= idle[0] + 7:
                        samples = idle[1]
                        first, last = samples[0], samples[-1]
                        if len(samples) < 10:
                            raise ValueError("Too few idle samples")
                        # Require stable membership in EVERY sample, not only endpoints.
                        for sample in samples[1:]:
                            cpu_percent(first["family"], sample["family"], sample["at"]-first["at"])
                        ready[-1]["cpu"] = cpu_percent(first["family"], last["family"], last["at"]-first["at"])
                        ready[-1]["rss"] = statistics.median(sum(p["rss_mib"] for p in sample["family"].values()) for sample in samples)
                        idle = []
                        if len(ready) == 4:
                            row.update(status="pass", rss_idle_mib=ready[0]["rss"], rss_after_navigation_mib=ready[-1]["rss"], cpu_idle_percent_one_core=ready[0]["cpu"], switch_ms=ready[-2]["switch_ms"])
                            break
                if process.poll() is not None and messages.empty():
                    raise ValueError(f"Adapter exited early: {process.returncode}")
            else:
                raise TimeoutError("No complete batch within 120 s")
    except Exception as error:
        row["error"] = str(error)
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
        reader.join(timeout=2)
        if reader.is_alive():
            raise RuntimeError("Output reader did not terminate; stop batch")
        (directory / "samples.json").write_text(json.dumps(raw, indent=2), encoding="utf-8")
        row["phases"] = ready
    return row


def run(args):
    plan = schedule(args.n)
    if args.command == "report":
        manifest = json.loads((args.output / "manifest.json").read_text(encoding="utf-8"))
        report(args.output, manifest["rows"], manifest["n"])
        return
    if args.command == "execute":
        if platform.system() != "Darwin" or not args.mac_cleared:
            raise ValueError("Execution requires macOS and --mac-cleared; never launch on Windows")
        if not args.checkout or not args.rune or not re.fullmatch(r"[0-9a-f]{40}", args.sha or ""):
            raise ValueError("Supply clean checkout, exact SHA and debug Rune binary")
        if args.rune.name != "vantare-hub-ui-rune" or args.rune.parent.name != "debug":
            raise ValueError("Only the owned debug QA binary is accepted")
        actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=args.checkout, text=True).strip()
        if actual != args.sha or subprocess.check_output(["git", "status", "--porcelain"], cwd=args.checkout, text=True).strip():
            raise ValueError("Source SHA mismatch or uncommitted edits")
        if shutil.disk_usage(args.output.parent).free < 12 * 1024**3:
            raise ValueError("Need at least 12 GiB free; never delete other workers' targets")
        if any(Path(line.strip()).name in ("cargo", "rustc", "rust-lld", "clang") for line in subprocess.check_output(["ps", "-axo", "comm="], text=True).splitlines()):
            raise ValueError("Compiler active on Mac; stop before any Hub launch")
    args.output.mkdir(parents=True, exist_ok=False)
    (args.output / "plan.json").write_text(json.dumps(plan, indent=2), encoding="utf-8")
    manifest = dict(schema=1, n=args.n, source_sha=args.sha, platform=platform.platform(), cores=os.cpu_count(), rows=[], mode="offscreen-debug-preflight", decision="PENDIENTE")
    report(args.output, [], args.n)
    if args.command != "execute":
        (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return
    manifest["controllers_sha256"] = {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__), Path(__file__).with_name("electron-corte2.mjs"), Path(__file__).with_name("corte2-scene.mjs"), Path(__file__).with_name("electron-capture-guard.mjs")]}
    manifest["electron_entry_sha256"] = hashlib.sha256((args.checkout / "vantare-v2/hub-web/out-qa/main/index.js").read_bytes()).hexdigest()
    manifest["rune_sha256"] = hashlib.sha256(args.rune.read_bytes()).hexdigest()
    sizes = {"rune":footprint(args.rune), "electron":footprint(args.checkout / "vantare-v2/hub-web/node_modules/electron/dist/Electron.app") + footprint(args.checkout / "vantare-v2/hub-web/out-qa")}
    manifest["scenes_sha256"] = {}
    for screen, scene in zip(SCREENS, ("inicio-base", "studio-base", "launcher-base")):
        directory = args.output / f"scene-{screen}"
        directory.mkdir()
        path = directory / "shared-scene.json"
        subprocess.run(["bun", str(Path(__file__).with_name("corte2-scene.mjs")), str(args.checkout / "vantare-v2/hub-web"), scene, str(path)], check=True, timeout=60)
        manifest["scenes_sha256"][screen] = hashlib.sha256(path.read_bytes()).hexdigest()
    for i, cell in enumerate(plan):
        if shutil.disk_usage(args.output).free < 12 * 1024**3:
            raise ValueError("Free disk below 12 GiB; batch stopped")
        row = session(args, cell, args.output / f"{i:03d}-{cell['client']}-{cell['screen']}-{cell['cache']}")
        row["qa_bytes"] = sizes[cell["client"]]
        manifest["rows"].append(row)
        (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        report(args.output, manifest["rows"], args.n)
        if row["status"] != "pass":
            raise ValueError(f"Sample failed; preserved without retries: {row.get('error')}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("plan", "execute", "report"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--n", type=int, default=10)
    parser.add_argument("--checkout", type=Path)
    parser.add_argument("--rune", type=Path)
    parser.add_argument("--sha")
    parser.add_argument("--mac-cleared", action="store_true")
    run(parser.parse_args())
