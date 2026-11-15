import { describe, expect, it } from "vitest";
import { studioMonitorCases } from "../src/contract/generated/studio";
import { isStudio } from "../src/contract/modules/studio";
import { createMockHost } from "../src/mock/host";

describe("detected session monitor", () => {
  for (const sample of studioMonitorCases)
    it(`accepts Rust ${sample.name}`, () =>
      expect(isStudio(sample.value)).toBe(true));
  it("keeps monitor dimensions separate from a custom preset, including native DPI units", () => {
    const preset = studioMonitorCases.find((c) => c.name === "preset");
    const scaled = studioMonitorCases.find((c) => c.name === "scaled-preset");
    expect(preset?.value.monitor).toEqual({ width: 2560, height: 1440 });
    expect(preset?.value.canvas).toEqual({
      width: 1920,
      height: 1080,
      source: "custom",
    });
    expect(scaled?.value.monitor).toEqual({ width: 2560, height: 1440 });
    expect(scaled?.value.canvas).toEqual({
      width: 1280,
      height: 720,
      source: "custom",
    });
  });
  it("does not accept paths, device identities or invalid dimensions", () => {
    const value = studioMonitorCases[0].value;
    for (const monitor of [
      { width: 0, height: 1080 },
      { width: -1, height: 1080 },
      { width: NaN, height: 1080 },
      { width: Infinity, height: 1080 },
      { width: 1920, height: 1080, device: "private" },
      "1920x1080",
    ])
      expect(isStudio({ ...value, monitor })).toBe(false);
  });
  it("unknown does not mean a default monitor in the simulated protected document", () => {
    const host = createMockHost("studio-protegido");
    const reply = host({
      kind: "request",
      id: 1,
      request: { method: "studio.get" },
    });
    if (reply?.kind !== "response" || reply.result.method !== "studio.get")
      throw new Error("studio");
    expect(reply.result.value.monitor).toBeNull();
    expect(isStudio(reply.result.value)).toBe(true);
  });
});
