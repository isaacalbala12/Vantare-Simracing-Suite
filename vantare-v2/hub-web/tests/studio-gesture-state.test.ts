import { expect, it } from "vitest";
import {
  type StudioView,
  studioWidgetDefaults,
} from "../src/contract/generated/studio";
import { isStudio } from "../src/contract/modules/studio";
import {
  type CanvasState,
  projectedBox,
  canvasReducer as reduce,
} from "../src/renderer/screens/studio/gesture-state";

function view(revision = "0".repeat(64)): StudioView {
  const value: StudioView = {
    state: "ready",
    showing: false,
    plan: "pro",
    catalog: [],
    canUndo: false,
    canRedo: false,
    revision,
    canvas: { width: 1920, height: 1080, source: "custom" },
    instances: [
      {
        id: "one",
        kind: "delta",
        settings: studioWidgetDefaults.delta,
        visible: true,
        locked: false,
        opacity: 100,
        showIn: { practice: true, qualifying: true, race: true },
        offTrack: "inherit",
        size: { width: 300, height: 100 },
        x: 10,
        y: 20,
        sizeMode: "explicit",
        aspectLocked: false,
        canvasPlacement: "inside",
      },
    ],
  };
  if (!isStudio(value))
    throw Error("Geometry test uses a valid generated StudioView");
  return value;
}
const initial = (): CanvasState => ({ view: view(), serial: 0 });
function move(s: CanvasState, x: number) {
  let next = reduce(s, { type: "begin", id: "one", mode: "move" });
  const box = projectedBox(next, "one");
  if (!box) throw Error("No widget");
  next = reduce(next, { type: "preview", box: { ...box, x } });
  return next;
}
function saved(s: CanvasState, revision = "1".repeat(64)) {
  const value = structuredClone(s.view);
  value.revision = revision;
  if (!s.pending) throw Error("No pending request");
  Object.assign(value.instances[0], s.pending.target);
  return value;
}
it("keeps all pointer moves local and writes once only after release", () => {
  let s = move(initial(), 30);
  s = reduce(s, { type: "preview", box: { ...gesture(s).draft, x: 80 } });
  expect(s.pending).toBeUndefined();
  s = reduce(s, { type: "finish" });
  expect(s.pending?.request).toEqual({
    method: "studio.geometry",
    id: "one",
    baseRevision: "0".repeat(64),
    change: { kind: "move", x: 80, y: 20 },
  });
  expect(reduce(s, { type: "finish" })).toBe(s);
});
it("Escape and a gesture returning to its start write nothing", () => {
  expect(
    reduce(move(initial(), 80), { type: "cancel" }).pending,
  ).toBeUndefined();
  const s = reduce(initial(), { type: "begin", id: "one", mode: "resize" });
  expect(reduce(s, { type: "finish" }).pending).toBeUndefined();
});
it("uses the latest revision after unrelated external changes", () => {
  let s = move(initial(), 80);
  const next = view("2".repeat(64));
  next.showing = true;
  s = reduce(s, { type: "view", view: next });
  expect(s.gesture).toBeDefined();
  s = reduce(s, { type: "finish" });
  expect(s.pending?.request.baseRevision).toBe(next.revision);
});
it.each(["geometry", "removed", "canvas", "rights", "protected"] as const)(
  "cancels a gesture when its authoritative %s changes",
  (kind) => {
    let s = move(initial(), 80);
    const next = view("2".repeat(64));
    if (kind === "geometry") next.instances[0].x = 90;
    if (kind === "removed") next.instances = [];
    if (kind === "canvas") next.canvas = null;
    if (kind === "rights") next.plan = "unverified";
    if (kind === "protected") next.state = "protected";
    s = reduce(s, { type: "view", view: next });
    expect(s.gesture).toBeUndefined();
    expect(s.notice).toBe("changed");
    expect(reduce(s, { type: "finish" }).pending).toBeUndefined();
  },
);
it("holds only the last finished gesture while one request is in flight", () => {
  let s = reduce(move(initial(), 80), { type: "finish" });
  const first = pending(s);
  s = reduce(move(s, 100), { type: "finish" });
  s = reduce(move(s, 150), { type: "finish" });
  expect(s.pending).toEqual(first);
  expect(s.queued?.target.x).toBe(150);
  const current = saved(s);
  s = reduce(s, { type: "reply", token: first.token, view: current });
  expect(s.pending?.request.baseRevision).toBe(current.revision);
  expect(s.pending?.request.change).toEqual({ kind: "move", x: 150, y: 20 });
  expect(s.queued).toBeUndefined();
});
it("drops a queued gesture if a later gesture restores the in-flight target", () => {
  let s = reduce(move(initial(), 80), { type: "finish" });
  s = reduce(move(s, 100), { type: "finish" });
  s = reduce(move(s, 80), { type: "finish" });
  expect(s.queued).toBeUndefined();
});
it("adopts a conflict and drops both local gesture and queued intent without resending", () => {
  let s = reduce(move(initial(), 80), { type: "finish" });
  const token = pending(s).token;
  s = reduce(move(s, 100), { type: "finish" });
  s = move(s, 150);
  const current = view("3".repeat(64));
  current.instances[0].x = 500;
  s = reduce(s, { type: "error", token, conflict: current });
  expect(s.view).toEqual(current);
  expect(s.pending).toBeUndefined();
  expect(s.queued).toBeUndefined();
  expect(s.gesture).toBeUndefined();
  expect(s.notice).toBe("conflict");
});
it("cancels a queued write on external geometry changes instead of overwriting them", () => {
  let s = reduce(move(initial(), 80), { type: "finish" });
  s = reduce(move(s, 100), { type: "finish" });
  const next = saved(s);
  next.instances[0].x = 500;
  s = reduce(s, { type: "reply", token: pending(s).token, view: next });
  expect(s.pending).toBeUndefined();
  expect(s.queued).toBeUndefined();
  expect(s.notice).toBe("changed");
});
it("preserves a gesture begun on the pending projection when its matching reply arrives", () => {
  let s = reduce(move(initial(), 80), { type: "finish" });
  s = move(s, 100);
  s = reduce(s, { type: "reply", token: pending(s).token, view: saved(s) });
  expect(s.gesture?.draft.x).toBe(100);
  s = reduce(s, { type: "finish" });
  expect(s.pending?.request.baseRevision).toBe("1".repeat(64));
});
it("disables pending local work on live/rights changes and ignores obsolete replies", () => {
  let s = reduce(move(initial(), 80), { type: "finish" });
  s = reduce(move(s, 100), { type: "finish" });
  s = reduce(s, { type: "disable" });
  expect(s.queued).toBeUndefined();
  expect(s.gesture).toBeUndefined();
  expect(
    reduce(s, { type: "reply", token: 999, view: view("f".repeat(64)) }),
  ).toBe(s);
});
it("does not start geometry for a protected, unverified or missing canvas", () => {
  for (const patch of [
    { state: "protected" },
    { plan: "unverified" },
    { canvas: null },
  ] as const) {
    const s = { ...initial(), view: { ...view(), ...patch } };
    expect(
      reduce(s, { type: "begin", id: "one", mode: "move" }).gesture,
    ).toBeUndefined();
  }
});

function pending(s: CanvasState) {
  if (!s.pending) throw Error("Expected one in-flight request");
  return s.pending;
}
function gesture(s: CanvasState) {
  if (!s.gesture) throw Error("Expected active gesture");
  return s.gesture;
}
