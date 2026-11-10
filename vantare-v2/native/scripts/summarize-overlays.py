"""Summarize VANTA-139 raw measurement evidence; standard library only."""
import collections
import csv
import json
import pathlib
import re
import sys

def number(value):
    # Read older PowerShell CSV produced under a decimal-comma locale too.
    return float(value.replace(",", "."))


def summarize(root):
    if not (root / "complete.txt").exists():
        raise ValueError("incomplete run")
    with (root / "process.csv").open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    # Exclude the two-second window creation warmup and final idle/drain.
    active = [r for r in rows if 3 <= number(r["seconds"]) <= number(rows[-1]["seconds"]) - 3]
    if len(active) < 2:
        raise ValueError("recording too short for a steady interval")
    duration = number(active[-1]["seconds"]) - number(active[0]["seconds"])
    cpu = number(active[-1]["cpu_seconds"]) - number(active[0]["cpu_seconds"])
    out = (root / "stdout.log").read_text(encoding="utf-8-sig")
    err = (root / "stderr.log").read_text(encoding="utf-8-sig")
    frames = sum(map(int, re.findall(r"^frames/s=(\d+)", out, re.M)))
    steady_frames = sum(int(active[0]["qpc"]) <= int(tick) <= int(active[-1]["qpc"])
                        for tick in re.findall(r"perf frame .*?clock=Some\((\d+)\)", err))
    presents = re.findall(r"perf present clock=Some\((\d+)\)", err)
    steady_presents = sum(int(active[0]["qpc"]) <= int(tick) <= int(active[-1]["qpc"])
                          for tick in presents)
    frame_count = steady_presents if presents else steady_frames
    stages = collections.defaultdict(lambda: collections.Counter())
    for name, calls, wall, cycles, errors in re.findall(
        r"perf stage=(\w+) calls=(\d+) wall_ns=(\d+) cpu_cycles=(\d+) cycle_errors=(\d+)", err
    ):
        stages[name].update(calls=int(calls), wall_ns=int(wall), cpu_cycles=int(cycles), cycle_errors=int(errors))
    notifications = collections.Counter(re.findall(r"perf notify widget=([^ ]+)", err))
    changed = collections.Counter(re.findall(r"perf notify widget=[^ ]+ epoch=(\d+) seq=(\d+)", err))
    data_paints = collections.Counter(re.findall(r"perf data_paint widget=[^ ]+ epoch=(\d+) seq=(\d+)", err))
    repaints = collections.Counter()
    for name, count in re.findall(r"([^\s]+) render=\d+ paint=(\d+)", out):
        repaints[name] += int(count)
    result = {
        "metadata": json.loads((root / "metadata.json").read_text(encoding="utf-8-sig")),
        "steady_seconds": duration, "steady_cpu_seconds": cpu,
        "steady_logical_cores": cpu / duration,
        "steady_screen_frames": steady_frames,
        "steady_present_calls": steady_presents if presents else None,
        "frame_counter": "dxgi_present" if presents else "screen_render_proxy" if frames else "disabled",
        "steady_cpu_ms_per_frame": cpu * 1000 / frame_count if frame_count else None,
        "steady_cpu_ms_per_screen_frame": cpu * 1000 / steady_frames if steady_frames else None,
        "mean_private_mib": sum(int(r["private_bytes"]) for r in active) / len(active) / 2**20,
        "peak_private_mib": max(int(r["private_bytes"]) for r in rows) / 2**20,
        "reported_frames_full_run": frames,
        "cpu_ms_per_frame_full_run": number(rows[-1]["cpu_seconds"]) * 1000 / frames if frames else None,
        "notifications_full_run": dict(notifications), "widget_paints_full_run": dict(repaints),
        "changed_widgets_per_changed_snapshot": sum(changed.values()) / len(changed) if changed else None,
        "data_widget_paints_per_painted_snapshot": sum(data_paints.values()) / len(data_paints) if data_paints else None,
        "stages_full_run": dict(stages),
        "limits": "steady CPU/frame uses common QPC endpoints, excludes warmup/drain. Full-run CPU/frame includes startup/idle. Stages overlap: do not sum. wall_ns is elapsed time, cycles are not CPU nanoseconds. layout is widget planning; gpui_layout_compute brackets root layout plus framework overhead. frame_counter identifies DXGI calls or the legacy Screen proxy, whose total must match Present; neither proves physical display presents. Changed widgets counts data notifications; animations can repaint independently; counts are coalesced by GPUI.",
    }
    (root / "summary.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    summarize(pathlib.Path(sys.argv[1]))
