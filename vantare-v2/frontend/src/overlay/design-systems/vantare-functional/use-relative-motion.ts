import { useRef, type RefObject } from "react";
import { flipRows, useWidgetMotion, type MotionLevel, type MotionSchedule } from "../../core/widget-motion";
import type { RelativeViewModel } from "../../widget-types/relative/relative-view-model";
import { deriveSideCrosses } from "./functional-motion";

type RowSnapshot = { row: HTMLTableRowElement; top: number };
const ROWS = "[data-relative-row]:not([data-player])";
const TOPS = "relative-tops";

function rememberRows(root: HTMLElement, persist: Map<string, unknown>): void {
  const wrap = root.querySelector<HTMLElement>(".vf-table-wrap");
  const tops = persist.get(TOPS) as Map<string, number> | undefined;
  if (!wrap || !tops) return;
  const rootRect = root.getBoundingClientRect();
  const scale = root.offsetHeight > 0 ? rootRect.height / root.offsetHeight : 1;
  const wrapTop = (wrap.getBoundingClientRect().top - rootRect.top) / (scale || 1);
  const snapshots = new Map<string, RowSnapshot>();
  for (const row of root.querySelectorAll<HTMLTableRowElement>(ROWS)) {
    const id = row.dataset.relativeRow;
    const top = id ? tops.get(id) : undefined;
    if (id && top !== undefined) snapshots.set(id, { row: row.cloneNode(true) as HTMLTableRowElement, top: top - wrapTop });
  }
  persist.set("relative-snapshots", snapshots);
}

function fadeExits(
  root: HTMLElement,
  previous: Map<string, RowSnapshot>,
  nextIds: ReadonlySet<string>,
  schedule: MotionSchedule,
  own: (animation: Animation) => void,
  ghosts: Set<HTMLElement>,
): void {
  const wrap = root.querySelector<HTMLElement>(".vf-table-wrap");
  const table = wrap?.querySelector<HTMLTableElement>(".vf-table:not([data-relative-ghost])");
  if (!wrap || !table) return;
  for (const [id, snapshot] of previous) {
    if (nextIds.has(id)) continue;
    const ghost = document.createElement("table");
    ghost.className = "vf-table vf-relative-exit";
    ghost.dataset.relativeGhost = id;
    ghost.setAttribute("aria-hidden", "true");
    ghost.setAttribute("inert", "");
    ghost.style.top = `${snapshot.top}px`;
    const columns = table.querySelector("colgroup")?.cloneNode(true);
    if (columns) ghost.append(columns);
    const body = document.createElement("tbody");
    const row = snapshot.row;
    delete row.dataset.relativeRow;
    delete row.dataset.cross;
    body.append(row);
    ghost.append(body);
    wrap.append(ghost);
    ghosts.add(ghost);
    if (typeof ghost.animate === "function") own(ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: "ease-out", fill: "forwards" }));
    schedule(120, () => { ghost.remove(); ghosts.delete(ghost); });
  }
}

/** Motion is keyed to identity and layout, never to changing telemetry text. */
export function useRelativeMotion(
  model: RelativeViewModel,
  motion: MotionLevel,
  rootRef: RefObject<HTMLElement | null>,
  boundaryKey: string,
  structureKey: string,
): void {
  const owned = useRef<Set<Animation>>(new Set());
  const independent = useRef<Set<Animation>>(new Set());
  const ghosts = useRef<Set<HTMLElement>>(new Set());
  const own = (animation: Animation, preserve = false) => {
    owned.current.add(animation);
    if (preserve) independent.current.add(animation);
    const forget = () => { owned.current.delete(animation); independent.current.delete(animation); };
    animation.addEventListener?.("finish", forget, { once: true });
    animation.addEventListener?.("cancel", forget, { once: true });
  };
  const clear = () => {
    for (const animation of owned.current) animation.cancel();
    owned.current.clear();
    independent.current.clear();
    for (const ghost of ghosts.current) ghost.remove();
    ghosts.current.clear();
  };
  const measure = (root: HTMLElement, persist: Map<string, unknown>) => {
    flipRows(root, persist, {
      rows: ROWS,
      id: (row) => row.dataset.relativeRow,
      key: TOPS,
      duration: (from) => Math.min(300, 220 + (Math.abs(from) / 28) * 20),
      easing: "cubic-bezier(0.2, 0.65, 0.3, 1)",
      onAnimation: (animation) => own(animation),
      preserveAnimation: (animation) => independent.current.has(animation),
    });
  };

  useWidgetMotion(model, motion !== "minimal", rootRef, ({ prev, next, root, schedule, persist }) => {
    const oldBoundary = persist.get("relative-boundary");
    const oldStructure = persist.get("relative-structure");
    if (oldBoundary === boundaryKey && oldStructure === structureKey) return;
    if (oldBoundary !== boundaryKey) {
      clear();
      persist.clear();
      persist.set("relative-boundary", boundaryKey);
      persist.set("relative-structure", structureKey);
      measure(root, persist);
      rememberRows(root, persist);
      return;
    }

    for (const ghost of ghosts.current) ghost.remove();
    ghosts.current.clear();
    const previous = persist.get("relative-snapshots") as Map<string, RowSnapshot> | undefined;
    const nextIds = new Set([...root.querySelectorAll<HTMLElement>(ROWS)].map((row) => row.dataset.relativeRow).filter((id): id is string => id !== undefined));
    measure(root, persist);
    if (motion === "full") {
      fadeExits(root, previous ?? new Map(), nextIds, schedule, (animation) => own(animation, true), ghosts.current);
      const previousIds = new Set(previous?.keys());
      for (const row of root.querySelectorAll<HTMLElement>(ROWS)) {
        const id = row.dataset.relativeRow;
        if (id && !previousIds.has(id) && typeof row.animate === "function") {
          own(row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: "ease-out" }), true);
        }
      }
      const { gained, lost } = deriveSideCrosses(prev.rows, next.rows);
      for (const [ids, color] of [[gained, "rgb(127 182 134 / 4%)"], [lost, "rgb(217 83 96 / 4%)"]] as const) {
        for (const id of ids) {
          const row = [...root.querySelectorAll<HTMLElement>(ROWS)].find((candidate) => candidate.dataset.relativeRow === id);
          if (row && typeof row.animate === "function") own(row.animate([{ backgroundColor: color }, { backgroundColor: "transparent" }], { duration: 480, easing: "ease-out" }), true);
        }
      }
    }
    persist.set("relative-structure", structureKey);
    rememberRows(root, persist);
  }, () => clear(), (root, persist) => {
    persist.set("relative-boundary", boundaryKey);
    persist.set("relative-structure", structureKey);
    measure(root, persist);
    rememberRows(root, persist);
  });
}
