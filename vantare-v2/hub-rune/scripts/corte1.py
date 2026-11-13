#!/usr/bin/env python3
"""Plan CPU-only everywhere; execute serialized Rune captures only on macOS after clearance."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import struct
import subprocess
import time

CASES = [
    ("marco", "frame-expanded", "inicio-base", "inicio-base", "expanded"),
    ("marco", "frame-collapsed", "inicio-base", "inicio-base", "collapsed"),
    ("roadmap", "published", "roadmap-published", "roadmap-publicado", "roadmap"),
    ("roadmap", "empty", "roadmap-base", "roadmap-base", "roadmap"),
    ("roadmap", "error", "roadmap-error", None, "roadmap"),
] + [("inicio", scene, scene, scene, "home") for scene in (
    "inicio-base", "inicio-vacio", "inicio-cargando", "inicio-error", "inicio-lanzando", "inicio-sin-diseno")]


def plan():
    result = []
    for group, case, host, reference, preset in CASES:
        for theme in ("light", "dark"):
            for scale in (1, 1.25, 1.5):
                percentage = round(scale * 100)
                variant = f"frame-{preset}" if group == "marco" else preset
                result.append(dict(id=f"{group}-{case}-{theme}-{percentage}", group=group,
                    host_scene=host, preset=f"{variant}-{theme}", theme=theme, scale=scale,
                    logical=[1440, 900], physical=[round(1440*scale), round(900*scale)],
                    electron_scene=reference,
                    sidebar="expanded" if preset == "expanded" else "collapsed",
                    scope="frame-only" if group == "marco" else "whole-client"))
    return result


def png_size(path):
    with path.open("rb") as stream:
        header = stream.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise ValueError(f"Not a PNG: {path}")
    return list(struct.unpack(">II", header[16:24]))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args):
    if not args.execute:
        args.output.mkdir(parents=True, exist_ok=True)
        (args.output / "plan.json").write_text(json.dumps(plan(), indent=2)+"\n", encoding="utf-8")
        print(f"Prepared {len(plan())} captures. No graphics, SSH or compilation executed.")
        return
    if platform.system() != "Darwin":
        raise SystemExit("Execution is macOS-only. Never run Rune captures on the Windows server.")
    if not args.mac_cleared:
        raise SystemExit("Wait for the orchestrator, then explicitly pass --mac-cleared.")
    if not args.checkout or not args.binary or not args.sha:
        raise SystemExit("Execution needs --checkout, --binary and --sha.")
    checkout, binary = args.checkout.resolve(), args.binary.resolve()
    if binary.parent.name != "debug" or binary.name != "vantare-hub-ui-rune":
        raise SystemExit("Use the debug Hub binary, not a measurement or release executable.")
    actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=checkout, text=True).strip()
    if actual != args.sha or subprocess.check_output(["git", "status", "--porcelain"], cwd=checkout, text=True).strip():
        raise SystemExit("Checkout must be clean and match --sha exactly.")
    processes = subprocess.check_output(["ps", "-axo", "comm="], text=True)
    if any(Path(line.strip()).name in ("cargo", "cargo-xwin", "rustc") for line in processes.splitlines()):
        raise SystemExit("Another compiler is active: do not compete with VANTA-141.")
    if not binary.is_file():
        raise SystemExit("Build debug+macOS after clearance; this script never compiles.")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    rows = []
    for cell in plan():
        if shutil.disk_usage(output).free < 12 * 1024**3:
            raise SystemExit("Stop: fewer than 12 GiB free; no target deletion performed.")
        directory = output / cell["group"] / cell["id"]
        directory.mkdir(parents=True)
        env = os.environ.copy()
        for key in ("VANTARE_HUB_PIPE", "VANTARE_HUB_TOKEN"):
            env.pop(key, None)
        env.update(VANTARE_HUB_HOST="mock", VANTARE_HUB_SCENE=cell["host_scene"], VANTARE_HUB_CAPTURE=cell["preset"])
        record = dict(cell, source_sha=actual, binary_sha256=digest(binary), platform=platform.platform(), status="failed")
        start = time.monotonic()
        try:
            destination = directory / "rune.png"
            # Advance virtual time for asynchronous assets; export only the final snap.
            command = [str(binary), "--scene", "capture", "--theme", cell["theme"], "--size", "1440x900",
                "--scale", str(cell["scale"]), "--frames", "181", "--snap", str(destination)]
            record["command"] = command
            with (directory / "rune.log").open("wb") as log:
                subprocess.run(command, env=env, cwd=checkout, stdout=log, stderr=subprocess.STDOUT, timeout=180, check=True)
            if png_size(destination) != cell["physical"]:
                raise ValueError("Physical dimensions mismatch")
            record.update(status="captured", png_sha256=digest(destination), png=str(destination.relative_to(output)))
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            record["error"] = str(error)
        record["seconds"] = time.monotonic()-start
        rows.append(record)
        (output / "manifest.json").write_text(json.dumps(rows, indent=2)+"\n", encoding="utf-8")
        if record["status"] != "captured":
            raise SystemExit(f"Stopped at {cell['id']}; preserve logs, do not hide or retry automatically.")
    print(output / "manifest.json")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--mac-cleared", action="store_true")
    parser.add_argument("--checkout", type=Path)
    parser.add_argument("--binary", type=Path)
    parser.add_argument("--sha")
    run(parser.parse_args())
