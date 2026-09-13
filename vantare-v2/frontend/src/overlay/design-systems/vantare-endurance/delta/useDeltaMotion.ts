import type { RefObject } from "react";
import { useWidgetMotion } from "../../../core/widget-motion";
import type { DeltaViewModel } from "../../../widget-types/delta/delta-view-model";
import { deriveDeltaEvents } from "./delta-motion";

const CROSS_MS = 700;
const BEST_MS = 1100;

/**
 * Motion for the Redline delta. The bar itself already transitions its width
 * and opacity, so the engine only marks the two moments a width change cannot
 * express on its own: the instant the lap flips from losing to gaining, and the
 * moment the reference lap underneath it is replaced.
 *
 * A single render never animates, which keeps the deterministic visual gate
 * deterministic.
 */
export function useDeltaMotion(
  model: DeltaViewModel,
  enabled: boolean,
  rootRef: RefObject<HTMLElement | null>,
): void {
  useWidgetMotion(model, enabled, rootRef, ({ prev, next, root, schedule }) => {
    for (const event of deriveDeltaEvents(prev, next)) {
      if (event.kind === "cross-zero") {
        // The anchor pulses in the direction just taken, so the crossing reads
        // as an event rather than as the fill happening to pass the middle.
        root.dataset.cross = event.to;
        schedule(CROSS_MS, () => {
          delete root.dataset.cross;
        });
      }
      if (event.kind === "new-best") {
        root.dataset.newBest = "true";
        schedule(BEST_MS, () => {
          delete root.dataset.newBest;
        });
      }
    }
  });
}
