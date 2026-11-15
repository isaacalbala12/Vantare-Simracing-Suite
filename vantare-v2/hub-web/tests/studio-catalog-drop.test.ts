import { expect, it } from "vitest";
import type { StudioView } from "../src/contract/generated/studio";
import { studioLimits } from "../src/contract/generated/studio";
import { createMockHost } from "../src/mock/host";
import { catalogDropController } from "../src/renderer/screens/studio/catalog-drop";

function setup() {
  const host = createMockHost("studio-canvas");
  const reply = host({
    kind: "request",
    id: 1,
    request: { method: "studio.get" },
  });
  if (reply?.kind !== "response" || reply.result.method !== "studio.get")
    throw Error("Studio view missing");
  const view = reply.result.value;
  const canvas = view.canvas;
  if (!canvas) throw Error("Canvas missing");
  return {
    host,
    view,
    surface: {
      left: 100,
      top: 50,
      width: canvas.width / 2,
      height: canvas.height / 2,
    },
    controller: catalogDropController(),
  };
}
const access = { enabled: true, pending: false };

it("has a local snapped silhouette, then consumes exactly one add using the latest revision", () => {
  const { view, surface, controller } = setup();
  expect(controller.begin(view, "delta", access)).toBe(true);
  expect(controller.begin(view, "radar", access)).toBe(false);
  const point = [
    surface.left + surface.width / 2,
    surface.top + surface.height / 2,
  ] as const;
  const preview = controller.preview(view, point, surface, access);
  expect(preview?.size).toEqual([150, 36]);
  expect(preview?.guides).toEqual([
    (surface.width * 2) / 2,
    (surface.height * 2) / 2,
  ]);
  const current = { ...view, revision: "a".repeat(64) };
  expect(controller.release(current, point, surface, access)).toEqual({
    method: "studio.add",
    kind: "delta",
    baseRevision: current.revision,
    at: { x: preview?.at[0], y: preview?.at[1] },
  });
  expect(controller.release(current, point, surface, access)).toBeNull();
});

it.each([
  [-1, 0],
  [0, -1],
  [1, 0],
  [0, 1],
])("outside release %j never adds and cannot be replayed", (dx, dy) => {
  const { view, surface, controller } = setup();
  controller.begin(view, "delta", access);
  const point = [
    surface.left + (dx < 0 ? -1 : dx * surface.width),
    surface.top + (dy < 0 ? -1 : dy * surface.height),
  ] as const;
  expect(controller.release(view, point, surface, access)).toBeNull();
  expect(controller.release(view, [200, 200], surface, access)).toBeNull();
});

it("Escape/lost capture/unmount cancellation has no command", () => {
  const { view, surface, controller } = setup();
  controller.begin(view, "delta", access);
  controller.cancel();
  expect(controller.preview(view, [200, 200], surface, access)).toBeNull();
  expect(controller.release(view, [200, 200], surface, access)).toBeNull();
});

it("does not start without capacity, a canvas or authority", () => {
  const { view, controller } = setup();
  expect(controller.begin(view, "delta", { ...access, enabled: false })).toBe(
    false,
  );
  expect(controller.begin({ ...view, canvas: null }, "delta", access)).toBe(
    false,
  );
  const full = {
    ...view,
    instances: Array.from(
      { length: studioLimits.instances },
      () => view.instances[0],
    ),
  };
  expect(controller.begin(full, "delta", access)).toBe(false);
  expect(controller.begin(view, "delta", access)).toBe(true);
});
it("accepts subpixel-rounded ultrawide DOM bounds but rejects a stretched plane", () => {
  const { view, controller } = setup();
  view.canvas = { width: 3440, height: 1440, source: "custom" };
  const measured = { left: 100, top: 50, width: 974, height: 407.719 };
  expect(controller.begin(view, "delta", access)).toBe(true);
  expect(
    controller.release(view, [587, 253.8595], measured, access),
  ).toMatchObject({ method: "studio.add", at: { x: 1645, y: 702 } });
  expect(controller.begin(view, "delta", access)).toBe(true);
  expect(
    controller.release(
      view,
      [587, 253.8595],
      { ...measured, height: 408.719 },
      access,
    ),
  ).toBeNull();
});

it.each(["pending", "disabled", "protected", "unverified", "locked", "canvas"])(
  "rechecks %s at release",
  (reason) => {
    const { view, surface, controller } = setup();
    controller.begin(view, "delta", access);
    const next = structuredClone(view);
    const rights = { ...access };
    if (reason === "pending") rights.pending = true;
    if (reason === "disabled") rights.enabled = false;
    if (reason === "protected") next.state = "protected";
    if (reason === "unverified") next.plan = "unverified";
    if (reason === "locked")
      next.catalog = next.catalog.map((item) => ({
        ...item,
        allowed: item.kind === "delta" ? false : item.allowed,
      }));
    if (reason === "canvas" && next.canvas) next.canvas.width++;
    expect(controller.release(next, [200, 200], surface, rights)).toBeNull();
  },
);

it("rejects invalid surface/coordinates rather than sending a guessed point", () => {
  for (const surfaceChange of [
    { width: 0 },
    { height: Number.NaN },
    { height: 10 },
  ]) {
    const { view, surface, controller } = setup();
    controller.begin(view, "delta", access);
    expect(
      controller.release(
        view,
        [200, 200],
        { ...surface, ...surfaceChange },
        access,
      ),
    ).toBeNull();
  }
  const { view, surface, controller } = setup();
  controller.begin(view, "delta", access);
  expect(
    controller.release(view, [Number.NaN, 200], surface, access),
  ).toBeNull();
});

it("uses fresh neighbours for snapping without changing the view during preview", () => {
  const { view, surface, controller } = setup();
  controller.begin(view, "delta", access);
  const saved = structuredClone(view);
  controller.preview(view, [200, 200], surface, access);
  controller.preview(view, [300, 200], surface, access);
  expect(view).toEqual(saved);
  const changed: StudioView = structuredClone(view);
  changed.instances = [];
  const result = controller.release(
    changed,
    [200.125, 200.25],
    surface,
    access,
  );
  expect(result?.at).toEqual({ x: 125.25, y: 282.5 });
});

it("writes the chosen point once against the mock and conflicts instead of duplicating", () => {
  const { host, view, surface, controller } = setup();
  controller.begin(view, "delta", access);
  const request = controller.release(view, [200.125, 200.25], surface, access);
  if (!request) throw Error("drop missing");
  const reply = host({ kind: "request", id: 2, request });
  if (reply?.kind !== "response" || reply.result.method !== "studio.add")
    throw Error("add missing");
  expect(reply.result.value.instances).toHaveLength(view.instances.length + 1);
  const result = reply.result;
  const added = result.value.instances.find((item) => item.id === result.added);
  expect(added?.x).toBe(request.at?.x);
  expect(added?.y).toBe(request.at?.y);
  expect(host({ kind: "request", id: 3, request })).toMatchObject({
    kind: "failure",
    error: { kind: "studioConflict" },
  });
  const read = host({
    kind: "request",
    id: 4,
    request: { method: "studio.get" },
  });
  expect(read).toMatchObject({
    kind: "response",
    result: { value: { instances: reply.result.value.instances } },
  });
});

it.each([
  { x: -1, y: 1 },
  { x: 1, y: -1 },

  { x: 100000, y: 1 },
])("mock rejects invalid point %j without adding", (at) => {
  const { host, view } = setup();
  expect(
    host({
      kind: "request",
      id: 2,
      request: {
        method: "studio.add",
        kind: "delta",
        baseRevision: view.revision,
        at,
      },
    })?.kind,
  ).toBe("failure");
  expect(
    host({ kind: "request", id: 3, request: { method: "studio.get" } }),
  ).toMatchObject({
    kind: "response",
    result: { value: { revision: view.revision, instances: view.instances } },
  });
});
