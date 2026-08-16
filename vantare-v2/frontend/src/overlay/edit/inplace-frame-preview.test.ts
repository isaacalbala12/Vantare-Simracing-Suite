import { afterEach, describe, expect, it } from "vitest";
import {
  applyInplaceFrameLayoutPreview,
  beginInplaceFramePreview,
  clearInplaceFrameLayoutPreview,
  findInplaceFrameElement,
  getInplaceFrameLayoutPreview,
  inplaceFrameTestId,
  registerInplaceFrameElement,
  resetInplaceFrameLayoutPreview,
  resolveInplaceFrameGeometry,
} from "./inplace-frame-preview";
import { relativeDefinition } from "../widget-types/relative/relative-definition";

const layout = { x: 120, y: 80, w: 280, h: 96, zIndex: 0, aspectLocked: true };
const start = { x: 100, y: 100, w: 280, h: 96, zIndex: 0, aspectLocked: true };

afterEach(() => {
  document.body.innerHTML = "";
  clearInplaceFrameLayoutPreview("delta-main");
});

function mountFrame(): HTMLElement {
  const frame = document.createElement("div");
  frame.dataset.testid = inplaceFrameTestId("delta-main");
  const viewport = document.createElement("div");
  viewport.dataset.widgetVisualViewport = "true";
  viewport.dataset.widgetVisualBaseWidth = "280";
  frame.append(viewport);
  document.body.append(frame);
  return frame;
}

describe("inplace-frame-preview", () => {
  it("tracks the latest preview layout per widget id", () => {
    beginInplaceFramePreview("delta-main", "resize", layout);
    applyInplaceFrameLayoutPreview("delta-main", layout);
    expect(getInplaceFrameLayoutPreview("delta-main")).toEqual(layout);
    clearInplaceFrameLayoutPreview("delta-main");
    expect(getInplaceFrameLayoutPreview("delta-main")).toBeUndefined();
  });

  it("writes geometry directly to the frame element on resize", () => {
    mountFrame();

    beginInplaceFramePreview("delta-main", "resize", layout);
    applyInplaceFrameLayoutPreview("delta-main", layout);

    const element = findInplaceFrameElement("delta-main");
    expect(element?.style.left).toBe("120px");
    expect(element?.style.top).toBe("80px");
    expect(element?.style.width).toBe("280px");
    expect(element?.style.height).toBe("96px");
    expect(element?.style.transform).toBe("");
  });

  it("updates the canonical visual scale during imperative resize", () => {
    const frame = mountFrame();
    beginInplaceFramePreview("delta-main", "resize", layout);

    applyInplaceFrameLayoutPreview("delta-main", { ...layout, w: 560, h: 192 });

    const viewport = frame.querySelector<HTMLElement>("[data-widget-visual-viewport]");
    expect(viewport?.style.width).toBe("280px");
    expect(viewport?.style.height).toBe("96px");
    expect(viewport?.style.transform).toBe("scale(2)");
  });

  it("keeps start geometry and applies transform delta on move", () => {
    mountFrame();

    beginInplaceFramePreview("delta-main", "move", start);
    applyInplaceFrameLayoutPreview("delta-main", { ...start, x: 140, y: 130 });

    const element = findInplaceFrameElement("delta-main");
    expect(element?.style.left).toBe("100px");
    expect(element?.style.top).toBe("100px");
    expect(element?.style.transform).toBe("translate(40px, 30px)");
  });

  it("resolves start geometry during move preview and preview geometry on resize", () => {
    expect(resolveInplaceFrameGeometry("delta-main", layout, false)).toEqual(layout);

    beginInplaceFramePreview("delta-main", "move", start);
    expect(resolveInplaceFrameGeometry("delta-main", layout, true)).toEqual(start);
    clearInplaceFrameLayoutPreview("delta-main");

    beginInplaceFramePreview("delta-main", "resize", start);
    applyInplaceFrameLayoutPreview("delta-main", layout);
    expect(resolveInplaceFrameGeometry("delta-main", layout, true)).toEqual(layout);
  });

  it("restores the original geometry and clears the session on reset", () => {
    mountFrame();

    beginInplaceFramePreview("delta-main", "move", start);
    applyInplaceFrameLayoutPreview("delta-main", { ...start, x: 140, y: 130 });
    resetInplaceFrameLayoutPreview("delta-main", start);

    const element = findInplaceFrameElement("delta-main");
    expect(element?.style.left).toBe("100px");
    expect(element?.style.top).toBe("100px");
    expect(element?.style.transform).toBe("");
    expect(getInplaceFrameLayoutPreview("delta-main")).toBeUndefined();
  });

  it("resolves registered elements without DOM query fallback", () => {
    const frame = document.createElement("div");
    registerInplaceFrameElement("delta-main", frame);
    expect(findInplaceFrameElement("delta-main")).toBe(frame);
    registerInplaceFrameElement("delta-main", null);
    expect(findInplaceFrameElement("delta-main")).toBeNull();
    expect(relativeDefinition.capabilities.defaultSize.width).toBeGreaterThan(0);
  });
});
