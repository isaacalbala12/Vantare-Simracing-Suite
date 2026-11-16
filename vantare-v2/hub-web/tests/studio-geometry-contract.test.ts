import { expect, it } from "vitest";
import { isHostMessage, isUiMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

const revision = "0".repeat(64);
const message = (request: object) => ({ kind: "request", id: 1, request });
const geometry = (change: object) =>
  message({
    method: "studio.geometry",
    id: "widget-1",
    baseRevision: revision,
    change,
  });
it("accepts each closed geometry order and rejects arbitrary data", () => {
  for (const change of [
    { kind: "move", x: -12.5, y: 48.25 },
    { kind: "resize", x: 0, y: 0, width: 338.5, height: 304 },
    { kind: "anchor", column: 2, row: 0 },
    { kind: "autoSize" },
    { kind: "aspectLocked", value: false },
  ])
    expect(isUiMessage(geometry(change))).toBe(true);
  for (const change of [
    { kind: "move", x: Number.NaN, y: 0 },
    { kind: "move", x: Number.POSITIVE_INFINITY, y: 0 },
    { kind: "move", x: 1e100, y: 0 },
    { kind: "move", x: 100001, y: 0 },
    { kind: "resize", x: -100001, y: 0, width: 100, height: 100 },
    { kind: "move", x: 0, y: 0, command: "never" },
    { kind: "resize", x: 0, y: 0, width: 0, height: 300 },
    { kind: "anchor", column: 3, row: 0 },
    { kind: "autoSize", document: {} },
    { kind: "aspectLocked", value: "false" },
  ])
    expect(isUiMessage(geometry(change))).toBe(false);
});
it("keeps legacy add compatible, closes optional drop and validates canvas choices", () => {
  const add = { method: "studio.add", kind: "delta", baseRevision: revision };
  expect(isUiMessage(message(add))).toBe(true);
  expect(isUiMessage(message({ ...add, at: { x: 48.25, y: 62 } }))).toBe(true);
  expect(isUiMessage(message({ ...add, at: null }))).toBe(false);
  expect(
    isUiMessage(message({ ...add, at: { x: 1, y: 1, executable: "never" } })),
  ).toBe(false);
  const canvas = (resolution: unknown) =>
    message({ method: "studio.canvas", baseRevision: revision, resolution });
  for (const choice of [
    { kind: "monitor" },
    { kind: "custom", width: 2560.5, height: 1440 },
  ])
    expect(isUiMessage(canvas(choice))).toBe(true);
  for (const choice of [
    null,
    { kind: "monitor", width: 1920 },
    { kind: "custom", width: 0, height: 1080 },
    { kind: "custom", width: 32769, height: 1080 },
  ])
    expect(isUiMessage(canvas(choice))).toBe(false);
});
it("projects fractional geometry and acknowledges positioned additions with their persisted point", () => {
  const host = createMockHost("studio-ready");
  const snapshot = host(message({ method: "studio.get" }));
  if (snapshot?.kind !== "response" || snapshot.result.method !== "studio.get")
    throw new Error("studio view");
  expect(isHostMessage(snapshot)).toBe(true);
  const changed = structuredClone(snapshot);
  if (changed.result.method !== "studio.get")
    throw new Error("cloned studio view");
  changed.result.value.instances[0].x = -12.5;
  changed.result.value.instances[0].size.width = 338.5;
  changed.result.value.instances[0].canvasPlacement = "outside";
  expect(isHostMessage(changed)).toBe(true);
  const added = host(
    message({
      method: "studio.add",
      kind: "delta",
      at: { x: 10, y: 20 },
      baseRevision: revision,
    }),
  );
  expect(added).toMatchObject({
    kind: "response",
    result: {
      method: "studio.add",
      value: {
        instances: expect.arrayContaining([
          expect.objectContaining({ kind: "delta", x: 10, y: 20 }),
        ]),
      },
    },
  });
  expect(isHostMessage(added)).toBe(true);
  const persisted = host(message({ method: "studio.get" }));
  if (added?.kind !== "response" || added.result.method !== "studio.add")
    throw Error("Positioned add missing");
  expect(persisted).toMatchObject({
    kind: "response",
    result: { method: "studio.get", value: added.result.value },
  });
  expect(added.result.value.instances).toHaveLength(
    snapshot.result.value.instances.length + 1,
  );
});

it("persists fractional geometry in the QA host and rejects a stale gesture", () => {
  const host = createMockHost("studio-canvas");
  const response = host(geometry({ kind: "move", x: -12.5, y: 48.25 }));
  expect(response).toMatchObject({
    kind: "response",
    result: {
      method: "studio.geometry",
      value: {
        revision: "1".padStart(64, "0"),
        instances: [
          expect.objectContaining({
            id: "widget-1",
            x: -12.5,
            y: 48.25,
            canvasPlacement: "outside",
          }),
          expect.anything(),
          expect.anything(),
          expect.anything(),
        ],
      },
    },
  });
  expect(isHostMessage(response)).toBe(true);
  expect(host(geometry({ kind: "move", x: 99, y: 99 }))).toMatchObject({
    kind: "failure",
    error: { kind: "studioConflict" },
  });
  expect(host(message({ method: "studio.get" }))).toMatchObject({
    kind: "response",
    result: {
      value: {
        instances: [
          expect.objectContaining({ x: -12.5, y: 48.25 }),
          expect.anything(),
          expect.anything(),
          expect.anything(),
        ],
      },
    },
  });
});
