import type { OverlayStandingRowV2 } from "../../../generated/telemetry";

/** Absence on older frames is unknown, never an implicit fresh authority. */
export function standingQuality(row: OverlayStandingRowV2, field: "position" | "classPosition" | "pit" | "laps" | "gapLaps" | "classGap" | "classGapLaps" | "interval" | "intervalLaps") {
 return row.quality?.[field] ?? row.quality?.q ?? "missing";
}

export function standingNumber(row: OverlayStandingRowV2, field: "classGap" | "classGapLaps" | "interval" | "intervalLaps") {
 const n = row[field] ?? 0;
 return standingQuality(row, field) === "fresh" && Number.isFinite(n) ? n : undefined;
}
