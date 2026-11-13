import assert from "node:assert/strict";

export interface PrototypeReceipt {
  sourceSha256: string;
  state: string;
  theme: string;
  sidebar: string;
  dimensions: number[];
  chromium: { product: string; jsVersion: string };
  fonts: { sha256: string }[];
}
/** Reject a convincing-looking comparison made with a different source or condition. */
export function verifyPrototypeReceipt(
  receipt: PrototypeReceipt,
  expected: {
    sourceSha256: string;
    state: string;
    theme: string;
    sidebar: string;
    dimensions: number[];
    browser: { product: string; jsVersion: string };
    fontHashes: string[];
  },
) {
  assert.equal(
    receipt.sourceSha256,
    expected.sourceSha256,
    "Prototype source changed; recapture its reference",
  );
  assert.equal(receipt.state, expected.state, "Prototype state differs");
  assert.equal(receipt.theme, expected.theme, "Prototype theme differs");
  assert.equal(receipt.sidebar, expected.sidebar, "Prototype sidebar differs");
  assert.deepEqual(
    receipt.dimensions,
    expected.dimensions,
    "Prototype viewport differs",
  );
  assert.equal(
    receipt.chromium.product,
    expected.browser.product,
    "Prototype Chromium differs",
  );
  assert.equal(
    receipt.chromium.jsVersion,
    expected.browser.jsVersion,
    "Prototype V8 differs",
  );
  assert.ok(
    expected.fontHashes.length > 0,
    "Product font receipt must not be empty",
  );
  assert.deepEqual(
    receipt.fonts.map((font) => font.sha256).sort(),
    [...expected.fontHashes].sort(),
    "Prototype fonts differ from product fonts",
  );
}
