#!/usr/bin/env python3
"""
LMU Live Capture — dump LMU_Data shared memory to disk and report
candidate offsets for fields the engineer parser doesn't yet know.

Usage:
    python capture.py [--out OUTDIR] [--count N] [--interval SECONDS]

Default: 3 snapshots, 1.0s apart, written to ./docs/lmu-capture/.

See docs/lmu-capture/README.md for context.
"""

import argparse
import ctypes
import os
import struct
import sys
import time
from datetime import datetime
from pathlib import Path

# Reuse the same constants as the Go parser (internal/telemetry/lmu/offsets.go).
LMU_MEMORY_NAME = "LMU_Data"
LMU_MMAP_SIZE = 324820

# Offsets confirmed in offsets.go (Go side) — used for sanity checks.
KNOWN_OFFSETS = {
    "scoringInfoOffset":    1632,
    "scoringInfoSize":      548,
    "scoringNumVehicles":   1736,
    "scoringGamePhase":     1740,
    "scoringPlayerName":    1748,
    "scoringAmbientTemp":   1860,
    "scoringTrackTemp":     1868,
    "telemetryPlayerIdx":   128465,
    "telemetryPlayerHas":   128466,
    "telemetryTelemOffset": 128468,
    "telemetryTelemStride": 1888,
    "vehicleScoringOffset": 2192,
    "vehicleScoringStride": 584,
    "vehicleScoringID":     0,
    "vehicleScoringDriverName": 4,
    "vehicleScoringIsPlayer": 196,
    "vehicleScoringInPits": 198,
    "vehicleScoringPlace":  199,
    "vehicleScoringVehicleClass": 200,
    "vehicleScoringLapDistance": 104,
    "vehicleScoringBestLapTime": 144,
    "vehicleScoringLastLapTime": 168,
    "vehicleScoringCurrentSectorTime1": 176,
    "vehicleScoringCurrentSectorTime2": 184,
    "vehicleScoringPitstops": 192,
    "vehicleScoringPenalties": 194,
    "vehicleTelemetryID":    0,
    "vehicleTelemetryLapNumber": 20,
    "vehicleTelemetryLocalVel": 184,
    "vehicleTelemetryGear":  352,
    "vehicleTelemetryEngineRPM": 356,
    "vehicleTelemetryFuel":   524,
    "vehicleTelemetryFuelCap": 608,
    "vehicleTelemetryDeltaBest": 696,
}

# Candidate offsets for fields the Go parser does NOT yet know.
# Each entry: (cc_field_name, candidate_offsets_in_lmu_data, c_type, comment).
# c_type is one of: "u8", "i8", "u16", "i16", "u32", "i32", "f32", "f64", "u8[8]", "i8[3]".
# Multi-candidate lists are searched so we can pick the right one from
# the capture report. The exact offset for each field is something only
# live capture can confirm — these are the best guesses from the
# rFactor2 struct layout (RF2Data.cs in the CrewChief source).
#
# Format: a list of dicts, one per unknown field, each with:
#   field: human-readable name
#   block: which mmap block ("scoring" or "telemetry" or "vehicle")
#   rel: candidate RELATIVE offsets within that block (the absolute
#        offset is computed as base + rel for telemetry/vehicle blocks)
#   type: c type for struct.unpack
#   cc_ref: where in CC this field is defined
CANDIDATES = [
    # === Scoring block (absolute offsets) ===
    {
        "field": "mYellowFlagState",
        "block": "scoring",
        "rel": [78],  # single byte after mGamePhase (offset 1740+4=1744 minus 4 bytes for game phase itself; layout per RF2Data.cs:396-408)
        "type": "i8",
        "cc_ref": "RF2Data.cs:408 public sbyte mYellowFlagState",
    },
    {
        "field": "mSectorFlag[3]",
        "block": "scoring",
        "rel": [79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90],
        "type": "i8",
        "cc_ref": "RF2Data.cs:411 public sbyte[] mSectorFlag (size 3, after mYellowFlagState)",
        "array_len": 3,
    },
    {
        "field": "mInRealtime",
        "block": "scoring",
        "rel": [92, 93, 94, 95],
        "type": "u8",
        "cc_ref": "RF2Data.cs:414 public byte mInRealtime (after sector flag)",
    },
    # === Telemetry block (player slot, base 128468) ===
    {
        "field": "mDentSeverity[8]",
        "block": "telemetry",
        "rel": [276, 280, 284, 288, 292, 296, 300, 304, 308, 312, 316, 320],
        "type": "u8",
        "cc_ref": "RF2Data.cs:322 public byte[] mDentSeverity (size 8, after position+orientation)",
        "array_len": 8,
    },
    {
        "field": "mDetached",
        "block": "telemetry",
        "rel": [272, 273, 274, 275],
        "type": "u8",
        "cc_ref": "RF2Data.cs:319 public byte mDetached (boolean: any parts detached)",
    },
    {
        "field": "mLastImpactET",
        "block": "telemetry",
        "rel": [328, 336, 344, 352, 360, 368],
        "type": "f64",
        "cc_ref": "RF2Data.cs:323 public double mLastImpactET (seconds since session start)",
    },
    {
        "field": "mLastImpactMagnitude",
        "block": "telemetry",
        "rel": [336, 344, 352, 360, 368, 376],
        "type": "f64",
        "cc_ref": "RF2Data.cs:324 public double mLastImpactMagnitude",
    },
    {
        "field": "mEngineWaterTemp",
        "block": "telemetry",
        "rel": [800, 808, 816, 824, 832, 840, 848, 856, 864, 872, 880, 888, 896, 904],
        "type": "f32",
        "cc_ref": "RF2GameStateMapper.cs maps engine water temp; offset approximate",
    },
    {
        "field": "mEngineOilTemp",
        "block": "telemetry",
        "rel": [800, 808, 816, 824, 832, 840, 848, 856, 864, 872, 880, 888, 896, 904],
        "type": "f32",
        "cc_ref": "RF2GameStateMapper.cs maps engine oil temp; offset approximate",
    },
    {
        "field": "mElectricBatteryPercentage",
        "block": "telemetry",
        "rel": [912, 920, 928, 936, 944, 952, 960, 968, 976, 984],
        "type": "f32",
        "cc_ref": "Battery.cs:77 BatteryLowThreshold; LMU may not have separate SOC field",
    },
    {
        "field": "tyre_temp_FL",
        "block": "telemetry",
        "rel": list(range(1000, 1080, 4)),
        "type": "f32",
        "cc_ref": "RF2GameStateMapper.cs maps tyre temps (4 wheels)",
    },
    {
        "field": "tyre_temp_FR",
        "block": "telemetry",
        "rel": list(range(1000, 1080, 4)),
        "type": "f32",
        "cc_ref": "RF2GameStateMapper.cs maps tyre temps (4 wheels)",
    },
    {
        "field": "tyre_temp_RL",
        "block": "telemetry",
        "rel": list(range(1000, 1080, 4)),
        "type": "f32",
        "cc_ref": "RF2GameStateMapper.cs maps tyre temps (4 wheels)",
    },
    {
        "field": "tyre_temp_RR",
        "block": "telemetry",
        "rel": list(range(1000, 1080, 4)),
        "type": "f32",
        "cc_ref": "RF2GameStateMapper.cs maps tyre temps (4 wheels)",
    },
    {
        "field": "brake_temp_FL",
        "block": "telemetry",
        "rel": list(range(1100, 1180, 4)),
        "type": "f32",
        "cc_ref": "RF2GameStateMapper.cs maps brake temps (4 wheels)",
    },
    # === Vehicle scoring block (slot 0, base 2192) ===
    {
        "field": "mVehicleClass_slot0",
        "block": "vehicle",
        "rel": [KNOWN_OFFSETS["vehicleScoringVehicleClass"]],
        "type": "str32",
        "cc_ref": "RF2Data.cs vehicle class field, slot 0",
    },
    {
        "field": "mBestLapTime_slot0",
        "block": "vehicle",
        "rel": [KNOWN_OFFSETS["vehicleScoringBestLapTime"]],
        "type": "f64",
        "cc_ref": "vehicle best lap, slot 0 (player)",
    },
]

C_TYPE_SIZES = {
    "u8": 1, "i8": 1, "u16": 2, "i16": 2,
    "u32": 4, "i32": 4, "f32": 4, "f64": 8,
}

C_TYPE_FORMATS = {
    "u8": "B", "i8": "b", "u16": "H", "i16": "h",
    "u32": "I", "i32": "i", "f32": "f", "f64": "d",
}


# === Cross-platform LMU_Data mmap reader ===

class LMUReader:
    """Attach to the LMU_Data shared memory region. Multi-platform."""

    def __init__(self):
        self.data = None
        self._win_handle = None
        self._win_map = None
        self._shm_fd = None

    def open(self):
        if sys.platform == "win32":
            self._open_windows()
        else:
            # LMU is Windows-only; on Unix this is a stub for testing only.
            raise RuntimeError("LMU capture script only supports Windows. "
                               "On Unix, open a binary LMU capture manually.")

    def _open_windows(self):
        import ctypes.wintypes as w  # type: ignore

        kernel32 = ctypes.windll.kernel32
        # PAGE_READONLY = 0x04, FILE_MAP_READ = 0x0004
        hMap = kernel32.OpenFileMappingW(0x0004, False, LMU_MEMORY_NAME)
        if not hMap:
            err = ctypes.GetLastError()
            raise RuntimeError(
                f"OpenFileMappingW('{LMU_MEMORY_NAME}') failed: error {err}. "
                f"Is Le Mans Ultimate running and on-track?"
            )
        self._win_handle = hMap

        # void* MapViewOfFile(HANDLE, DWORD, DWORD, DWORD, SIZE_T)
        ptr = kernel32.MapViewOfFile(hMap, 0x0004, 0, 0, LMU_MMAP_SIZE)
        if not ptr:
            err = ctypes.GetLastError()
            kernel32.CloseHandle(hMap)
            self._win_handle = None
            raise RuntimeError(f"MapViewOfFile failed: error {err}")
        self._win_map = ptr
        # Cast void* to bytes. ctypes.string_at copies; we re-read on
        # each snapshot.
        self._addr = ptr

    def read(self):
        if sys.platform == "win32":
            # ctypes.string_at returns a fresh copy each call.
            return bytes(ctypes.string_at(self._addr, LMU_MMAP_SIZE))
        raise RuntimeError("unsupported platform")

    def close(self):
        if sys.platform == "win32":
            kernel32 = ctypes.windll.kernel32
            if self._win_map:
                kernel32.UnmapViewOfFile(self._win_map)
                self._win_map = None
            if self._win_handle:
                kernel32.CloseHandle(self._win_handle)
                self._win_handle = None


# === Helpers ===

def read_at(buf, abs_offset, c_type, array_len=1):
    """Read a value at abs_offset from buf using c_type."""
    if c_type == "str32":
        # Null-terminated ASCII string up to 32 bytes.
        end = abs_offset + 32
        chunk = buf[abs_offset:end]
        nul = chunk.find(b"\x00")
        if nul >= 0:
            chunk = chunk[:nul]
        return chunk.decode("ascii", errors="replace")
    size = C_TYPE_SIZES[c_type]
    if abs_offset + size > len(buf):
        return None
    raw = buf[abs_offset:abs_offset + size]
    fmt = C_TYPE_FORMATS[c_type]
    val = struct.unpack("<" + fmt, raw)[0]
    if array_len > 1:
        # Multi-byte array — return as list (treating as bytes).
        return [b for b in raw[:array_len]]
    return val


def block_base(block):
    if block == "scoring":
        return KNOWN_OFFSETS["scoringInfoOffset"]
    if block == "telemetry":
        # Player slot 0 by default.
        return KNOWN_OFFSETS["telemetryTelemOffset"] + 0 * KNOWN_OFFSETS["telemetryTelemStride"]
    if block == "vehicle":
        return KNOWN_OFFSETS["vehicleScoringOffset"] + 0 * KNOWN_OFFSETS["vehicleScoringStride"]
    raise ValueError(block)


# === Main capture flow ===

def main():
    ap = argparse.ArgumentParser(description="LMU live capture for Vantare engineer.")
    ap.add_argument("--out", default="docs/lmu-capture",
                    help="output directory (default: docs/lmu-capture)")
    ap.add_argument("--count", type=int, default=3,
                    help="number of snapshots (default: 3)")
    ap.add_argument("--interval", type=float, default=1.0,
                    help="seconds between snapshots (default: 1.0)")
    args = ap.parse_args()

    outdir = Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)

    print(f"[capture] output dir: {outdir}")
    print(f"[capture] opening LMU_Data shared memory ({LMU_MMAP_SIZE} bytes)...")

    r = LMUReader()
    try:
        r.open()
    except RuntimeError as e:
        print(f"[capture] ERROR: {e}")
        sys.exit(1)

    print(f"[capture] attached. capturing {args.count} snapshots "
          f"every {args.interval}s...")

    snapshots = []
    for i in range(args.count):
        ts = time.time()
        data = r.read()
        label = ["pits", "outlap", "driving"][i] if i < 3 else f"snap{i}"
        path = outdir / f"snapshot-{i:02d}-{label}.bin"
        path.write_bytes(data)
        snapshots.append((label, ts, path))
        print(f"[capture] snapshot {i+1}/{args.count} -> {path.name} "
              f"({len(data)} bytes)")
        if i < args.count - 1:
            time.sleep(args.interval)

    r.close()

    # === Sanity checks ===
    sanity_lines = ["# LMU Live Capture Report", ""]
    sanity_lines.append(f"Captured at: {datetime.now().isoformat()}")
    sanity_lines.append(f"Snapshots: {args.count} at {args.interval}s intervals")
    sanity_lines.append("")
    sanity_lines.append("## Sanity checks (known offsets)")
    for sname, ts, path in snapshots:
        data = path.read_bytes()
        n = struct.unpack("<i", data[KNOWN_OFFSETS["scoringNumVehicles"]:KNOWN_OFFSETS["scoringNumVehicles"]+4])[0]
        gp = data[KNOWN_OFFSETS["scoringGamePhase"]]
        ph = data[KNOWN_OFFSETS["telemetryPlayerHas"]]
        sanity_lines.append(f"### snapshot {sname} ({path.name})")
        sanity_lines.append(f"- mNumVehicles = {n}")
        sanity_lines.append(f"- mGamePhase = {gp} "
                            f"(5=GreenFlag, 6=FCY, 7=SessionStopped, 8=SessionOver)")
        sanity_lines.append(f"- player has vehicle = {ph}")
        sanity_lines.append("")

    # === Candidate offsets report ===
    sanity_lines.append("## Candidate offsets (unknown fields)")
    sanity_lines.append("")
    sanity_lines.append("These offsets are best-guess from the rF2 struct layout in")
    sanity_lines.append("RF2Data.cs. Compare values across the 3 snapshots — the")
    sanity_lines.append("right offset is the one whose value changes when it should")
    sanity_lines.append("(e.g. mYellowFlagState changes between green flag and FCY;")
    sanity_lines.append("mDetached goes 0->1 when you crash; battery % drops over time).")
    sanity_lines.append("")

    # Build per-snapshot value tables.
    snap_data = {sname: path.read_bytes() for sname, _, path in snapshots}

    for cand in CANDIDATES:
        field = cand["field"]
        block = cand["block"]
        ctype = cand["type"]
        rels = cand["rel"]
        arr_len = cand.get("array_len", 1)
        base = block_base(block)
        sanity_lines.append(f"### {field}  ({cand['cc_ref']})")
        sanity_lines.append(f"block: {block}, base={base}, type={ctype}")
        for rel in rels:
            abs_off = base + rel
            vals = []
            for sname, _, _ in snapshots:
                v = read_at(snap_data[sname], abs_off, ctype, arr_len)
                if v is None:
                    vals.append("(out of range)")
                else:
                    if isinstance(v, list):
                        vals.append("[" + ", ".join(f"0x{b:02x}" for b in v) + "]")
                    else:
                        vals.append(repr(v))
            marker = ""
            if len(set(vals)) > 1:
                marker = "  **CHANGED**"
            sanity_lines.append(f"  rel=+{rel:4d} abs=0x{abs_off:05x} ({abs_off:6d})  "
                                f"{' | '.join(f'{s}={v}' for s, v in zip([s[0] for s in snapshots], vals))}{marker}")
        sanity_lines.append("")

    outdir.joinpath("capture-report.md").write_text("\n".join(sanity_lines))
    print(f"[capture] wrote {outdir/'capture-report.md'}")
    print("[capture] done. Review capture-report.md and commit the 4 files.")


if __name__ == "__main__":
    main()