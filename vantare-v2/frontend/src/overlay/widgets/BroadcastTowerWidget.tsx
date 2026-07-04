import { useEffect, useMemo, useState } from "react";
import { getWidgetTelemetrySource } from "./use-widget-telemetry";
import type { WidgetTelemetryMode } from "./use-widget-telemetry";
import { resolveWidgetAppearance } from "./widget-appearance";
import type { VehicleScoring } from "../../lib/telemetry-ref";

type BroadcastTowerProps = {
  editMode: boolean;
  telemetryMode?: WidgetTelemetryMode;
  mockSessionScenario?: "practice" | "qual" | "race";
  updateHz?: number;
  props?: Record<string, unknown>;
};

const POS_LABELS = ["1st", "2nd", "3rd", "4th"] as const;

function formatGap(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  if (seconds === 0) return "—";
  const sign = seconds > 0 ? "+" : "";
  return `${sign}${seconds.toFixed(1)}s`;
}

function selectTopFour(vehicles: VehicleScoring[]): VehicleScoring[] {
  return [...vehicles]
    .filter((v) => v.place != null)
    .sort((a, b) => a.place! - b.place!)
    .slice(0, 4);
}

export function BroadcastTowerWidget({
  editMode,
  telemetryMode,
  updateHz = 15,
  props,
}: BroadcastTowerProps) {
  const { appearance: a } = resolveWidgetAppearance("broadcast-tower", props);
  const getTelemetry = useMemo(
    () => getWidgetTelemetrySource(telemetryMode ?? (editMode ? "mock" : "live")),
    [editMode, telemetryMode],
  );
  const [topFour, setTopFour] = useState<VehicleScoring[]>(() => selectTopFour(getTelemetry().vehicles ?? []));

  useEffect(() => {
    let active = true;
    const id = setInterval(() => {
      if (!active) return;
      const t = getTelemetry();
      setTopFour(selectTopFour(t.vehicles ?? []));
    }, 1000 / updateHz);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [updateHz, getTelemetry]);

  return (
    <div
      data-testid="broadcast-tower-widget"
      className="w-full h-full flex items-center overflow-hidden font-display"
      style={{
        backgroundColor: a.backgroundColor,
        color: a.textColor,
        borderTop: `2px solid ${a.borderColor}`,
        borderBottom: `2px solid ${a.borderColor}`,
      }}
    >
      {topFour.map((v, i) => (
        <div
          key={v.id}
          className="flex items-center gap-2 px-3"
          style={{
            borderRight: i < topFour.length - 1 ? `1px solid ${a.borderColor}` : undefined,
          }}
        >
          <span
            className="text-xs font-bold"
            style={{ color: a.accentColor, minWidth: "28px" }}
          >
            {POS_LABELS[i] ?? `P${i + 1}`}
          </span>
          <span
            className="text-xs font-semibold truncate max-w-[120px]"
            style={{ color: a.textColor }}
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
      ))}
    </div>
  );
}
