import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { StandingsViewModel } from "../../../widget-types/standings/standings-view-model";
import {
  classPositionsById,
  deriveBattlePairs,
  deriveFlipOffsets,
  derivePositionDeltas,
  deriveStandingsEvents,
  type BattlePair,
} from "./standings-motion";

export const REDLINE_ROW_STRIDE_PX = 30;
const FLIP_DURATION_MS = 380;
const FLASH_DURATION_MS = 1100;
const HOT_DURATION_MS = 1400;
const TIRE_DURATION_MS = 4200;
const BATTLE_BOX_AFTER_MS = 2500;
const MAX_CONCURRENT_FLASHES = 4;
const FLASH_STAGGER_MS = 40;

export type BattleState = BattlePair & {
  /** seam = just engaged; box = sustained battle, crystallized. */
  stage: "seam" | "box";
};

export type StandingsMotionState = {
  /** Net positions gained/lost per row versus the session baseline. */
  positionDeltas: ReadonlyMap<string, number>;
  /** Tire compound reveals after pit exits, keyed by row id. */
  tires: ReadonlyMap<string, string>;
  battles: readonly BattleState[];
};

function rowElement(root: HTMLElement | null, rowId: string): HTMLElement | null {
  return root?.querySelector<HTMLElement>(`[data-standings-row="${CSS.escape(rowId)}"]`) ?? null;
}

/**
 * Motion engine for the Redline standings. The previous ViewModel lives in a
 * ref as ephemeral presentation state; discrete animations (FLIP slides and
 * overtake flashes) are applied imperatively to the DOM inside a layout effect
 * so React never re-renders for them, while slow-changing motion (battle
 * crystallization, tire reveals) flows through state updated from timers.
 */
export function useStandingsMotion(
  model: StandingsViewModel,
  enabled: boolean,
  rootRef: RefObject<HTMLElement | null>,
): StandingsMotionState {
  const [baseline] = useState(() =>
    model.status === "ready" ? classPositionsById(model) : new Map<string, number>(),
  );
  const [tires, setTires] = useState<ReadonlyMap<string, string>>(new Map());
  const [boxKeys, setBoxKeys] = useState<ReadonlySet<string>>(new Set());
  const prevRef = useRef<StandingsViewModel | null>(null);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const battleSeenRef = useRef<Set<string>>(new Set());

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

    for (const [rowId, offset] of deriveFlipOffsets(prev, model, REDLINE_ROW_STRIDE_PX)) {
      const element = rowElement(root, rowId);
      element?.animate(
        [{ transform: `translateY(${offset}px)` }, { transform: "translateY(0)" }],
        { duration: FLIP_DURATION_MS, easing: "cubic-bezier(0.22, 0.9, 0.3, 1)" },
      );
    }

    let flashBudget = MAX_CONCURRENT_FLASHES;
    let flashIndex = 0;
    for (const event of deriveStandingsEvents(prev, model)) {
      if (event.kind === "overtake" && flashBudget > 0) {
        flashBudget -= 1;
        const delayMs = flashIndex * FLASH_STAGGER_MS;
        flashIndex += 1;
        for (const [rowId, direction] of [
          [event.gainerId, "rise"],
          [event.loserId, "fall"],
        ] as const) {
          const element = rowElement(root, rowId);
          if (element) {
            element.style.setProperty("--flash-delay", `${delayMs}ms`);
            element.dataset.motion = direction;
            schedule(FLASH_DURATION_MS + delayMs, () => {
              delete element.dataset.motion;
              element.style.removeProperty("--flash-delay");
            });
          }
        }
      }
      if (event.kind === "session-best") {
        const element = rowElement(root, event.rowId);
        if (element) {
          element.dataset.hot = "true";
          schedule(HOT_DURATION_MS, () => {
            delete element.dataset.hot;
          });
        }
      }
      if (event.kind === "pit-out" && event.tireChanged && event.tireCompound) {
        const rowId = event.rowId;
        const compound = event.tireCompound;
        schedule(0, () => {
          setTires((current) => new Map(current).set(rowId, compound));
        });
        schedule(TIRE_DURATION_MS, () => {
          setTires((current) => {
            const next = new Map(current);
            next.delete(rowId);
            return next;
          });
        });
      }
    }

    const pairs = deriveBattlePairs(model);
    const activeKeys = new Set(pairs.map((pair) => `${pair.aheadId}|${pair.behindId}`));
    for (const key of activeKeys) {
      if (!battleSeenRef.current.has(key)) {
        battleSeenRef.current.add(key);
        schedule(BATTLE_BOX_AFTER_MS, () => {
          if (battleSeenRef.current.has(key)) {
            setBoxKeys((current) => new Set(current).add(key));
          }
        });
      }
    }
    for (const key of [...battleSeenRef.current]) {
      if (!activeKeys.has(key)) {
        battleSeenRef.current.delete(key);
        schedule(0, () => {
          setBoxKeys((current) => {
            if (!current.has(key)) {
              return current;
            }
            const next = new Set(current);
            next.delete(key);
            return next;
          });
        });
      }
    }
  }, [enabled, model, rootRef]);

  if (!enabled || model.status !== "ready") {
    return { positionDeltas: new Map(), tires: new Map(), battles: [] };
  }

  const battles = deriveBattlePairs(model).map<BattleState>((pair) => ({
    ...pair,
    stage: boxKeys.has(`${pair.aheadId}|${pair.behindId}`) ? "box" : "seam",
  }));

  return {
    positionDeltas: derivePositionDeltas(baseline, model),
    tires,
    battles,
  };
}
