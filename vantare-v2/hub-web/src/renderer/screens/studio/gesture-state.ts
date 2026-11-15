import type { Request } from "../../../contract/generated/contract";
import type {
  GeometryChange,
  OverlayInstance,
  StudioView,
} from "../../../contract/generated/studio";
import { near } from "./geometry";

export type Box = Pick<
  OverlayInstance,
  "x" | "y" | "size" | "sizeMode" | "aspectLocked"
>;
type Intent = {
  id: string;
  expected: Box;
  target: Box;
  change: GeometryChange;
};
type Pending = Intent & {
  token: number;
  request: Extract<Request, { method: "studio.geometry" }>;
  visible: boolean;
};
type Gesture = {
  id: string;
  mode: "move" | "resize";
  expected: Box;
  origin: Box;
  draft: Box;
};
export type CanvasState = {
  view: StudioView;
  disabled?: boolean;
  gesture?: Gesture;
  pending?: Pending;
  queued?: Intent;
  serial: number;
  notice?: "changed" | "conflict" | "failed";
};
export type CanvasAction =
  | { type: "begin"; id: string; mode: Gesture["mode"] }
  | { type: "preview"; box: Box }
  | { type: "finish" }
  | { type: "write"; id: string; change: GeometryChange; target: Box }
  | { type: "cancel" }
  | { type: "disable" }
  | { type: "enable" }
  | { type: "view"; view: StudioView }
  | { type: "reply"; token: number; view: StudioView }
  | { type: "error"; token: number; conflict?: StudioView }
  | { type: "dismiss" };
export const boxOf = (item: OverlayInstance): Box => ({
  x: item.x,
  y: item.y,
  size: { ...item.size },
  sizeMode: item.sizeMode,
  aspectLocked: item.aspectLocked,
});
export const sameBox = (a: Box, b: Box) =>
  near(a.x, b.x) &&
  near(a.y, b.y) &&
  near(a.size.width, b.size.width) &&
  near(a.size.height, b.size.height) &&
  a.sizeMode === b.sizeMode &&
  a.aspectLocked === b.aspectLocked;
const itemBox = (view: StudioView, id: string) => {
  const item = view.instances.find((i) => i.id === id);
  return item ? boxOf(item) : undefined;
};
const editable = (view: StudioView, id: string) =>
  view.state === "ready" &&
  view.canvas !== null &&
  view.plan !== "unverified" &&
  view.instances.some((i) => i.id === id && !i.locked);
export function projectedBox(state: CanvasState, id: string): Box | undefined {
  if (state.gesture?.id === id) return state.gesture.draft;
  if (state.queued?.id === id) return state.queued.target;
  if (state.pending?.id === id && state.pending.visible)
    return state.pending.target;
  return itemBox(state.view, id);
}
function expectedBox(state: CanvasState, id: string) {
  return state.pending?.id === id
    ? state.pending.target
    : itemBox(state.view, id);
}
function startWrite(state: CanvasState, intent: Intent): CanvasState {
  const current = itemBox(state.view, intent.id);
  if (
    state.disabled ||
    !editable(state.view, intent.id) ||
    !current ||
    !sameBox(current, intent.expected)
  )
    return { ...state, queued: undefined, notice: "changed" };
  const serial = state.serial + 1;
  return {
    ...state,
    serial,
    queued: undefined,
    pending: {
      ...intent,
      token: serial,
      visible: true,
      request: {
        method: "studio.geometry",
        id: intent.id,
        baseRevision: state.view.revision,
        change: intent.change,
      },
    },
  };
}
function enqueue(state: CanvasState, intent: Intent): CanvasState {
  if (sameBox(intent.expected, intent.target))
    return { ...state, queued: undefined };
  return state.pending
    ? { ...state, queued: intent }
    : startWrite(state, intent);
}
function observe(state: CanvasState, view: StudioView): CanvasState {
  const matches = (id: string, expected: Box) => {
    const current = itemBox(view, id);
    return (
      editable(view, id) &&
      current &&
      (sameBox(current, expected) ||
        (state.pending?.id === id && sameBox(current, state.pending.target)))
    );
  };
  const canvasUnchanged =
    state.view.canvas?.width === view.canvas?.width &&
    state.view.canvas?.height === view.canvas?.height &&
    state.view.canvas?.source === view.canvas?.source;
  const cancelGesture =
    state.gesture &&
    (!canvasUnchanged || !matches(state.gesture.id, state.gesture.expected));
  const cancelQueued =
    state.queued &&
    (!canvasUnchanged || !matches(state.queued.id, state.queued.expected));
  const pending = state.pending;
  const current = pending ? itemBox(view, pending.id) : undefined;
  return {
    ...state,
    view,
    gesture: cancelGesture ? undefined : state.gesture,
    queued: cancelQueued ? undefined : state.queued,
    pending: pending
      ? {
          ...pending,
          visible:
            !!current &&
            (sameBox(current, pending.expected) ||
              sameBox(current, pending.target)),
        }
      : undefined,
    notice: cancelGesture || cancelQueued ? "changed" : state.notice,
  };
}
/** Pure lifecycle: no IO during a gesture; only `pending.request` may be sent. */
export function canvasReducer(
  state: CanvasState,
  action: CanvasAction,
): CanvasState {
  switch (action.type) {
    case "begin": {
      if (state.disabled || state.gesture || !editable(state.view, action.id))
        return state;
      const origin = projectedBox(state, action.id),
        expected = expectedBox(state, action.id);
      return origin && expected
        ? {
            ...state,
            notice: undefined,
            gesture: {
              id: action.id,
              mode: action.mode,
              origin,
              expected,
              draft: origin,
            },
          }
        : state;
    }
    case "preview":
      return state.gesture
        ? { ...state, gesture: { ...state.gesture, draft: action.box } }
        : state;
    case "finish": {
      const g = state.gesture;
      if (!g) return state;
      const next = { ...state, gesture: undefined };
      if (sameBox(g.origin, g.draft)) return next;
      const change: GeometryChange =
        g.mode === "move"
          ? { kind: "move", x: g.draft.x, y: g.draft.y }
          : {
              kind: "resize",
              x: g.draft.x,
              y: g.draft.y,
              width: g.draft.size.width,
              height: g.draft.size.height,
            };
      return enqueue(next, {
        id: g.id,
        expected: g.expected,
        target: g.draft,
        change,
      });
    }
    case "write": {
      if (state.disabled || state.gesture || !editable(state.view, action.id))
        return state;
      const expected = expectedBox(state, action.id);
      return expected
        ? enqueue({ ...state, notice: undefined }, { ...action, expected })
        : state;
    }
    case "cancel":
      return { ...state, gesture: undefined };
    case "disable":
      return {
        ...state,
        disabled: true,
        gesture: undefined,
        queued: undefined,
      };
    case "enable":
      return { ...state, disabled: false };
    case "view":
      return observe(state, action.view);
    case "reply": {
      if (state.pending?.token !== action.token) return state;
      const next = { ...observe(state, action.view), pending: undefined };
      return next.queued ? startWrite(next, next.queued) : next;
    }
    case "error": {
      if (state.pending?.token !== action.token) return state;
      return {
        ...state,
        view: action.conflict ?? state.view,
        pending: undefined,
        queued: undefined,
        gesture: undefined,
        notice: action.conflict ? "conflict" : "failed",
      };
    }
    case "dismiss":
      return { ...state, notice: undefined };
  }
}
