import { useRef, type RefObject } from "react";
import { useWidgetMotion, type MotionLevel } from "../../core/widget-motion";
import type { BroadcastTowerViewModel } from "../../widget-types/broadcast-tower/broadcast-tower-view-model";
import { deriveOvertakes } from "./functional-motion";

type Card = { node: HTMLElement; left: number; width: number };
type Slide = { animation: Animation; from: number };
type Fade = { animation: Animation; startOpacity: number };
type Ghost = { node: HTMLElement; fade?: Animation; timer: ReturnType<typeof setTimeout>; startOpacity: number };

const CARDS = "[data-bt-row]";
const FADE_MS = 120;

function progress(animation: Animation | undefined): number {
  const value = animation?.effect?.getComputedTiming().progress;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 1;
}

function measureCards(root: HTMLElement, visualOffset: (id: string) => number = () => 0): Map<string, Card> {
  const stream = root.querySelector<HTMLElement>(".vf-bt-stream");
  const measured = new Map<string, Card>();
  if (!stream) return measured;
  const streamRect = stream.getBoundingClientRect();
  const scale = stream.offsetWidth > 0 ? streamRect.width / stream.offsetWidth : 1;
  for (const node of stream.querySelectorAll<HTMLElement>(CARDS)) {
    const id = node.dataset.btRow;
    if (!id) continue;
    const rect = node.getBoundingClientRect();
    // A running WAAPI transform is part of the rect. Store layout coordinates
    // so the next retarget adds that in-flight offset exactly once.
    measured.set(id, { node, left: (rect.left - streamRect.left) / (scale || 1) - visualOffset(id), width: rect.width / (scale || 1) });
  }
  return measured;
}

/** Horizontal motion belongs to the card strip; telemetry text is never a trigger. */
export function useBroadcastTowerMotion(
  model: BroadcastTowerViewModel,
  motion: MotionLevel,
  rootRef: RefObject<HTMLElement | null>,
  geometry: { w?: number; h?: number },
): void {
  const visible = model.rows.slice(0, model.rowCount);
  const ids = visible.map((row) => row.id);
  // Old preview models have no canonical IDs. They still render, but a number
  // or place is not a safe motion identity across telemetry samples.
  const hasCanonicalIds = ids.every((id): id is string => typeof id === "string" && id.length > 0)
    && new Set(ids).size === ids.length;
  const structureKey = hasCanonicalIds ? ids.join("\u001f") : "";
  const boundaryKey = [model.motionIdentity, model.sessionLabel, geometry.w, geometry.h, model.rowCount, model.showWeather, model.showSof, motion].join("\u001f");

  const cardsRef = useRef<Map<string, Card>>(new Map());
  const slidesRef = useRef<Map<string, Slide>>(new Map());
  const entrancesRef = useRef<Map<string, Fade>>(new Map());
  const cuesRef = useRef<Map<string, Animation>>(new Map());
  const ghostsRef = useRef<Map<string, Ghost>>(new Map());
  const ownedRef = useRef<Set<Animation>>(new Set());

  const own = (animation: Animation) => {
    ownedRef.current.add(animation);
    const forget = () => ownedRef.current.delete(animation);
    animation.addEventListener?.("finish", forget, { once: true });
    animation.addEventListener?.("cancel", forget, { once: true });
  };
  const removeGhost = (id: string) => {
    const ghost = ghostsRef.current.get(id);
    if (!ghost) return;
    clearTimeout(ghost.timer);
    ghost.fade?.cancel();
    ghost.node.remove();
    ghostsRef.current.delete(id);
  };
  const clear = () => {
    for (const animation of ownedRef.current) animation.cancel();
    ownedRef.current.clear();
    slidesRef.current.clear();
    entrancesRef.current.clear();
    cuesRef.current.clear();
    for (const id of ghostsRef.current.keys()) removeGhost(id);
    cardsRef.current.clear();
  };

  useWidgetMotion(
    { status: model.status, boundaryKey, structureKey },
    motion !== "minimal" && hasCanonicalIds,
    rootRef,
    ({ next, root, persist }) => {
      const oldBoundary = persist.get("bt-boundary");
      const oldStructure = persist.get("bt-structure");
      if (oldBoundary === next.boundaryKey && oldStructure === next.structureKey) return;
      if (oldBoundary !== next.boundaryKey) {
        clear();
        cardsRef.current = measureCards(root);
        persist.set("bt-boundary", next.boundaryKey);
        persist.set("bt-structure", next.structureKey);
        return;
      }

      const previous = cardsRef.current;
      const current = measureCards(root, (id) => {
        const slide = slidesRef.current.get(id);
        return slide ? slide.from * (1 - progress(slide.animation)) : 0;
      });
      const nextIds = new Set(current.keys());
      const returningOpacity = new Map<string, number>();
      for (const [id, ghost] of ghostsRef.current) {
        if (nextIds.has(id)) {
          returningOpacity.set(id, ghost.fade ? ghost.startOpacity * (1 - progress(ghost.fade)) : ghost.startOpacity);
          removeGhost(id);
        }
      }

      for (const [id, card] of current) {
        const old = previous.get(id);
        if (!old) continue;
        const running = slidesRef.current.get(id);
        const visualOffset = running ? running.from * (1 - progress(running.animation)) : 0;
        running?.animation.cancel();
        slidesRef.current.delete(id);
        const from = old.left - card.left + visualOffset;
        if (Math.abs(from) < 0.5 || typeof card.node.animate !== "function") continue;
        const animation = card.node.animate(
          [{ transform: `translateX(${from}px)` }, { transform: "translateX(0)" }],
          { duration: Math.min(360, 250 + Math.abs(from) * 0.28), easing: "cubic-bezier(0.2, 0.75, 0.3, 1)" },
        );
        own(animation);
        slidesRef.current.set(id, { animation, from });
      }

      if (motion === "full") {
        const stream = root.querySelector<HTMLElement>(".vf-bt-stream");
        for (const [id, card] of previous) {
          if (nextIds.has(id) || !stream) continue;
          const slide = slidesRef.current.get(id);
          const entrance = entrancesRef.current.get(id);
          const opacity = entrance ? entrance.startOpacity + (1 - entrance.startOpacity) * progress(entrance.animation) : 1;
          const left = card.left + (slide ? slide.from * (1 - progress(slide.animation)) : 0);
          const node = card.node.cloneNode(true) as HTMLElement;
          delete node.dataset.btRow;
          node.dataset.btGhost = id;
          node.setAttribute("aria-hidden", "true");
          node.setAttribute("inert", "");
          node.style.left = `${left}px`;
          node.style.width = `${card.width}px`;
          stream.append(node);
          const fade = typeof node.animate === "function"
            ? node.animate([{ opacity }, { opacity: 0 }], { duration: FADE_MS, easing: "ease-out", fill: "forwards" })
            : undefined;
          if (fade) own(fade);
          const timer = setTimeout(() => removeGhost(id), FADE_MS);
          ghostsRef.current.set(id, { node, fade, timer, startOpacity: opacity });
        }
        for (const [id, card] of current) {
          if (previous.has(id) || typeof card.node.animate !== "function") continue;
          const startOpacity = returningOpacity.get(id) ?? 0;
          const animation = card.node.animate([{ opacity: startOpacity }, { opacity: 1 }], { duration: FADE_MS, easing: "ease-out" });
          own(animation);
          entrancesRef.current.set(id, { animation, startOpacity });
        }

        // Compare only shared IDs: inserting/removing a card is not a gain or loss.
        const commonBefore = [...previous.keys()].filter((id) => nextIds.has(id));
        const commonAfter = [...current.keys()].filter((id) => previous.has(id));
        const { gained, lost } = deriveOvertakes(
          commonBefore.map((id) => ({ id })), commonAfter.map((id) => ({ id })),
        );
        for (const [group, color] of [[gained, "rgb(127 182 134 / 5%)"], [lost, "rgb(217 83 96 / 5%)"]] as const) {
          for (const id of group) {
            const cue = current.get(id)?.node.querySelector<HTMLElement>(".vf-bt-cue");
            if (!cue || typeof cue.animate !== "function") continue;
            cuesRef.current.get(id)?.cancel();
            const animation = cue.animate([{ backgroundColor: color }, { backgroundColor: "transparent" }], { duration: 450, easing: "ease-out" });
            own(animation);
            cuesRef.current.set(id, animation);
          }
        }
      }
      for (const [id, slide] of slidesRef.current) if (!nextIds.has(id)) { slide.animation.cancel(); slidesRef.current.delete(id); }
      for (const [id, fade] of entrancesRef.current) if (!nextIds.has(id)) { fade.animation.cancel(); entrancesRef.current.delete(id); }
      for (const [id, cue] of cuesRef.current) if (!nextIds.has(id)) { cue.cancel(); cuesRef.current.delete(id); }
      cardsRef.current = current;
      persist.set("bt-structure", next.structureKey);
    },
    () => clear(),
    (root, persist) => {
      cardsRef.current = measureCards(root);
      persist.set("bt-boundary", boundaryKey);
      persist.set("bt-structure", structureKey);
    },
  );
}
