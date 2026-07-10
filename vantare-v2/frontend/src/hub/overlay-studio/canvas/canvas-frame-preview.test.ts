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
import { resolveWidgetIntrinsicScale } from "./widget-intrinsic-scale";

const layout = { x: 120, y: 80, w: 280, h: 96, zIndex: 0, aspectLocked: true };
const start = { x: 100, y: 100, w: 280, h: 96, zIndex: 0, aspectLocked: true };
const widgetType = "delta" as const;

afterEach(() => {
  document.body.innerHTML = "";
  clearStudioFrameLayoutPreview("delta-main");
});

function mountFrameWithScaler(): HTMLElement {
  const frame = document.createElement("div");
  frame.dataset.testid = studioFrameTestId("delta-main");
  const scaler = document.createElement("div");
  scaler.dataset.testid = "studio-widget-intrinsic-scaler-delta-main";
  frame.append(scaler);
  document.body.append(frame);
  return frame;
}

describe("canvas-frame-preview", () => {
  it("tracks the latest preview layout per widget id", () => {
    beginStudioFramePreview("delta-main", "resize", layout, widgetType);
    applyStudioFrameLayoutPreview("delta-main", layout);
    expect(getStudioFrameLayoutPreview("delta-main")).toEqual(layout);
    clearStudioFrameLayoutPreview("delta-main");
    expect(getStudioFrameLayoutPreview("delta-main")).toBeUndefined();
  });

  it("writes geometry directly to the frame element on resize", () => {
    mountFrameWithScaler();

    beginStudioFramePreview("delta-main", "resize", layout, widgetType);
    applyStudioFrameLayoutPreview("delta-main", layout);

    const element = findStudioFrameElement("delta-main");
    expect(element?.style.left).toBe("120px");
    expect(element?.style.top).toBe("80px");
    expect(element?.style.width).toBe("280px");
    expect(element?.style.height).toBe("96px");
    expect(element?.style.transform).toBe("");
  });

  it("updates intrinsic scaler transform during resize preview", () => {
    mountFrameWithScaler();

    beginStudioFramePreview("delta-main", "resize", start, widgetType);
    const resized = { ...start, w: 420, h: 144 };
    applyStudioFrameLayoutPreview("delta-main", resized);

    const element = findStudioFrameElement("delta-main");
    const scaler = element?.querySelector<HTMLElement>('[data-testid="studio-widget-intrinsic-scaler-delta-main"]');
    const expected = resolveWidgetIntrinsicScale(resized, widgetType).scale;
    expect(scaler?.style.transform).toBe(`scale(${expected})`);
  });

  it("keeps start geometry and applies transform delta on move", () => {
    mountFrameWithScaler();

    beginStudioFramePreview("delta-main", "move", start, widgetType);
    applyStudioFrameLayoutPreview("delta-main", { ...start, x: 140, y: 130 });

    const element = findStudioFrameElement("delta-main");
    expect(element?.style.left).toBe("100px");
    expect(element?.style.top).toBe("100px");
    expect(element?.style.transform).toBe("translate(40px, 30px)");
  });

  it("does not clear the committed scaler transform when a move preview ends", () => {
    const frame = mountFrameWithScaler();
    const scaler = frame.querySelector<HTMLElement>('[data-testid="studio-widget-intrinsic-scaler-delta-main"]');
    expect(scaler).toBeTruthy();
    scaler!.style.transform = "scale(1.5)";

    beginStudioFramePreview("delta-main", "move", start, widgetType);
    applyStudioFrameLayoutPreview("delta-main", start);
    clearStudioFrameLayoutPreview("delta-main");

    expect(scaler?.style.transform).toBe("scale(1.5)");
  });

  it("clears cached preview layout on reset", () => {
    beginStudioFramePreview("delta-main", "resize", layout, widgetType);
    applyStudioFrameLayoutPreview("delta-main", layout);
    resetStudioFrameLayoutPreview("delta-main", layout);
    expect(getStudioFrameLayoutPreview("delta-main")).toBeUndefined();
  });

  it("restores the intrinsic scaler transform when resize preview is reset", () => {
    const frame = mountFrameWithScaler();
    const scaler = frame.querySelector<HTMLElement>('[data-testid="studio-widget-intrinsic-scaler-delta-main"]');
    const scaledStart = { ...start, w: 420, h: 180 };
    const scaledPreview = { ...scaledStart, w: 520, h: 223 };

    beginStudioFramePreview("delta-main", "resize", scaledStart, widgetType);
    applyStudioFrameLayoutPreview("delta-main", scaledPreview);
    resetStudioFrameLayoutPreview("delta-main", scaledStart);

    expect(scaler?.style.transform).toBe("scale(1.5)");
  });

  it("prefers registered frame refs over querySelector", () => {
    const registered = document.createElement("div");
    registerStudioFrameElement("delta-main", registered);
    beginStudioFramePreview("delta-main", "resize", layout, widgetType);
    applyStudioFrameLayoutPreview("delta-main", layout);
    expect(registered.style.left).toBe("120px");
    registerStudioFrameElement("delta-main", null);
  });

  it("resolves start geometry from cache during move preview", () => {
    beginStudioFramePreview("delta-main", "move", start, widgetType);
    applyStudioFrameLayoutPreview("delta-main", { ...start, x: 140, y: 130 });
    const committed = { ...start, x: 10, y: 10 };
    expect(resolveStudioFrameGeometry("delta-main", committed, true)).toEqual(start);
    expect(resolveStudioFrameGeometry("delta-main", committed, false)).toEqual(committed);
  });

  it("resolves preview geometry from cache during resize preview", () => {
    beginStudioFramePreview("delta-main", "resize", layout, widgetType);
    applyStudioFrameLayoutPreview("delta-main", layout);
    const committed = { ...layout, x: 10, y: 10 };
    expect(resolveStudioFrameGeometry("delta-main", committed, true)).toEqual(layout);
    expect(resolveStudioFrameGeometry("delta-main", committed, false)).toEqual(committed);
  });
});
