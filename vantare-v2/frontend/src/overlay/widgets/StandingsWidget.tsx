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


export function formatStandingsGap(v: Partial<VehicleScoring>): string {
	if (v.place === 1) return "Leader";
	if ((v.lapsBehindLeader ?? 0) > 0) return `+${v.lapsBehindLeader}L`;
	if ((v.timeBehindLeader ?? 0) > 0) return `+${v.timeBehindLeader!.toFixed(3)}s`;
	return "—";
}

export function formatStandingsPit(v: Partial<VehicleScoring>): string {
  if (v.inGarageStall) return "GARAGE";
  if (v.pitting || v.inPits || (v.pitState && v.pitState !== "NONE")) return "PIT";
  return "";
}

function formatLapTime(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${mins}:${rem.toFixed(3).padStart(6, "0")}`;
}

export function formatStandingsGapForMode(
  mode: SessionMode,
  v: Partial<VehicleScoring>
): string {
  if (mode === "practice" || mode === "qualifying") {
    return formatLapTime(v.bestLapTime);
  }
  // Race mode
  if (v.place === 1) return "Leader";
  if ((v.lapsBehindLeader ?? 0) > 0) return `+${v.lapsBehindLeader}L`;
  if ((v.timeBehindLeader ?? 0) > 0) return `+${v.timeBehindLeader!.toFixed(3)}s`;
  return "—";
}

function tireBadgeHtml(compound: string | undefined, tireSoft: string, tireMedium: string, tireHard: string): string {
  if (!compound) return "";
  const colorMap: Record<string, string> = { S: tireSoft, M: tireMedium, H: tireHard };
  const color = colorMap[compound] ?? "#FFFFFF";
  return `<span class="font-sans font-bold text-[8px] px-[3px] py-[1px] rounded-sm border leading-none" style="border-color:${color};color:${color}">${escapeHTML(compound)}</span>`;
}

function brandInitial(name: string | undefined): string {
  if (!name) return "?";
  return name.charAt(0);
}

export function StandingsWidget({ editMode, telemetryMode, props, updateHz = 15 }: StandingsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const maxRows = (props?.maxRows as number) ?? 12;
  const lastFingerprintRef = useRef("");

  const { appearance: a } = resolveWidgetAppearance("standings", props);

  useEffect(() => {
    return startFrameBudgetLoop(updateHz, () => {
      const t = (telemetryMode ?? (editMode ? "mock" : "live")) === "mock" ? getMockTelemetry() : getTelemetryRef();
      const container = containerRef.current;
      if (!container) return;

      const sorted = [...t.vehicles]
        .sort((x, y) => (x.place ?? 99) - (y.place ?? 99))
        .slice(0, maxRows);

      const mode = resolveSessionMode(t.sessionType, t.sessionName);

		const fingerprint = mode + "|" + sorted.map(v =>
			`${v.id}:${v.place}:${v.inPits}:${v.pitState}:${v.pitting}:${v.inGarageStall}:${v.fastestLap}:${v.bestLapTime?.toFixed(1)}:${v.timeBehindLeader?.toFixed(3)}:${v.lapsBehindLeader}:${v.tireCompound}`
		).join("|");
		if (fingerprint === lastFingerprintRef.current) return;
		lastFingerprintRef.current = fingerprint;

      const rows = sorted.map((v, i) => {
        const bgRow = i % 2 === 0 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.3)";
        const isLeader = v.place === 1;
        const pitLabel = formatStandingsPit(v);
        const gapText = mode === "race" && v.fastestLap ? "FASTEST" : formatStandingsGapForMode(mode, v);
        const gapColor = isLeader ? a.posLeaderColor : "";
        const posColor = isLeader ? a.posLeaderColor : (v.place && v.place <= 3 ? "#FFFFFF" : "#9CA3AF");

        const hasBrand = !!v.teamBrandColor;
        const bi = hasBrand ? brandInitial(v.driverName) : "";
        const teamBg = v.teamBrandColor || "transparent";
        const tc = hasBrand ? brandTextColor(teamBg) : "#9CA3AF";
        const numTc = pitLabel ? a.pitColor : (hasBrand ? brandTextColor(v.teamBrandColor!) : "#9CA3AF");
        const numBg = pitLabel ? "#000" : (v.teamBrandColor || "transparent");
        const teamColor = isLeader ? a.posLeaderColor : (v.place && v.place <= 3 ? "#FFFFFF" : "#D1D5DB");

        const leaderShadow = isLeader ? `box-shadow: inset 2px 0 0 0 ${a.posLeaderColor}` : "";
        const fastestShadow = v.fastestLap ? `box-shadow: inset 2px 0 0 0 ${a.textColor}` : "";
        const leftInset = fastestShadow || leaderShadow;

        const brandCell = hasBrand
          ? `<div class="w-7 h-full flex items-center justify-center py-[2px] px-[2px] shrink-0">
            <div class="w-full h-full flex items-center justify-center" style="background:${teamBg}">
              <span class="font-black text-[10px]" style="color:${tc}">${bi}</span>
            </div>
          </div>`
          : "";
        const numberCell = v.driverNumber
          ? `<div class="w-7 h-full flex items-center justify-center py-[2px] pr-[2px] shrink-0 relative">
            <div class="w-full h-full flex items-center justify-center" style="background:${numBg};${pitLabel ? `border:1px solid ${a.pitColor}` : ""}">
              <span class="font-black text-[11px]" style="color:${numTc}">${escapeHTML(v.driverNumber)}</span>
            </div>
            ${pitLabel ? `<div class="absolute -top-1 -left-0 text-[7px] px-1 rounded" style="background:${a.pitColor};color:#000">PIT</div>` : ""}
          </div>`
          : "";

        return `<div class="flex items-center h-[26px] text-[11px] font-bold border-b border-black/20 transition-all" style="background:${bgRow};${leftInset}">
          <div class="w-6 text-center shrink-0" style="color:${posColor}">${v.place ?? ""}</div>
          ${brandCell}
          ${numberCell}
          <div class="flex-1 px-1 tracking-wide truncate" style="color:${teamColor}">${escapeHTML(v.driverName ?? "?")}</div>
          <div class="px-2 flex items-center justify-end font-mono text-[9px] shrink-0 gap-1">
            ${tireBadgeHtml(v.tireCompound, a.tireSoftColor, a.tireMediumColor, a.tireHardColor)}
            <span style="${gapColor ? `color:${gapColor}` : ""}">${gapText}</span>
          </div>
        </div>`;
      });

      setHTMLIfChanged(container, rows.join(""));
    });
  }, [maxRows, updateHz, editMode, telemetryMode, props]);

  return (
    <div
      data-testid="standings-panel"
      className="w-full h-full flex flex-col overflow-hidden rounded-lg"
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
        <div className="text-[11px] font-mono font-bold text-white tracking-widest">00:08:48</div>
      </div>
      <div
        className="text-center text-[11px] py-1 font-bold tracking-widest text-white relative"
        style={{ background: BAKED_CLASS_BG, borderBottom: "1px solid #000" }}
      >
        HYPERCAR
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden mt-1 px-1" />
      <div className="mt-1 py-1 text-center text-[8px] tracking-widest text-white/50 font-bold border-t border-black" style={{ background: "#1a0104" }}>
        LE MANS ULTIMATE
      </div>
    </div>
  );
}
