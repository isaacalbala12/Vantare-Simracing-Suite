#!/usr/bin/env python3
"""Spike F0-1 de ISA-694 sobre copias privadas de DuckDB de LMU.

No importa duckdb ni abre originales con DuckDB. Selecciona solo ficheros sin
WAL y estables, los copia uno a uno como ``session.duckdb`` dentro del
worktree, verifica que el original no cambió y consulta la copia mediante el
helper firmado que instala Vantare. Los resultados persistidos contienen
metadata de producto permitida y agregados; nunca rutas ni telemetría cruda.
"""

from __future__ import annotations

import argparse
import base64
import csv
import datetime as dt
import gzip
import hashlib
import json
import math
import os
import re
import shutil
import statistics
import struct
import subprocess
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Sequence


PROTOCOL_VERSION = 1
HELPER_VERSION = "1"
DUCKDB_VERSION = "v1.5.5"
SCHEMA_VERSION = 1
MAX_PAGE = 16_384
DEFAULT_SOURCE = Path(
    r"C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Telemetry"
)
DEFAULT_RUNTIME = (
    Path(os.environ.get("LOCALAPPDATA", ""))
    / "Programs"
    / "Vantare Simracing Suite"
    / "runtime"
    / "telemetry"
    / "duckdb-v1"
)
OUTPUT_DIR = Path(__file__).resolve().parent
WORK_DIR = OUTPUT_DIR / "_runtime-work"
ALLOWED_METADATA = {
    "CarClass",
    "CarName",
    "SessionType",
    "TrackLayout",
    "TrackName",
    "Version",
    "WeatherConditions",
}
DATE_RE = re.compile(r"_(\d{4}-\d{2}-\d{2}T\d{2}_\d{2}_\d{2}Z)\.duckdb$", re.I)

TARGET_GROUPS: dict[str, tuple[str, ...]] = {
    "fuel_level": ("Fuel Level",),
    "virtual_energy": ("Virtual Energy",),
    "tyres_wear": ("Tyres Wear",),
    "fuel_mixture": ("FuelMixtureMap",),
    "minimum_path_wetness": ("Minimum Path Wetness",),
    "offpath_wetness": ("OffpathWetness",),
    "cloud_darkness": ("CloudDarkness",),
    "tyres_pressure": ("TyresPressure",),
    "tyres_compound": ("TyresCompound",),
    "temperatures": (
        "Ambient Temperature",
        "Track Temperature",
        "TyresCarcassTemp",
        "TyresRimTemp",
        "TyresRubberTemp",
        "TyresTempCentre",
        "TyresTempLeft",
        "TyresTempRight",
    ),
}


class SpikeError(RuntimeError):
    pass


@dataclass
class Candidate:
    path: Path
    size: int
    mtime_ns: int
    date_utc: str
    source_hash: str = ""
    catalog: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, str] = field(default_factory=dict)
    duration_s: float | None = None
    continuous_span_s: float | None = None
    laps: int | None = None
    lap_rows: list[dict[str, Any]] = field(default_factory=list)
    session_id: str = ""
    error: str = ""


class BufferReader:
    def __init__(self, data: bytes):
        self.data = data
        self.offset = 0

    def take(self, size: int) -> bytes:
        end = self.offset + size
        if size < 0 or end > len(self.data):
            raise SpikeError("batch truncado")
        value = self.data[self.offset:end]
        self.offset = end
        return value

    def unpack(self, fmt: str) -> tuple[Any, ...]:
        size = struct.calcsize(fmt)
        return struct.unpack(fmt, self.take(size))

    def u8(self) -> int:
        return self.unpack("<B")[0]

    def u16(self) -> int:
        return self.unpack("<H")[0]

    def u32(self) -> int:
        return self.unpack("<I")[0]

    def i64(self) -> int:
        return self.unpack("<q")[0]

    def f64(self) -> float:
        return self.unpack("<d")[0]

    def string16(self) -> str:
        return self.take(self.u16()).decode("utf-8", "replace")

    def string32(self) -> str:
        return self.take(self.u32()).decode("utf-8", "replace")


def decode_batch(payload: str) -> dict[str, Any]:
    reader = BufferReader(base64.b64decode(payload, validate=True))
    if reader.take(4) != b"VTB1":
        raise SpikeError("magic de batch inválido")
    row_count = reader.u32()
    if row_count > MAX_PAGE:
        raise SpikeError("batch fuera de límite")
    timestamp_flag = reader.u8()
    if timestamp_flag not in (0, 1):
        raise SpikeError("flag de timestamp inválido")
    timestamps = [reader.f64() for _ in range(row_count)] if timestamp_flag else []
    columns: list[list[Any]] = []
    column_kinds: list[str] = []
    for _ in range(reader.u16()):
        kind_code = reader.u8()
        _duck_type = reader.string16()
        if kind_code == 0:
            values: list[Any] = [None] * row_count
            kind = "unknown"
        elif kind_code == 1:
            values = [reader.f64() for _ in range(row_count)]
            kind = "number"
        elif kind_code == 2:
            values = [reader.i64() for _ in range(row_count)]
            kind = "integer"
        elif kind_code == 3:
            values = [bool(reader.u8()) for _ in range(row_count)]
            kind = "boolean"
        elif kind_code == 4:
            values = [reader.string32() for _ in range(row_count)]
            kind = "text"
        else:
            raise SpikeError("tipo vectorial desconocido")
        for _ in range(reader.u32()):
            index = reader.u32()
            if index >= row_count:
                raise SpikeError("índice nulo inválido")
            values[index] = None
        for _ in range(reader.u32()):
            index = reader.u32()
            _quality = reader.u8()
            if index >= row_count:
                raise SpikeError("índice de calidad inválido")
        columns.append(values)
        column_kinds.append(kind)
    if reader.offset != len(reader.data):
        raise SpikeError("bytes residuales en batch")
    return {
        "row_count": row_count,
        "timestamps": timestamps,
        "columns": columns,
        "column_kinds": column_kinds,
    }


class HelperSession:
    def __init__(self, runtime: Path, artifact: Path, size: int, sha256: str):
        self.runtime = runtime
        self.artifact = {"path": str(artifact), "size": size, "sha256": sha256}
        self.counter = 0
        helper = runtime / "vantare-telemetry-reader.exe"
        if not helper.is_file() or not (runtime / "manifest.json").is_file():
            raise SpikeError("runtime DuckDB firmado no disponible")
        self.process = subprocess.Popen(
            [str(helper)],
            cwd=runtime,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        answer = self.request("handshake", include_artifact=False)
        if not answer.get("ok"):
            raise SpikeError("handshake del helper falló")

    def request(
        self,
        operation: str,
        *,
        include_artifact: bool = True,
        read_rows: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self.counter += 1
        request: dict[str, Any] = {
            "protocol_version": PROTOCOL_VERSION,
            "request_id": f"spike-{self.counter:08d}",
            "operation": operation,
            "handshake": {
                "helper_version": HELPER_VERSION,
                "duckdb_version": DUCKDB_VERSION,
                "schema_version": SCHEMA_VERSION,
                "os": "windows",
                "arch": "amd64",
            },
        }
        if include_artifact:
            request["artifact"] = self.artifact
        if read_rows is not None:
            request["read_rows"] = read_rows
        assert self.process.stdin is not None
        assert self.process.stdout is not None
        self.process.stdin.write(json.dumps(request, separators=(",", ":")) + "\n")
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line:
            stderr = ""
            if self.process.stderr is not None:
                stderr = self.process.stderr.read(2048)
            raise SpikeError(f"helper terminó sin respuesta: {stderr.strip()}")
        answer = json.loads(line)
        if answer.get("request_id") != request["request_id"] or answer.get("operation") != operation:
            raise SpikeError("correlación inválida del helper")
        if not answer.get("ok"):
            raise SpikeError(f"helper {operation}: {answer.get('error_code', 'error')}")
        return answer

    def catalog(self) -> dict[str, Any]:
        return self.request("catalog")["catalog"]

    def read_rows(self, table: str, start: int, limit: int) -> dict[str, Any]:
        answer = self.request(
            "read_rows",
            read_rows={"source_table": table, "start": start, "limit": limit},
        )
        return decode_batch(answer["batch_payload"])

    def close(self) -> None:
        if self.process.stdin is not None:
            self.process.stdin.close()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=5)

    def __enter__(self) -> "HelperSession":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inferred_date(path: Path, stat: os.stat_result) -> str:
    match = DATE_RE.search(path.name)
    if match:
        raw = match.group(1).replace("_", ":")
        raw = raw[:13] + raw[13:].replace(":", ":", 2)
        try:
            parsed = dt.datetime.strptime(match.group(1), "%Y-%m-%dT%H_%M_%SZ").replace(tzinfo=dt.timezone.utc)
            return parsed.isoformat().replace("+00:00", "Z")
        except ValueError:
            pass
    return dt.datetime.fromtimestamp(stat.st_mtime, dt.timezone.utc).isoformat().replace("+00:00", "Z")


def discover_candidates(source: Path, stable_minutes: int) -> tuple[list[Candidate], dict[str, int]]:
    if not source.is_dir():
        raise SpikeError("ruta estándar de telemetría LMU no encontrada")
    now_ns = dt.datetime.now(dt.timezone.utc).timestamp() * 1_000_000_000
    threshold_ns = stable_minutes * 60 * 1_000_000_000
    candidates: list[Candidate] = []
    excluded_wal = 0
    excluded_recent = 0
    all_dbs = sorted(source.glob("*.duckdb"), key=lambda item: item.name.casefold())
    for path in all_dbs:
        stat = path.stat()
        if Path(str(path) + ".wal").exists():
            excluded_wal += 1
            continue
        if now_ns - stat.st_mtime_ns < threshold_ns:
            excluded_recent += 1
            continue
        candidates.append(Candidate(path, stat.st_size, stat.st_mtime_ns, inferred_date(path, stat)))
    return candidates, {
        "duckdb_total": len(all_dbs),
        "excluded_wal": excluded_wal,
        "excluded_recent": excluded_recent,
        "eligible_stable": len(candidates),
    }


def safe_stage(candidate: Candidate) -> tuple[Path, str]:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    staged = WORK_DIR / "session.duckdb"
    if staged.exists():
        staged.unlink()
    before = candidate.path.stat()
    if before.st_size != candidate.size or before.st_mtime_ns != candidate.mtime_ns:
        raise SpikeError("fuente cambió antes del staging")
    if Path(str(candidate.path) + ".wal").exists():
        raise SpikeError("apareció WAL antes del staging")
    shutil.copyfile(candidate.path, staged)
    after = candidate.path.stat()
    if (
        after.st_size != before.st_size
        or after.st_mtime_ns != before.st_mtime_ns
        or Path(str(candidate.path) + ".wal").exists()
    ):
        staged.unlink(missing_ok=True)
        raise SpikeError("fuente cambió durante el staging")
    digest = sha256_file(staged)
    if staged.stat().st_size != before.st_size:
        staged.unlink(missing_ok=True)
        raise SpikeError("copia privada incompleta")
    return staged, digest


def metadata_dict(catalog: dict[str, Any]) -> dict[str, str]:
    result: dict[str, str] = {}
    for item in catalog.get("metadata", []):
        key = item.get("key")
        if key in ALLOWED_METADATA and item.get("present") and isinstance(item.get("value"), str):
            result[key] = item["value"]
    return result


def channel_map(catalog: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for kind in ("continuous", "events"):
        for channel in catalog.get(kind, []):
            result[channel["name"]] = {**channel, "kind": kind}
    return result


def find_row_count(helper: HelperSession, table: str, hint: int = 1) -> int:
    low = 0
    high = max(1, hint)
    while helper.read_rows(table, high - 1, 1)["row_count"] == 1:
        low = high
        high *= 2
        if high > 1_000_000_000:
            raise SpikeError("tabla fuera del límite del spike")
    while low < high:
        middle = (low + high) // 2
        if helper.read_rows(table, middle, 1)["row_count"] == 1:
            low = middle + 1
        else:
            high = middle
    return low


def rows_from_batch(batch: dict[str, Any], start: int = 0) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for index in range(batch["row_count"]):
        result.append(
            {
                "index": start + index,
                "ts": batch["timestamps"][index] if batch["timestamps"] else None,
                "values": [column[index] for column in batch["columns"]],
            }
        )
    return result


def read_all(helper: HelperSession, table: str, max_rows: int = 500_000) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    start = 0
    while start < max_rows:
        limit = min(MAX_PAGE, max_rows - start)
        batch = helper.read_rows(table, start, limit)
        rows.extend(rows_from_batch(batch, start))
        if batch["row_count"] < limit:
            return rows
        start += batch["row_count"]
    return rows


def read_sample(helper: HelperSession, table: str, count: int, page: int = 2048) -> list[dict[str, Any]]:
    if count <= page * 3:
        return read_all(helper, table, max_rows=count + 1)
    starts = sorted({0, max(0, count // 2 - page // 2), max(0, count - page)})
    rows: list[dict[str, Any]] = []
    for start in starts:
        rows.extend(rows_from_batch(helper.read_rows(table, start, min(page, count - start)), start))
    return rows


def first_numeric(row: dict[str, Any]) -> float | None:
    for value in row["values"]:
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value)):
            return float(value)
    return None


def inspect_inventory(candidate: Candidate, runtime: Path) -> None:
    staged, digest = safe_stage(candidate)
    try:
        with HelperSession(runtime, staged, candidate.size, digest) as helper:
            catalog = helper.catalog()
            candidate.catalog = catalog
            candidate.metadata = metadata_dict(catalog)
            candidate.source_hash = digest
            channels = channel_map(catalog)
            continuous = list(catalog.get("continuous", []))
            anchors = [item for item in continuous if int(item.get("frequency_hz", 0)) > 0]
            if anchors:
                anchor = min(anchors, key=lambda item: (int(item["frequency_hz"]), item["name"]))
                count = find_row_count(helper, anchor["name"], hint=max(1, candidate.size // 4096))
                candidate.continuous_span_s = count / int(anchor["frequency_hz"])
                candidate.duration_s = candidate.continuous_span_s
            if "Current LapTime" in channels:
                event_count = find_row_count(helper, "Current LapTime", hint=max(1, int(candidate.duration_s or 1)))
                if event_count:
                    last = helper.read_rows("Current LapTime", event_count - 1, 1)
                    if last["timestamps"]:
                        candidate.duration_s = max(
                            float(last["timestamps"][0]), candidate.continuous_span_s or 0.0
                        )
            if "Lap" in channels:
                candidate.lap_rows = read_all(helper, "Lap", max_rows=10_000)
                values = [first_numeric(row) for row in candidate.lap_rows]
                numeric = [value for value in values if value is not None]
                candidate.laps = max(0, int(max(numeric)) - int(min(numeric))) if numeric else len(candidate.lap_rows)
    finally:
        staged.unlink(missing_ok=True)


def quantile(values: Sequence[float], probability: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def numeric_stats(rows: list[dict[str, Any]], columns: int) -> dict[str, Any]:
    flattened: list[float] = []
    per_column: list[list[float]] = [[] for _ in range(columns)]
    nulls = 0
    for row in rows:
        for index in range(columns):
            value = row["values"][index] if index < len(row["values"]) else None
            if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value)):
                number = float(value)
                flattened.append(number)
                per_column[index].append(number)
            else:
                nulls += 1
    diffs: list[float] = []
    positive = 0
    negative = 0
    unchanged = 0
    for series in per_column:
        for left, right in zip(series, series[1:]):
            delta = right - left
            if delta > 0:
                positive += 1
            elif delta < 0:
                negative += 1
            else:
                unchanged += 1
            if delta:
                diffs.append(abs(delta))
    unique = sorted(set(flattened))
    resolution_candidates = [right - left for left, right in zip(unique, unique[1:]) if right > left]
    return {
        "samples": len(flattened),
        "nulls": nulls,
        "minimum": min(flattened) if flattened else None,
        "maximum": max(flattened) if flattened else None,
        "mean": statistics.fmean(flattened) if flattened else None,
        "stddev": statistics.pstdev(flattened) if len(flattened) > 1 else 0.0 if flattened else None,
        "empirical_resolution": min(resolution_candidates) if resolution_candidates else None,
        "median_abs_step": quantile(diffs, 0.5),
        "p95_abs_step": quantile(diffs, 0.95),
        "positive_steps": positive,
        "negative_steps": negative,
        "unchanged_steps": unchanged,
    }


def categorical_stats(rows: list[dict[str, Any]]) -> dict[str, Any]:
    values: list[str] = []
    nulls = 0
    for row in rows:
        if not row["values"] or row["values"][0] is None:
            nulls += 1
        else:
            values.append(str(row["values"][0]))
    return {
        "samples": len(values),
        "nulls": nulls,
        "distinct": len(set(values)),
        "values": dict(Counter(values).most_common(20)),
    }


def value_at(rows: list[dict[str, Any]], timestamp: float, frequency: int, column: int = 0) -> float | None:
    if not rows or frequency <= 0:
        return None
    target_index = int(round(timestamp * frequency))
    nearest = min(rows, key=lambda row: abs(row["index"] - target_index))
    if abs(nearest["index"] - target_index) > max(2, frequency):
        return None
    if column >= len(nearest["values"]):
        return None
    value = nearest["values"][column]
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def service_metrics(
    rows: list[dict[str, Any]], start_s: float, end_s: float, frequency: int, threshold: float
) -> dict[str, float | None]:
    if not rows or frequency <= 0 or end_s <= start_s:
        return {"delta": None, "service_duration_s": None, "rate": None}
    start_index = int(max(0.0, start_s) * frequency)
    end_index = int(max(0.0, end_s) * frequency)
    window = [row for row in rows if start_index <= row["index"] <= end_index]
    increments: list[tuple[int, float]] = []
    for left, right in zip(window, window[1:]):
        a = first_numeric(left)
        b = first_numeric(right)
        if a is not None and b is not None and b - a > threshold:
            increments.append((right["index"], b - a))
    if not increments:
        return {"delta": 0.0, "service_duration_s": 0.0, "rate": None}
    duration = max(1.0 / frequency, (increments[-1][0] - increments[0][0] + 1) / frequency)
    delta = sum(item[1] for item in increments)
    return {"delta": delta, "service_duration_s": duration, "rate": delta / duration}


def event_intervals(rows: list[dict[str, Any]]) -> list[tuple[float, float]]:
    intervals: list[tuple[float, float]] = []
    opened: float | None = None
    for row in rows:
        value = row["values"][0] if row["values"] else None
        active = value is True or value == 1 or str(value).lower() in {"true", "1", "yes"}
        if active and opened is None and row["ts"] is not None:
            opened = float(row["ts"])
        elif not active and opened is not None and row["ts"] is not None:
            intervals.append((opened, float(row["ts"])))
            opened = None
    return intervals


def lap_time_rows(helper: HelperSession, channels: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    for name in ("Lap Time", "Best LapTime"):
        if name in channels:
            rows = read_all(helper, name, max_rows=20_000)
            usable = [row for row in rows if row["ts"] is not None and first_numeric(row) is not None]
            if len(usable) >= 2:
                return usable
    return []


def solve_linear(matrix: list[list[float]], vector: list[float]) -> list[float] | None:
    n = len(vector)
    augmented = [matrix[row][:] + [vector[row]] for row in range(n)]
    for column in range(n):
        pivot = max(range(column, n), key=lambda row: abs(augmented[row][column]))
        if abs(augmented[pivot][column]) < 1e-12:
            return None
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        scale = augmented[column][column]
        augmented[column] = [value / scale for value in augmented[column]]
        for row in range(n):
            if row == column:
                continue
            factor = augmented[row][column]
            augmented[row] = [
                augmented[row][index] - factor * augmented[column][index]
                for index in range(n + 1)
            ]
    return [augmented[index][-1] for index in range(n)]


def regression(records: list[dict[str, float]]) -> dict[str, Any]:
    usable = [row for row in records if all(math.isfinite(row[key]) for key in ("lap_time", "fuel", "tyre_age"))]
    if len(usable) < 8:
        return {"status": "insufficient", "n": len(usable)}
    x = [[1.0, row["fuel"], row["tyre_age"]] for row in usable]
    y = [row["lap_time"] for row in usable]
    xtx = [[sum(row[i] * row[j] for row in x) for j in range(3)] for i in range(3)]
    xty = [sum(row[i] * value for row, value in zip(x, y)) for i in range(3)]
    beta = solve_linear(xtx, xty)
    if beta is None:
        return {"status": "singular", "n": len(usable)}
    predicted = [sum(coefficient * value for coefficient, value in zip(beta, row)) for row in x]
    mean_y = statistics.fmean(y)
    residual = sum((actual - estimate) ** 2 for actual, estimate in zip(y, predicted))
    total = sum((actual - mean_y) ** 2 for actual in y)
    fuels = [row["fuel"] for row in usable]
    ages = [row["tyre_age"] for row in usable]
    covariance = sum((a - statistics.fmean(fuels)) * (b - statistics.fmean(ages)) for a, b in zip(fuels, ages))
    denominator = math.sqrt(
        sum((a - statistics.fmean(fuels)) ** 2 for a in fuels)
        * sum((b - statistics.fmean(ages)) ** 2 for b in ages)
    )
    return {
        "status": "ok",
        "n": len(usable),
        "intercept_s": beta[0],
        "fuel_s_per_l": beta[1],
        "tyre_age_s_per_lap": beta[2],
        "r_squared": 1.0 - residual / total if total else None,
        "fuel_age_correlation": covariance / denominator if denominator else None,
        "stints": len({int(row.get("stint", 0)) for row in usable}),
    }


def analyze_session(candidate: Candidate, runtime: Path) -> dict[str, Any]:
    staged, digest = safe_stage(candidate)
    result: dict[str, Any] = {
        "session_id": candidate.session_id,
        "metadata": candidate.metadata,
        "duration_s": candidate.duration_s,
        "laps": candidate.laps,
        "channels": {},
        "alignment": {},
        "lap_records": [],
        "pits": [],
        "mixture_curve": [],
    }
    try:
        with HelperSession(runtime, staged, candidate.size, digest) as helper:
            catalog = helper.catalog()
            channels = channel_map(catalog)
            counts: dict[str, int] = {}
            loaded: dict[str, list[dict[str, Any]]] = {}

            names = sorted({name for group in TARGET_GROUPS.values() for name in group if name in channels})
            for name in names:
                channel = channels[name]
                if channel["kind"] == "continuous":
                    frequency = int(channel.get("frequency_hz", 0))
                    hint = int((candidate.duration_s or 1) * max(1, frequency))
                    count = find_row_count(helper, name, hint=max(1, hint))
                    counts[name] = count
                    rows = read_sample(helper, name, count)
                    loaded[name] = rows
                    stats = numeric_stats(rows, len(channel.get("columns", [])))
                else:
                    rows = read_all(helper, name, max_rows=100_000)
                    loaded[name] = rows
                    counts[name] = len(rows)
                    kinds = {type(value).__name__ for row in rows for value in row["values"] if value is not None}
                    value_columns = max((len(row["values"]) for row in rows), default=max(0, len(channel.get("columns", [])) - 1))
                    stats = numeric_stats(rows, value_columns) if kinds <= {"int", "float"} else categorical_stats(rows)
                result["channels"][name] = {
                    "kind": channel["kind"],
                    "frequency_hz": channel.get("frequency_hz"),
                    "unit": channel.get("unit"),
                    "columns": [column.get("name") for column in channel.get("columns", []) if column.get("name") != "ts"],
                    **stats,
                }

            # Alineación: fin continuo de 1 Hz contra último timestamp de Current LapTime.
            continuous = [item for item in catalog.get("continuous", []) if int(item.get("frequency_hz", 0)) > 0]
            if continuous and "Current LapTime" in channels:
                anchor = min(continuous, key=lambda item: (int(item["frequency_hz"]), item["name"]))
                anchor_count = find_row_count(helper, anchor["name"], hint=max(1, int(candidate.duration_s or 1)))
                event_count = find_row_count(helper, "Current LapTime", hint=max(1, anchor_count))
                last = helper.read_rows("Current LapTime", max(0, event_count - 1), 1)
                last_ts = last["timestamps"][0] if last["row_count"] and last["timestamps"] else None
                continuous_end = anchor_count / int(anchor["frequency_hz"])
                result["alignment"] = {
                    "continuous_anchor": anchor["name"],
                    "continuous_end_s": continuous_end,
                    "last_event_s": last_ts,
                    "end_delta_s": continuous_end - last_ts if last_ts is not None else None,
                    "estimated_event_to_continuous_offset_s": last_ts - continuous_end if last_ts is not None else None,
                }

            # Carga completa de baja frecuencia para vueltas, stints y pits.
            for name in ("Fuel Level", "Virtual Energy", "Tyres Wear", "Lap Dist"):
                if name not in channels:
                    continue
                frequency = int(channels[name].get("frequency_hz", 0))
                count = counts.get(name) or find_row_count(
                    helper, name, hint=max(1, int((candidate.duration_s or 1) * frequency))
                )
                if count <= 500_000:
                    loaded[name] = read_all(helper, name, max_rows=count + 1)

            laps = lap_time_rows(helper, channels)
            pit_rows = read_all(helper, "In Pits", max_rows=20_000) if "In Pits" in channels else []
            pit_intervals = event_intervals(pit_rows)
            compounds = loaded.get("TyresCompound", [])
            mixtures = loaded.get("FuelMixtureMap", [])
            fuel_rows = loaded.get("Fuel Level", [])
            wear_rows = loaded.get("Tyres Wear", [])
            ve_rows = loaded.get("Virtual Energy", [])
            fuel_hz = int(channels.get("Fuel Level", {}).get("frequency_hz", 0))
            wear_hz = int(channels.get("Tyres Wear", {}).get("frequency_hz", 0))
            ve_hz = int(channels.get("Virtual Energy", {}).get("frequency_hz", 0))
            event_offset = float(result.get("alignment", {}).get("estimated_event_to_continuous_offset_s") or 0.0)

            lap_dist_rows = loaded.get("Lap Dist", [])
            lap_resets = 0
            for left, right in zip(lap_dist_rows, lap_dist_rows[1:]):
                a = first_numeric(left)
                b = first_numeric(right)
                if a is not None and b is not None and a - b > 500.0:
                    lap_resets += 1
            result["lap_segmentation"] = {
                "lap_event_rows": len(candidate.lap_rows),
                "lap_time_rows": len(laps),
                "lap_dist_resets": lap_resets,
                "difference_resets_vs_lap_times": lap_resets - len(laps),
            }

            lap_records: list[dict[str, Any]] = []
            stint = 0
            stint_lap = 0
            previous_fuel: float | None = None
            previous_wear: float | None = None
            for index, lap in enumerate(laps):
                timestamp = float(lap["ts"])
                continuous_timestamp = timestamp - event_offset
                lap_time = first_numeric(lap)
                if lap_time is None or lap_time <= 0:
                    continue
                fuel = value_at(fuel_rows, continuous_timestamp, fuel_hz)
                wear_values = [value_at(wear_rows, continuous_timestamp, wear_hz, column) for column in range(4)]
                wear = statistics.fmean([value for value in wear_values if value is not None]) if any(value is not None for value in wear_values) else None
                ve = value_at(ve_rows, continuous_timestamp, ve_hz)
                if previous_fuel is not None and fuel is not None and fuel - previous_fuel > 3.0:
                    stint += 1
                    stint_lap = 0
                elif previous_wear is not None and wear is not None and wear - previous_wear > 2.0:
                    stint += 1
                    stint_lap = 0
                else:
                    stint_lap += 1
                mixture = None
                for event in mixtures:
                    if event["ts"] is not None and float(event["ts"]) <= timestamp:
                        mixture = event["values"][0] if event["values"] else None
                    elif event["ts"] is not None and float(event["ts"]) > timestamp:
                        break
                compound = None
                for event in compounds:
                    if event["ts"] is not None and float(event["ts"]) <= timestamp:
                        compound = event["values"][0] if event["values"] else None
                    elif event["ts"] is not None and float(event["ts"]) > timestamp:
                        break
                in_pit = any(start <= timestamp <= end for start, end in pit_intervals)
                lap_records.append(
                    {
                        "lap": index + 1,
                        "timestamp_s": timestamp,
                        "lap_time_s": lap_time,
                        "fuel_l": fuel,
                        "virtual_energy_pct": ve,
                        "tyres_remaining_pct": wear,
                        "stint": stint,
                        "stint_lap": stint_lap,
                        "mixture": mixture,
                        "compound": compound,
                        "pit": in_pit,
                    }
                )
                previous_fuel = fuel
                previous_wear = wear
            result["lap_records"] = lap_records

            for start, end in pit_intervals:
                continuous_start = start - event_offset
                continuous_end = end - event_offset
                fuel_service = service_metrics(fuel_rows, continuous_start, continuous_end, fuel_hz, 0.01)
                ve_service = service_metrics(ve_rows, continuous_start, continuous_end, ve_hz, 0.01)
                pit_duration = end - start
                service_durations = [
                    value for value in (fuel_service["service_duration_s"], ve_service["service_duration_s"])
                    if isinstance(value, float) and value > 0
                ]
                resource_service_duration = max(service_durations) if service_durations else 0.0
                result["pits"].append(
                    {
                        "duration_s": pit_duration,
                        "resource_service_duration_s": resource_service_duration,
                        "non_resource_time_s": max(0.0, pit_duration - resource_service_duration),
                        "fuel_delta_l": fuel_service["delta"],
                        "fuel_service_lps": fuel_service["rate"],
                        "virtual_energy_delta_pct": ve_service["delta"],
                        "virtual_energy_service_pctps": ve_service["rate"],
                    }
                )

            grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for row in lap_records:
                if row["mixture"] is not None and not row["pit"]:
                    grouped[str(row["mixture"])].append(row)
            for mixture, rows in sorted(grouped.items()):
                clean = [row for row in rows if row["fuel_l"] is not None and row["lap_time_s"] is not None]
                consumptions = [
                    left["fuel_l"] - right["fuel_l"]
                    for left, right in zip(clean, clean[1:])
                    if left["stint"] == right["stint"] and left["fuel_l"] >= right["fuel_l"]
                ]
                result["mixture_curve"].append(
                    {
                        "mixture": mixture,
                        "laps": len(clean),
                        "mean_lap_time_s": statistics.fmean(row["lap_time_s"] for row in clean) if clean else None,
                        "mean_fuel_per_lap_l": statistics.fmean(consumptions) if consumptions else None,
                    }
                )
    finally:
        staged.unlink(missing_ok=True)
    return result


def presence_summary(candidates: list[Candidate]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for group, names in TARGET_GROUPS.items():
        for name in names:
            present = []
            frequencies: list[int] = []
            columns: Counter[int] = Counter()
            kinds: Counter[str] = Counter()
            for candidate in candidates:
                channel = channel_map(candidate.catalog).get(name)
                if channel is None:
                    continue
                present.append(candidate.session_id)
                kinds[channel["kind"]] += 1
                columns[len(channel.get("columns", []))] += 1
                if channel.get("frequency_hz"):
                    frequencies.append(int(channel["frequency_hz"]))
            rows.append(
                {
                    "group": group,
                    "channel": name,
                    "present_sessions": len(present),
                    "total_sessions": len(candidates),
                    "presence_pct": 100.0 * len(present) / len(candidates) if candidates else 0.0,
                    "kinds": dict(kinds),
                    "frequencies_hz": sorted(set(frequencies)),
                    "column_counts": dict(columns),
                }
            )
    return rows


def choose_analysis_sessions(candidates: list[Candidate], limit: int) -> list[Candidate]:
    races = [candidate for candidate in candidates if "race" in candidate.metadata.get("SessionType", "").casefold()]
    usable_races = [candidate for candidate in races if (candidate.laps or 0) >= 5]
    pool = usable_races or races or candidates
    weather_priority = [
        candidate
        for candidate in candidates
        if any(
            token in candidate.metadata.get("WeatherConditions", "").casefold()
            for token in ("drizzle", "rain", "wet")
        )
    ]
    weather_priority.sort(
        key=lambda candidate: (candidate.laps or 0, candidate.duration_s or 0, candidate.size),
        reverse=True,
    )
    by_combo: dict[tuple[str, str, str], list[Candidate]] = defaultdict(list)
    for candidate in pool:
        key = (
            candidate.metadata.get("TrackName", ""),
            candidate.metadata.get("TrackLayout", ""),
            candidate.metadata.get("CarClass", ""),
        )
        by_combo[key].append(candidate)
    selected: list[Candidate] = weather_priority[: min(4, len(weather_priority))]
    for _, group in sorted(by_combo.items(), key=lambda item: str(item[0]).casefold()):
        best = max(group, key=lambda candidate: (candidate.laps or 0, candidate.duration_s or 0, candidate.size))
        if best not in selected:
            selected.append(best)
    if len(selected) < limit:
        remaining = [candidate for candidate in pool if candidate not in selected]
        remaining.sort(key=lambda candidate: (candidate.laps or 0, candidate.duration_s or 0, candidate.size), reverse=True)
        selected.extend(remaining[: limit - len(selected)])
    return sorted(selected[:limit], key=lambda candidate: candidate.session_id)


def inventory_rows(candidates: list[Candidate]) -> list[dict[str, Any]]:
    return [
        {
            "session_id": candidate.session_id,
            "date_utc": candidate.date_utc,
            "track": candidate.metadata.get("TrackName", ""),
            "layout": candidate.metadata.get("TrackLayout", ""),
            "car": candidate.metadata.get("CarName", ""),
            "class": candidate.metadata.get("CarClass", ""),
            "session_type": candidate.metadata.get("SessionType", ""),
            "weatherconditions": candidate.metadata.get("WeatherConditions", ""),
            "duration_s": round(candidate.duration_s, 3) if candidate.duration_s is not None else "",
            "continuous_span_s": round(candidate.continuous_span_s, 3) if candidate.continuous_span_s is not None else "",
            "laps": candidate.laps if candidate.laps is not None else "",
            "source_bytes": candidate.size,
            "catalog_continuous": len(candidate.catalog.get("continuous", [])),
            "catalog_events": len(candidate.catalog.get("events", [])),
        }
        for candidate in candidates
    ]


def metadata_quality(candidates: list[Candidate]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    identity_fields = ("TrackName", "TrackLayout", "CarName", "CarClass", "SessionType", "WeatherConditions")
    completeness = {
        field: {
            "present": sum(bool(candidate.metadata.get(field, "").strip()) for candidate in candidates),
            "total": len(candidates),
        }
        for field in identity_fields
    }
    for values in completeness.values():
        values["presence_pct"] = 100.0 * values["present"] / values["total"] if values["total"] else 0.0
    distinct = {
        field: dict(Counter(candidate.metadata.get(field, "<missing>") for candidate in candidates).most_common())
        for field in identity_fields
    }
    ambiguous: list[dict[str, Any]] = []
    known_types = ("practice", "qual", "race", "test", "warmup")
    for candidate in candidates:
        reasons: list[str] = []
        missing = [field for field in identity_fields if not candidate.metadata.get(field, "").strip()]
        if missing:
            reasons.append("missing:" + ",".join(missing))
        session_type = candidate.metadata.get("SessionType", "").casefold()
        if session_type and not any(token in session_type for token in known_types):
            reasons.append("session_type_unrecognized")
        if candidate.metadata.get("TrackName") != candidate.metadata.get("TrackLayout"):
            reasons.append("track_layout_differs")
        if (candidate.laps or 0) == 0:
            reasons.append("zero_completed_laps")
        if (candidate.duration_s or 0) < 300:
            reasons.append("short_capture")
        if reasons:
            ambiguous.append({
                "session_id": candidate.session_id,
                "spot_check_reason": ";".join(reasons),
                "date_utc": candidate.date_utc,
                "track": candidate.metadata.get("TrackName", ""),
                "layout": candidate.metadata.get("TrackLayout", ""),
                "car": candidate.metadata.get("CarName", ""),
                "class": candidate.metadata.get("CarClass", ""),
                "session_type": candidate.metadata.get("SessionType", ""),
                "weatherconditions": candidate.metadata.get("WeatherConditions", ""),
            })
    ambiguous.sort(key=lambda row: (-row["spot_check_reason"].count(";"), row["session_id"]))
    return {
        "fields": completeness,
        "distinct_values": distinct,
        "spot_check_candidate_sessions": len(ambiguous),
    }, ambiguous[:8]


def dump_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def dump_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def build_bundle(session: dict[str, Any]) -> dict[str, Any]:
    lap_records = session.get("lap_records", [])
    stints: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in lap_records:
        stints[int(row.get("stint", 0))].append(row)
    return {
        "schema": "isa-694-spike-derived-bundle.v0",
        "session_id": session["session_id"],
        "combination": {
            key: session["metadata"].get(key, "")
            for key in ("TrackName", "TrackLayout", "CarClass", "CarName", "SessionType", "WeatherConditions")
        },
        "duration_s": session.get("duration_s"),
        "laps": len(lap_records),
        "stints": [
            {
                "index": index,
                "laps": len(rows),
                "mean_lap_time_s": statistics.fmean(row["lap_time_s"] for row in rows) if rows else None,
                "fuel_start_l": rows[0].get("fuel_l") if rows else None,
                "fuel_end_l": rows[-1].get("fuel_l") if rows else None,
                "tyres_start_pct": rows[0].get("tyres_remaining_pct") if rows else None,
                "tyres_end_pct": rows[-1].get("tyres_remaining_pct") if rows else None,
                "mixtures": sorted({str(row["mixture"]) for row in rows if row.get("mixture") is not None}),
                "compounds": sorted({str(row["compound"]) for row in rows if row.get("compound") is not None}),
            }
            for index, rows in sorted(stints.items())
        ],
        "pit_aggregates": session.get("pits", []),
        "mixture_curve": session.get("mixture_curve", []),
        "channel_quality": {
            name: {
                key: stats.get(key)
                for key in ("samples", "nulls", "minimum", "maximum", "empirical_resolution", "median_abs_step", "p95_abs_step")
            }
            for name, stats in session.get("channels", {}).items()
        },
    }


def combined_stint_decay(analyses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[int, list[float]] = defaultdict(list)
    for session in analyses:
        by_stint: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for row in session.get("lap_records", []):
            if row.get("pit") or row.get("lap_time_s") is None:
                continue
            by_stint[int(row.get("stint", 0))].append(row)
        for rows in by_stint.values():
            rows.sort(key=lambda row: int(row.get("stint_lap", 0)))
            if len(rows) < 3:
                continue
            baseline = statistics.median(float(row["lap_time_s"]) for row in rows[: min(3, len(rows))])
            for row in rows:
                age = int(row.get("stint_lap", 0))
                if age > 0:
                    buckets[age].append(float(row["lap_time_s"]) - baseline)
    return [
        {
            "stint_lap": age,
            "n": len(values),
            "mean_delta_s": statistics.fmean(values),
            "median_delta_s": statistics.median(values),
            "p25_delta_s": quantile(values, 0.25),
            "p75_delta_s": quantile(values, 0.75),
        }
        for age, values in sorted(buckets.items())
        if len(values) >= 3
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--runtime", type=Path, default=DEFAULT_RUNTIME)
    parser.add_argument("--stable-minutes", type=int, default=30)
    parser.add_argument("--analysis-sessions", type=int, default=24)
    parser.add_argument("--max-sessions", type=int, default=0, help="0 = corpus estable completo")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    candidates, discovery = discover_candidates(args.source.resolve(), args.stable_minutes)
    if args.max_sessions > 0:
        candidates = candidates[: args.max_sessions]
        discovery["limited_run"] = len(candidates)
    failures: list[dict[str, str]] = []
    inspected: list[Candidate] = []
    for index, candidate in enumerate(candidates, 1):
        try:
            inspect_inventory(candidate, args.runtime.resolve())
            inspected.append(candidate)
        except Exception as error:  # el informe necesita el bloqueo por sesión
            candidate.error = type(error).__name__
            failures.append({"ordinal": str(index), "error": type(error).__name__})
        print(f"catalog {index}/{len(candidates)} ok={len(inspected)} fail={len(failures)}", flush=True)

    inspected.sort(key=lambda candidate: (candidate.date_utc, candidate.source_hash))
    for index, candidate in enumerate(inspected, 1):
        candidate.session_id = f"S{index:03d}-{candidate.source_hash[:8]}"

    selected = choose_analysis_sessions(inspected, min(args.analysis_sessions, len(inspected)))
    analyses: list[dict[str, Any]] = []
    for index, candidate in enumerate(selected, 1):
        try:
            analyses.append(analyze_session(candidate, args.runtime.resolve()))
        except Exception as error:
            failures.append({"session_id": candidate.session_id, "error": type(error).__name__})
        print(f"analysis {index}/{len(selected)} ok={len(analyses)}", flush=True)

    presence = presence_summary(inspected)
    session_regressions: list[dict[str, Any]] = []
    for session in analyses:
        regression_rows: list[dict[str, float]] = []
        for row in session.get("lap_records", []):
            if row.get("pit") or row.get("fuel_l") is None or row.get("lap_time_s") is None:
                continue
            regression_rows.append(
                {
                    "lap_time": float(row["lap_time_s"]),
                    "fuel": float(row["fuel_l"]),
                    "tyre_age": float(row.get("stint_lap", 0)),
                    "stint": float(row.get("stint", 0)),
                }
            )
        session_regression = regression(regression_rows)
        session_regression["session_id"] = session["session_id"]
        session_regressions.append(session_regression)
    combined_decay = combined_stint_decay(analyses)

    bundles = [build_bundle(session) for session in analyses]
    bundle_sizes = []
    for bundle in bundles:
        raw = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
        compressed = gzip.compress(raw, compresslevel=9, mtime=0)
        bundle_sizes.append({"session_id": bundle["session_id"], "json_bytes": len(raw), "gzip_bytes": len(compressed)})
    bundle_summary = {
        "sessions": bundle_sizes,
        "median_json_bytes": statistics.median(item["json_bytes"] for item in bundle_sizes) if bundle_sizes else None,
        "p95_json_bytes": quantile([float(item["json_bytes"]) for item in bundle_sizes], 0.95),
        "median_gzip_bytes": statistics.median(item["gzip_bytes"] for item in bundle_sizes) if bundle_sizes else None,
        "p95_gzip_bytes": quantile([float(item["gzip_bytes"]) for item in bundle_sizes], 0.95),
        "estimated_full_corpus_json_bytes": sum(item["json_bytes"] for item in bundle_sizes) / len(bundle_sizes) * len(inspected) if bundle_sizes else None,
        "estimated_full_corpus_gzip_bytes": sum(item["gzip_bytes"] for item in bundle_sizes) / len(bundle_sizes) * len(inspected) if bundle_sizes else None,
    }

    inventory = inventory_rows(inspected)
    metadata_summary, spot_checks = metadata_quality(inspected)
    dump_csv(OUTPUT_DIR / "inventario-sesiones.csv", inventory)
    dump_csv(OUTPUT_DIR / "spot-check-metadata.csv", spot_checks)
    dump_csv(OUTPUT_DIR / "presencia-canales.csv", presence)
    dump_json(OUTPUT_DIR / "resultados-f0-1.json", {
        "generated_at_utc": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "discovery": discovery,
        "inspected_sessions": len(inspected),
        "failures": failures,
        "analysis_session_ids": [candidate.session_id for candidate in selected],
        "presence": presence,
        "analyses": analyses,
        "metadata_quality": metadata_summary,
        "fuel_vs_tyre_regressions": session_regressions,
        "combined_stint_decay_curve": combined_decay,
        "bundle_size": bundle_summary,
    })
    dump_json(OUTPUT_DIR / "bundle-derivado-ejemplo.json", bundles[0] if bundles else {})
    dump_json(OUTPUT_DIR / "tamano-bundle.json", bundle_summary)

    WORK_DIR.mkdir(parents=True, exist_ok=True)
    for child in WORK_DIR.iterdir():
        if child.is_file():
            child.unlink()
    try:
        WORK_DIR.rmdir()
    except OSError:
        pass
    print(json.dumps({"inspected": len(inspected), "analyzed": len(analyses), "failures": len(failures)}))
    return 0 if inspected else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SpikeError as error:
        print(f"BLOCKED: {error}", file=sys.stderr)
        raise SystemExit(2)
