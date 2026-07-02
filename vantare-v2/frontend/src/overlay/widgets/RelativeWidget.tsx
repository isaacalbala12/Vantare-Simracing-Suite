import { useEffect, useRef } from "react";
import { getTelemetryRef } from "../../lib/telemetry-ref";
import { getMockTelemetry } from "./mock-telemetry";
import type { WidgetTelemetryMode } from "./use-widget-telemetry";
import { resolveWidgetAppearance } from "./widget-appearance";
import { setHTMLIfChanged } from "../../lib/dom-write";
import { escapeHTML } from "../../lib/html-escape";
import { brandTextColor } from "../../lib/color-utils";
import { startFrameBudgetLoop } from "../../lib/frame-budget";
import type { ColumnConfig } from "../../lib/profile";
import { createDefaultRelativeColumns } from "./relative-catalog";
import { getRelativeFilters, selectRelativeRows } from "./relative-filters";
import {
  formatRelativeDriverName,
  formatRelativeLapTime,
  DEFAULT_RELATIVE_COLUMN_WIDTHS,
  getRelativeColumnAlign,
  getRelativeColumnColor,
  getRelativeColumnWidth,
  getRelativeIntrinsicWidth,
  getRelativeJustifyClass,
} from "./relative-format";
import { formatSignedGap, resolveClassColor } from "./relative-widget-helpers";

type RelativeProps = {
  editMode: boolean;
  telemetryMode?: WidgetTelemetryMode;
  updateHz?: number;
  props?: Record<string, unknown>;
};

type RelativeRenderVariant = {
  columns?: ColumnConfig[];
  filters?: Record<string, unknown>;
};

function getRelativeColumnFallbackWidth(column: ColumnConfig): number {
  return DEFAULT_RELATIVE_COLUMN_WIDTHS[column.id] ?? 0;
}

function getActiveRelativeColumns(props?: Record<string, unknown>): ColumnConfig[] {
  const variant = props?.variant as RelativeRenderVariant | undefined;
  const sourceColumns = variant?.columns?.length ? variant.columns : createDefaultRelativeColumns();
  return sourceColumns.filter((column) => column.enabled);
}

const BAKED_PANEL_BG = "linear-gradient(180deg, #3a050a 0%, #0d0102 100%)";
const BAKED_HEADER_BG = "linear-gradient(180deg, #9b2226 0%, #3a050a 100%)";
const BAKED_CLASS_BG = "linear-gradient(90deg, #111 0%, #222 50%, #111 100%)";
const BAKED_PLAYER_BG = "linear-gradient(90deg, rgba(230,57,70,0.2) 0%, rgba(155,34,38,0.4) 100%)";
const GLASS_PANEL_BG = "rgba(18,18,22,0.82)";
const GLASS_HEADER_BG = "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)";
const GLASS_CLASS_BG = "rgba(0,0,0,0.45)";
const GLASS_PLAYER_BG = "linear-gradient(90deg, rgba(255,42,59,0.22) 0%, rgba(230,57,70,0.05) 100%)";
const COMPACT_ROW_HEIGHT = 31;

export function RelativeWidget({ editMode, telemetryMode, props, updateHz = 15 }: RelativeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const variant = props?.variant as RelativeRenderVariant | undefined;
  const filters = getRelativeFilters(variant?.filters, props);
  const { rangeAhead, rangeBehind, classScope, includePlayer, rowHeightMode } = filters;
  const activeColumns = getActiveRelativeColumns(props);
  const intrinsicWidth = getRelativeIntrinsicWidth(activeColumns);
  const fillHost = props?.__previewFillHost !== false;
  const intrinsicOnly = !fillHost;
  const lastFingerprintRef = useRef("");
  const { style, appearance: a } = resolveWidgetAppearance("relative", props);
  const isGlass = style === "glassmorphism-pro";

  useEffect(() => {
    return startFrameBudgetLoop(updateHz, () => {
      const t = (telemetryMode ?? (editMode ? "mock" : "live")) === "mock" ? getMockTelemetry() : getTelemetryRef();
      const container = containerRef.current;
      if (!container) return;

      const currentFilters = { rangeAhead, rangeBehind, classScope, includePlayer, rowHeightMode };
      const visible = selectRelativeRows(t.vehicles, currentFilters);
      const player = t.vehicles.find((v) => v.isPlayer);

      if (!player) {
        setHTMLIfChanged(container, `<div class="text-xs font-mono p-2" style="color:color-mix(in srgb, ${a.textColor} 30%, transparent)">No player</div>`);
        return;
      }

      const columnFingerprint = activeColumns
        .map((column) => `${column.id}:${column.metricId}:${column.enabled}:${column.width ?? ""}:${JSON.stringify(column.format ?? {})}:${JSON.stringify(column.style ?? {})}`)
        .join(",");
      const fingerprint = `${rowHeightMode}|${columnFingerprint}|${visible.map(v =>
        `${v.id}:${v.place}:${v.timeGapToPlayer?.toFixed(2)}:${v.inPits}:${v.vehicleClass}:${v.driverNumber}:${v.driverName}:${v.teamBrandColor}:${v.bestLapTime}:${v.lastLapTime}:${v.isPlayer}`
      ).join("|")}`;
      if (fingerprint === lastFingerprintRef.current) return;
      lastFingerprintRef.current = fingerprint;

      const rowHeight = rowHeightMode === "compact"
        ? COMPACT_ROW_HEIGHT
        : Math.max(20, Math.floor((container.clientHeight - 8) / Math.max(1, visible.length)));

      const rows = visible.map((v, idx) => {
        const isP = v.isPlayer;
        const bgRow = isGlass
          ? idx % 2 === 0 ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.25)"
          : idx % 2 === 0 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.3)";

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

        const cells = activeColumns.map((column) => {
          const width = getRelativeColumnWidth(column, getRelativeColumnFallbackWidth(column));
          switch (column.id) {
          case "position":
            return `<div class="text-center shrink-0" style="width:${width}px;color:#9CA3AF">${v.place ?? ""}</div>`;
          case "class":
            return `<div class="h-full shrink-0" style="width:${width}px;background:${resolveClassColor(v.vehicleClass, a)}"></div>`;
          case "carNumber":
            return `<div class="flex items-center justify-center py-[2px] px-[2px] shrink-0" style="width:${width}px;height:${rowHeight}px">
              ${v.driverNumber ? `<div class="w-full h-full flex items-center justify-center" style="background:${teamBg}">
                <span class="font-black text-[11px]" style="color:${tc}">${escapeHTML(v.driverNumber)}</span>
              </div>` : ""}
            </div>`;
          case "driverName": {
            const color = getRelativeColumnColor(column, isP ? "#FFFFFF" : "#E5E7EB");
            const align = getRelativeColumnAlign(column, "left");
            return `<div class="px-2 tracking-wide shrink-0 whitespace-nowrap overflow-visible ${getRelativeJustifyClass(align)}" style="width:${width}px;color:${color}">
              ${escapeHTML(formatRelativeDriverName(v.driverName, column))}
            </div>`;
          }
          case "gap":
            return `<div class="px-2 flex items-center justify-end font-mono text-[10px] shrink-0" style="width:${width}px">
              <span style="color:${gapColor}">${gapDisplay}</span>
            </div>`;
          case "bestLap": {
            const color = getRelativeColumnColor(column, a.textColor);
            const align = getRelativeColumnAlign(column, "right");
            return `<div class="px-2 flex items-center font-mono text-[10px] shrink-0 ${getRelativeJustifyClass(align)}" style="width:${width}px">
              <span style="color:${color}">${escapeHTML(formatRelativeLapTime(v.bestLapTime, column))}</span>
            </div>`;
          }
          case "lastLap": {
            const color = getRelativeColumnColor(column, a.textColor);
            const align = getRelativeColumnAlign(column, "right");
            return `<div class="px-2 flex items-center font-mono text-[10px] shrink-0 ${getRelativeJustifyClass(align)}" style="width:${width}px">
              <span style="color:${color}">${escapeHTML(formatRelativeLapTime(v.lastLapTime, column))}</span>
            </div>`;
          }
          default:
            return "";
          }
        }).join("");

        const rowWidthStyle = intrinsicOnly
          ? `width:${intrinsicWidth}px`
          : `min-width:${intrinsicWidth}px;width:max(100%, ${intrinsicWidth}px)`;

        return `<div class="flex items-center text-[11px] font-bold border-b border-black/20 transition-all" style="${rowWidthStyle};height:${rowHeight}px;background:${isP ? (isGlass ? GLASS_PLAYER_BG : BAKED_PLAYER_BG) : bgRow};${leftInset}">
          ${cells}
        </div>`;
      });

      setHTMLIfChanged(container, rows.join(""));
    });
  }, [rangeAhead, rangeBehind, classScope, includePlayer, rowHeightMode, updateHz, editMode, telemetryMode, props, a, activeColumns, intrinsicWidth, intrinsicOnly, isGlass]);

  const compactRows = rowHeightMode === "compact";
  const intrinsicRoot = intrinsicOnly || compactRows;

  const panelBg = isGlass ? GLASS_PANEL_BG : BAKED_PANEL_BG;
  const headerBg = isGlass ? GLASS_HEADER_BG : BAKED_HEADER_BG;
  const classBg = isGlass ? GLASS_CLASS_BG : BAKED_CLASS_BG;

  return (
    <div
      data-testid="relative-panel"
      className={`${intrinsicOnly && !compactRows ? "inline-flex h-full" : compactRows ? "inline-flex" : "flex w-full h-full"} flex-col overflow-hidden font-display`}
      style={{
        width: intrinsicRoot ? `${intrinsicWidth}px` : undefined,
        background: panelBg,
        border: `1px solid ${a.borderColor}`,
        color: a.textColor,
        opacity: a.opacity,
        borderRadius: isGlass ? 16 : 8,
        backdropFilter: isGlass ? "blur(24px)" : undefined,
        boxShadow: isGlass ? "0 24px 60px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.1)" : "0 10px 40px rgba(0,0,0,0.8)",
      }}
    >
      <div
        className="pt-2 pb-1 flex flex-col items-center"
        style={{ background: headerBg, borderBottom: isGlass ? "1px solid rgba(255,255,255,0.06)" : "2px solid #1a0104" }}
      >
        <div className="text-xl font-black italic tracking-widest mb-0.5 text-white">VANTARE</div>
      </div>
      <div
        className="text-center text-[10px] py-1 font-bold tracking-widest text-white relative"
        style={{ background: classBg, borderBottom: "1px solid #000" }}
      >
        RELATIVE
      </div>
      <div ref={containerRef} className={`${compactRows ? "" : "flex-1"} overflow-hidden mt-1 px-1`} />
    </div>
  );
}
