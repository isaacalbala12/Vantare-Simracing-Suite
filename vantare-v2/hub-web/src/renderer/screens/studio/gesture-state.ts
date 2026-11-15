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
  saved?: { token: number; id: string; target: Box };
  awaitingRead?: { token: number; id: string; target: Box; confirm: boolean };
  notice?: "changed" | "conflict" | "failed" | "uncertain";
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
  | {
      type: "error";
      token: number;
      conflict?: StudioView;
      readRequired?: boolean;
      confirmFromRead?: boolean;
    }
  | { type: "reconciled"; view: StudioView }
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
    state.awaitingRead ||
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
  const savedBox = state.saved ? itemBox(view, state.saved.id) : undefined;
  return {
    ...state,
    view,
    saved:
      state.saved && savedBox && sameBox(savedBox, state.saved.target)
        ? state.saved
        : undefined,
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
      if (
        state.disabled ||
        state.awaitingRead ||
        state.gesture ||
        !editable(state.view, action.id)
      )
        return state;
      const origin = projectedBox(state, action.id),
        expected = expectedBox(state, action.id);
      return origin && expected
        ? {
            ...state,
            notice: undefined,
            saved: undefined,
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
      // A newer move can continue the locally queued resize. Its one final
      // order must include that size too, rather than previewing unsent fields.
      const resized =
        g.mode === "resize" ||
        !near(g.expected.size.width, g.draft.size.width) ||
        !near(g.expected.size.height, g.draft.size.height) ||
        g.expected.sizeMode !== g.draft.sizeMode;
      const change: GeometryChange = !resized
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
      if (
        state.disabled ||
        state.awaitingRead ||
        state.gesture ||
        !editable(state.view, action.id)
      )
        return state;
      const expected = expectedBox(state, action.id);
      return expected
        ? enqueue(
            { ...state, notice: undefined, saved: undefined },
            { ...action, expected },
          )
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
      const actual = itemBox(action.view, state.pending.id);
      if (!actual || !sameBox(actual, state.pending.target))
        return {
          ...observe(state, action.view),
          pending: undefined,
          queued: undefined,
          gesture: undefined,
          saved: undefined,
          notice: "changed",
        };
      const next = {
        ...observe(state, action.view),
        pending: undefined,
        saved: { token: action.token, id: state.pending.id, target: actual },
      };
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
        saved: undefined,
        awaitingRead: action.readRequired
          ? {
              token: action.token,
              id: state.pending.id,
              target: state.pending.target,
              confirm: action.confirmFromRead === true && !action.conflict,
            }
          : undefined,
        notice: action.conflict
          ? "conflict"
          : action.readRequired
            ? "uncertain"
            : "failed",
      };
    }
    case "reconciled": {
      const read = state.awaitingRead;
      if (!read) return state;
      const actual = itemBox(action.view, read.id);
      const confirmed = read.confirm && actual && sameBox(actual, read.target);
      return {
        ...observe(state, action.view),
        awaitingRead: undefined,
        saved: confirmed
          ? { token: read.token, id: read.id, target: actual }
          : undefined,
        notice: confirmed
          ? undefined
          : state.notice === "conflict"
            ? "conflict"
            : "failed",
      };
    }
    case "dismiss":
      return { ...state, notice: undefined };
  }
}
