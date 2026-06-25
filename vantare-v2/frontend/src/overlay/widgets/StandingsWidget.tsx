import { useCallback, useEffect, useRef } from "react";
import { getTelemetryRef, resolveSessionMode, type SessionMode, type VehicleScoring } from "../../lib/telemetry-ref";
import { getMockTelemetry, getMockTelemetryForSession, type MockSessionScenario } from "./mock-telemetry";
import type { WidgetTelemetryMode } from "./use-widget-telemetry";
import { resolveWidgetAppearance } from "./widget-appearance";
import { setHTMLIfChanged } from "../../lib/dom-write";
import { escapeHTML } from "../../lib/html-escape";
import { brandTextColor } from "../../lib/color-utils";
import { startFrameBudgetLoop } from "../../lib/frame-budget";
import type { ColumnConfig } from "../../lib/profile";
import { createDefaultStandingsColumns, getStandingsColumn } from "./standings-catalog";
import {
  formatStandingsDriverName,
  formatStandingsLapTime,
  getStandingsColumnAlign,
  getStandingsColumnColor,
  getStandingsColumnWidth,
  getStandingsIntrinsicWidth,
  getStandingsJustifyClass,
} from "./standings-format";

type StandingsProps = {
  editMode: boolean;
  telemetryMode?: WidgetTelemetryMode;
  mockSessionScenario?: MockSessionScenario;
  updateHz?: number;
  props?: Record<string, unknown>;
};

const BAKED_PANEL_BG = "linear-gradient(180deg, #3a050a 0%, #0d0102 100%)";
const BAKED_HEADER_BG = "linear-gradient(180deg, #9b2226 0%, #3a050a 100%)";
const BAKED_CLASS_BG = "linear-gradient(90deg, #9b2226 0%, #e63946 50%, #9b2226 100%)";
const ON_TRACK_COLOR = "#FFFFFF";
const PIT_COLOR = "#9CA3AF";

type StandingsRenderVariant = {
  columns?: ColumnConfig[];
};

function getActiveStandingsColumns(props?: Record<string, unknown>): ColumnConfig[] {
  const variant = props?.variant as StandingsRenderVariant | undefined;
  const sourceColumns = variant?.columns?.length ? variant.columns : createDefaultStandingsColumns();
  return sourceColumns.filter((column) => column.enabled && getStandingsColumn(column.id));
}

// eslint-disable-next-line react-refresh/only-export-components
export function formatStandingsGap(
  v: Partial<VehicleScoring>,
  classLeader: Partial<VehicleScoring> | undefined
): string {
  if (!classLeader || v.id === classLeader.id) return "Leader";
  const lapsDiff = (v.lapsBehindLeader ?? 0) - (classLeader.lapsBehindLeader ?? 0);
  if (lapsDiff > 0) return `+${lapsDiff}L`;
  const timeDiff = (v.timeBehindLeader ?? 0) - (classLeader.timeBehindLeader ?? 0);
  if (timeDiff > 0) return `+${timeDiff.toFixed(3)}s`;
  return "—";
}

// eslint-disable-next-line react-refresh/only-export-components
export function formatStandingsPit(v: Partial<VehicleScoring>): string {
  if (v.inGarageStall) return "GARAGE";
  if (v.pitting || v.inPits || (v.pitState && v.pitState !== "NONE")) return "PIT";
  return "";
}

function formatLapTime(seconds: number | undefined): string {
  if (seconds == null || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
}

// eslint-disable-next-line react-refresh/only-export-components
export function formatRemainingTime(seconds: number | undefined): string {
  if (seconds == null || seconds < 0 || !Number.isFinite(seconds)) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

// eslint-disable-next-line react-refresh/only-export-components
export function formatStandingsGapForMode(
  mode: SessionMode,
  v: Partial<VehicleScoring>,
  classLeader: Partial<VehicleScoring> | undefined
): string {
  if (mode === "practice" || mode === "qual") {
    return formatLapTime(v.bestLapTime);
  }
  return formatStandingsGap(v, classLeader);
}

function tireBadgeHtml(compound: string | undefined, tireSoft: string, tireMedium: string, tireHard: string): string {
  if (!compound) return "";
  const c = compound.toUpperCase();
  let color = "#9CA3AF";
  if (c === "S") color = tireSoft;
  else if (c === "M") color = tireMedium;
  else if (c === "H") color = tireHard;
  return `<span class="inline-flex items-center justify-center w-4 h-4 text-[8px] font-black rounded-sm" style="background:${color};color:#000">${c}</span>`;
}

function brandInitial(name: string | undefined): string {
  const n = name ?? "";
  return n.split(/[\s-]/).map((p) => p[0] ?? "").slice(0, 2).join("").toUpperCase();
}

export function StandingsWidget({ editMode, telemetryMode, mockSessionScenario, props, updateHz = 15 }: StandingsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const classRef = useRef<HTMLDivElement>(null);
  const maxRows = (props?.maxRows as number) ?? 12;
  const lastFingerprintRef = useRef("");

  const { appearance: a } = resolveWidgetAppearance("standings", props);
  const activeColumns = getActiveStandingsColumns(props);
  const intrinsicWidth = getStandingsIntrinsicWidth(activeColumns);
  const fillHost = props?.__previewFillHost !== false;
  const intrinsicOnly = !fillHost;

  const readTelemetry = useCallback(
    () =>
      (telemetryMode ?? (editMode ? "mock" : "live")) === "mock"
        ? mockSessionScenario
          ? getMockTelemetryForSession(mockSessionScenario)
          : getMockTelemetry()
        : getTelemetryRef(),
    [editMode, mockSessionScenario, telemetryMode],
  );

  useEffect(() => {
    return startFrameBudgetLoop(updateHz, () => {
      const t = readTelemetry();
      const container = containerRef.current;
      if (!container) return;

      const player = t.vehicles.find((v) => v.isPlayer);
      const activeClass = player?.vehicleClass || t.vehicles[0]?.vehicleClass || "HYPERCAR";
      const classVehicles = t.vehicles.filter(
        (v) => (v.vehicleClass ?? "").toUpperCase() === activeClass.toUpperCase()
      );

      const allVehicles = [...classVehicles].sort((x, y) => (x.place ?? 99) - (y.place ?? 99));
      const sorted = allVehicles.slice(0, Math.min(maxRows, allVehicles.length));

      const mode = resolveSessionMode(t.sessionType, t.sessionName);

      const columnFingerprint = activeColumns
        .map((column) => `${column.id}:${column.metricId}:${column.enabled}:${column.width ?? ""}:${JSON.stringify(column.format ?? {})}:${JSON.stringify(column.style ?? {})}`)
        .join(",");
      const fingerprint = mode + "|" + activeClass + "|" + (t.timeRemaining ?? 0).toFixed(0) + "|" + columnFingerprint + "|" + sorted.map(v =>
        `${v.id}:${v.place}:${v.inPits}:${v.pitState}:${v.pitting}:${v.inGarageStall}:${v.fastestLap}:${v.bestLapTime?.toFixed(1)}:${v.lastLapTime?.toFixed(1)}:${v.timeBehindLeader?.toFixed(3)}:${v.lapsBehindLeader}:${v.totalLaps}:${v.timeBehindNext?.toFixed(3)}:${v.tireCompound}`
      ).join("|");
      if (fingerprint === lastFingerprintRef.current) return;
      lastFingerprintRef.current = fingerprint;

      if (timeRef.current) {
        setHTMLIfChanged(timeRef.current, formatRemainingTime(t.timeRemaining));
      }
      if (classRef.current) {
        setHTMLIfChanged(classRef.current, activeClass.toUpperCase());
      }

      const rowHeight = 24;
      const classLeader = sorted[0];

      const rows = sorted.map((v, i) => {
        const bgRow = i % 2 === 0 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.3)";
        const isLeader = i === 0;
        const pitLabel = formatStandingsPit(v);
        const pitting = pitLabel !== "";
        const gapText = mode === "race" && v.fastestLap ? "FASTEST" : formatStandingsGapForMode(mode, v, classLeader);
        const gapColor = isLeader ? a.posLeaderColor : "";
        const posColor = isLeader ? a.posLeaderColor : ON_TRACK_COLOR;
        const rowTextColor = pitting ? PIT_COLOR : ON_TRACK_COLOR;
        const classPlace = i + 1;

        const numColor = pitLabel ? "#000000" : rowTextColor;
        const numBg = pitLabel ? a.pitColor : (v.teamBrandColor || "transparent");
        const teamColor = isLeader ? a.posLeaderColor : rowTextColor;

        const hasBrand = !!v.teamBrandColor;
        const bi = hasBrand ? brandInitial(v.driverName) : "";
        const teamBg = v.teamBrandColor || "transparent";
        const tc = hasBrand ? brandTextColor(teamBg) : rowTextColor;

        const leaderShadow = isLeader ? `box-shadow: inset 2px 0 0 0 ${a.posLeaderColor}` : "";
        const fastestShadow = v.fastestLap ? `box-shadow: inset 2px 0 0 0 ${a.textColor}` : "";
        const leftInset = fastestShadow || leaderShadow;

        const brandCell = hasBrand
          ? `<div class="w-7 flex items-center justify-center py-[2px] px-[2px] shrink-0" style="height:${rowHeight}px">
            <div class="w-full h-full flex items-center justify-center" style="background:${teamBg}">
              <span class="font-black text-[10px]" style="color:${tc}">${bi}</span>
            </div>
          </div>`
          : "";

        const cells = activeColumns.map((column) => {
          const def = getStandingsColumn(column.id);
          const fallbackWidth = def?.defaultWidth ?? 0;
          const width = getStandingsColumnWidth(column, fallbackWidth);
          const baseStyle = `width:${width}px`;

          switch (column.id) {
          case "position":
            return `<div class="text-center shrink-0" style="${baseStyle};color:${posColor}">${classPlace}</div>`;

          case "driverNumber": {
            return `<div class="flex items-center justify-center py-[2px] px-[2px] shrink-0" style="${baseStyle};height:${rowHeight}px">
              <div class="w-5 h-[18px] flex items-center justify-center relative" style="background:${numBg};${pitLabel ? `border:1px solid ${a.pitColor}` : ""}">
                <span class="font-black text-[11px]" style="color:${numColor}">${escapeHTML(v.driverNumber ?? "")}</span>
                ${pitLabel ? `<div class="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[6px] px-0.5 rounded-sm leading-none whitespace-nowrap font-black" style="background:${a.pitColor};color:#000">PIT</div>` : ""}
              </div>
            </div>`;
          }

          case "driverName": {
            const color = getStandingsColumnColor(column, teamColor);
            const align = getStandingsColumnAlign(column, "left");
            return `<div class="px-1 tracking-wide shrink-0 whitespace-nowrap overflow-hidden ${getStandingsJustifyClass(align)}" style="${baseStyle};color:${color}" data-standings-col="driverName">
              ${escapeHTML(formatStandingsDriverName(v.driverName, column))}
            </div>`;
          }

          case "vehicleClass": {
            const color = getStandingsColumnColor(column, rowTextColor);
            const align = getStandingsColumnAlign(column, "right");
            return `<div class="px-2 flex items-center font-mono text-[9px] shrink-0 ${getStandingsJustifyClass(align)}" style="${baseStyle};color:${color}">
              ${escapeHTML(v.vehicleClass ?? "")}
            </div>`;
          }

          case "currentLap": {
            const color = getStandingsColumnColor(column, rowTextColor);
            const align = getStandingsColumnAlign(column, "right");
            return `<div class="px-2 flex items-center font-mono text-[9px] shrink-0 ${getStandingsJustifyClass(align)}" style="${baseStyle};color:${color}">
              ${v.totalLaps ?? ""}
            </div>`;
          }

          case "gap": {
            const color = gapColor || getStandingsColumnColor(column, rowTextColor);
            const align = getStandingsColumnAlign(column, "right");
            return `<div class="px-2 flex items-center justify-end font-mono text-[9px] shrink-0 gap-1 ${getStandingsJustifyClass(align)}" style="${baseStyle};color:${rowTextColor}">
              ${tireBadgeHtml(v.tireCompound, a.tireSoftColor, a.tireMediumColor, a.tireHardColor)}
              <span style="${color ? `color:${color}` : ""}">${escapeHTML(gapText)}</span>
            </div>`;
          }

          case "interval": {
            const color = getStandingsColumnColor(column, rowTextColor);
            const align = getStandingsColumnAlign(column, "right");
            const interval = v.timeBehindNext != null ? `+${v.timeBehindNext.toFixed(3)}s` : "—";
            return `<div class="px-2 flex items-center font-mono text-[9px] shrink-0 ${getStandingsJustifyClass(align)}" style="${baseStyle};color:${color}">
              ${interval}
            </div>`;
          }

          case "bestLap": {
            const color = getStandingsColumnColor(column, rowTextColor);
            const align = getStandingsColumnAlign(column, "right");
            return `<div class="px-2 flex items-center font-mono text-[9px] shrink-0 ${getStandingsJustifyClass(align)}" style="${baseStyle};color:${color}">
              ${escapeHTML(formatStandingsLapTime(v.bestLapTime, column))}
            </div>`;
          }

          case "lastLap": {
            const color = getStandingsColumnColor(column, rowTextColor);
            const align = getStandingsColumnAlign(column, "right");
            return `<div class="px-2 flex items-center font-mono text-[9px] shrink-0 ${getStandingsJustifyClass(align)}" style="${baseStyle};color:${color}">
              ${escapeHTML(formatStandingsLapTime(v.lastLapTime, column))}
            </div>`;
          }

          default:
            return "";
          }
        }).join("");

        const rowWidthStyle = intrinsicOnly
          ? `width:${intrinsicWidth}px`
          : `min-width:${intrinsicWidth}px;width:max(100%, ${intrinsicWidth}px)`;

        return `<div class="flex items-center text-[11px] font-bold border-b border-black/20 transition-all" data-standings-row style="${rowWidthStyle};height:${rowHeight}px;background:${bgRow};${leftInset}">
          ${brandCell}${cells}
        </div>`;
      });

      setHTMLIfChanged(container, rows.join(""));
    });
  }, [maxRows, updateHz, editMode, telemetryMode, mockSessionScenario, props, a, activeColumns, intrinsicWidth, intrinsicOnly, readTelemetry]);

  const t = readTelemetry();
  const player = t.vehicles.find((v) => v.isPlayer);
  const activeClass = player?.vehicleClass || t.vehicles[0]?.vehicleClass || "HYPERCAR";
  const timeStr = formatRemainingTime(t.timeRemaining);

  return (
    <div
      data-testid="standings-panel"
      className={`${intrinsicOnly ? "inline-flex" : "flex w-full"} h-fit flex-col overflow-hidden rounded-lg`}
      style={{
        width: intrinsicOnly ? `${intrinsicWidth}px` : undefined,
        background: BAKED_PANEL_BG,
        border: `1px solid ${a.borderColor}`,
        color: a.textColor,
        opacity: a.opacity,
      }}
    >
      <div
        className={`flex flex-col items-center pt-4 pb-2 ${!intrinsicOnly ? "w-full" : ""}`}
        style={{ background: BAKED_HEADER_BG, borderBottom: "2px solid #1a0104" }}
      >
        <div className="text-3xl font-black italic tracking-widest mb-1 text-white font-display">VANTARE</div>
        <div ref={timeRef} className="text-[11px] font-mono font-bold text-white tracking-widest">{timeStr}</div>
      </div>
      <div
        ref={classRef}
        className={`text-center text-[11px] py-1 font-bold tracking-widest text-white relative ${!intrinsicOnly ? "w-full" : ""}`}
        style={{ background: BAKED_CLASS_BG, borderBottom: "1px solid #000" }}
      >
        {activeClass.toUpperCase()}
      </div>
      <div ref={containerRef} className={`mt-1 px-1 ${!intrinsicOnly ? "w-full" : ""}`} />
      <div className={`mt-1 py-1 text-center text-[8px] tracking-widest text-white/50 font-bold border-t border-black ${!intrinsicOnly ? "w-full" : ""}`} style={{ background: "#1a0104" }}>
        LE MANS ULTIMATE
      </div>
    </div>
  );
}
