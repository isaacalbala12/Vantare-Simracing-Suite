import { describe, expect, it, vi } from "vitest";
import { resolveMotionLevel } from "./widget-motion";
import { deriveDeltaCross, deriveIndexOffsets, deriveOvertakes } from "../design-systems/vantare-functional/functional-motion";

describe("resolveMotionLevel", () => {
  const perf = (level: 1 | 2 | 3 | 4 | 5) => ({
    effects: "full" as const, level, mode: "auto" as const,
    rafCap: null, sourceHz: 60, widgetHz: {},
  });

  it("maps the published performance level to a motion budget", () => {
    expect(resolveMotionLevel(undefined)).toBe("full");
    expect(resolveMotionLevel(perf(1))).toBe("full");
    expect(resolveMotionLevel(perf(3))).toBe("full");
    expect(resolveMotionLevel(perf(4))).toBe("reduced");
    expect(resolveMotionLevel(perf(5))).toBe("minimal");
  });

  it("drops to minimal when the system asks for reduced motion", () => {
    const original = globalThis.matchMedia;
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    expect(resolveMotionLevel(perf(1))).toBe("minimal");
    vi.stubGlobal("matchMedia", original);
  });
});

describe("functional motion derivations", () => {
  const rows = (...ids: string[]) => ids.map((id) => ({ id }));

  it("computes index offsets for moved rows only", () => {
    const offsets = deriveIndexOffsets(rows("a", "b", "c"), rows("b", "a", "c"));
    expect(offsets.get("a")).toBe(-1); // bajó una posición: viene de arriba
    expect(offsets.get("b")).toBe(1); // subió una: viene de abajo
    expect(offsets.has("c")).toBe(false);
  });

  it("splits overtakes into gained and lost ids", () => {
    const { gained, lost } = deriveOvertakes(rows("a", "b", "c", "d"), rows("a", "d", "b", "c"));
    expect(gained).toEqual(["d"]);
    expect(lost).toEqual(["b", "c"]);
  });

  it("detects the delta crossing zero and ignores neutral sides", () => {
    expect(deriveDeltaCross({ tone: "losing" }, { tone: "gaining" })).toBe("gaining");
    expect(deriveDeltaCross({ tone: "gaining" }, { tone: "losing" })).toBe("losing");
    expect(deriveDeltaCross({ tone: "neutral" }, { tone: "gaining" })).toBeNull();
    expect(deriveDeltaCross(null, { tone: "gaining" })).toBeNull();
    expect(deriveDeltaCross({ tone: "losing" }, { tone: "losing" })).toBeNull();
  });
});
