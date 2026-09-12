import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import type { OverlayPerformanceV2 } from "../../generated/telemetry";

/**
 * Presupuesto de movimiento por widget. Lo resuelve el host desde la
 * política de rendimiento del frame (`capabilities.performance`) y la
 * preferencia del sistema; los renderers deciden qué anima cada nivel:
 * full todo, reduced solo desplazamientos, minimal nada.
 */
export type MotionLevel = "full" | "reduced" | "minimal";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

/**
 * Lectura reactiva de la preferencia del sistema. Sin suscripción, un
 * cambio en caliente solo se aplicaba en el siguiente render — y si la
 * telemetría no empujaba otro frame, las animaciones en vuelo podían no
 * cancelarse nunca.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof matchMedia !== "function") {
        return () => {};
      }
      const query = matchMedia(REDUCED_MOTION_QUERY);
      query.addEventListener("change", onStoreChange);
      return () => query.removeEventListener("change", onStoreChange);
    },
    prefersReducedMotion,
    () => false,
  );
}

export function resolveMotionLevel(
  performance: OverlayPerformanceV2 | null | undefined,
  reducedMotion = prefersReducedMotion(),
): MotionLevel {
  if (reducedMotion) {
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

/** Transform translateY vigente de un elemento, en sus px locales sin escalar. */
function currentTranslateY(el: HTMLElement): number {
  const value = getComputedStyle(el).transform;
  if (!value || value === "none") {
    return 0;
  }
  if (typeof DOMMatrixReadOnly === "function") {
    try {
      const y = new DOMMatrixReadOnly(value).m42;
      return Number.isFinite(y) ? y : 0;
    } catch {
      return 0;
    }
  }
  const parts = /^matrix\(([^)]+)\)$/.exec(value)?.[1]?.split(",");
  const y = parts ? Number(parts[5]) : Number.NaN;
  return Number.isFinite(y) ? y : 0;
}

/**
 * FLIP medido por identidad de fila. `persist` guarda el top de layout de la
 * pasada anterior por id, así que sobrevive a un remount del nodo (una fila
 * que React recoloca en otro contenedor es otro HTMLElement, pero conserva su
 * id y su posición de origen) y a un re-target a mitad de animación (el
 * translateY en vuelo se lee antes de cancelar y se suma al origen — sin ese
 * término la fila saltaría del punto donde el ojo la ve al stride anterior).
 *
 * La distancia se mide en px de layout normalizados por la escala del root —
 * getBoundingClientRect devuelve px YA escalados por el transform del
 * viewport, y un translateY en px escalados aplica la escala dos veces.
 */
export function flipRows(
  root: HTMLElement,
  persist: Map<string, unknown>,
  opts: {
    rows: string;
    id: (row: HTMLElement) => string | undefined;
    duration: (offsetPx: number) => number;
    easing?: string;
    key?: string;
  },
): void {
  const topsKey = opts.key ?? "flip-tops";
  let tops = persist.get(topsKey) as Map<string, number> | undefined;
  if (tops === undefined) {
    tops = new Map();
    persist.set(topsKey, tops);
  }
  const rootRect = root.getBoundingClientRect();
  const scale = root.offsetHeight > 0 ? rootRect.height / root.offsetHeight : 1;
  const seen = new Set<string>();
  for (const row of root.querySelectorAll<HTMLElement>(opts.rows)) {
    const id = opts.id(row);
    if (id === undefined) {
      continue;
    }
    seen.add(id);
    const running = typeof row.getAnimations === "function"
      ? row.getAnimations().filter(
          (animation) =>
            typeof CSSTransition === "undefined" || !(animation instanceof CSSTransition),
        )
      : [];
    const inFlight = running.length > 0 ? currentTranslateY(row) : 0;
    for (const animation of running) {
      animation.cancel();
    }
    // Tras el cancel el rect vuelve a ser layout puro (sin transform).
    const top = (row.getBoundingClientRect().top - rootRect.top) / (scale || 1);
    const prevTop = tops.get(id);
    tops.set(id, top);
    if (prevTop === undefined) {
      continue;
    }
    const from = prevTop - top + inFlight;
    if (Math.abs(from) < 0.5) {
      continue;
    }
    row.animate(
      [{ transform: `translateY(${from}px)` }, { transform: "translateY(0)" }],
      { duration: opts.duration(from), easing: opts.easing ?? "cubic-bezier(0.22, 0.9, 0.3, 1)" },
    );
  }
  // Los ids que ya no están (filas retiradas) no acumulan entradas.
  for (const id of [...tops.keys()]) {
    if (!seen.has(id)) {
      tops.delete(id);
    }
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
    /**
     * Memoria de presentación entre applies (p. ej. tops de fila para el
     * FLIP, último lado no neutro del delta). La posee el hook y se limpia
     * cuando se rompe la continuidad de la fuente: status no-ready, nivel
     * deshabilitado o unmount.
     */
    persist: Map<string, unknown>;
  }) => void,
  teardown?: (root: HTMLElement) => void,
): void {
  const prevRef = useRef<TModel | null>(null);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const keyedRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const persistRef = useRef<Map<string, unknown>>(new Map());
  // true solo cuando un apply dejó trabajo visual vivo — evita llamar a
  // getAnimations(subtree) en cada tick deshabilitado.
  const effectsActiveRef = useRef(false);
  const applyRef = useRef(apply);
  const teardownRef = useRef(teardown);
  const stopAllRef = useRef<() => void>(() => {});

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

  // Las refs se sincronizan en un layout effect declarado antes que el
  // principal: en cada commit el apply/teardown/stopAll vigentes quedan
  // disponibles antes de que el motor los use (escribir refs en render
  // está prohibido por react-hooks/refs).
  useLayoutEffect(() => {
    applyRef.current = apply;
    teardownRef.current = teardown;
    stopAllRef.current = stopAll;
  });

  useEffect(() => {
    return () => stopAllRef.current();
  }, []);

  useLayoutEffect(() => {
    if (!enabled || model.status !== "ready") {
      // Mientras está deshabilitado el modelo sigue registrándose para que
      // al reactivar el diff sea contra el estado actual, no uno viejo —
      // pero nada visual del apply anterior puede seguir corriendo.
      stopAllRef.current();
      persistRef.current.clear();
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
    applyRef.current({ prev, next: model, root, schedule, persist: persistRef.current });
  }, [enabled, model, rootRef]);
}
