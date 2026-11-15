import { expect, it, vi } from "vitest";
import type { StudioView } from "../src/contract/generated/studio";
import {
  CanvasWriter,
  project,
  rectOf,
} from "../src/renderer/screens/studio/canvas-writer";
import { contentInstance } from "./helpers/studio-content";

function setup() {
  const view: StudioView = {
    state: "ready",
    revision: "a".repeat(64),
    plan: "pro",
    catalog: [],
    instances: [contentInstance()],
    showing: false,
    canUndo: false,
    canRedo: false,
    canvas: { source: "monitor", width: 1920, height: 1080 },
  };
  const pending: Array<{
    request: Parameters<ConstructorParameters<typeof CanvasWriter>[3]>[0];
    resolve: (view: StudioView | undefined) => void;
    reject: (error: unknown) => void;
  }> = [];
  const send = vi.fn(
    (request: Parameters<ConstructorParameters<typeof CanvasWriter>[3]>[0]) =>
      new Promise<StudioView | undefined>((resolve, reject) =>
        pending.push({ request, resolve, reject }),
      ),
  );
  const changed = vi.fn(),
    writer = new CanvasWriter(view, "account-a", true, send, changed);
  const id = view.instances[0].id;
  function ack(index: number, revision: string) {
    const response = structuredClone(writer.view);
    response.revision = revision.repeat(64);
    const request = pending[index].request;
    const item = project(response.instances[0], request.change, response);
    if (!item) throw new Error("Expected a valid geometry fixture");
    response.instances[0] = item;
    return response;
  }
  return { writer, view, send, pending, changed, id, ack };
}
it("previews without writing and finishes one gesture exactly once", async () => {
  const { writer, id, send, pending, ack } = setup();
  expect(writer.begin(id)).toBe(true);
  writer.preview([100, 200, 338, 304]);
  expect(send).not.toHaveBeenCalled();
  expect(writer.view.instances[0].x).not.toBe(100);
  writer.finish("move");
  writer.finish("move");
  expect(send).toHaveBeenCalledExactlyOnceWith({
    method: "studio.geometry",
    id,
    change: { kind: "move", x: 100, y: 200 },
    baseRevision: "a".repeat(64),
  });
  expect(writer.notice).not.toBe("saved");
  pending[0].resolve(ack(0, "b"));
  await Promise.resolve();
  expect(writer.notice).toBe("saved");
  expect(writer.view.instances[0].x).toBe(100);
});
it("cancels a local gesture and ignores clicks/no-op changes", () => {
  const { writer, id, send, view } = setup();
  writer.begin(id);
  writer.preview([300, 200, 338, 304]);
  writer.cancel();
  writer.finish("move");
  writer.enqueue(id, {
    kind: "move",
    x: view.instances[0].x,
    y: view.instances[0].y,
  });
  writer.enqueue(id, {
    kind: "aspectLocked",
    value: view.instances[0].aspectLocked,
  });
  writer.enqueue(id, { kind: "autoSize" });
  expect(send).not.toHaveBeenCalled();
  expect(writer.notice).toBe("cancelled");
});
it("keeps a gesture over a newer revision when its geometry is unchanged", () => {
  const { writer, id, view, send } = setup();
  writer.begin(id);
  writer.preview([100, 200, 338, 304]);
  const fresh = structuredClone(view);
  fresh.revision = "b".repeat(64);
  fresh.instances[0].opacity = 50;
  writer.refresh(fresh, "account-a", true);
  writer.finish("move");
  expect(send.mock.calls[0][0].baseRevision).toBe(fresh.revision);
});
it.each([
  "moved",
  "removed",
  "locked",
  "hidden",
  "canvas",
  "rights",
  "account",
  "offline",
])("cancels a gesture after %s changes", (kind) => {
  const { writer, id, view, send } = setup();
  writer.begin(id);
  writer.preview([100, 200, 338, 304]);
  const next = structuredClone(view);
  next.revision = "b".repeat(64);
  if (kind === "moved") next.instances[0].x += 10;
  if (kind === "removed") next.instances = [];
  if (kind === "locked") next.instances[0].locked = true;
  if (kind === "hidden") next.instances[0].visible = !next.instances[0].visible;
  if (kind === "canvas")
    next.canvas = { source: "custom", width: 2560, height: 1440 };
  writer.refresh(
    next,
    kind === "account" ? "account-b" : "account-a",
    kind !== "rights" && kind !== "offline",
  );
  writer.finish("move");
  expect(writer.draft).toBeUndefined();
  expect(send).not.toHaveBeenCalled();
  expect(writer.notice).toBe("changed");
});
it("serializes writes and keeps only the last completed gesture while one is pending", async () => {
  const { writer, id, send, pending, ack } = setup();
  writer.enqueue(id, { kind: "move", x: 100, y: 200 });
  writer.begin(id);
  writer.preview([200, 200, 338, 304]);
  writer.finish("move");
  writer.begin(id);
  writer.preview([300, 200, 338, 304]);
  writer.finish("move");
  expect(send).toHaveBeenCalledTimes(1);
  pending[0].resolve(ack(0, "b"));
  await Promise.resolve();
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1][0]).toMatchObject({
    change: { x: 300 },
    baseRevision: "b".repeat(64),
  });
  pending[1].resolve(ack(1, "c"));
  await Promise.resolve();
  expect(writer.view.instances[0].x).toBe(300);
});
it("accepts its own publication before its reply without losing the queued successor", async () => {
  const { writer, id, pending, ack, send } = setup();
  writer.enqueue(id, { kind: "move", x: 100, y: 200 });
  writer.enqueue(id, { kind: "move", x: 300, y: 200 });
  const response = ack(0, "b");
  writer.refresh(response, "account-a", true);
  pending[0].resolve(response);
  await Promise.resolve();
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1][0].change).toMatchObject({ x: 300 });
});
it("does not resurrect a discarded successor after an external edit or a late response", async () => {
  const { writer, id, view, send, pending, ack } = setup();
  writer.enqueue(id, { kind: "move", x: 100, y: 200 });
  writer.enqueue(id, { kind: "move", x: 300, y: 200 });
  const response = ack(0, "b");
  const external = structuredClone(view);
  external.revision = "c".repeat(64);
  external.instances[0].x = 500;
  writer.refresh(external, "account-a", true);
  pending[0].resolve(response);
  await Promise.resolve();
  expect(send).toHaveBeenCalledTimes(1);
  expect(writer.view.instances[0].x).toBe(500);
  expect(writer.notice).toBe("changed");
});
it.each(["account", "rights", "canvas"])(
  "discards queued work on %s change during a pending write",
  async (kind) => {
    const { writer, id, view, send, pending, ack } = setup();
    writer.enqueue(id, { kind: "move", x: 100, y: 200 });
    writer.enqueue(id, { kind: "move", x: 300, y: 200 });
    const response = ack(0, "b"),
      next = structuredClone(view);
    if (kind === "canvas")
      next.canvas = { source: "custom", width: 1280, height: 720 };
    writer.refresh(
      next,
      kind === "account" ? "account-b" : "account-a",
      kind !== "rights",
    );
    pending[0].resolve(response);
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    expect(writer.queued).toBeUndefined();
    expect(writer.notice).not.toBe("saved");
  },
);
it.each(["undefined", "throw"])(
  "never retries or confirms a failed %s write",
  async (kind) => {
    const { writer, id, send, pending } = setup();
    writer.enqueue(id, { kind: "move", x: 100, y: 200 });
    writer.enqueue(id, { kind: "move", x: 300, y: 200 });
    if (kind === "throw") pending[0].reject(new Error("transport"));
    else pending[0].resolve(undefined);
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    expect(writer.queued).toBeUndefined();
    expect(writer.notice).toBe("failed");
  },
);
it("stops work on disposal and ignores an acknowledgment after leaving the canvas", async () => {
  const { writer, id, send, pending, ack, changed } = setup();
  writer.enqueue(id, { kind: "move", x: 100, y: 200 });
  writer.enqueue(id, { kind: "move", x: 300, y: 200 });
  const response = ack(0, "b");
  writer.dispose();
  const count = changed.mock.calls.length;
  pending[0].resolve(response);
  await Promise.resolve();
  expect(send).toHaveBeenCalledTimes(1);
  expect(changed).toHaveBeenCalledTimes(count);
  expect(writer.queued).toBeUndefined();
});
it("rejects unknown, locked, unavailable canvas and read-only documents", () => {
  const { writer, id, send, view } = setup();
  expect(writer.begin("absent")).toBe(false);
  const next = structuredClone(view);
  next.instances[0].locked = true;
  writer.refresh(next, "account-a", true);
  expect(writer.begin(id)).toBe(false);
  writer.enqueue(id, { kind: "move", x: 1, y: 2 });
  next.canvas = null;
  writer.refresh(next, "account-a", true);
  expect(writer.begin(id)).toBe(false);
  expect(send).not.toHaveBeenCalled();
});
it("keeps a hidden widget editable without changing its visibility", () => {
  const { writer, id, view, send } = setup();
  const next = structuredClone(view);
  next.instances[0].visible = false;
  writer.refresh(next, "account-a", true);
  expect(writer.begin(id)).toBe(true);
  writer.preview([100, 200, ...rectOf(next.instances[0]).slice(2)] as [
    number,
    number,
    number,
    number,
  ]);
  writer.finish("move");
  expect(send.mock.calls[0][0].change.kind).toBe("move");
  expect(writer.view.instances[0].visible).toBe(false);
});
