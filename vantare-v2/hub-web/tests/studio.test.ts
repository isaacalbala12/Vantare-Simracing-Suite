import { describe, expect, it } from "vitest";
import { isUiMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

type Host = ReturnType<typeof createMockHost>;
const send = (host: Host, method: string, fields = {}) =>
  host({ kind: "request", id: 1, request: { method, ...fields } });
function view(host: Host) {
  const reply = send(host, "studio.get");
  if (reply?.kind !== "response" || reply.result.method !== "studio.get")
    throw new Error("Expected Studio view");
  return reply.result.value;
}
describe("Studio document contract", () => {
  it("rejects geometry, arbitrary settings and unknown fields from the renderer", () => {
    const baseRevision = "0".repeat(64);
    for (const patch of [
      { field: "x", value: 10 },
      { field: "size", value: { width: 1, height: 1 } },
      { field: "settings", value: {} },
      { field: "opacity", value: 19 },
      { field: "opacity", value: 101 },
      { field: "opacity", value: 20.5 },
      {
        field: "showIn",
        value: { practice: true, qualifying: true, race: true, path: "x" },
      },
    ])
      expect(
        isUiMessage({
          kind: "request",
          id: 1,
          request: {
            method: "studio.instance",
            id: "widget-1",
            patch,
            baseRevision,
          },
        }),
      ).toBe(false);
    expect(
      isUiMessage({
        kind: "request",
        id: 1,
        request: {
          method: "studio.add",
          kind: "standings",
          baseRevision,
          settings: { executable: "x" },
        },
      }),
    ).toBe(false);
    expect(
      isUiMessage({
        kind: "request",
        id: 1,
        request: {
          method: "studio.visibility",
          id: "x\0",
          visible: true,
          baseRevision,
        },
      }),
    ).toBe(false);
    expect(
      isUiMessage({
        kind: "request",
        id: 1,
        request: { method: "studio.undo", baseRevision: "old" },
      }),
    ).toBe(false);
  });
  it("uses CAS for visibility and restores the document through undo and redo", () => {
    const host = createMockHost("studio-base"),
      before = view(host);
    expect(
      send(host, "studio.visibility", {
        id: "widget-1",
        visible: false,
        baseRevision: before.revision,
      }),
    ).toMatchObject({ kind: "response" });
    const hidden = view(host);
    expect(hidden.instances[0].visible).toBe(false);
    expect(
      send(host, "studio.remove", {
        id: "widget-1",
        baseRevision: before.revision,
      }),
    ).toMatchObject({ kind: "failure", error: { kind: "studioConflict" } });
    expect(view(host)).toEqual(hidden);
    send(host, "studio.undo", { baseRevision: hidden.revision });
    const restored = view(host);
    expect(restored.instances).toEqual(before.instances);
    send(host, "studio.redo", { baseRevision: restored.revision });
    expect(view(host).instances).toEqual(hidden.instances);
  });
  it("keeps membership equal to visibility and never projects a path or editable geometry", () => {
    const host = createMockHost("studio-base");
    const before = view(host);
    send(host, "studio.instance", {
      id: "widget-1",
      patch: { field: "opacity", value: 20 },
      baseRevision: before.revision,
    });
    const after = view(host);
    expect(after.instances[0]).toMatchObject({ visible: true, opacity: 20 });
    for (const forbidden of [
      '"x":',
      '"y":',
      '"settings":',
      "Users",
      ":/",
      "executable",
    ])
      expect(JSON.stringify(after)).not.toContain(forbidden);
  });
  it("does not seed a missing document and denies a locked add", () => {
    const missing = createMockHost("studio-missing");
    expect(view(missing).state).toBe("missing");
    expect(
      send(missing, "studio.add", {
        kind: "delta",
        baseRevision: view(missing).revision,
      }),
    ).toMatchObject({ kind: "failure", error: { kind: "protected" } });
    expect(view(missing).state).toBe("missing");
    const free = createMockHost("studio-pro-bloqueado"),
      before = view(free),
      locked = before.catalog.find((w) => !w.allowed);
    expect(locked).toBeDefined();
    expect(
      send(free, "studio.add", {
        kind: locked?.kind,
        baseRevision: before.revision,
      }),
    ).toMatchObject({ kind: "failure", error: { kind: "denied" } });
    expect(view(free)).toEqual(before);
  });
  it("adds native default dimensions and clears redo after another edit", () => {
    const host = createMockHost("studio-vacio");
    send(host, "studio.add", {
      kind: "standings",
      baseRevision: view(host).revision,
    });
    const added = view(host);
    expect(added.instances[0].size.width).toBeGreaterThan(0);
    send(host, "studio.undo", { baseRevision: added.revision });
    expect(view(host).canRedo).toBe(true);
    send(host, "studio.add", {
      kind: "delta",
      baseRevision: view(host).revision,
    });
    expect(view(host).canRedo).toBe(false);
  });
  it("show and hide are idempotent and do not change layout revision", () => {
    const host = createMockHost("studio-base"),
      before = view(host);
    send(host, "studio.track", { show: true });
    send(host, "studio.track", { show: true });
    expect(view(host)).toEqual({ ...before, showing: true });
    send(host, "studio.track", { show: false });
    expect(view(host)).toEqual(before);
  });
 it("rejects non-catalog additions and identifies the exact added instance",()=>{
  const host=createMockHost("studio-vacio"),before=view(host);
  expect(isUiMessage({kind:"request",id:1,request:{method:"studio.add",kind:"car-damage-numbers",baseRevision:before.revision}})).toBe(false);
  const reply=send(host,"studio.add",{kind:"delta",baseRevision:before.revision});
  expect(reply).toMatchObject({kind:"response",result:{method:"studio.add",added:"widget-1"}});
 });

});
