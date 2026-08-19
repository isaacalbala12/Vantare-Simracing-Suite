import { describe, expect, it } from "vitest";
import { placeSelectionTag, TAG_EDGE, TAG_GAP } from "./selection-tag-placement";

const STAGE = { width: 1000, height: 560 };
const TAG = { width: 140, height: 22 };

/** A2: la etiqueta se pega al widget, lo sigue y no se sale del lienzo. */
describe("placeSelectionTag", () => {
  it("se centra sobre el borde superior del widget", () => {
    const placement = placeSelectionTag({
      anchor: { left: 400, top: 200, width: 200, height: 120 },
      tag: TAG,
      stage: STAGE,
    });
    expect(placement.side).toBe("above");
    expect(placement.top).toBe(200 - TAG_GAP - TAG.height);
    // Centro del widget (500) menos medio ancho de etiqueta.
    expect(placement.left).toBe(500 - TAG.width / 2);
  });

  it("baja debajo del widget cuando no cabe arriba", () => {
    const placement = placeSelectionTag({
      anchor: { left: 400, top: 2, width: 200, height: 120 },
      tag: TAG,
      stage: STAGE,
    });
    expect(placement.side).toBe("below");
    expect(placement.top).toBe(2 + 120 + TAG_GAP);
  });

  it("sigue al widget al arrastrarlo: mismo desplazamiento, misma etiqueta", () => {
    const before = placeSelectionTag({
      anchor: { left: 100, top: 200, width: 200, height: 120 },
      tag: TAG,
      stage: STAGE,
    });
    const after = placeSelectionTag({
      anchor: { left: 340, top: 260, width: 200, height: 120 },
      tag: TAG,
      stage: STAGE,
    });
    expect(after.left - before.left).toBe(240);
    expect(after.top - before.top).toBe(60);
  });

  it("no se sale por la derecha del lienzo", () => {
    const placement = placeSelectionTag({
      anchor: { left: 940, top: 300, width: 60, height: 60 },
      tag: TAG,
      stage: STAGE,
    });
    expect(placement.left + TAG.width).toBeLessThanOrEqual(STAGE.width - TAG_EDGE);
  });

  it("no se sale por la izquierda del lienzo", () => {
    const placement = placeSelectionTag({
      anchor: { left: -20, top: 300, width: 60, height: 60 },
      tag: TAG,
      stage: STAGE,
    });
    expect(placement.left).toBeGreaterThanOrEqual(TAG_EDGE);
  });

  it("con un widget que ocupa todo el lienzo se queda dentro igualmente", () => {
    const placement = placeSelectionTag({
      anchor: { left: 0, top: 0, width: STAGE.width, height: STAGE.height },
      tag: TAG,
      stage: STAGE,
    });
    expect(placement.top).toBeGreaterThanOrEqual(TAG_EDGE);
    expect(placement.top + TAG.height).toBeLessThanOrEqual(STAGE.height - TAG_EDGE);
  });
});
