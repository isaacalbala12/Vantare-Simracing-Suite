import { useEffect, useRef } from "react";
import { getWidgetTelemetrySource } from "./use-widget-telemetry";
import { resolveWidgetAppearance } from "./widget-appearance";
import {
  setStylePropertyIfChanged,
  setTextIfChanged,
} from "../../lib/dom-write";
import { startFrameBudgetLoop } from "../../lib/frame-budget";
import { useMemo } from "react";
import type { WidgetTelemetryMode } from "./use-widget-telemetry";

type DeltaProps = {
  editMode: boolean;
  telemetryMode?: WidgetTelemetryMode;
  updateHz?: number;
  props?: Record<string, unknown>;
};

// eslint-disable-next-line react-refresh/only-export-components
export function formatDelta(delta: number): string {
  if (!Number.isFinite(delta)) return "—";
  if (delta === 0) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(3)}s`;
}

// eslint-disable-next-line react-refresh/only-export-components
export function formatLapTime(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  let roundedRemaining = Number(remaining.toFixed(3));
  let mins = minutes;
  if (roundedRemaining >= 60) {
    mins += 1;
    roundedRemaining -= 60;
  }
  return `${mins}:${roundedRemaining.toFixed(3).padStart(6, "0")}`;
}

export function DeltaWidget({ editMode, telemetryMode, updateHz = 30, props }: DeltaProps) {
  const { style, appearance: a } = resolveWidgetAppearance("delta", props);
  const isGlass = style === "glassmorphism-pro";
  const deltaRef = useRef<HTMLSpanElement>(null);
  const targetRef = useRef<HTMLSpanElement>(null);
  const lapRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);

  const getTelemetry = useMemo(
    () => getWidgetTelemetrySource(telemetryMode ?? (editMode ? "mock" : "live")),
    [editMode, telemetryMode],
  );

  useEffect(() => {
    return startFrameBudgetLoop(updateHz, () => {
      const t = getTelemetry();
      const player = t.vehicles?.find((v) => v.isPlayer);

      if (deltaRef.current) {
        setTextIfChanged(deltaRef.current, formatDelta(t.deltaBest));
      }
      if (targetRef.current) {
        const bestLap = player?.bestLapTime;
        const targetText = bestLap && bestLap > 0 ? `Target ${formatLapTime(bestLap)}` : "Target —";
        setTextIfChanged(targetRef.current, targetText);
      }
      if (lapRef.current) {
        const lapText = player?.totalLaps != null ? `Lap ${player.totalLaps}` : "Lap —";
        setTextIfChanged(lapRef.current, lapText);
      }
      if (fillRef.current) {
        const delta = Number.isFinite(t.deltaBest) ? t.deltaBest : 0;
        const isFast = delta <= 0;
        const widthPercent = Math.min(50, (Math.abs(delta) / 5) * 50);
        const col = isFast ? a.negativeColor : a.positiveColor;
        setStylePropertyIfChanged(fillRef.current, "width", `${widthPercent}%`);
        setStylePropertyIfChanged(fillRef.current, "backgroundColor", col);
        setStylePropertyIfChanged(fillRef.current, "boxShadow", `0 0 25px ${col}`);
        if (isFast) {
          setStylePropertyIfChanged(fillRef.current, "right", "50%");
          setStylePropertyIfChanged(fillRef.current, "left", "auto");
        } else {
          setStylePropertyIfChanged(fillRef.current, "left", "50%");
          setStylePropertyIfChanged(fillRef.current, "right", "auto");
        }
      }
    });
  }, [updateHz, a.positiveColor, a.negativeColor, getTelemetry]);

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center font-display"
      style={{
        opacity: a.opacity,
        color: a.textColor,
        background: isGlass ? "rgba(18,18,22,0.82)" : undefined,
        border: isGlass ? `1px solid ${a.borderColor}` : undefined,
        borderRadius: isGlass ? 16 : undefined,
        backdropFilter: isGlass ? "blur(24px)" : undefined,
        boxShadow: isGlass ? "0 24px 60px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.1)" : undefined,
      }}
    >
      <div className="flex justify-between w-full px-4 mb-2 opacity-80">
        <span
          ref={targetRef}
          className="font-mono text-[16px] font-bold tracking-widest uppercase"
          style={{ textShadow: "0 2px 10px rgba(0,0,0,1)" }}
        >
          Target —
        </span>
        <span
          ref={lapRef}
          className="font-mono text-[16px] font-bold tracking-widest uppercase"
          style={{ textShadow: "0 2px 10px rgba(0,0,0,1)" }}
        >
          Lap —
        </span>
      </div>
      <div className="text-center mb-4 z-20">
        <span
          ref={deltaRef}
          className="text-[75px] font-black leading-none font-tech tracking-tighter"
          style={{
            textShadow: `0 5px 25px rgba(0,0,0,0.9), 0 0 40px ${a.negativeColor}`,
            color: a.negativeColor,
          }}
        >
          —
        </span>
      </div>
      <div className="w-full h-[14px] rounded-sm relative z-10" style={{ background: a.backgroundColor, boxShadow: "inset 0 0 5px rgba(0,0,0,1), 0 5px 15px rgba(0,0,0,0.8)" }}>
        <div className="absolute top-[-4px] bottom-[-4px] left-1/2 w-[4px] bg-white rounded-full -translate-x-1/2 z-30" style={{ boxShadow: "0 0 10px white" }} />
        <div ref={fillRef} className="absolute top-0 bottom-0 z-20 rounded-sm" style={{ boxShadow: "0 0 25px currentColor" }} />
      </div>
    </div>
  );
}
