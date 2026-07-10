import { afterEach, describe, expect, it } from "vitest";
import {
  applyStudioFrameLayoutPreview,
  clearStudioFrameLayoutPreview,
  findStudioFrameElement,
  getStudioFrameLayoutPreview,
  resetStudioFrameLayoutPreview,
  studioFrameTestId,
} from "./canvas-frame-preview";

const layout = { x: 120, y: 80, w: 280, h: 96, zIndex: 0, aspectLocked: true };

afterEach(() => {
  document.body.innerHTML = "";
});

describe("canvas-frame-preview", () => {
  it("tracks the latest preview layout per widget id", () => {
    applyStudioFrameLayoutPreview("delta-main", layout);
    expect(getStudioFrameLayoutPreview("delta-main")).toEqual(layout);
    clearStudioFrameLayoutPreview("delta-main");
    expect(getStudioFrameLayoutPreview("delta-main")).toBeUndefined();
  });

  it("writes geometry directly to the frame element", () => {
    const frame = document.createElement("div");
    frame.dataset.testid = studioFrameTestId("delta-main");
    document.body.append(frame);

    applyStudioFrameLayoutPreview("delta-main", layout);

    const element = findStudioFrameElement("delta-main");
    expect(element?.style.left).toBe("120px");
    expect(element?.style.top).toBe("80px");
    expect(element?.style.width).toBe("280px");
    expect(element?.style.height).toBe("96px");
  });

  it("clears cached preview layout on reset", () => {
    applyStudioFrameLayoutPreview("delta-main", layout);
    resetStudioFrameLayoutPreview("delta-main", layout);
    expect(getStudioFrameLayoutPreview("delta-main")).toEqual(layout);
  });
});