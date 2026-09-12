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

/**
 * Programa trabajo diferido de presentación (retirar un data-attr, un
 * siguiente paso de una coreografía). Con `key`, programar de nuevo la
 * misma clave cancela el timer anterior — sin la clave, el borrado de un
 * flash viejo llegaba después de que el siguiente evento lo hubiera
 * vuelto a encender y lo apagaba antes de tiempo.
 */
export type MotionSchedule = (durationMs: number, run: () => void, key?: string) => void;

function cancelAnimations(root: HTMLElement): void {
  if (typeof root.getAnimations === "function") {
    root.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
  }
}

/**
 * Patrón común de los motores de motion: el ViewModel anterior vive en un
 * ref (estado de presentación efímero), las animaciones discretas se
 * aplican de forma imperativa dentro de un layout effect (React nunca
 * re-renderiza porque algo se movió) y los timers se acumulan para
 * limpiarse al desmontar.
 *
 * Un único render nunca anima — no hay modelo previo contra el que
 * comparar — que es lo que mantiene determinista la puerta visual.
 *
 * Al deshabilitarse (bajada de nivel, reduced-motion) el hook cancela las
 * animaciones WAAPI en vuelo y los timers pendientes, y `teardown` retira
 * los data-attrs que el apply hubiera encendido — bajar el presupuesto no
 * puede dejar un flash congelado ni una fila a mitad de deslizamiento.
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
  teardown?: (root: HTMLElement) => void,
): void {
  const prevRef = useRef<TModel | null>(null);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const keyedRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // true solo cuando un apply dejó trabajo visual vivo — evita llamar a
  // getAnimations(subtree) en cada tick deshabilitado.
  const effectsActiveRef = useRef(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const teardownRef = useRef(teardown);
  teardownRef.current = teardown;

  const stopAll = () => {
    if (!effectsActiveRef.current) {
      return;
    }
    effectsActiveRef.current = false;
    for (const timer of timersRef.current) {
      clearTimeout(timer);
    }
    timersRef.current.clear();
    keyedRef.current.clear();
    const root = rootRef.current;
    if (root) {
      cancelAnimations(root);
      teardownRef.current?.(root);
    }
  };
  const stopAllRef = useRef(stopAll);
  stopAllRef.current = stopAll;

  useEffect(() => {
    return () => stopAllRef.current();
  }, []);

  useLayoutEffect(() => {
    if (!enabled || model.status !== "ready") {
      // Mientras está deshabilitado el modelo sigue registrándose para que
      // al reactivar el diff sea contra el estado actual, no uno viejo —
      // pero nada visual del apply anterior puede seguir corriendo.
      stopAllRef.current();
      prevRef.current = model.status === "ready" ? model : null;
      return;
    }
    const prev = prevRef.current;
    prevRef.current = model;
    const root = rootRef.current;
    if (!prev || !root) {
      return;
    }
    effectsActiveRef.current = true;
    const schedule: MotionSchedule = (durationMs, run, key) => {
      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        if (key !== undefined && keyedRef.current.get(key) === timer) {
          keyedRef.current.delete(key);
        }
        run();
      }, durationMs);
      if (key !== undefined) {
        const previous = keyedRef.current.get(key);
        if (previous !== undefined) {
          clearTimeout(previous);
          timersRef.current.delete(previous);
        }
        keyedRef.current.set(key, timer);
      }
      timersRef.current.add(timer);
    };
    applyRef.current({ prev, next: model, root, schedule });
  }, [enabled, model, rootRef]);
}
