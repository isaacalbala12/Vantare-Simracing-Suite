import assert from "node:assert/strict";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/** Exact RGBA mismatch is the primary metric; perceptual AA-inclusive is secondary. */
export function compareImages(reference: Buffer, current: Buffer) {
  const a = PNG.sync.read(reference);
  const b = PNG.sync.read(current);
  assert.equal(b.width, a.width, "Capture width differs from reference");
  assert.equal(b.height, a.height, "Capture height differs from reference");
  const output = new PNG({ width: a.width, height: a.height });
  const perceptual = new PNG({ width: a.width, height: a.height });
  let exactPixels = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const changed = !a.data
      .subarray(i, i + 4)
      .equals(b.data.subarray(i, i + 4));
    if (changed) exactPixels++;
    const grey = Math.round(
      230 + (((a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3) * 25) / 255,
    );
    output.data.set(changed ? [255, 0, 64, 255] : [grey, grey, grey, 255], i);
  }
  const perceptualPixels = pixelmatch(
    a.data,
    b.data,
    perceptual.data,
    a.width,
    a.height,
    {
      threshold: 0.1,
      includeAA: true,
    },
  );
  const pixels = a.width * a.height;
  return {
    width: a.width,
    height: a.height,
    pixels,
    exactPixels,
    exactPercent: (100 * exactPixels) / pixels,
    perceptualPixels,
    perceptualPercent: (100 * perceptualPixels) / pixels,
    diff: PNG.sync.write(output),
  };
}
