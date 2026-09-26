import { useRef, type RefObject } from "react";
import { flipRows, useWidgetMotion, type MotionLevel } from "../../core/widget-motion";
import type { StandingsViewModel } from "../../widget-types/standings/standings-view-model";
import { deriveFunctionalStandingsEvents, selectStandingsBattle, standingsMotionContinues, type StandingsBattle } from "./standings-motion";
import { clearStandingsPresence, rememberStandingsRows, transitionStandingsRows, type StandingsPresence } from "./standings-presence";

const priority = { "session-best": 3, position: 2, "personal-best": 1 };
const MAX_NOTICES = 3;

function clearNotice(row: HTMLElement): void {
  delete row.dataset.motion;
  delete row.dataset.lapEvent;
  delete row.dataset.noticePriority;
  const chip = row.querySelector<HTMLElement>("[data-position-change]");
  if (chip) chip.textContent = "";
  row.querySelector<HTMLElement>(".vf-lap-sweep")?.getAnimations?.().forEach((animation) => animation.cancel());
}

function clearStandingsMotion(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-standings-row]").forEach(clearNotice);
  root.querySelectorAll<HTMLElement>("[data-battle]").forEach((row) => delete row.dataset.battle);
  root.getAnimations?.({ subtree: true }).forEach((animation) => animation.cancel());
}

function moveStandingsRows(root: HTMLElement, persist: Map<string, unknown>, onAnimation: (animation: Animation, row: HTMLElement) => void, preserveAnimation: (animation: Animation) => boolean): void {
  const duration = (from: number) => Math.min(460, 280 + Math.abs(from) * 1.1);
  flipRows(root, persist, {
    rows: "[data-standings-row]", id: (row) => row.dataset.standingsRow, duration, onAnimation, preserveAnimation,
  });
  // PIT belongs to the same pilot and follows the same vertical trajectory.
  flipRows(root, persist, {
    rows: "[data-pit-row]", id: (row) => row.dataset.pitRow, key: "pit-tops", duration, onAnimation, preserveAnimation,
  });
}

export function useStandingsMotion(model: StandingsViewModel, motion: MotionLevel, rootRef: RefObject<HTMLElement | null>): void {
  // DOM queries cannot find animations after a pilot or the table is removed.
  const owned = useRef(new Map<Animation, HTMLElement>());
  const presence = useRef<StandingsPresence>({ rows: new Map(), exits: new Map(), fades: new Set() });
  const track = (animation: Animation, target: HTMLElement) => { owned.current.set(animation, target); };
  const clear = (root: HTMLElement) => {
    for (const animation of owned.current.keys()) animation.cancel();
    owned.current.clear();
    clearStandingsPresence(presence.current);
    clearStandingsMotion(root);
  };
  const moveRows = (root: HTMLElement, persist: Map<string, unknown>) => {
    for (const [animation, target] of owned.current) {
      const removed = !root.contains(target);
      if (removed) animation.cancel();
      if (removed || animation.playState === "finished" || animation.playState === "idle") owned.current.delete(animation);
    }
    moveStandingsRows(root, persist, track, (animation) => presence.current.fades.has(animation));
    rememberStandingsRows(root, persist, presence.current);
  };
  // Layout/column changes can crop actual rows without changing telemetry.
  const input = { status: model.status, model, motion };
  useWidgetMotion(input, motion !== "minimal", rootRef, ({ prev, next, root, persist, schedule }) => {
    if (!standingsMotionContinues(prev.model, next.model) || prev.motion !== next.motion) {
      clear(root);
      persist.clear();
      moveRows(root, persist);
      return;
    }
    if (motion === "full") transitionStandingsRows(root, persist, presence.current, owned.current, track, schedule);
    moveRows(root, persist);
    if (motion !== "full") return;
    const visibleIds = new Set([...root.querySelectorAll<HTMLElement>("[data-standings-row]")].map((row) => row.dataset.standingsRow!));
    const battle = selectStandingsBattle(next.model, visibleIds, persist.get("battle") as StandingsBattle | undefined);
    persist.set("battle", battle);
    root.querySelectorAll<HTMLElement>("[data-standings-row]").forEach((row) => {
      if (row.dataset.standingsRow === battle?.aheadId || row.dataset.standingsRow === battle?.behindId) row.dataset.battle = "true";
      else delete row.dataset.battle;
    });
    for (const event of deriveFunctionalStandingsEvents(prev.model, next.model)) {
      const row = root.querySelector<HTMLElement>(`[data-standings-row="${CSS.escape(event.rowId)}"]`);
      if (!row) continue;
      const lap = row.querySelector<HTMLElement>('[data-metric="bestLap"] .vf-lap-sweep');
      if (event.kind !== "position" && !lap) continue;
      const active = [...root.querySelectorAll<HTMLElement>("[data-standings-row][data-notice-priority]")];
      if (!row.dataset.noticePriority && active.length >= MAX_NOTICES) {
        const lowest = active.sort((a, b) => Number(a.dataset.noticePriority) - Number(b.dataset.noticePriority))[0]!;
        if (Number(lowest.dataset.noticePriority) >= priority[event.kind]) continue;
        clearNotice(lowest);
      }
      if (Number(row.dataset.noticePriority) > priority[event.kind]) continue;
      clearNotice(row);
      row.dataset.noticePriority = String(priority[event.kind]);
      if (event.kind === "position") {
        row.dataset.motion = event.places! > 0 ? "rise" : "fall";
        const chip = row.querySelector<HTMLElement>("[data-position-change]");
        if (chip) chip.textContent = `${event.places! > 0 ? "+" : "−"}${Math.abs(event.places!)}`;
      } else {
        row.dataset.lapEvent = event.kind === "session-best" ? "session" : "personal";
        track(lap!.animate([
          { opacity: 0, transform: "translateX(-100%)" },
          { opacity: 0.7, transform: "translateX(0)", offset: 0.4 },
          { opacity: 0, transform: "translateX(100%)" },
        ], { duration: 800, easing: "ease-out" }), lap!);
      }
      schedule(1200, () => clearNotice(row), `standings-notice-${event.rowId}`);
    }
  }, clear, moveRows);
}
