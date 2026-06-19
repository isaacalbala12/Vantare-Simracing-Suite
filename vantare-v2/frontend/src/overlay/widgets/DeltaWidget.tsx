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

export function DeltaWidget({ editMode, telemetryMode, updateHz = 30, props }: DeltaProps) {
  const { appearance: a } = resolveWidgetAppearance("delta", props);
  const deltaRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);

  const getTelemetry = useMemo(
    () => getWidgetTelemetrySource(telemetryMode ?? (editMode ? "mock" : "live")),
    [editMode, telemetryMode],
  );

  useEffect(() => {
    return startFrameBudgetLoop(updateHz, () => {
      const t = getTelemetry();
      if (deltaRef.current) {
        setTextIfChanged(deltaRef.current, formatDelta(t.deltaBest));
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
      }}
    >
      <div className="flex justify-between w-full px-4 mb-2 opacity-80">
        <span className="font-mono text-[16px] font-bold tracking-widest uppercase" style={{ textShadow: "0 2px 10px rgba(0,0,0,1)" }}>
          Target 1:24.350
        </span>
        <span className="font-mono text-[16px] font-bold tracking-widest uppercase" style={{ textShadow: "0 2px 10px rgba(0,0,0,1)" }}>
          Lap 34
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
