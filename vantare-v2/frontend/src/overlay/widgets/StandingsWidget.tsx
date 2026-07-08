import { useCallback, useEffect, useRef } from "react";
import { getTelemetryRef, resolveSessionMode, type SessionMode, type TelemetryRefState, type VehicleScoring } from "../../lib/telemetry-ref";
import { getMockTelemetry, getMockTelemetryForSession, type MockSessionScenario } from "./mock-telemetry";
import type { WidgetTelemetryMode } from "./use-widget-telemetry";
import { resolveWidgetAppearance } from "./widget-appearance";
import { resolveWidgetDesignSystem } from "./widget-design-system";
import { setHTMLIfChanged } from "../../lib/dom-write";
import { escapeHTML } from "../../lib/html-escape";
import { startFrameBudgetLoop } from "../../lib/frame-budget";
import type { ColumnConfig } from "../../lib/profile";
import { useWidgetComponents } from "../../hub/registry";
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
import { VantareDiamondLogo } from "./_assets/VantareDiamondLogo";

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
const GLASS_PANEL_BG = "rgba(18,18,22,0.82)";
const GLASS_HEADER_BG = "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)";
const GLASS_CLASS_BG = "rgba(0,0,0,0.45)";
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
  return `<span style="width:14px;height:14px;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:7px;font-weight:800;color:#000;background:${color}">${c}</span>`;
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

  const { style, appearance: a } = resolveWidgetAppearance("standings", props);
  const { Header: CustomHeader } = useWidgetComponents("standings", style);
  const isGlass = style === "vantare-crystal";
  const isCrystal = style === "vantare-crystal";
  const crystal = isCrystal ? resolveWidgetDesignSystem("vantare-crystal") : null;
  const containerStyle = isGlass ? {
    background: "rgba(18,18,22,0.82)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: "16px",
    boxShadow: "0 24px 60px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.1)",
    overflow: "hidden",
  } : {};
  const activeColumns = getActiveStandingsColumns(props);
  const intrinsicWidth = getStandingsIntrinsicWidth(activeColumns);
  const fillHost = props?.__previewFillHost !== false;
  const intrinsicOnly = !fillHost;

  const readTelemetry = useCallback(
    () => {
      const previewTelemetry = props?.__previewTelemetry as TelemetryRefState | undefined;
      if (previewTelemetry) return previewTelemetry;
      return (telemetryMode ?? (editMode ? "mock" : "live")) === "mock"
        ? mockSessionScenario
          ? getMockTelemetryForSession(mockSessionScenario)
          : getMockTelemetry()
        : getTelemetryRef();
    },
    [editMode, mockSessionScenario, telemetryMode, props],
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

      const rowHeight = 28;
      const classLeader = sorted[0];

      const rows = sorted.map((v, i) => {
        const isPlayer = !!v.isPlayer;
        const isLeader = i === 0;
        const baseBgRow = isCrystal && crystal
          ? i % 2 === 0 ? crystal.surfaces.rowEven : crystal.surfaces.rowOdd
          : isGlass
          ? i % 2 === 0 ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.25)"
          : i % 2 === 0 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.3)";
        const bgRow = isCrystal && crystal && isPlayer ? crystal.surfaces.playerHighlight : baseBgRow;
        const pitLabel = formatStandingsPit(v);
        const pitting = pitLabel !== "";
        const gapText = mode === "race" && v.fastestLap ? "FASTEST" : formatStandingsGapForMode(mode, v, classLeader);
        const gapColor = isLeader ? a.posLeaderColor : "";
        const posColor = isLeader ? a.posLeaderColor : ON_TRACK_COLOR;
        const rowTextColor = pitting ? PIT_COLOR : ON_TRACK_COLOR;
        const classPlace = i + 1;

        const teamColor = isLeader ? a.posLeaderColor : rowTextColor;

        const hasBrand = !!v.teamBrandColor;
        const bi = hasBrand ? brandInitial(v.driverName) : "";
        const teamBg = v.teamBrandColor || "transparent";

        const leaderBorder = isLeader && !isPlayer ? `border-left:3px solid ${isCrystal && crystal ? crystal.colors.accent : a.posLeaderColor};` : "";
        const fastestBorder = v.fastestLap && !isPlayer ? `border-left:3px solid ${isCrystal && crystal ? crystal.colors.accent : a.textColor};` : "";
        const playerLeftBorder = isPlayer ? `border-left:3px solid ${isCrystal && crystal ? crystal.colors.accent : a.posLeaderColor};` : "";
        const leftBorder = playerLeftBorder || fastestBorder || leaderBorder;

        const brandCell = hasBrand
          ? `<div style="font-size:8px;font-weight:800;letter-spacing:0.5px;width:20px;text-align:center;justify-self:center;color:${teamBg};flex-shrink:0">${bi}</div>`
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
            return `<div class="flex items-center justify-center shrink-0" style="${baseStyle};height:${rowHeight}px">
              <div style="width:26px;text-align:center;position:relative;display:inline-block;${pitLabel ? `background:${a.pitColor};border-radius:3px` : ""}">
                <span style="font-family:var(--font-mono);font-weight:900;font-size:11px;color:#fff">${escapeHTML(v.driverNumber ?? "")}</span>
                ${pitLabel ? `<div style="position:absolute;top:-6px;left:50%;transform:translateX(-50%);font-size:6px;padding:0 2px;border-radius:2px;line-height:1;white-space:nowrap;font-weight:800;background:${a.pitColor};color:#000">PIT</div>` : ""}
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

        const playerHighlightBorder = isPlayer ? "border-top:1px solid rgba(255,42,59,0.4);border-bottom:1px solid rgba(255,42,59,0.4);" : "";

        return `<div data-standings-row style="display:flex;align-items:center;height:${rowHeight}px;background:${bgRow};border-bottom:1px solid rgba(255,255,255,0.03);padding:0 10px;${leftBorder}${playerHighlightBorder}${rowWidthStyle}">
          ${brandCell}${cells}
        </div>`;
      });

      setHTMLIfChanged(container, rows.join(""));
    });
  }, [maxRows, updateHz, editMode, telemetryMode, mockSessionScenario, props, a, activeColumns, intrinsicWidth, intrinsicOnly, readTelemetry, isGlass, isCrystal, crystal]);

  const t = readTelemetry();
  const player = t.vehicles.find((v) => v.isPlayer);
  const activeClass = player?.vehicleClass || t.vehicles[0]?.vehicleClass || "HYPERCAR";
  const timeStr = formatRemainingTime(t.timeRemaining);

  const panelBg = isCrystal && crystal ? crystal.surfaces.panel : isGlass ? GLASS_PANEL_BG : BAKED_PANEL_BG;
  const headerBg = isCrystal && crystal ? crystal.surfaces.header : isGlass ? GLASS_HEADER_BG : BAKED_HEADER_BG;
  const classBg = isCrystal && crystal ? `linear-gradient(90deg, ${crystal.colors.accent}, ${crystal.colors.accent}80, ${crystal.colors.accent})` : isGlass ? GLASS_CLASS_BG : BAKED_CLASS_BG;

  return (
    <div
      data-testid="standings-panel"
      data-standings-template={isGlass ? "glassmorphism" : "default"}
      className={`${intrinsicOnly ? "inline-flex" : "flex w-full"} h-fit flex-col overflow-hidden`}
      style={{
        width: intrinsicOnly ? `${intrinsicWidth}px` : undefined,
        background: panelBg,
        border: `1px solid ${isCrystal && crystal ? crystal.colors.border : a.borderColor}`,
        color: isCrystal && crystal ? crystal.colors.text : a.textColor,
        opacity: a.opacity,
        borderRadius: isCrystal && crystal ? 12 : isGlass ? 16 : 8,
        backdropFilter: isCrystal && crystal ? "blur(16px)" : isGlass ? "blur(24px)" : undefined,
        boxShadow: isCrystal && crystal ? `0 0 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)` : isGlass ? "0 24px 60px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.1)" : undefined,
        ...containerStyle,
      }}
    >
      {CustomHeader ? (
        <CustomHeader data={{ time: timeStr }} appearance={a} className="" />
      ) : isGlass ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <VantareDiamondLogo size={20} />
            <span style={{
              fontFamily: crystal?.typography.displayFont ?? a.textColor,
              fontSize: "13px",
              fontWeight: 800,
              color: a.textColor,
            }}>VANTARE</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              background: "rgba(230,57,70,0.15)",
              border: "1px solid rgba(230,57,70,0.4)",
              color: "#fff",
              fontSize: "9px",
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: "20px",
              letterSpacing: "0.05em",
            }}>{activeClass.toUpperCase()}</span>
            <span
              ref={timeRef}
              style={{
                fontFamily: crystal?.typography?.monoFont ?? "'JetBrains Mono', monospace",
                fontSize: "11px",
                fontWeight: 700,
                color: "#ff2a3b",
              }}
            >{timeStr}</span>
          </div>
        </div>
      ) : (
        <div
          className={`flex flex-col items-center pt-4 pb-2 ${!intrinsicOnly ? "w-full" : ""}`}
          style={{ background: headerBg, borderBottom: isGlass ? "1px solid rgba(255,255,255,0.06)" : "2px solid #1a0104" }}
        >
          <div className="text-3xl font-black italic tracking-widest mb-1 text-white font-display">VANTARE</div>
          <div ref={timeRef} className="text-[11px] font-mono font-bold text-white tracking-widest">{timeStr}</div>
        </div>
      )}
      {/* Class bar: hidden in crystal mode (class is in header pill) */}
      {!isGlass && (
        <div
          ref={classRef}
          className={`text-center text-[11px] py-1 font-bold tracking-widest text-white relative ${!intrinsicOnly ? "w-full" : ""}`}
          style={{ background: classBg, borderBottom: "1px solid #000" }}
        >
          {activeClass.toUpperCase()}
        </div>
      )}
      {/* Table header row (crystal mode only) */}
      {isGlass && (
        <div style={{ display: "grid", gridTemplateColumns: "20px 20px 26px 1fr 76px 58px", height: "24px", padding: "0 10px", background: "rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(255,255,255,0.06)", alignItems: "center", columnGap: "6px" }}>
          <span style={{ fontSize: "9px", fontWeight: 700, color: "rgba(255,255,255,0.4)" }}></span>
          <span style={{ fontSize: "9px", fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>POS</span>
          <span style={{ fontSize: "9px", fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>#</span>
          <span style={{ fontSize: "9px", fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>EQUIPO / PILOTO</span>
          <span style={{ fontSize: "9px", fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>GAP</span>
          <span style={{ fontSize: "9px", fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>LAST</span>
        </div>
      )}
      <div ref={containerRef} className={`mt-1 px-1 ${!intrinsicOnly ? "w-full" : ""}`} />
      {/* Footer: crystal mode has track temp */}
      {isGlass ? (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", background: "rgba(0,0,0,0.45)", borderTop: "1px solid rgba(255,255,255,0.06)", alignItems: "center" }}>
          <span style={{ fontSize: "9px", fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>LE MANS ULTIMATE</span>
          <span style={{ fontSize: "9px", fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>TRACK TEMP: --°C</span>
        </div>
      ) : (
        <div className={`mt-1 py-1 text-center text-[8px] tracking-widest text-white/50 font-bold border-t border-black ${!intrinsicOnly ? "w-full" : ""}`} style={{ background: "#1a0104" }}>
          LE MANS ULTIMATE
        </div>
      )}
    </div>
  );
}
