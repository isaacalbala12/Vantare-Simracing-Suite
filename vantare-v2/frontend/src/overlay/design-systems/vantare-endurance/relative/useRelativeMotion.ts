import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type {
  RelativeRowViewModel,
  RelativeViewModel,
} from "../../../widget-types/relative/relative-view-model";
import { deriveRelativeEvents } from "./relative-motion";

/** Row pitch used to translate an index change into pixels for the FLIP slide. */
export const RELATIVE_ROW_STRIDE_PX = 26;

const FLIP_BASE_MS = 280;
const FLIP_PER_ROW_MS = 55;
const FLIP_MAX_MS = 520;
const CROSS_FLASH_MS = 900;
const ENTER_MS = 380;
/** Crossings arrive in packs when the field shuffles; only the first few play. */
const MAX_CONCURRENT_CROSSES = 3;
const CROSS_STAGGER_MS = 45;
/** How long a departed row lingers as a ghost before it is dropped. */
const EXIT_MS = 380;

/** A row that has left the visible window, held where it sat so it can fold away. */
export type RelativeGhost = {
  row: RelativeRowViewModel;
  /** Index it occupied, so the fold happens where the row actually was. */
  index: number;
  /** Identifies this departure, even if the same VehicleID leaves again. */
  departure: number;
};

export type RelativeMotionState = {
  ghosts: readonly RelativeGhost[];
};

type RelativeGhostState = {
  model: RelativeViewModel | null;
  ghosts: readonly RelativeGhost[];
  departed: readonly RelativeGhost[];
  nextDeparture: number;
};

function rowElement(root: HTMLElement | null, rowId: string): HTMLElement | null {
  return root?.querySelector<HTMLElement>(`[data-relative-row="${CSS.escape(rowId)}"]`) ?? null;
}

/**
 * Motion for the Redline relative. Same shape as the standings engine: the
 * previous ViewModel is ephemeral presentation state in a ref, and discrete
 * animations are applied imperatively inside a layout effect so React never
 * re-renders because something moved.
 *
 * A single render never animates — there is no previous model to compare
 * against — which is what keeps the deterministic visual gate deterministic.
 */
export function useRelativeMotion(
  model: RelativeViewModel,
  enabled: boolean,
  rootRef: RefObject<HTMLElement | null>,
): RelativeMotionState {
  const prevRef = useRef<RelativeViewModel | null>(null);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const [ghostState, setGhostState] = useState<RelativeGhostState>({
    model: null,
    ghosts: [],
    departed: [],
    nextDeparture: 0,
  });
  const ghostTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  /**
   * Top position of every row in the last painted model, relative to the root.
   * Measured imperatively after each paint; the next model slides each row from
   * its previous position to its current one, which is what makes a crossing
   * through the player row (and past the axis seams) read as one continuous
   * glide instead of an estimated jump.
   */
  const rectsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  let ghosts = ghostState.ghosts;
  if (ghostState.model !== model) {
    const samePresentation = ghostState.model !== null &&
      ghostState.model.presentationKey === model.presentationKey;
    const stillHere = new Set(model.rows.map((row) => row.id));
    const departed: RelativeGhost[] = [];
    let nextDeparture = ghostState.nextDeparture;
    if (samePresentation && enabled && model.status === "ready" && ghostState.model?.status === "ready") {
      ghostState.model.rows.forEach((row, index) => {
        if (!row.isPlayer && !stillHere.has(row.id)) {
          departed.push({ row, index, departure: nextDeparture++ });
        }
      });
    }
    ghosts = [
      ...(samePresentation ? ghostState.ghosts : []).filter(
        (ghost) => !departed.some((item) => item.row.id === ghost.row.id),
      ),
      ...departed,
    ];
    setGhostState({ model, ghosts, departed, nextDeparture });
  }

  useEffect(() => {
    const departed = ghostState.departed;
    if (departed.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      ghostTimersRef.current.delete(timer);
      const departures = new Set(departed.map((item) => item.departure));
      setGhostState((current) => ({
        ...current,
        ghosts: current.ghosts.filter(
          (ghost) => !departures.has(ghost.departure),
        ),
      }));
    }, EXIT_MS);
    ghostTimersRef.current.add(timer);
  }, [ghostState.departed]);

  useLayoutEffect(() => {
    if (!enabled || model.status !== "ready") {
      prevRef.current = model.status === "ready" ? model : null;
      rectsRef.current = new Map();
      return;
    }
    const previous = prevRef.current;
    const samePresentation = previous !== null &&
      previous.presentationKey === model.presentationKey;
    const prev = samePresentation ? previous : null;
    if (!samePresentation) {
      rectsRef.current = new Map();
    }
    prevRef.current = model;
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const rootTop = root.getBoundingClientRect().top;

    // FLIP real: cada fila se desliza desde la posicion que ocupaba en el modelo
    // anterior (medida) hasta la actual. La distancia medida atraviesa tambien
    // los ejes y la fila del jugador, asi que un cruce recorre una trayectoria
    // continua en vez de un salto estimado por indice.
    if (prev) {
      for (const [rowId, previousTop] of rectsRef.current) {
        const element = rowElement(root, rowId);
        if (!element) {
          continue;
        }
        const offsetPx = previousTop - (element.getBoundingClientRect().top - rootTop);
        if (Math.abs(offsetPx) < 0.5) {
          continue;
        }
        const rowsMoved = Math.abs(offsetPx) / RELATIVE_ROW_STRIDE_PX;
        const duration = Math.min(FLIP_MAX_MS, FLIP_BASE_MS + rowsMoved * FLIP_PER_ROW_MS);
        element.animate(
          [{ transform: `translateY(${offsetPx}px)` }, { transform: "translateY(0)" }],
          { duration, easing: "cubic-bezier(0.22, 0.9, 0.3, 1)" },
        );
      }
    }

    const schedule = (durationMs: number, run: () => void) => {
      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        run();
      }, durationMs);
      timersRef.current.add(timer);
    };

    let crossBudget = MAX_CONCURRENT_CROSSES;
    let crossIndex = 0;
    for (const event of deriveRelativeEvents(prev, model)) {
      if (event.kind === "enter") {
        // The row unfolds from nothing rather than blinking into the list.
        rowElement(root, event.rowId)?.animate(
          [
            { transform: "scaleY(0.1)", opacity: 0, transformOrigin: "center" },
            { transform: "scaleY(1)", opacity: 1, transformOrigin: "center" },
          ],
          { duration: ENTER_MS, easing: "cubic-bezier(0.22, 0.9, 0.3, 1)" },
        );
        continue;
      }
      if (event.kind === "cross" && crossBudget > 0) {
        crossBudget -= 1;
        const delayMs = crossIndex * CROSS_STAGGER_MS;
        crossIndex += 1;
        const element = rowElement(root, event.rowId);
        if (element) {
          element.style.setProperty("--cross-delay", `${delayMs}ms`);
          // Losing a place to this car reads red; taking one back reads green.
          element.dataset.cross = event.to === "ahead" ? "lost" : "gained";
          schedule(CROSS_FLASH_MS + delayMs, () => {
            delete element.dataset.cross;
            element.style.removeProperty("--cross-delay");
          });
        }
      }
    }

    // Posiciones actuales para el siguiente modelo: el FLIP del proximo render
    // deslizara cada fila desde aqui hasta su nuevo sitio.
    const nextRects = new Map<string, number>();
    for (const row of model.rows) {
      const element = rowElement(root, row.id);
      if (element) {
        nextRects.set(row.id, element.getBoundingClientRect().top - rootTop);
      }
    }
    rectsRef.current = nextRects;
  }, [enabled, model, rootRef]);

  useEffect(() => {
    const timers = ghostTimersRef.current;
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  // A row that comes back is no longer a ghost.
  const present = new Set(model.rows.map((row) => row.id));
  const visibleGhosts = ghosts.filter((ghost) => !present.has(ghost.row.id));

  return { ghosts: enabled && model.status === "ready" ? visibleGhosts : [] };
}
