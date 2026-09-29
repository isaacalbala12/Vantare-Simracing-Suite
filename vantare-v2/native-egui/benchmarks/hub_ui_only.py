"""Windows-only, UI-only process probe for the Orbit harness and egui Hub.

This measures a controlled static page, not Wails, telemetry or production parity.
Requires the already-installed local Python playwright and psutil packages.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import socket
import statistics
import subprocess
import sys
import tempfile
import time
import urllib.request

from playwright.sync_api import sync_playwright
import psutil


ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "frontend"
NATIVE = ROOT / "native-egui" / "target" / "release" / "vantare-native-egui.exe"
FROZEN = dt.datetime(2026, 7, 7, 18, 7, 30, tzinfo=dt.timezone.utc)
STILL_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}"


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def stop_tree(pid: int) -> None:
    try:
        root = psutil.Process(pid)
        children = root.children(recursive=True)
        for process in children:
            process.terminate()
        root.terminate()
        _, alive = psutil.wait_procs(children + [root], timeout=4)
        for process in alive:
            process.kill()
    except psutil.NoSuchProcess:
        pass


def wait_http(url: str, deadline: float = 30) -> None:
    until = time.monotonic() + deadline
    while time.monotonic() < until:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except (OSError, TimeoutError):
            pass
        time.sleep(0.2)
    raise RuntimeError(f"No response from {url}")


def processes(pid: int) -> list[psutil.Process]:
    try:
        root = psutil.Process(pid)
        return [root, *root.children(recursive=True)]
    except psutil.NoSuchProcess:
        return []


def snapshot(pid: int) -> dict:
    cpu = {}
    uss = rss = private = 0
    names = []
    for process in processes(pid):
        try:
            times = process.cpu_times()
            memory = process.memory_full_info()
            cpu[process.pid] = times.user + times.system
            uss += memory.uss
            rss += memory.rss
            private += memory.private
            names.append(process.name())
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return {"cpu": cpu, "uss": uss, "rss": rss, "private": private, "names": names}


def sample(pid: int, seconds: int) -> dict:
    points = []
    before = snapshot(pid)
    started = time.monotonic()
    for index in range(seconds):
        time.sleep(max(0, started + index + 1 - time.monotonic()))
        after = snapshot(pid)
        cpu_seconds = sum(
            max(0, value - before["cpu"].get(child, 0))
            for child, value in after["cpu"].items()
        )
        points.append({
            "cpu_seconds": cpu_seconds,
            "uss_mib": after["uss"] / 1048576,
            "rss_mib_sum": after["rss"] / 1048576,
            "private_commit_mib": after["private"] / 1048576,
            "processes": len(after["names"]),
            "system_cpu_percent": psutil.cpu_percent(interval=None),
        })
        before = after
    return {
        "duration_seconds": seconds,
        "cpu_core_percent": round(100 * sum(p["cpu_seconds"] for p in points) / seconds, 3),
        "uss_mib_median": round(statistics.median(p["uss_mib"] for p in points), 2),
        "rss_mib_sum_median": round(statistics.median(p["rss_mib_sum"] for p in points), 2),
        "private_commit_mib_median": round(statistics.median(p["private_commit_mib"] for p in points), 2),
        "process_count_median": statistics.median(p["processes"] for p in points),
        "system_cpu_percent_median": round(statistics.median(p["system_cpu_percent"] for p in points), 2),
        "points": points,
    }


def rust_run(seconds: int, backend: str) -> dict:
    env = os.environ.copy()
    if backend:
        env["WGPU_BACKEND"] = backend
    else:
        env.pop("WGPU_BACKEND", None)
    app = subprocess.Popen([str(NATIVE), "--mode", "hub"], cwd=ROOT, env=env)
    try:
        time.sleep(7)
        if app.poll() is not None:
            raise RuntimeError(f"Rust Hub exited: {app.returncode}")
        idle = sample(app.pid, seconds)
        return {"kind": "egui-release", "wgpu_backend": backend or "default", "pid": app.pid, "idle": idle}
    finally:
        stop_tree(app.pid)


def browser_run(playwright_engine, seconds: int, scratch: Path) -> dict:
    vite_port = free_port()
    devtools_port = free_port()
    url = f"http://127.0.0.1:{vite_port}/orbit-home-harness.html?view=inicio"
    env = {**os.environ, "VITE_RUNTIME_MOCK": "mock"}
    vite = subprocess.Popen(
        ["node", str(FRONTEND / "node_modules" / "vite" / "bin" / "vite.js"),
         "--host", "127.0.0.1", "--port", str(vite_port), "--strictPort"],
        cwd=FRONTEND, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    chrome = None
    browser = None
    try:
        wait_http(url)
        profile = scratch / f"chrome-{vite_port}"
        chrome = subprocess.Popen(
            [playwright_engine.chromium.executable_path,
             f"--user-data-dir={profile}", f"--remote-debugging-port={devtools_port}",
             "--remote-debugging-address=127.0.0.1", "--no-first-run",
             "--no-default-browser-check", "--disable-extensions", "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        wait_http(f"http://127.0.0.1:{devtools_port}/json/version")
        browser = playwright_engine.chromium.connect_over_cdp(f"http://127.0.0.1:{devtools_port}")
        context = browser.contexts[0]
        page = context.pages[0]
        page.set_viewport_size({"width": 1920, "height": 1080})
        page.emulate_media(reduced_motion="reduce")
        page.add_init_script(f"document.addEventListener('DOMContentLoaded',()=>{{let s=document.createElement('style');s.textContent={json.dumps(STILL_CSS)};document.head.append(s)}})")
        page.clock.install(time=FROZEN)
        page.goto(url, wait_until="networkidle")
        page.get_by_test_id("orbit-home").wait_for()
        page.get_by_test_id("orbit-mini-stage").wait_for()
        page.clock.set_fixed_time(FROZEN)
        page.evaluate("document.fonts.ready")
        page.wait_for_timeout(5000)
        idle = sample(chrome.pid, seconds)
        return {"kind": "chromium-react-harness", "pid": chrome.pid, "idle": idle}
    finally:
        if browser is not None:
            browser.close()
        if chrome is not None:
            stop_tree(chrome.pid)
        stop_tree(vite.pid)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seconds", type=int, default=15)
    parser.add_argument("--order", default="browser,rust,rust,browser")
    parser.add_argument("--wgpu-backend", default="")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if sys.platform != "win32" or args.seconds < 5 or not NATIVE.is_file():
        raise SystemExit("Requires Windows, release executable, and at least 5 seconds")
    result = {
        "purpose": "Preliminary UI-only static-state comparison; no Wails, Go or LMU",
        "frontend_ref": "origin/nightly@c4c7a5ceb60995db191078aca03085a1e56a063e",
        "rust_ref": "vantareapp/isa-1414-rust-egui-hub-foundation",
        "viewport": "1920x1080 @ deviceScaleFactor 1",
        "logical_processors": psutil.cpu_count(logical=True),
        "versions": {"python": sys.version.split()[0], "psutil": psutil.__version__,
                     "playwright_python": __import__("importlib.metadata", fromlist=["version"]).version("playwright")},
        "runs": [],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="vantare-ui-bench-") as scratch_name:
        scratch = Path(scratch_name).resolve()
        if Path(os.path.commonpath([scratch, Path(tempfile.gettempdir()).resolve()])) != Path(tempfile.gettempdir()).resolve():
            raise RuntimeError("Temporary profile is outside the system temporary directory")
        with sync_playwright() as engine:
            for kind in args.order.split(","):
                if kind not in ("browser", "rust"):
                    raise ValueError(f"Invalid run kind: {kind}")
                run = browser_run(engine, args.seconds, scratch) if kind == "browser" else rust_run(args.seconds, args.wgpu_backend)
                result["runs"].append(run)
                args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
                print(kind, "idle", run["idle"]["cpu_core_percent"],
                      run["idle"]["uss_mib_median"], flush=True)
    args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
