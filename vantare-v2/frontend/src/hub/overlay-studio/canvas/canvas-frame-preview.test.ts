import { afterEach, describe, expect, it } from "vitest";
import {
  applyStudioFrameLayoutPreview,
  beginStudioFramePreview,
  clearStudioFrameLayoutPreview,
  findStudioFrameElement,
  getStudioFrameLayoutPreview,
  registerStudioFrameElement,
  resetStudioFrameLayoutPreview,
  resolveStudioFrameGeometry,
  studioFrameTestId,
} from "./canvas-frame-preview";
import { relativeDefinition } from "../../../overlay/widget-types/relative/relative-definition";

const layout = { x: 120, y: 80, w: 280, h: 96, zIndex: 0, aspectLocked: true };
const start = { x: 100, y: 100, w: 280, h: 96, zIndex: 0, aspectLocked: true };

afterEach(() => {
  document.body.innerHTML = "";
  clearStudioFrameLayoutPreview("delta-main");
});

function mountFrame(fluidWidth = false): HTMLElement {
  const frame = document.createElement("div");
  frame.dataset.testid = studioFrameTestId("delta-main");
  const viewport = document.createElement("div");
  viewport.dataset.widgetVisualViewport = "true";
  viewport.dataset.widgetVisualBaseWidth = fluidWidth ? "826" : "280";
  if (fluidWidth) {
    frame.dataset.effectiveMinimumWidth = "826";
    viewport.dataset.widgetVisualFluidWidth = "true";
  }
  frame.append(viewport);
  document.body.append(frame);
  return frame;
}

describe("canvas-frame-preview", () => {
  it("tracks the latest preview layout per widget id", () => {
    beginStudioFramePreview("delta-main", "resize", layout);
    applyStudioFrameLayoutPreview("delta-main", layout);
    expect(getStudioFrameLayoutPreview("delta-main")).toEqual(layout);
    clearStudioFrameLayoutPreview("delta-main");
    expect(getStudioFrameLayoutPreview("delta-main")).toBeUndefined();
  });

  it("writes geometry directly to the frame element on resize", () => {
    mountFrame();

    beginStudioFramePreview("delta-main", "resize", layout);
    applyStudioFrameLayoutPreview("delta-main", layout);

    const element = findStudioFrameElement("delta-main");
    expect(element?.style.left).toBe("120px");
    expect(element?.style.top).toBe("80px");
    expect(element?.style.width).toBe("280px");
    expect(element?.style.height).toBe("96px");
    expect(element?.style.transform).toBe("");
  });

  it("updates the canonical visual scale during imperative resize", () => {
    const frame = mountFrame();
    beginStudioFramePreview("delta-main", "resize", layout);

    applyStudioFrameLayoutPreview("delta-main", { ...layout, w: 560, h: 192 });

    const viewport = frame.querySelector<HTMLElement>("[data-widget-visual-viewport]");
    expect(viewport?.style.width).toBe("280px");
    expect(viewport?.style.height).toBe("96px");
    expect(viewport?.style.transform).toBe("scale(2)");
  });

  it("keeps the fluid Redline physical frame narrow while scaling its visual base", () => {
    const frame = mountFrame(true);
    beginStudioFramePreview("delta-main", "resize", layout);

    applyStudioFrameLayoutPreview("delta-main", { ...layout, w: 560, h: 192 });

    const viewport = frame.querySelector<HTMLElement>("[data-widget-visual-viewport]");
    expect(frame.style.width).toBe("560px");
    expect(viewport?.style.width).toBe("826px");
    expect(viewport?.style.height).toBe(`${192 / (560 / 826)}px`);
    expect(viewport?.style.transform).toBe(`scale(${560 / 826})`);
  });

  it("keeps start geometry and applies transform delta on move", () => {
    mountFrame();

    beginStudioFramePreview("delta-main", "move", start);
    applyStudioFrameLayoutPreview("delta-main", { ...start, x: 140, y: 130 });

    const element = findStudioFrameElement("delta-main");
    expect(element?.style.left).toBe("100px");
    expect(element?.style.top).toBe("100px");
    expect(element?.style.transform).toBe("translate(40px, 30px)");
  });

  it("clamps an effective minimum-width frame while moving at the right edge", () => {
    const frame = mountFrame(true);
    frame.dataset.effectiveMinimumWidth = "826";
    frame.dataset.layoutViewportWidth = "1920";
    const narrowStart = { ...start, x: 1094, w: 280 };

    beginStudioFramePreview("delta-main", "move", narrowStart);
    applyStudioFrameLayoutPreview("delta-main", { ...narrowStart, x: 1194 });

    expect(frame.style.left).toBe("1094px");
    expect(frame.style.width).toBe("826px");
    expect(frame.style.transform).toBe("");

    applyStudioFrameLayoutPreview("delta-main", { ...narrowStart, x: 994 });
    expect(frame.style.transform).toBe("translate(-100px, 0px)");
  });

  it("keeps document frame dimensions while moving", () => {
    mountFrame();
    const widget = relativeDefinition.createDefault("delta-main");
    const rawStart = { ...widget.layout, x: 100, y: 100, w: 430, h: 300, aspectLocked: true };
    beginStudioFramePreview("delta-main", "move", rawStart);
    applyStudioFrameLayoutPreview("delta-main", { ...rawStart, x: 140, y: 130 });

    const frame = findStudioFrameElement("delta-main");
    expect(frame?.style.width).toBe("430px");
    expect(frame?.style.height).toBe("300px");
  });

  it("clears cached preview layout on reset", () => {
    beginStudioFramePreview("delta-main", "resize", layout);
    applyStudioFrameLayoutPreview("delta-main", layout);
    resetStudioFrameLayoutPreview("delta-main", layout);
    expect(getStudioFrameLayoutPreview("delta-main")).toBeUndefined();
  });

  it("prefers registered frame refs over querySelector", () => {
    const registered = document.createElement("div");
    registerStudioFrameElement("delta-main", registered);
    beginStudioFramePreview("delta-main", "resize", layout);
    applyStudioFrameLayoutPreview("delta-main", layout);
    expect(registered.style.left).toBe("120px");
    registerStudioFrameElement("delta-main", null);
  });

  it("resolves start geometry from cache during move preview", () => {
    beginStudioFramePreview("delta-main", "move", start);
    applyStudioFrameLayoutPreview("delta-main", { ...start, x: 140, y: 130 });
    const committed = { ...start, x: 10, y: 10 };
    expect(resolveStudioFrameGeometry("delta-main", committed, true)).toEqual(start);
    expect(resolveStudioFrameGeometry("delta-main", committed, false)).toEqual(committed);
  });

  it("resolves preview geometry from cache during resize preview", () => {
    beginStudioFramePreview("delta-main", "resize", layout);
    applyStudioFrameLayoutPreview("delta-main", layout);
    const committed = { ...layout, x: 10, y: 10 };
    expect(resolveStudioFrameGeometry("delta-main", committed, true)).toEqual(layout);
    expect(resolveStudioFrameGeometry("delta-main", committed, false)).toEqual(committed);
  });
});
