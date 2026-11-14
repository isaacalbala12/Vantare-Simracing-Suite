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
it("projects fractional geometry while mock-only unsupported orders never pretend success", () => {
  const host = createMockHost("studio-ready");
  const snapshot = host(message({ method: "studio.get" }));
  if (snapshot?.kind !== "response" || snapshot.result.method !== "studio.get")
    throw new Error("studio view");
  expect(isHostMessage(snapshot)).toBe(true);
  const changed = structuredClone(snapshot);
  changed.result.value.instances[0].x = -12.5;
  changed.result.value.instances[0].size.width = 338.5;
  changed.result.value.instances[0].outsideCanvas = true;
  expect(isHostMessage(changed)).toBe(true);
  expect(host(geometry({ kind: "move", x: 1, y: 2 }))).toMatchObject({
    kind: "failure",
    error: { kind: "unsupported" },
  });
  expect(host(message({ method: "studio.get" }))).toEqual(snapshot);
});
