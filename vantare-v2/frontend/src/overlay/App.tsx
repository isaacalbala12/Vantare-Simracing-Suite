import { useEffect, useRef } from "react";
import { Events } from "@wailsio/runtime";
import {
  applyTelemetryUpdate,
  getTelemetryRef,
  parseTelemetryPayload,
} from "../lib/telemetry-ref";

function formatGear(gear: number): string {
  if (gear <= 0) return "N";
  return String(gear);
}

export function OverlayApp() {
  const speedRef = useRef<HTMLSpanElement>(null);
  const gearRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const unsubscribe = Events.On("telemetry:update", (event: { data: unknown }) => {
      try {
        applyTelemetryUpdate(parseTelemetryPayload(event.data));
      } catch (err) {
        console.error("telemetry:update parse failed", err);
      }
    });

    let frameId = 0;
    const tick = () => {
      const t = getTelemetryRef();
      if (speedRef.current) {
        speedRef.current.textContent = `${(t.speed * 3.6).toFixed(0)} km/h`;
      }
      if (gearRef.current) {
        gearRef.current.textContent = formatGear(t.gear);
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      unsubscribe?.();
    };
  }, []);

  return (
    <div className="rounded-lg bg-black/60 px-4 py-2 font-mono text-white backdrop-blur-sm">
      <span ref={speedRef}>0 km/h</span>
      <span className="mx-2 text-white/40">|</span>
      <span ref={gearRef}>N</span>
    </div>
  );
}
