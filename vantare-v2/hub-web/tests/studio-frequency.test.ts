import { describe, expect, it } from "vitest";
import type {
  HostToUi,
  SettingsView,
  StudioView,
} from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus/studio.json";
import {
  studioFrequencyCases,
  studioFrequencyOptions,
} from "../src/contract/generated/studio";
import {
  frequencyFor,
  isFrequencyView,
} from "../src/contract/studio-frequency";
import { isUiMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

type Host = ReturnType<typeof createMockHost>;
function send(
  host: Host,
  method: string,
  fields: Record<string, unknown> = {},
) {
  return host({ kind: "request", id: 1, request: { method, ...fields } });
}
function studio(host: Host): StudioView {
  const reply = send(host, "studio.get");
  if (reply?.kind !== "response" || reply.result.method !== "studio.get")
    throw new Error("Expected Studio");
  return reply.result.value;
}
function settings(host: Host): SettingsView {
  const reply = send(host, "settings.get");
  if (reply?.kind !== "response" || reply.result.method !== "settings.get")
    throw new Error("Expected Settings");
  return reply.result.value;
}
function set(
  host: Host,
  view: StudioView,
  hz: number | null,
  id = view.instances[0].id,
) {
  return send(host, "studio.instance", {
    id,
    baseRevision: view.revision,
    patch: { field: "frequency", value: hz },
  });
}
function failure(reply: HostToUi | null) {
  if (reply?.kind !== "failure") throw new Error("Expected rejection");
  return reply.error.kind;
}

describe("native frequency vectors", () => {
  for (const sample of studioFrequencyCases)
    it(`${sample.kind}/${sample.level}/${sample.overrideHz}`, () => {
      expect(
        frequencyFor(sample.kind, sample.level, sample.overrideHz),
      ).toEqual(sample.view);
      expect(isFrequencyView(sample.view, sample.kind)).toBe(true);
      expect(
        isFrequencyView(
          { ...sample.view, appliedHz: sample.view.appliedHz + 1 },
          sample.kind,
        ),
      ).toBe(false);
      expect(
        isFrequencyView({ ...sample.view, path: "private" }, sample.kind),
      ).toBe(false);
    });
  it("accepts only explicit inspector choices or null, while preserving legacy read values", () => {
    const request = (patch: unknown, id = "widget-1") => ({
      kind: "request",
      id: 1,
      request: {
        method: "studio.instance",
        id,
        patch,
        baseRevision: "0".repeat(64),
      },
    });
    for (const value of [...studioFrequencyOptions.choices, null])
      expect(isUiMessage(request({ field: "frequency", value }))).toBe(true);
    for (const patch of corpus.invalidFrequencies)
      expect(isUiMessage(request(patch))).toBe(false);
    expect(
      isUiMessage(request({ field: "frequency", value: 20 }, "é".repeat(64))),
    ).toBe(true);
    expect(
      isUiMessage(request({ field: "frequency", value: 20 }, "é".repeat(65))),
    ).toBe(false);
    expect(
      isFrequencyView(
        {
          overrideHz: 40,
          appliedHz: 40,
          source: "override",
          level: "balanced",
        },
        "standings",
      ),
    ).toBe(true);
    expect(
      isFrequencyView(
        { overrideHz: 0, appliedHz: 0, source: "override", level: "balanced" },
        "standings",
      ),
    ).toBe(true);
    expect(
      isFrequencyView(
        { overrideHz: 0, appliedHz: 0, source: "level", level: "balanced" },
        "standings",
      ),
    ).toBe(false);
  });
});

describe("frequency writes in the host mock", () => {
  it("changes one override, preserves others/global level, and removes it without treating absence as zero", () => {
    const host = createMockHost("studio-base");
    const initial = studio(host);
    expect(set(host, initial, 20)?.kind).toBe("response");
    const chosen = studio(host);
    expect(chosen.instances[0].frequency).toEqual({
      overrideHz: 20,
      appliedHz: 20,
      source: "override",
      level: "balanced",
    });
    expect(chosen.instances.slice(1)).toEqual(initial.instances.slice(1));
    expect(settings(host).track).toMatchObject({
      level: "balanced",
      customized: true,
      customWidgets: 1,
    });
    const beforeSettings = settings(host);
    expect(set(host, chosen, 20)?.kind).toBe("response");
    expect(studio(host)).toEqual(chosen);
    expect(settings(host).revision).toBe(beforeSettings.revision);
    expect(set(host, chosen, null)?.kind).toBe("response");
    const inherited = studio(host);
    expect(inherited.instances[0].frequency).toEqual({
      overrideHz: null,
      appliedHz: 15,
      source: "level",
      level: "balanced",
    });
    expect(settings(host).track).toMatchObject({
      level: "balanced",
      customized: false,
      customWidgets: 0,
    });
  });
  it("never turns an inherited no-op into a write or undo entry", () => {
    const host = createMockHost("studio-base");
    const before = studio(host);
    const settingsBefore = settings(host);
    expect(set(host, before, null)?.kind).toBe("response");
    expect(studio(host)).toEqual(before);
    expect(settings(host)).toEqual(settingsBefore);
  });
  it("uses the current global level and rejects stale revisions on both sides without retry", () => {
    const host = createMockHost("studio-base");
    const before = studio(host);
    const oldSettings = settings(host);
    set(host, before, 20);
    const armed = studio(host);
    expect(
      failure(
        send(host, "settings.update", {
          baseRevision: oldSettings.revision,
          patch: { field: "performance", value: "minimum" },
        }),
      ),
    ).toBe("conflict");
    const fresh = settings(host);
    expect(
      send(host, "settings.update", {
        baseRevision: fresh.revision,
        patch: { field: "performance", value: "minimum" },
      })?.kind,
    ).toBe("response");
    for (let n = 0; n < 2; n++)
      expect(failure(set(host, armed, 30))).toBe("studioConflict");
    const now = studio(host);
    expect(now.instances[0].frequency).toEqual({
      overrideHz: 20,
      appliedHz: 20,
      source: "override",
      level: "minimum",
    });
    expect(now.instances[2].frequency).toEqual({
      overrideHz: null,
      appliedHz: 5,
      source: "level",
      level: "minimum",
    });
    expect(now.canUndo).toBe(false);
  });
  it("keeps RacingFlags on every snapshot and rejects every inspector override/removal", () => {
    const host = createMockHost("studio-base");
    const before = studio(host);
    const added = send(host, "studio.add", {
      kind: "racing-flags",
      baseRevision: before.revision,
    });
    if (added?.kind !== "response" || added.result.method !== "studio.add")
      throw new Error("Expected flag instance");
    const id = added.result.added;
    const current = studio(host);
    expect(current.instances.find((item) => item.id === id)?.frequency).toEqual(
      { overrideHz: null, appliedHz: 0, source: "snapshot", level: "balanced" },
    );
    for (const value of [...studioFrequencyOptions.choices, null])
      expect(failure(set(host, current, value, id))).toBe("denied");
    expect(studio(host)).toEqual(current);
  });
});
