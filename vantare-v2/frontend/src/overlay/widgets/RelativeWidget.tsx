import { useEffect, useRef } from "react";
import { getTelemetryRef, type VehicleScoring } from "../../lib/telemetry-ref";
import { getMockTelemetry } from "./mock-telemetry";
import type { WidgetTelemetryMode } from "./use-widget-telemetry";
import { resolveWidgetAppearance } from "./widget-appearance";
import { setHTMLIfChanged } from "../../lib/dom-write";
import { escapeHTML } from "../../lib/html-escape";
import { brandTextColor } from "../../lib/color-utils";
import { startFrameBudgetLoop } from "../../lib/frame-budget";

type RelativeProps = {
  editMode: boolean;
  telemetryMode?: WidgetTelemetryMode;
  updateHz?: number;
  props?: Record<string, unknown>;
};

const BAKED_PANEL_BG = "linear-gradient(180deg, #3a050a 0%, #0d0102 100%)";
const BAKED_HEADER_BG = "linear-gradient(180deg, #9b2226 0%, #3a050a 100%)";
const BAKED_CLASS_BG = "linear-gradient(90deg, #111 0%, #222 50%, #111 100%)";
const BAKED_PLAYER_BG = "linear-gradient(90deg, rgba(230,57,70,0.2) 0%, rgba(155,34,38,0.4) 100%)";

export function selectRelativeRows(vehicles: Partial<VehicleScoring>[], rangeAhead: number, rangeBehind: number): Partial<VehicleScoring>[] {
  const player = vehicles.find((v) => v.isPlayer);
  if (!player || player.lapDistance == null) {
    const sortedByPlace = [...vehicles].sort((x, y) => (x.place ?? 99) - (y.place ?? 99));
    const idx = sortedByPlace.findIndex((v) => v.isPlayer);
    if (idx < 0) return [];
    return sortedByPlace.slice(Math.max(0, idx - rangeAhead), Math.min(sortedByPlace.length, idx + rangeBehind + 1));
  }
  const playerDistance = player.lapDistance;
  const withDelta = vehicles.map((v) => ({
    vehicle: v,
    delta: (v.lapDistance ?? playerDistance) - playerDistance,
  }));
  const ahead = withDelta
    .filter((x) => x.delta > 0 && !x.vehicle.isPlayer)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, rangeAhead)
    .map((x) => x.vehicle)
    .reverse();
  const behind = withDelta
    .filter((x) => x.delta < 0 && !x.vehicle.isPlayer)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, rangeBehind)
    .map((x) => x.vehicle);
  return [...ahead, player, ...behind];
}

export function resolveClassColor(
  vehicleClass: string | undefined,
  a: Record<string, string>
): string {
  const cls = (vehicleClass ?? "").toUpperCase();
  if (cls === "HYPERCAR") return a.classHypercarColor;
  if (cls === "LMP2") return a.classLmp2Color;
  if (cls === "LMP3") return a.classLmp3Color;
  if (cls === "GT3" || cls === "LMGT3") return a.classGt3Color;
  return a.classUnknownColor;
}

export function formatSignedGap(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  if (seconds === 0) return "—";
  const sign = seconds > 0 ? "+" : "";
  return `${sign}${seconds.toFixed(1)}`;
}

export function selectRelativeRowsByGap(
  vehicles: Partial<VehicleScoring>[],
  rangeAhead: number,
  rangeBehind: number
): Partial<VehicleScoring>[] {
  const player = vehicles.find((v) => v.isPlayer);
  if (!player) return [];

  const withGap = vehicles
    .filter((v) => !v.isPlayer && v.timeGapToPlayer != null && Number.isFinite(v.timeGapToPlayer))
    .map((v) => ({ vehicle: v, gap: v.timeGapToPlayer! }));

  const ahead = withGap
    .filter((x) => x.gap > 0)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, rangeAhead)
    .map((x) => x.vehicle);

  const behind = withGap
    .filter((x) => x.gap < 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, rangeBehind)
    .map((x) => x.vehicle);

  return [...ahead, player, ...behind];
}

function truncate(name: string, max: number): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + "…";
}

function isAheadOfPlayer(v: Partial<VehicleScoring>, player: Partial<VehicleScoring>): boolean {
  if (v.lapDistance != null && player.lapDistance != null) {
    return v.lapDistance > player.lapDistance;
  }
  return (v.place ?? 99) < (player.place ?? 99);
}

export function formatRelativeGap(v: Partial<VehicleScoring>, player: Partial<VehicleScoring>): string {
  if (v.isPlayer) return "—";
  if (v.lapDistance != null && player.lapDistance != null) {
    return `${Math.round(Math.abs(v.lapDistance - player.lapDistance))}m`;
  }
  if (v.timeBehindNext != null && v.timeBehindNext > 0) {
    return `${v.timeBehindNext.toFixed(1)}s`;
  }
  return "—";
}

export function relativeGapColor(
  v: Partial<VehicleScoring>,
  player: Partial<VehicleScoring>,
  gapAheadColor: string,
  gapBehindColor: string,
  playerColor: string,
): string {
  if (v.isPlayer) return playerColor;
  return isAheadOfPlayer(v, player) ? gapAheadColor : gapBehindColor;
}

export function RelativeWidget({ editMode, telemetryMode, props, updateHz = 15 }: RelativeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rangeAhead = (props?.rangeAhead as number) ?? 3;
  const rangeBehind = (props?.rangeBehind as number) ?? 3;
  const { appearance: a } = resolveWidgetAppearance("relative", props);

  useEffect(() => {
    return startFrameBudgetLoop(updateHz, () => {
      const t = (telemetryMode ?? (editMode ? "mock" : "live")) === "mock" ? getMockTelemetry() : getTelemetryRef();
      const a = resolveWidgetAppearance("relative", props).appearance;
      const container = containerRef.current;
      if (!container) return;

      // Use timeGapToPlayer-based selection when available, fall back to legacy
      const hasTimeGaps = t.vehicles.some((v) => v.timeGapToPlayer != null && Number.isFinite(v.timeGapToPlayer));
      const visible = hasTimeGaps
        ? selectRelativeRowsByGap(t.vehicles, rangeAhead, rangeBehind)
        : selectRelativeRows(t.vehicles, rangeAhead, rangeBehind);

      const player = visible.find((v) => v.isPlayer);

      if (!player) {
        setHTMLIfChanged(container, `<div class="text-xs font-mono p-2" style="color:color-mix(in srgb, ${a.textColor} 30%, transparent)">No player</div>`);
        return;
      }

      const rows = visible.map((v, idx) => {
        const isP = v.isPlayer;
        const bgRow = idx % 2 === 0 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.3)";

        let gapDisplay: string;
        let gapColor: string;
        if (isP) {
          gapDisplay = "—";
          gapColor = a.textColor;
        } else if (hasTimeGaps && v.timeGapToPlayer != null) {
          gapDisplay = formatSignedGap(v.timeGapToPlayer);
          gapColor = v.timeGapToPlayer > 0 ? a.gapAheadColor : a.gapBehindColor;
        } else {
          gapDisplay = formatRelativeGap(v, player);
          gapColor = relativeGapColor(v, player, a.gapAheadColor, a.gapBehindColor, a.textColor);
        }

        const hasBrand = !!v.teamBrandColor;
        const teamBg = v.teamBrandColor || "transparent";
        const tc = hasBrand ? brandTextColor(teamBg) : "#9CA3AF";

        const leftInset = isP ? `box-shadow: inset 3px 0 0 0 ${a.accentColor}` : "";

        const numberCell = v.driverNumber
          ? `<div class="w-7 h-full flex items-center justify-center py-[2px] px-[2px] ml-1 shrink-0">
            <div class="w-full h-full flex items-center justify-center" style="background:${teamBg}">
              <span class="font-black text-[11px]" style="color:${tc}">${escapeHTML(v.driverNumber)}</span>
            </div>
          </div>`
          : "";

        return `<div class="flex items-center h-[26px] text-[11px] font-bold border-b border-black/20 transition-all" style="background:${isP ? BAKED_PLAYER_BG : bgRow};${leftInset}">
          <div class="w-6 text-center shrink-0" style="color:#9CA3AF">${v.place ?? ""}</div>
          <div class="w-1.5 h-full shrink-0" style="background:${resolveClassColor(v.vehicleClass, a)}"></div>
          ${numberCell}
          <div class="flex-1 px-2 tracking-wide truncate" style="color:${isP ? "#FFFFFF" : "#E5E7EB"}">${escapeHTML(truncate(v.driverName ?? "?", 18))}</div>
          <div class="px-2 flex items-center justify-end font-mono text-[10px] shrink-0">
            <span style="color:${gapColor}">${gapDisplay}</span>
          </div>
        </div>`;
      });

      setHTMLIfChanged(container, rows.join(""));
    });
  }, [rangeAhead, rangeBehind, updateHz, editMode, telemetryMode, props]);

  return (
    <div
      data-testid="relative-panel"
      className="w-full h-full flex flex-col overflow-hidden rounded-lg font-display"
      style={{
        background: BAKED_PANEL_BG,
        border: `1px solid ${a.borderColor}`,
        color: a.textColor,
        opacity: a.opacity,
        boxShadow: "0 10px 40px rgba(0,0,0,0.8)",
      }}
    >
      <div
        className="pt-2 pb-1 flex flex-col items-center"
        style={{ background: BAKED_HEADER_BG, borderBottom: "2px solid #1a0104" }}
      >
        <div className="text-xl font-black italic tracking-widest mb-0.5 text-white">VANTARE</div>
      </div>
      <div
        className="text-center text-[10px] py-1 font-bold tracking-widest text-white relative"
        style={{ background: BAKED_CLASS_BG, borderBottom: "1px solid #000" }}
      >
        RELATIVE
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden mt-1 px-1" />
    </div>
  );
}
