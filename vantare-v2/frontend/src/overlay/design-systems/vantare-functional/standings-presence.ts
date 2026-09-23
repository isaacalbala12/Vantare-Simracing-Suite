import type { MotionSchedule } from "../../core/widget-motion";

type RowSnapshot = {
  row: HTMLElement;
  pit?: HTMLElement;
  top: number;
  left: number;
  width: number;
  height: number;
  pitTop?: number;
  cellWidths: number[];
};
type Exit = { node: HTMLElement; top: number; pitTop?: number; animation: Animation };
export type StandingsPresence = {
  rows: Map<string, RowSnapshot>;
  exits: Map<string, Exit>;
  fades: Set<Animation>;
};
type Track = (animation: Animation, target: HTMLElement) => void;
const DURATION = 200;

// Retain only references and geometry. DOM snapshots are made on actual exits.
export function rememberStandingsRows(root: HTMLElement, persist: Map<string, unknown>, state: StandingsPresence): void {
  const rect = root.getBoundingClientRect();
  const scale = root.offsetHeight > 0 ? rect.height / root.offsetHeight || 1 : 1;
  const tops = persist.get("flip-tops") as Map<string, number> | undefined;
  const pitTops = persist.get("pit-tops") as Map<string, number> | undefined;
  const rows = [...root.querySelectorAll<HTMLElement>("[data-standings-row]")];
  const cellWidths = rows[0] ? [...rows[0].children].map((cell) => cell.getBoundingClientRect().width / scale) : [];
  state.rows.clear();
  for (const row of rows) {
    const id = row.dataset.standingsRow!;
    const box = row.getBoundingClientRect();
    state.rows.set(id, {
      row, pit: root.querySelector<HTMLElement>(`[data-pit-row="${CSS.escape(id)}"]`) ?? undefined,
      top: tops?.get(id) ?? (box.top - rect.top) / scale,
      left: (box.left - rect.left) / scale, width: box.width / scale, height: box.height / scale,
      pitTop: pitTops?.get(id), cellWidths,
    });
  }
}

function animationProgress(animation: Animation): number {
  const progress = animation.effect?.getComputedTiming().progress;
  return typeof progress === "number" ? progress : 0;
}

// A removed node no longer has computed layout. Its owned transform effect
// still knows its current eased progress, in local (unscaled) coordinates.
function offsetInFlight(row: HTMLElement, owned: ReadonlyMap<Animation, HTMLElement>): number {
  for (const [animation, target] of owned) {
    if (target !== row || animation.playState !== "running") continue;
    const effect = animation.effect as KeyframeEffect | null;
    const from = effect?.getKeyframes?.()[0]?.transform;
    const offset = typeof from === "string" ? /^translateY\(([-\d.]+)px\)$/.exec(from)?.[1] : undefined;
    if (offset !== undefined) return Number(offset) * (1 - animationProgress(animation));
  }
  return 0;
}

function opacityInFlight(row: HTMLElement, state: StandingsPresence, owned: ReadonlyMap<Animation, HTMLElement>): number {
  for (const animation of state.fades) {
    if (owned.get(animation) !== row || animation.playState !== "running") continue;
    const frames = (animation.effect as KeyframeEffect | null)?.getKeyframes?.();
    const from = Number(frames?.[0]?.opacity ?? 0);
    const to = Number(frames?.at(-1)?.opacity ?? 1);
    return from + (to - from) * animationProgress(animation);
  }
  return 1;
}

function exitSnapshot(snapshot: RowSnapshot, id: string, top: number): HTMLElement {
  const ghost = document.createElement("div");
  ghost.className = "vf-standings-exit";
  ghost.dataset.exitingRow = id;
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", "");
  Object.assign(ghost.style, { top: `${top}px`, left: `${snapshot.left}px`, width: `${snapshot.width}px`, height: `${snapshot.height}px` });
  const table = document.createElement("table");
  table.className = "vf-table";
  const columns = document.createElement("colgroup");
  for (const width of snapshot.cellWidths) {
    const column = document.createElement("col");
    column.style.width = `${width}px`;
    columns.append(column);
  }
  const body = document.createElement("tbody");
  const row = snapshot.row.cloneNode(true) as HTMLElement;
  row.removeAttribute("data-standings-row");
  row.style.transform = "none";
  body.append(row);
  table.append(columns, body);
  ghost.append(table);
  if (snapshot.pit) {
    const rail = document.createElement("div");
    rail.className = "vf-pit-rail";
    const pit = snapshot.pit.cloneNode(true) as HTMLElement;
    pit.removeAttribute("data-pit-row");
    Object.assign(pit.style, { top: "0", transform: "none" });
    pit.querySelector("[data-pit-indicator]")?.removeAttribute("data-pit-indicator");
    rail.append(pit);
    ghost.append(rail);
  }
  ghost.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  return ghost;
}

export function clearStandingsPresence(state: StandingsPresence): void {
  for (const animation of state.fades) animation.cancel();
  for (const exit of state.exits.values()) exit.node.remove();
  state.fades.clear();
  state.exits.clear();
  state.rows.clear();
}

/** Runs before FLIP, so a re-entering identity can start at its outgoing image. */
export function transitionStandingsRows(
  root: HTMLElement,
  persist: Map<string, unknown>,
  state: StandingsPresence,
  owned: ReadonlyMap<Animation, HTMLElement>,
  track: Track,
  schedule: MotionSchedule,
): void {
  if (typeof root.animate !== "function") return;
  const current = new Map([...root.querySelectorAll<HTMLElement>("[data-standings-row]")].map((row) => [row.dataset.standingsRow!, row]));
  const fade = (node: HTMLElement, from: number, to: number, done: () => void) => {
    const animation = node.animate([{ opacity: from }, { opacity: to }], { duration: DURATION, easing: "ease-out" });
    state.fades.add(animation);
    track(animation, node);
    schedule(DURATION, () => { animation.cancel(); state.fades.delete(animation); done(); });
    return animation;
  };
  for (const [id, snapshot] of state.rows) {
    if (current.has(id)) continue;
    const top = snapshot.top + offsetInFlight(snapshot.row, owned);
    const node = exitSnapshot(snapshot, id, top);
    root.append(node);
    const animation = fade(node, opacityInFlight(snapshot.row, state, owned), 0, () => {
      if (state.exits.get(id)?.node === node) state.exits.delete(id);
      node.remove();
    });
    state.exits.set(id, { node, top, pitTop: snapshot.pitTop === undefined ? undefined : top + snapshot.pitTop - snapshot.top, animation });
  }
  for (const [id, row] of current) {
    if (state.rows.has(id)) continue;
    const exit = state.exits.get(id);
    const from = exit ? opacityInFlight(exit.node, state, owned) : 0;
    if (exit) {
      (persist.get("flip-tops") as Map<string, number> | undefined)?.set(id, exit.top);
      if (exit.pitTop !== undefined) (persist.get("pit-tops") as Map<string, number> | undefined)?.set(id, exit.pitTop);
      exit.animation.cancel();
      state.fades.delete(exit.animation);
      exit.node.remove();
      state.exits.delete(id);
    }
    fade(row, from, 1, () => {});
    const pit = root.querySelector<HTMLElement>(`[data-pit-row="${CSS.escape(id)}"]`);
    if (pit) fade(pit, from, 1, () => {});
  }
}
