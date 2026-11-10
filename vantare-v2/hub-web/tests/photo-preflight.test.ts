import { describe, expect, it } from "vitest";
import { pilotLimits } from "../src/contract/generated/contract";
import { preflightPhoto } from "../src/renderer/screens/settings/photo-preflight";

function png(width: number, height: number) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const data = new DataView(bytes.buffer);
  data.setUint32(8, 13);
  data.setUint32(12, 0x49484452);
  data.setUint32(16, width);
  data.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
}
function jpeg(width: number, height: number) {
  // SOI, APP0 and a three-component baseline SOF; preflight is not a decoder.
  const bytes = new Uint8Array([
    255, 216, 255, 224, 0, 4, 0, 0, 255, 192, 0, 17, 8, 0, 0, 0, 0, 3, 1, 17, 0,
    2, 17, 1, 3, 17, 1,
  ]);
  const data = new DataView(bytes.buffer);
  data.setUint16(13, height);
  data.setUint16(15, width);
  return bytes;
}
describe("photo preflight before allocating decoded pixels", () => {
  it("recognizes content and dimensions independently of extension/MIME", () => {
    for (const [bytes, type] of [
      [png(12, 34), "image/png"],
      [jpeg(12, 34), "image/jpeg"],
    ] as const)
      expect(preflightPhoto(bytes.length, bytes)).toEqual({
        type,
        width: 12,
        height: 34,
      });
  });
  it("rejects a source exceeding the core byte limit", () => {
    const bytes = new Uint8Array(pilotLimits.sourceBytes + 1);
    bytes.set(png(1, 1));
    expect(() => preflightPhoto(bytes.length, bytes)).toThrow();
  });
  it.each([
    png(30000, 30000),
    png(0, 1),
    jpeg(pilotLimits.sourceSide + 1, 1),
    jpeg(1, 0),
  ])("rejects excessive/zero dimensions before decode", (bytes) => {
    expect(() => preflightPhoto(bytes.length, bytes)).toThrow();
  });
  it.each([
    new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    new Uint8Array([255, 216, 255, 224, 255, 255]),
    new Uint8Array([255, 216, 255, 192, 0, 2]),
    new Uint8Array([255, 216, 255, 218, 0, 2]),
    jpeg(1, 1).subarray(0, 20),
    new Uint8Array([255, 216, 12, 34]),
  ])("rejects disguised content and corrupt JPEG headers", (bytes) => {
    expect(() => preflightPhoto(bytes.length, bytes)).toThrow();
  });
  it("accepts exact dimension limits and rejects incomplete buffers", () => {
    const bytes = png(pilotLimits.sourceSide, pilotLimits.sourceSide);
    expect(preflightPhoto(bytes.length, bytes).width).toBe(
      pilotLimits.sourceSide,
    );
    expect(() => preflightPhoto(bytes.length + 1, bytes)).toThrow();
  });
  it("rejects an unsupported first frame instead of trusting a later SOF", () => {
    const first = jpeg(30000, 30000);
    first[9] = 0xc1;
    const bytes = new Uint8Array([...first, ...jpeg(1, 1).subarray(8)]);
    expect(() => preflightPhoto(bytes.length, bytes)).toThrow();
  });
});
