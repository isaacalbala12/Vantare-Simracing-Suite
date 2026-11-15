"""Run the prepared Standings batch OFFSCREEN on the authorized gaming PC only.

No build, no GPUI windows, no account, no source pipe. The orchestrator allocates
the capture session; running this script is never part of server/CI validation.
"""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess


def inside(root, relative):
    value = (root / relative).resolve()
    if not value.is_relative_to(root) or Path(relative).is_absolute():
        raise ValueError("Capture path escapes the plan")
    return value


def run(plan_file, executable, launch=subprocess.run):
    if os.environ.get("VANTARE_SIN_GRAFICOS") == "1":
        raise ValueError("Graphics disabled: do not run capture on the server")
    root = plan_file.resolve().parent
    plan = json.loads(plan_file.read_text(encoding="utf-8"))
    if plan.get("version") != 1 or not re.fullmatch(r"[0-9a-f]{40}", plan.get("commit", "")) or plan.get("rune_rev") != "d5338988a7c1b3377adb60853815b6d0843dae7c" or not plan.get("entries"):
        raise ValueError("Invalid plan identity; no renderer launched")
    executable = executable.resolve(strict=True)
    # Validate the whole batch before starting any renderer.
    for entry in plan["entries"]:
        layout = inside(root, entry["layout"])
        snapshot = inside(root, entry["snapshot"])
        output = inside(root, entry["rune_png"])
        expected = hashlib.sha256(snapshot.read_bytes() + b"\0" + layout.read_bytes()).hexdigest()
        if entry["input_sha256"] != expected or entry["scale"] not in (1, 1.25, 1.5):
            raise ValueError("Input identity or scale changed after preparing the plan")
        instances = json.loads(layout.read_text(encoding="utf-8"))["instances"]
        if len(instances) != 1 or instances[0]["settings"]["kind"] != "standings":
            raise ValueError("Only a single Standings per scene is supported")
        if output.exists() or output.with_suffix(".capture.txt").exists():
            raise ValueError("A previous capture exists; use a new empty batch")
    with executable.open("rb") as stream:
        binary_sha = hashlib.file_digest(stream, "sha256").hexdigest()
    rows = []
    for entry in plan["entries"]:
        output = inside(root, entry["rune_png"])
        launch([str(executable), "--capture-scene", "--layout", str(inside(root, entry["layout"])),
                "--snapshot", str(inside(root, entry["snapshot"])), "--output", str(output),
                "--scale", str(entry["scale"])], check=True, timeout=45)
        identity = dict(line.split("=", 1) for line in output.with_suffix(".capture.txt").read_text(encoding="utf-8").splitlines())
        if identity["commit"] != plan["commit"] or identity["rune_rev"] != plan["rune_rev"]:
            raise ValueError("Executable differs from the plan commit; capture preserved, not accepted")
        with output.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        rows.append({**entry, "rune_key": entry["rune_key"] + ":binary:" + binary_sha,
                     "binary_sha256": binary_sha, "png_sha256": digest, "identity": identity})
    record = root / "rune-captures.json"
    with record.open("x", encoding="utf-8") as stream:
        json.dump({"status": "captured-not-reviewed", "entries": rows}, stream, indent=2)
    print(f"{len(rows)} Rune images; GPUI pairing and visual review still pending: {record}")
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--exe", type=Path, required=True)
    args = parser.parse_args()
    run(args.plan, args.exe)


if __name__ == "__main__":
    main()
