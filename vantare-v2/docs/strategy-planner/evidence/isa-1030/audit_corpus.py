"""Audit-only corpus split and bounded observations; never changes source data."""
from __future__ import annotations

import argparse
import collections
import csv
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys


def load_spike(path: Path):
    spec = importlib.util.spec_from_file_location("isa1030_spike", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def write(path: Path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def verify_runtime(runtime: Path, trust: str):
    manifest = runtime / "manifest.json"
    if hashlib.sha256(manifest.read_bytes()).hexdigest() != trust:
        raise ValueError("runtime manifest differs from approved trust")
    for entry in json.loads(manifest.read_text(encoding="utf-8"))["files"]:
        path = runtime / entry["name"]
        if path.parent.resolve() != runtime.resolve():
            raise ValueError("invalid manifest path")
        if path.stat().st_size != entry["size"] or hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
            raise ValueError("runtime file differs from manifest")


def split(args, spike):
    rows = list(csv.DictReader(args.inventory.open(encoding="utf-8-sig", newline="")))
    by_prefix = collections.defaultdict(list)
    for row in rows:
        by_prefix[row["session_id"].split("-")[-1]].append(row)
    candidates, discovery = spike.discover_candidates(args.source, 30)
    records, private, seen = [], {}, set()
    changed, duplicated, unmatched = 0, 0, 0
    historical = json.loads(args.historical.read_text(encoding="utf-8"))
    exposed = {sid.split("-")[-1] for sid in historical.get("analysis_session_ids", [])}
    for candidate in candidates:
        digest = spike.sha256_file(candidate.path)
        after = candidate.path.stat()
        if (after.st_size, after.st_mtime_ns) != (candidate.size, candidate.mtime_ns) or Path(str(candidate.path) + ".wal").exists():
            changed += 1
            continue
        matches = by_prefix.get(digest[:8], [])
        if not matches:
            unmatched += 1
            continue
        if len({(r["date_utc"], r["source_bytes"]) for r in matches}) > 1:
            raise ValueError("ambiguous historical hash prefix; full re-inventory needed")
        row = matches[0]
        if int(row["source_bytes"]) != candidate.size:
            raise ValueError("inventory source size differs")
        if digest in seen:
            duplicated += 1
            continue
        seen.add(digest)
        sid = "sha256:" + digest
        combo = ["LMU", row["track"], row["layout"], row["class"], row["car"]]
        record = {
            "id": sid, "inventory_id": row["session_id"], "combination": combo,
            "date": row["date_utc"], "type": row["session_type"],
            "laps": int(row["laps"] or 0), "duration_s": float(row["duration_s"] or 0),
            "continuous_span_s": float(row["continuous_span_s"] or 0),
            "weather": row["weatherconditions"], "bytes": candidate.size,
            "prior_spike_analysis": digest[:8] in exposed,
            "race_completion": "unverified", "partition": "training",
        }
        records.append(record)
        private[sid] = {"path": str(candidate.path), "mtime_ns": candidate.mtime_ns}
    groups = collections.defaultdict(list)
    for record in records:
        groups[tuple(record["combination"])].append(record)
    cutoffs = []
    for combo, members in sorted(groups.items()):
        members.sort(key=lambda r: (r["date"], r["id"]))
        races = [r for r in members if "race" in r["type"].casefold() and r["laps"] > 0 and not r["prior_spike_analysis"]]
        if not races:
            continue
        reserved = races[-max(1, math.ceil(len(races) * 0.20)):]
        cutoff = min(r["date"] for r in reserved)
        if not any(r["date"] < cutoff and r["laps"] > 0 for r in members):
            continue
        reserved_ids = {r["id"] for r in reserved}
        for record in members:
            if record["id"] in reserved_ids:
                record["partition"] = "evaluation_candidate"
            elif record["date"] >= cutoff:
                record["partition"] = "embargo"
        cutoffs.append({"combination": list(combo), "cutoff": cutoff})
    partitions = collections.Counter(r["partition"] for r in records)
    for cutoff in cutoffs:
        assert all(r["date"] < cutoff["cutoff"] for r in records if r["combination"] == cutoff["combination"] and r["partition"] == "training")
    manifest = {"version": "isa1030.split.v1", "policy": "latest20pct-unexposed-race-candidates-per-exact-combination", "discovery": discovery, "changed": changed, "duplicates": duplicated, "unmatched": unmatched, "partitions": dict(partitions), "cutoffs": cutoffs, "records": records}
    write(args.output / "split-manifest.json", manifest)
    write(args.output / "_private-sources.json", private)
    print(json.dumps({"records": len(records), "combinations": len(groups), "cutoffs": len(cutoffs), "partitions": partitions, "changed": changed, "duplicates": duplicated, "unmatched": unmatched}))


def inspect(args, spike):
    manifest = json.loads((args.output / "split-manifest.json").read_text(encoding="utf-8"))
    private = json.loads((args.output / "_private-sources.json").read_text(encoding="utf-8"))
    by_id = {r["inventory_id"]: r for r in manifest["records"]}
    selected = [by_id[sid] for sid in args.sessions]
    if any(r["partition"] != "training" for r in selected):
        raise ValueError("only training sources can be inspected")
    verify_runtime(args.runtime, args.trust)
    for record in selected:
        source = Path(private[record["id"]]["path"])
        stat = source.stat()
        if stat.st_size != record["bytes"] or spike.sha256_file(source) != record["id"].split(":")[1]:
            raise ValueError("source changed since split")
        candidate = spike.Candidate(source, stat.st_size, stat.st_mtime_ns, record["date"])
        candidate.session_id = record["inventory_id"]
        candidate.duration_s = record["duration_s"]
        candidate.continuous_span_s = record["continuous_span_s"]
        candidate.laps = record["laps"]
        staged, digest = spike.safe_stage(candidate)
        try:
            if digest != record["id"].split(":")[1]:
                raise ValueError("staged content differs from split")
            with spike.HelperSession(args.runtime, staged, candidate.size, digest) as helper:
                catalog = helper.catalog()
                channels = spike.channel_map(catalog)
                candidate.metadata = spike.metadata_dict(catalog)
                summaries = []
                events = {}
                keywords = ("lap", "valid", "impact", "spin", "flag", "finish", "session", "pit", "traction", "orientation")
                explicit = {"Fuel Level", "Virtual Energy", "Tyres Wear", "Track Temperature", "Ambient Temperature", "Time Behind Next", "TyresCompound", "Minimum Path Wetness"}
                for name, channel in channels.items():
                    summaries.append({"name": name, "kind": channel["kind"], "frequency_hz": channel.get("frequency_hz"), "columns": channel.get("columns"), "unit": channel.get("unit")})
                    if channel["kind"] == "events" and (any(k in name.casefold() for k in keywords) or name in explicit):
                        rows = spike.read_all(helper, name, max_rows=100_000)
                        events[name] = rows
                write(args.output / (record["inventory_id"] + "-observations.json"), {"source_id": record["id"], "partition": "training", "metadata": candidate.metadata, "channels": summaries, "events": events, "note": "raw audit observations local only; event timestamps are not aligned to continuous clocks"})
        finally:
            staged.unlink(missing_ok=True)
        # Historical analysis is descriptive only, never independent truth labels.
        analysis = spike.analyze_session(candidate, args.runtime)
        analysis["source_id"] = record["id"]
        analysis["label_authority"] = "historical_spike_not_ground_truth"
        write(args.output / (record["inventory_id"] + "-analysis.json"), analysis)
        print(json.dumps({"session": record["inventory_id"], "lap_records": len(analysis["lap_records"]), "partition": "training"}), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("split", "inspect"))
    parser.add_argument("--spike", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--inventory", type=Path)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--historical", type=Path)
    parser.add_argument("--runtime", type=Path)
    parser.add_argument("--trust")
    parser.add_argument("--sessions", nargs="+", default=[])
    args = parser.parse_args()
    if not args.output.is_dir():
        parser.error("output must be an existing private audit directory")
    if args.mode == "split" and (args.output / "split-manifest.json").exists():
        parser.error("split already frozen; use a new directory for a new protocol")
    spike = load_spike(args.spike)
    spike.OUTPUT_DIR = args.output
    spike.WORK_DIR = args.output / "_audit-staging"
    if args.mode == "split":
        split(args, spike)
    else:
        inspect(args, spike)


if __name__ == "__main__":
    main()
