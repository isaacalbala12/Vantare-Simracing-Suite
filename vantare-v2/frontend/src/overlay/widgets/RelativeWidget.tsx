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

export function resolveClassColor(
  vehicleClass: string | undefined,
  a: Record<string, unknown>
): string {
  const cls = (vehicleClass ?? "").toUpperCase();
  if (cls === "HYPERCAR") return a.classHypercarColor as string;
  if (cls === "LMP2") return a.classLmp2Color as string;
  if (cls === "LMP3") return a.classLmp3Color as string;
  if (cls === "GT3" || cls === "LMGT3") return a.classGt3Color as string;
  return a.classUnknownColor as string;
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

export function RelativeWidget({ editMode, telemetryMode, props, updateHz = 15 }: RelativeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rangeAhead = (props?.rangeAhead as number) ?? 3;
  const rangeBehind = (props?.rangeBehind as number) ?? 3;
  const lastFingerprintRef = useRef("");
  const { appearance: a } = resolveWidgetAppearance("relative", props);

  useEffect(() => {
    return startFrameBudgetLoop(updateHz, () => {
      const t = (telemetryMode ?? (editMode ? "mock" : "live")) === "mock" ? getMockTelemetry() : getTelemetryRef();
      const container = containerRef.current;
      if (!container) return;

      const visible = selectRelativeRowsByGap(t.vehicles, rangeAhead, rangeBehind);
      const player = visible.find((v) => v.isPlayer);

      if (!player) {
        setHTMLIfChanged(container, `<div class="text-xs font-mono p-2" style="color:color-mix(in srgb, ${a.textColor} 30%, transparent)">No player</div>`);
        return;
      }

      const fingerprint = visible.map(v =>
        `${v.id}:${v.place}:${v.timeGapToPlayer?.toFixed(2)}:${v.inPits}:${v.vehicleClass}:${v.driverNumber}:${v.driverName}:${v.teamBrandColor}:${v.isPlayer}`
      ).join("|");
      if (fingerprint === lastFingerprintRef.current) return;
      lastFingerprintRef.current = fingerprint;

      const rowHeight = Math.max(20, Math.floor((container.clientHeight - 8) / Math.max(1, visible.length)));

      const rows = visible.map((v, idx) => {
        const isP = v.isPlayer;
        const bgRow = idx % 2 === 0 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.3)";

        let gapDisplay: string;
        let gapColor: string;
        if (isP) {
          gapDisplay = "—";
          gapColor = a.textColor;
        } else if (v.timeGapToPlayer != null) {
          gapDisplay = formatSignedGap(v.timeGapToPlayer);
          gapColor = v.timeGapToPlayer > 0 ? a.gapAheadColor : a.gapBehindColor;
        } else {
          gapDisplay = "—";
          gapColor = a.textColor;
        }

        const hasBrand = !!v.teamBrandColor;
        const teamBg = v.teamBrandColor || "transparent";
        const tc = hasBrand ? brandTextColor(teamBg) : "#9CA3AF";

        const leftInset = isP ? `box-shadow: inset 3px 0 0 0 ${a.accentColor}` : "";

        const numberCell = v.driverNumber
          ? `<div class="w-7 flex items-center justify-center py-[2px] px-[2px] ml-1 shrink-0" style="height:${rowHeight}px">
              <div class="w-full h-full flex items-center justify-center" style="background:${teamBg}">
                <span class="font-black text-[11px]" style="color:${tc}">${escapeHTML(v.driverNumber)}</span>
              </div>
            </div>`
          : "";

        return `<div class="flex items-center text-[11px] font-bold border-b border-black/20 transition-all" style="height:${rowHeight}px;background:${isP ? BAKED_PLAYER_BG : bgRow};${leftInset}">
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
