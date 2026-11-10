import { pilotLimits } from "../../../contract/generated/contract";
export interface PhotoHeader {
  type: "image/png" | "image/jpeg";
  width: number;
  height: number;
}
function bounded(
  type: PhotoHeader["type"],
  width: number,
  height: number,
): PhotoHeader {
  if (
    !width ||
    !height ||
    width > pilotLimits.sourceSide ||
    height > pilotLimits.sourceSide
  )
    throw new Error("photo dimensions");
  return { type, width, height };
}
/** Runs before any image decoder. MIME/extension never authorizes the input. */
export function preflightPhoto(size: number, bytes: Uint8Array): PhotoHeader {
  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > pilotLimits.sourceBytes ||
    size !== bytes.length
  )
    throw new Error("photo size");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= 33 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)
  ) {
    if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452)
      throw new Error("PNG IHDR");
    return bounded("image/png", view.getUint32(16), view.getUint32(20));
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new Error("photo signature");
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error("JPEG marker");
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (
      marker === undefined ||
      marker === 0 ||
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0xda
    )
      throw new Error("JPEG missing frame");
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) throw new Error("JPEG length");
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length)
      throw new Error("JPEG segment");
    if (marker === 0xc0 || marker === 0xc2) {
      if (
        length < 8 ||
        bytes[offset + 7] === 0 ||
        length !== 8 + 3 * bytes[offset + 7]
      )
        throw new Error("JPEG frame");
      return bounded(
        "image/jpeg",
        view.getUint16(offset + 5),
        view.getUint16(offset + 3),
      );
    }
    offset += length;
  }
  throw new Error("JPEG missing frame");
}
