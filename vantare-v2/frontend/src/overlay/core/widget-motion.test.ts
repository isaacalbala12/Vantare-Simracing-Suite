import { describe, expect, it, vi } from "vitest";
import { flipRows, resolveMotionLevel } from "./widget-motion";
import { deriveDeltaCross, deriveOvertakes } from "../design-systems/vantare-functional/functional-motion";

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

  it("sees a crossing that passed through neutral via the remembered side", () => {
    // perder → neutro → ganar: el par (neutro, ganar) solo no basta.
    expect(deriveDeltaCross({ tone: "neutral" }, { tone: "gaining" }, "losing")).toBe("gaining");
    expect(deriveDeltaCross({ tone: "neutral" }, { tone: "gaining" }, "gaining")).toBeNull();
    expect(deriveDeltaCross({ tone: "neutral" }, { tone: "neutral" }, "losing")).toBeNull();
  });
});

describe("flipRows", () => {
  function makeRoot(): { root: HTMLElement; rowTops: Map<string, number> } {
    const root = document.createElement("div");
    Object.defineProperty(root, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 0, height: 90 }),
    });
    Object.defineProperty(root, "offsetHeight", { configurable: true, value: 90 });
    return { root, rowTops: new Map() };
  }

  function addRow(root: HTMLElement, id: string, top: number): HTMLElement {
    const row = document.createElement("div");
    row.dataset.standingsRow = id;
    Object.defineProperty(row, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top }),
    });
    Object.defineProperty(row, "animate", { configurable: true, value: vi.fn() });
    Object.defineProperty(row, "getAnimations", { configurable: true, value: () => [] });
    root.appendChild(row);
    return row;
  }

  const opts = { rows: "[data-standings-row]", id: (r: HTMLElement) => r.dataset.standingsRow, duration: () => 300 };

  it("slides a moved row from its previous measured top", () => {
    const { root } = makeRoot();
    const persist = new Map<string, unknown>();
    addRow(root, "a", 0);
    const b = addRow(root, "b", 30);
    flipRows(root, persist, opts);
    expect(b.animate).not.toHaveBeenCalled();
    Object.defineProperty(b, "getBoundingClientRect", { configurable: true, value: () => ({ top: 0 }) });
    flipRows(root, persist, opts);
    expect(b.animate).toHaveBeenCalledWith(
      [{ transform: "translateY(30px)" }, { transform: "translateY(0)" }],
      expect.objectContaining({ duration: 300 }),
    );
  });

  it("keeps the origin across a node remount with the same id", () => {
    const { root } = makeRoot();
    const persist = new Map<string, unknown>();
    addRow(root, "a", 0);
    addRow(root, "b", 30);
    flipRows(root, persist, opts);
    root.querySelector('[data-standings-row="b"]')!.remove();
    const remounted = addRow(root, "b", 60);
    flipRows(root, persist, opts);
    expect(remounted.animate).toHaveBeenCalledWith(
      [{ transform: "translateY(-30px)" }, { transform: "translateY(0)" }],
      expect.anything(),
    );
  });

  it("retargets from the in-flight visual offset instead of teleporting", () => {
    const { root } = makeRoot();
    const persist = new Map<string, unknown>();
    addRow(root, "a", 0);
    const b = addRow(root, "b", 30);
    flipRows(root, persist, opts);
    // La fila bajó a top 60 y está a mitad de animación (translateY -15
    // todavía vigente): el nuevo origen es donde el ojo la ve, no el layout.
    Object.defineProperty(b, "getBoundingClientRect", { configurable: true, value: () => ({ top: 60 }) });
    const live = { cancel: vi.fn() };
    Object.defineProperty(b, "getAnimations", { configurable: true, value: () => [live] });
    const realGetComputedStyle = globalThis.getComputedStyle;
    vi.stubGlobal("getComputedStyle", (el: Element) =>
      el === b ? ({ transform: "matrix(1, 0, 0, 1, 0, -15)" } as CSSStyleDeclaration) : realGetComputedStyle(el),
    );
    flipRows(root, persist, opts);
    vi.stubGlobal("getComputedStyle", realGetComputedStyle);
    expect(live.cancel).toHaveBeenCalled();
    expect(b.animate).toHaveBeenCalledWith(
      [{ transform: "translateY(-45px)" }, { transform: "translateY(0)" }],
      expect.anything(),
    );
  });
});
