import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { OverlayPerformanceV2 } from "../../generated/telemetry";

/**
 * Presupuesto de movimiento por widget. Lo resuelve el host desde la
 * política de rendimiento del frame (`capabilities.performance`) y la
 * preferencia del sistema; los renderers deciden qué anima cada nivel:
 * full todo, reduced solo desplazamientos, minimal nada.
 */
export type MotionLevel = "full" | "reduced" | "minimal";

export function resolveMotionLevel(
  performance: OverlayPerformanceV2 | null | undefined,
): MotionLevel {
  if (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return "minimal";
  }
  if (!performance) {
    return "full";
  }
  if (performance.level >= 5) {
    return "minimal";
  }
  if (performance.level >= 4) {
    return "reduced";
  }
  return "full";
}

export type MotionSchedule = (durationMs: number, run: () => void) => void;

/**
 * Patrón común de los motores de motion: el ViewModel anterior vive en un
 * ref (estado de presentación efímero), las animaciones discretas se
 * aplican de forma imperativa dentro de un layout effect (React nunca
 * re-renderiza porque algo se movió) y los timers se acumulan en un set
 * que se limpia al desmontar.
 *
 * Un único render nunca anima — no hay modelo previo contra el que
 * comparar — que es lo que mantiene determinista la puerta visual.
 */
export function useWidgetMotion<TModel extends { status: string }>(
  model: TModel,
  enabled: boolean,
  rootRef: RefObject<HTMLElement | null>,
  apply: (context: {
    prev: TModel;
    next: TModel;
    root: HTMLElement;
    schedule: MotionSchedule;
  }) => void,
): void {
  const prevRef = useRef<TModel | null>(null);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  useLayoutEffect(() => {
    if (!enabled || model.status !== "ready") {
      prevRef.current = model.status === "ready" ? model : null;
      return;
    }
    const prev = prevRef.current;
    prevRef.current = model;
    const root = rootRef.current;
    if (!prev || !root) {
      return;
    }
    const schedule: MotionSchedule = (durationMs, run) => {
      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        run();
      }, durationMs);
      timersRef.current.add(timer);
    };
    applyRef.current({ prev, next: model, root, schedule });
  }, [enabled, model, rootRef]);
}
