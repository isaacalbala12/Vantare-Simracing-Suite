import { useEffect, useRef } from "react";
import { getTelemetryRef, resolveSessionMode, type SessionMode, type VehicleScoring } from "../../lib/telemetry-ref";
import { getMockTelemetry } from "./mock-telemetry";
import type { WidgetTelemetryMode } from "./use-widget-telemetry";
import { resolveWidgetAppearance } from "./widget-appearance";
import { setHTMLIfChanged } from "../../lib/dom-write";
import { escapeHTML } from "../../lib/html-escape";
import { brandTextColor } from "../../lib/color-utils";
import { startFrameBudgetLoop } from "../../lib/frame-budget";

type StandingsProps = {
  editMode: boolean;
  telemetryMode?: WidgetTelemetryMode;
  updateHz?: number;
  props?: Record<string, unknown>;
};

const BAKED_PANEL_BG = "linear-gradient(180deg, #3a050a 0%, #0d0102 100%)";
const BAKED_HEADER_BG = "linear-gradient(180deg, #9b2226 0%, #3a050a 100%)";
const BAKED_CLASS_BG = "linear-gradient(90deg, #9b2226 0%, #e63946 50%, #9b2226 100%)";
const ON_TRACK_COLOR = "#FFFFFF";
const PIT_COLOR = "#9CA3AF";

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

export function StandingsWidget({ editMode, telemetryMode, props, updateHz = 15 }: StandingsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const classRef = useRef<HTMLDivElement>(null);
  const maxRows = (props?.maxRows as number) ?? 12;
  const lastFingerprintRef = useRef("");

  const { appearance: a } = resolveWidgetAppearance("standings", props);

  useEffect(() => {
    return startFrameBudgetLoop(updateHz, () => {
      const t = (telemetryMode ?? (editMode ? "mock" : "live")) === "mock" ? getMockTelemetry() : getTelemetryRef();
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

      const fingerprint = mode + "|" + activeClass + "|" + (t.timeRemaining ?? 0).toFixed(0) + "|" + sorted.map(v =>
        `${v.id}:${v.place}:${v.inPits}:${v.pitState}:${v.pitting}:${v.inGarageStall}:${v.fastestLap}:${v.bestLapTime?.toFixed(1)}:${v.timeBehindLeader?.toFixed(3)}:${v.lapsBehindLeader}:${v.tireCompound}`
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

        const hasBrand = !!v.teamBrandColor;
        const bi = hasBrand ? brandInitial(v.driverName) : "";
        const teamBg = v.teamBrandColor || "transparent";
        const tc = hasBrand ? brandTextColor(teamBg) : rowTextColor;
        const numColor = pitLabel ? "#000000" : rowTextColor;
        const numBg = pitLabel ? a.pitColor : (v.teamBrandColor || "transparent");
        const teamColor = isLeader ? a.posLeaderColor : rowTextColor;

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

        const numberCell = v.driverNumber
          ? `<div class="w-7 flex items-center justify-center py-[2px] pr-[2px] shrink-0" style="height:${rowHeight}px">
            <div class="w-5 h-[18px] flex items-center justify-center relative" style="background:${numBg};${pitLabel ? `border:1px solid ${a.pitColor}` : ""}">
              <span class="font-black text-[11px]" style="color:${numColor}">${escapeHTML(v.driverNumber)}</span>
              ${pitLabel ? `<div class="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[6px] px-0.5 rounded-sm leading-none whitespace-nowrap font-black" style="background:${a.pitColor};color:#000">PIT</div>` : ""}
            </div>
          </div>`
          : "";

        return `<div class="flex items-center text-[11px] font-bold border-b border-black/20 transition-all" style="height:${rowHeight}px;background:${bgRow};${leftInset}">
          <div class="w-6 text-center shrink-0" style="color:${posColor}">${classPlace}</div>
          ${brandCell}
          ${numberCell}
          <div class="flex-1 px-1 tracking-wide truncate" style="color:${teamColor}">${escapeHTML(v.driverName ?? "?")}</div>
          <div class="px-2 flex items-center justify-end font-mono text-[9px] shrink-0 gap-1" style="color:${rowTextColor}">
            ${tireBadgeHtml(v.tireCompound, a.tireSoftColor, a.tireMediumColor, a.tireHardColor)}
            <span style="${gapColor ? `color:${gapColor}` : ""}">${gapText}</span>
          </div>
        </div>`;
      });

      setHTMLIfChanged(container, rows.join(""));
    });
  }, [maxRows, updateHz, editMode, telemetryMode, props]);

  const t = (telemetryMode ?? (editMode ? "mock" : "live")) === "mock" ? getMockTelemetry() : getTelemetryRef();
  const player = t.vehicles.find((v) => v.isPlayer);
  const activeClass = player?.vehicleClass || t.vehicles[0]?.vehicleClass || "HYPERCAR";
  const timeStr = formatRemainingTime(t.timeRemaining);

  return (
    <div
      data-testid="standings-panel"
      className="w-full h-fit flex flex-col overflow-hidden rounded-lg"
      style={{
        background: BAKED_PANEL_BG,
        border: `1px solid ${a.borderColor}`,
        color: a.textColor,
        opacity: a.opacity,
      }}
    >
      <div
        className="flex flex-col items-center pt-4 pb-2"
        style={{ background: BAKED_HEADER_BG, borderBottom: "2px solid #1a0104" }}
      >
        <div className="text-3xl font-black italic tracking-widest mb-1 text-white font-display">VANTARE</div>
        <div ref={timeRef} className="text-[11px] font-mono font-bold text-white tracking-widest">{timeStr}</div>
      </div>
      <div
        ref={classRef}
        className="text-center text-[11px] py-1 font-bold tracking-widest text-white relative"
        style={{ background: BAKED_CLASS_BG, borderBottom: "1px solid #000" }}
      >
        {activeClass.toUpperCase()}
      </div>
      <div ref={containerRef} className="mt-1 px-1" />
      <div className="mt-1 py-1 text-center text-[8px] tracking-widest text-white/50 font-bold border-t border-black" style={{ background: "#1a0104" }}>
        LE MANS ULTIMATE
      </div>
    </div>
  );
}
