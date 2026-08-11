import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { RelativeViewModel } from "../../../widget-types/relative/relative-view-model";
import { deriveRelativeEvents, deriveRelativeFlipOffsets } from "./relative-motion";

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
): void {
  const prevRef = useRef<RelativeViewModel | null>(null);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

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

    const schedule = (durationMs: number, run: () => void) => {
      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        run();
      }, durationMs);
      timersRef.current.add(timer);
    };

    for (const [rowId, offset] of deriveRelativeFlipOffsets(prev, model, RELATIVE_ROW_STRIDE_PX)) {
      const rowsMoved = Math.abs(offset) / RELATIVE_ROW_STRIDE_PX;
      const duration = Math.min(FLIP_MAX_MS, FLIP_BASE_MS + rowsMoved * FLIP_PER_ROW_MS);
      rowElement(root, rowId)?.animate(
        [{ transform: `translateY(${offset}px)` }, { transform: "translateY(0)" }],
        { duration, easing: "cubic-bezier(0.22, 0.9, 0.3, 1)" },
      );
    }

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
  }, [enabled, model, rootRef]);
}
