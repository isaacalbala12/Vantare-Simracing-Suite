import { useEffect, useMemo, useState } from "react";
import { getWidgetTelemetrySource } from "./use-widget-telemetry";
import type { WidgetTelemetryMode } from "./use-widget-telemetry";
import { resolveWidgetAppearance } from "./widget-appearance";
import { resolveClassColor } from "./relative-widget-helpers";
import type { VehicleScoring } from "../../lib/telemetry-ref";

type MulticlassRelativeProps = {
  editMode: boolean;
  telemetryMode?: WidgetTelemetryMode;
  mockSessionScenario?: "practice" | "qual" | "race";
  updateHz?: number;
  props?: Record<string, unknown>;
};

function formatGap(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  if (seconds === 0) return "—";
  const sign = seconds > 0 ? "+" : "";
  return `${sign}${seconds.toFixed(1)}s`;
}

function classBadge(vehicleClass: string | undefined): string {
  const cls = (vehicleClass ?? "").toUpperCase();
  if (cls === "HYPERCAR") return "HC";
  if (cls === "LMP2") return "LMP2";
  if (cls === "LMP3") return "LMP3";
  if (cls === "GT3" || cls === "LMGT3") return "GT3";
  return cls || "—";
}

function selectPreviewRows(vehicles: VehicleScoring[]): VehicleScoring[] {
  const sorted = [...vehicles]
    .filter((v) => v.place != null)
    .sort((a, b) => a.place! - b.place!);
  // Include player + a few cars around them for multiclass preview
  const player = sorted.find((v) => v.isPlayer);
  if (player) {
    const idx = sorted.indexOf(player);
    const start = Math.max(0, idx - 1);
    return sorted.slice(start, start + 5);
  }
  return sorted.slice(0, 5);
}

export function MulticlassRelativeWidget({
  editMode,
  telemetryMode,
  updateHz = 15,
  props,
}: MulticlassRelativeProps) {
  const { appearance: a } = resolveWidgetAppearance("multiclass-relative", props);
  const getTelemetry = useMemo(
    () => getWidgetTelemetrySource(telemetryMode ?? (editMode ? "mock" : "live")),
    [editMode, telemetryMode],
  );
  const [rows, setRows] = useState<VehicleScoring[]>(() => selectPreviewRows(getTelemetry().vehicles ?? []));

  useEffect(() => {
    let active = true;
    const id = setInterval(() => {
      if (!active) return;
      const t = getTelemetry();
      setRows(selectPreviewRows(t.vehicles ?? []));
    }, 1000 / updateHz);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [updateHz, getTelemetry]);

  return (
    <div
      data-testid="multiclass-relative-widget"
      className="w-full h-full flex flex-col overflow-hidden font-display"
      style={{
        backgroundColor: a.backgroundColor,
        color: a.textColor,
      }}
    >
      {rows.map((v, i) => {
        const badgeColor = resolveClassColor(v.vehicleClass, a);
        const isPlayer = v.isPlayer;
        return (
          <div
            key={v.id}
            className="flex items-center gap-2 px-2"
            style={{
              height: `${100 / Math.max(rows.length, 1)}%`,
              backgroundColor: isPlayer ? a.positiveColor + "18" : i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.3)",
              borderBottom: i < rows.length - 1 ? `1px solid ${a.borderColor}` : undefined,
            }}
          >
            <span
              className="text-[10px] font-bold w-5 text-center rounded"
              style={{ backgroundColor: badgeColor, color: "#fff" }}
            >
              {classBadge(v.vehicleClass)}
            </span>
            <span
              className="text-[10px] font-bold w-4 text-center"
              style={{ color: a.accentColor }}
            >
              {v.place ?? "—"}
            </span>
            <span
              className="text-xs font-semibold truncate flex-1"
              style={{ color: isPlayer ? a.accentColor : a.textColor }}
            >
              {v.driverName ?? "—"}
            </span>
            <span
              className="text-[10px]"
              style={{ color: a.gapAheadColor }}
            >
              {formatGap(v.timeBehindLeader)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
