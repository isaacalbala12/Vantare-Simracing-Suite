import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { compareImages } from "./image.ts";

const calendarViews: Record<string, string> = {
  "calendario-r6-proximas": "proximas",
  "calendario-r6-mias": "mias",
  "calendario-r6-semana": "semana",
  "calendario-r6-mes": "mes",
  "calendario-eventos-contraida": "eventos",
};

/** An input receipt alone does not prove that GPUI actually changed its sidebar. */
export function validateReferenceState(
  scene: string,
  reference: Buffer,
  sidebarTemplate: Buffer,
  expanded: boolean,
  bank?: { calendar_spec?: string; native_scene?: string },
) {
  const header = (input: Buffer) => {
    const image = PNG.sync.read(input);
    const width = expanded ? 272 : 76;
    assert.ok(image.width >= width && image.height >= 52);
    const crop = new PNG({ width, height: 52 });
    for (let y = 0; y < 52; y++)
      image.data.copy(
        crop.data,
        y * width * 4,
        y * image.width * 4,
        (y * image.width + width) * 4,
      );
    return PNG.sync.write(crop);
  };
  const difference = compareImages(header(sidebarTemplate), header(reference));
  assert.ok(
    difference.perceptualPercent <= 5,
    "Reference sidebar differs from the verified GPUI brand header",
  );
  const view = calendarViews[scene];
  if (view) {
    assert.equal(
      bank?.calendar_spec,
      `state=ok;view=${view}`,
      "Reference calendar fixture differs from the scene",
    );
    assert.equal(
      bank?.native_scene,
      "calendario-base",
      "R6 native capture forces its sidebar by width",
    );
  }
}
