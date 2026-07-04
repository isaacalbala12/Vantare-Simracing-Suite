import { useEffect, useMemo, useRef } from "react";
import { getWidgetTelemetrySource } from "./use-widget-telemetry";
import type { WidgetTelemetryMode } from "./use-widget-telemetry";
import { resolveWidgetAppearance } from "./widget-appearance";
import { resolveWidgetDesignSystem } from "./widget-design-system";
import { setStylePropertyIfChanged } from "../../lib/dom-write";
import { startFrameBudgetLoop } from "../../lib/frame-budget";
import { formatPedalHeightPercent } from "./pedals-format";

type PedalsProps = {
  editMode: boolean;
  telemetryMode?: WidgetTelemetryMode;
  updateHz?: number;
  props?: Record<string, unknown>;
};

const TRACK_BG = "#0a0a0a";
const DEFAULT_CONTAINER_BG = "transparent";

export function PedalsWidget({ editMode, telemetryMode, updateHz = 30, props }: PedalsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const clutchBarRef = useRef<HTMLDivElement>(null);
  const brakeBarRef = useRef<HTMLDivElement>(null);
  const throttleBarRef = useRef<HTMLDivElement>(null);
  const { style, appearance: a } = resolveWidgetAppearance("pedals", props);
  const isGlass = style === "glassmorphism-pro";
  const isCrystal = style === "vantare-crystal";
  const crystal = isCrystal ? resolveWidgetDesignSystem("vantare-crystal") : null;

  const getTelemetry = useMemo(
    () => getWidgetTelemetrySource(telemetryMode ?? (editMode ? "mock" : "live")),
    [editMode, telemetryMode],
  );

  useEffect(() => {
    return startFrameBudgetLoop(updateHz, () => {
      const t = getTelemetry();
      if (clutchBarRef.current) {
        setStylePropertyIfChanged(clutchBarRef.current, "height", formatPedalHeightPercent(t.clutch));
      }
      if (brakeBarRef.current) {
        setStylePropertyIfChanged(brakeBarRef.current, "height", formatPedalHeightPercent(t.brake));
      }
      if (throttleBarRef.current) {
        setStylePropertyIfChanged(throttleBarRef.current, "height", formatPedalHeightPercent(t.throttle));
      }
    });
  }, [updateHz, a.pedalThrottleColor, a.pedalBrakeColor, a.pedalClutchColor, getTelemetry, isCrystal]);

  const containerBg = isCrystal && crystal
    ? crystal.surfaces.panel
    : a.backgroundColor && a.backgroundColor !== "transparent"
      ? a.backgroundColor
      : DEFAULT_CONTAINER_BG;

  return (
    <div
      ref={containerRef}
      data-testid="pedals-widget"
      className="w-full h-full flex items-end justify-center overflow-hidden font-display"
      style={{
        background: containerBg,
        opacity: a.opacity,
        borderRadius: isCrystal && crystal ? 12 : isGlass ? 16 : undefined,
        backdropFilter: isCrystal && crystal ? "blur(16px)" : isGlass ? "blur(24px)" : undefined,
        boxShadow: isCrystal && crystal ? `0 0 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)` : isGlass ? "0 24px 60px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.1)" : undefined,
        border: isCrystal && crystal ? `1px solid ${crystal.colors.border}` : isGlass ? `1px solid ${a.borderColor}` : undefined,
      }}
    >
      <div
        className="flex gap-[3px] items-end"
        style={{ width: "84px", height: "100%" }}
        aria-label="Pedals: throttle, brake, clutch"
      >
        <div
          data-testid="pedal-bar-clt"
          aria-label="Clutch"
          className="relative overflow-hidden"
          style={{ width: "26px", height: "100%", background: isCrystal && crystal ? crystal.colors.background : TRACK_BG }}
        >
          <div
            ref={clutchBarRef}
            className="absolute bottom-0 left-0 w-full"
            style={{ height: "0%", background: isCrystal && crystal ? crystal.colors.info : a.pedalClutchColor, transition: "height .15s linear" }}
          />
        </div>
        <div
          data-testid="pedal-bar-brk"
          aria-label="Brake"
          className="relative overflow-hidden"
          style={{ width: "26px", height: "100%", background: isCrystal && crystal ? crystal.colors.background : TRACK_BG }}
        >
          <div
            ref={brakeBarRef}
            className="absolute bottom-0 left-0 w-full"
            style={{ height: "0%", background: isCrystal && crystal ? crystal.colors.negative : a.pedalBrakeColor, transition: "height .15s linear" }}
          />
        </div>
        <div
          data-testid="pedal-bar-thr"
          aria-label="Throttle"
          className="relative overflow-hidden"
          style={{ width: "26px", height: "100%", background: isCrystal && crystal ? crystal.colors.background : TRACK_BG }}
        >
          <div
            ref={throttleBarRef}
            className="absolute bottom-0 left-0 w-full"
            style={{ height: "0%", background: isCrystal && crystal ? crystal.colors.positive : a.pedalThrottleColor, transition: "height .15s linear" }}
          />
        </div>
      </div>
    </div>
  );
}
