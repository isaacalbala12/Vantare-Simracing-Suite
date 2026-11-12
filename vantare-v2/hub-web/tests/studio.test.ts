import { describe, expect, it } from "vitest";
import { isUiMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";
import { applyWidgetSettings } from "../src/mock/modules/studio";

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
    for (const forbidden of ['"x":', '"y":', "Users", ":/", "executable"])
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
  it("rejects non-catalog additions and identifies the exact added instance", () => {
    const host = createMockHost("studio-vacio"),
      before = view(host);
    expect(
      isUiMessage({
        kind: "request",
        id: 1,
        request: {
          method: "studio.add",
          kind: "car-damage-numbers",
          baseRevision: before.revision,
        },
      }),
    ).toBe(false);
    const reply = send(host, "studio.add", {
      kind: "delta",
      baseRevision: before.revision,
    });
    expect(reply).toMatchObject({
      kind: "response",
      result: { method: "studio.add", added: "widget-1" },
    });
  });
});

describe("typed Studio settings writes", () => {
  it("uses CAS, rejects another kind and keeps no-op revisions", () => {
    const host = createMockHost("studio-base");
    const before = view(host);
    expect(
      send(host, "studio.instance", {
        id: "widget-1",
        baseRevision: before.revision,
        patch: {
          field: "settings",
          value: { kind: "standings", rowCount: 21 },
        },
      }),
    ).toMatchObject({ kind: "response" });
    const changed = view(host);
    expect(changed.instances[0].settings).toMatchObject({
      kind: "standings",
      rowCount: 21,
    });
    expect(
      send(host, "studio.instance", {
        id: "widget-1",
        baseRevision: before.revision,
        patch: {
          field: "settings",
          value: { kind: "standings", rowCount: 22 },
        },
      }),
    ).toMatchObject({ kind: "failure", error: { kind: "studioConflict" } });
    expect(
      send(host, "studio.instance", {
        id: "widget-1",
        baseRevision: changed.revision,
        patch: {
          field: "settings",
          value: { kind: "standings", rowCount: 21 },
        },
      }),
    ).toMatchObject({ kind: "response" });
    expect(view(host).revision).toBe(changed.revision);
    expect(
      send(host, "studio.instance", {
        id: "widget-1",
        baseRevision: changed.revision,
        patch: { field: "settings", value: { kind: "delta", size: "pill" } },
      }),
    ).toMatchObject({ kind: "failure", error: { kind: "denied" } });
    expect(view(host)).toEqual(changed);
  });
});

it("session columns inherit main formatting when an override is absent", () => {
  const host = createMockHost("studio-base");
  let current = view(host);
  send(host, "studio.instance", {
    id: "widget-1",
    baseRevision: current.revision,
    patch: {
      field: "settings",
      value: {
        kind: "standings",
        columns: [
          {
            metric: "driverName",
            widthPreset: "lg",
            format: { mode: "surname" },
          },
        ],
        practiceColumns: null,
        qualifyingColumns: null,
      },
    },
  });
  current = view(host);
  send(host, "studio.instance", {
    id: "widget-1",
    baseRevision: current.revision,
    patch: {
      field: "settings",
      value: {
        kind: "standings",
        practiceColumns: [{ metric: "driverName", format: { maxChars: 0 } }],
        qualifyingColumns: [{ metric: "driverName" }],
      },
    },
  });
  expect(view(host).instances[0].settings).toMatchObject({
    practiceColumns: [
      { widthPreset: "lg", format: { mode: "surname", maxChars: 0 } },
    ],
    qualifyingColumns: [{ widthPreset: "lg", format: { mode: "surname" } }],
  });
});

it("simultaneous main and session patches inherit from the original snapshot", () => {
  for (const reverse of [false, true]) {
    const host = createMockHost("studio-base");
    send(host, "studio.instance", {
      id: "widget-1",
      baseRevision: view(host).revision,
      patch: {
        field: "settings",
        value: {
          kind: "standings",
          columns: [
            {
              metric: "driverName",
              widthPreset: "lg",
              format: { mode: "surname" },
            },
          ],
          practiceColumns: null,
        },
      },
    });
    const value = reverse
      ? {
          kind: "standings",
          practiceColumns: [{ metric: "driverName" }],
          columns: [],
        }
      : {
          kind: "standings",
          columns: [],
          practiceColumns: [{ metric: "driverName" }],
        };
    expect(
      send(host, "studio.instance", {
        id: "widget-1",
        baseRevision: view(host).revision,
        patch: { field: "settings", value },
      }),
    ).toMatchObject({ kind: "response" });
    expect(view(host).instances[0].settings).toMatchObject({
      columns: [],
      practiceColumns: [
        {
          metricId: "driverName",
          widthPreset: "lg",
          format: { mode: "surname" },
        },
      ],
    });
  }
});
it("mock rejects new column IDs that collide without changing the original", () => {
  const settings = structuredClone(
    view(createMockHost("studio-base")).instances[0].settings,
  );
  if (settings?.kind !== "standings" || !settings.columns?.length)
    throw new Error("Expected table settings");
  settings.columns = [
    { ...settings.columns[0], id: "gap", metricId: "driverName" },
  ];
  const before = structuredClone(settings);
  expect(
    applyWidgetSettings(settings, {
      kind: "standings",
      columns: [{ metric: "gap" }],
    }),
  ).toBeNull();
  expect(settings).toEqual(before);
});

it.each(["standings", "relative"] as const)(
  "mock restores %s columns with a single Undo after a repeated recipe",
  (kind) => {
    const host = createMockHost("studio-base");
    const before = view(host);
    const item = before.instances.find((entry) => entry.kind === kind);
    if (!item) throw new Error("Missing table fixture");
    const fields = {
      id: item.id,
      patch: { field: "settings", value: { kind, tablePreset: "compact" } },
    };
    expect(
      send(host, "studio.instance", {
        ...fields,
        baseRevision: before.revision,
      }),
    ).toMatchObject({ kind: "response" });
    const applied = view(host);
    expect(applied.revision).not.toBe(before.revision);
    expect(applied.canUndo).toBe(true);
    send(host, "studio.instance", {
      ...fields,
      baseRevision: applied.revision,
    });
    expect(view(host).revision).toBe(applied.revision);
    send(host, "studio.undo", { baseRevision: applied.revision });
    const undone = view(host);
    expect(undone.instances).toEqual(before.instances);
    expect(undone.canUndo).toBe(false);
    send(host, "studio.redo", { baseRevision: undone.revision });
    expect(view(host).instances).toEqual(applied.instances);
  },
);
