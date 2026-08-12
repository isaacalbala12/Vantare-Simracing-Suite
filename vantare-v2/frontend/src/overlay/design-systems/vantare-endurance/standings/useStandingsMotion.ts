import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type {
  StandingsRowViewModel,
  StandingsViewModel,
} from "../../../widget-types/standings/standings-view-model";
import {
  classPositionsById,
  deriveBattlePairs,
  deriveFlipOffsets,
  derivePositionDeltas,
  deriveRosterChange,
  deriveStandingsEvents,
  type BattlePair,
} from "./standings-motion";

export const REDLINE_ROW_STRIDE_PX = 30;

/** Stable identity for a pair, used by both the box set and the dissolve map. */
function battleKey(pair: BattlePair): string {
  return `${pair.aheadId}|${pair.behindId}`;
}
const FLIP_BASE_MS = 320;
const FLIP_PER_ROW_MS = 60;
const FLIP_MAX_MS = 560;
const FLASH_DURATION_MS = 1100;
const HOT_DURATION_MS = 1400;
const CROWN_FLY_MS = 620;
const TIRE_DURATION_MS = 4200;
const TIRE_EXIT_MS = 420;
const ENTER_DURATION_MS = 420;
const RETIRE_DURATION_MS = 640;
const BATTLE_BOX_AFTER_MS = 2500;
const BATTLE_DISSOLVE_MS = 360;
const MAX_CONCURRENT_FLASHES = 4;
const FLASH_STAGGER_MS = 40;
const DELTA_STEP_MS = 140;

export type BattleState = BattlePair & {
  /** seam = just engaged; box = sustained battle, crystallized; dissolve = box melting away. */
  stage: "seam" | "box" | "dissolve";
};

export type TireReveal = {
  compound: string;
  /** true during the last stretch of the reveal so CSS can play the exit. */
  leaving: boolean;
};

export type GhostRow = {
  row: StandingsRowViewModel;
  vehicleClass: string;
  classIndex: number;
};

export type StandingsMotionState = {
  /** Net positions gained/lost per row versus the session baseline, stepped one unit at a time. */
  positionDeltas: ReadonlyMap<string, number>;
  /** Tire compound reveals after pit exits, keyed by row id. */
  tires: ReadonlyMap<string, TireReveal>;
  battles: readonly BattleState[];
  /** Rows that just left the field, rendered as fading ghosts where they used to sit. */
  ghosts: readonly GhostRow[];
};

function rowElement(root: HTMLElement | null, rowId: string): HTMLElement | null {
  return root?.querySelector<HTMLElement>(`[data-standings-row="${CSS.escape(rowId)}"]`) ?? null;
}

/** Flies a clone of the fastest-lap glyph from the old holder's best cell to the new one. */
function flyCrown(root: HTMLElement, fromRowId: string, toRowId: string): void {
  const fromCell = rowElement(root, fromRowId)?.querySelector<HTMLElement>(".ven-red-best");
  const toCell = rowElement(root, toRowId)?.querySelector<HTMLElement>(".ven-red-best");
  const glyph = fromCell?.querySelector<SVGElement>(".ven-red-fastest") ?? toCell?.querySelector<SVGElement>(".ven-red-fastest");
  if (!fromCell || !toCell || !glyph) {
    return;
  }
  const rootRect = root.getBoundingClientRect();
  const fromRect = fromCell.getBoundingClientRect();
  const toRect = toCell.getBoundingClientRect();
  const floater = glyph.cloneNode(true) as SVGElement;
  floater.classList.add("ven-red-crown-fly");
  floater.style.left = `${fromRect.left - rootRect.left - 2}px`;
  floater.style.top = `${fromRect.top - rootRect.top + fromRect.height / 2 - 6}px`;
  root.appendChild(floater);
  const animation = floater.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      {
        transform: `translate(${toRect.left - fromRect.left}px, ${toRect.top - fromRect.top}px) scale(1.35)`,
        opacity: 1,
        offset: 0.7,
      },
      {
        transform: `translate(${toRect.left - fromRect.left}px, ${toRect.top - fromRect.top}px) scale(1)`,
        opacity: 0,
      },
    ],
    { duration: CROWN_FLY_MS, easing: "cubic-bezier(0.3, 0.7, 0.2, 1)" },
  );
  animation.onfinish = () => floater.remove();
  animation.oncancel = () => floater.remove();
}

/**
 * Motion engine for the Redline standings. The previous ViewModel lives in a
 * ref as ephemeral presentation state; discrete animations (FLIP slides,
 * overtake flashes, the crown flight, row entries) are applied imperatively to
 * the DOM inside a layout effect so React never re-renders for them, while
 * slow-changing motion (battle crystallization, tire reveals, delta counting,
 * retirement ghosts) flows through state updated from timers.
 */
export function useStandingsMotion(
  model: StandingsViewModel,
  enabled: boolean,
  rootRef: RefObject<HTMLElement | null>,
): StandingsMotionState {
  const [baseline] = useState(() =>
    model.status === "ready" ? classPositionsById(model) : new Map<string, number>(),
  );
  const [tires, setTires] = useState<ReadonlyMap<string, TireReveal>>(new Map());
  const [boxKeys, setBoxKeys] = useState<ReadonlySet<string>>(new Set());
  const [dissolving, setDissolving] = useState<ReadonlyMap<string, BattlePair>>(new Map());
  /** Model the last render was built from, so a broken pair is caught in-render. */
  const [renderedModel, setRenderedModel] = useState<StandingsViewModel | null>(null);
  const [ghosts, setGhosts] = useState<readonly GhostRow[]>([]);
  const [displayDeltas, setDisplayDeltas] = useState<ReadonlyMap<string, number>>(new Map());
  const prevRef = useRef<StandingsViewModel | null>(null);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const battleSeenRef = useRef<Set<string>>(new Set());
  const deltaTargetsRef = useRef<ReadonlyMap<string, number>>(new Map());
  const deltaShownRef = useRef<ReadonlyMap<string, number>>(new Map());

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

    const schedule = (durationMs: number, run: () => void) => {
      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        run();
      }, durationMs);
      timersRef.current.add(timer);
    };

    // Delta counting: step the displayed value one unit toward the target so
    // a two-place jump reads +1 → +2 instead of teleporting.
    deltaTargetsRef.current = derivePositionDeltas(baseline, model);
    const stepDeltas = () => {
      const goal = deltaTargetsRef.current;
      const current = deltaShownRef.current;
      const next = new Map(current);
      let moved = false;
      for (const [id, target] of goal) {
        const shown = next.get(id) ?? 0;
        if (shown !== target) {
          next.set(id, shown + Math.sign(target - shown));
          moved = true;
        }
      }
      for (const id of next.keys()) {
        if (!goal.has(id)) {
          next.delete(id);
          moved = true;
        }
      }
      if (moved) {
        deltaShownRef.current = next;
        setDisplayDeltas(next);
        schedule(DELTA_STEP_MS, stepDeltas);
      }
    };
    stepDeltas();

    if (!prev || !root) {
      return;
    }

    // FLIP slides, duration scaled by distance so a three-row climb glides
    // slower than a one-row swap instead of snapping at the same speed.
    for (const [rowId, offset] of deriveFlipOffsets(prev, model, REDLINE_ROW_STRIDE_PX)) {
      const rowsMoved = Math.abs(offset) / REDLINE_ROW_STRIDE_PX;
      const duration = Math.min(FLIP_MAX_MS, FLIP_BASE_MS + rowsMoved * FLIP_PER_ROW_MS);
      const element = rowElement(root, rowId);
      element?.animate(
        [{ transform: `translateY(${offset}px)` }, { transform: "translateY(0)" }],
        { duration, easing: "cubic-bezier(0.22, 0.9, 0.3, 1)" },
      );
    }

    // Roster: entries slide in; retirements become ghosts that fade in place.
    const roster = deriveRosterChange(prev, model);
    for (const rowId of roster.entered) {
      rowElement(root, rowId)?.animate(
        [
          { transform: "translateX(-10px)", opacity: 0 },
          { transform: "translateX(0)", opacity: 1 },
        ],
        { duration: ENTER_DURATION_MS, easing: "cubic-bezier(0.22, 0.9, 0.3, 1)" },
      );
    }
    if (roster.retired.length > 0) {
      const retiredIds = new Set(roster.retired.map((ghost) => ghost.row.id));
      schedule(0, () => {
        setGhosts((current) => [
          ...current.filter((ghost) => !retiredIds.has(ghost.row.id)),
          ...roster.retired,
        ]);
      });
      schedule(RETIRE_DURATION_MS, () => {
        setGhosts((current) => current.filter((ghost) => !retiredIds.has(ghost.row.id)));
      });
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
        if (event.previousRowId && event.previousRowId !== event.rowId) {
          flyCrown(root, event.previousRowId, event.rowId);
        }
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
          setTires((current) => new Map(current).set(rowId, { compound, leaving: false }));
        });
        schedule(TIRE_DURATION_MS - TIRE_EXIT_MS, () => {
          setTires((current) => {
            const reveal = current.get(rowId);
            if (!reveal || reveal.leaving) {
              return current;
            }
            return new Map(current).set(rowId, { ...reveal, leaving: true });
          });
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
        // A crystallized box melts over BATTLE_DISSOLVE_MS instead of vanishing;
        // the CSS transition plays the styles back to the plain-rows look.
        // The pair itself entered `dissolving` during the render that dropped
        // it — see the block below the effect. Only the box flag and the
        // timed removal belong here.
        setBoxKeys((current) => {
          if (!current.has(key)) {
            return current;
          }
          const next = new Set(current);
          next.delete(key);
          return next;
        });
        schedule(BATTLE_DISSOLVE_MS, () => {
          setDissolving((current) => {
            if (!current.has(key)) {
              return current;
            }
            const next = new Map(current);
            next.delete(key);
            return next;
          });
        });
      }
    }
  }, [enabled, model, rootRef, baseline]);

  // A pair that just broke has to be dissolving BEFORE anything commits.
  //
  // Adding it from the effect meant one whole render where the battle was
  // neither active nor dissolving: the template unwrapped the two rows out of
  // their .ven-red-battle container, React destroyed that subtree, and the
  // re-wrap a beat later mounted fresh nodes. Every descendant animation
  // restarted with them — which is why the pressure cell replayed its entry
  // instead of leaving.
  //
  // Adjusting state during render is React's own answer to this: it re-runs
  // the component and discards the in-progress output before touching the DOM,
  // so the intermediate tree never reaches the browser.
  if (renderedModel !== model) {
    setRenderedModel(model);
    if (enabled && model.status === "ready" && renderedModel?.status === "ready") {
      const stillActive = new Set(deriveBattlePairs(model).map(battleKey));
      const justBroken = deriveBattlePairs(renderedModel).filter(
        (pair) => !stillActive.has(battleKey(pair)),
      );
      if (justBroken.length > 0) {
        setDissolving((current) => {
          const next = new Map(current);
          for (const pair of justBroken) {
            next.set(battleKey(pair), pair);
          }
          return next;
        });
      }
    }
  }

  if (!enabled || model.status !== "ready") {
    return { positionDeltas: new Map(), tires: new Map(), battles: [], ghosts: [] };
  }

  const battles: BattleState[] = deriveBattlePairs(model).map<BattleState>((pair) => ({
    ...pair,
    stage: boxKeys.has(`${pair.aheadId}|${pair.behindId}`) ? "box" : "seam",
  }));
  const activeBattleKeys = new Set(battles.map((battle) => `${battle.aheadId}|${battle.behindId}`));
  for (const [key, pair] of dissolving) {
    if (!activeBattleKeys.has(key)) {
      battles.push({ ...pair, stage: "dissolve" });
    }
  }

  return {
    positionDeltas: displayDeltas,
    tires,
    battles,
    ghosts,
  };
}
