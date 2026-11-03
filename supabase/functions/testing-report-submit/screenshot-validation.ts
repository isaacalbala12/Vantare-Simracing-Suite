// Server-side checks for bytes fetched from the private Storage object.
// The native encoder writes baseline JPEG; we accept that narrow profile.
export class EvidenceInvalid extends Error {
  constructor(
    public readonly reason:
      | "missing"
      | "size"
      | "format"
      | "dimensions"
      | "digest",
  ) {
    super("invalid_evidence");
  }
}

export type EvidenceManifest = {
  sha256: string;
  byteSize: number;
  width: number;
  height: number;
};

const MAX_BYTES = 1024 * 1024;
const MAX_SIDE = 1920;

function jpegDimensions(bytes: Uint8Array): [number, number] {
  if (
    bytes.length < 16 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
    bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9
  ) {
    throw new EvidenceInvalid("format");
  }
  let offset = 2;
  let dimensions: [number, number] | null = null;
  while (offset < bytes.length - 2) {
    if (bytes[offset++] !== 0xff) throw new EvidenceInvalid("format");
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (
      marker === undefined || marker === 0xd9 || marker === 0xd8 ||
      marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)
    ) {
      throw new EvidenceInvalid("format");
    }
    if (offset + 2 > bytes.length - 2) throw new EvidenceInvalid("format");
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length - 2) {
      throw new EvidenceInvalid("format");
    }
    if (marker === 0xc0) {
      if (dimensions || length < 8 || bytes[offset + 2] !== 8) {
        throw new EvidenceInvalid("format");
      }
      dimensions = [
        (bytes[offset + 5] << 8) | bytes[offset + 6],
        (bytes[offset + 3] << 8) | bytes[offset + 4],
      ];
    } else if (marker === 0xda) {
      if (!dimensions || offset + length >= bytes.length - 2) {
        throw new EvidenceInvalid("format");
      }
      return dimensions;
    } else if (
      marker === 0xe1 || (marker >= 0xc1 && marker <= 0xcf && marker !== 0xc4)
    ) {
      // No EXIF or alternative coding profiles cross the report boundary.
      throw new EvidenceInvalid("format");
    }
    offset += length;
  }
  throw new EvidenceInvalid("format");
}

export async function validateEvidence(
  bytes: Uint8Array | null,
  expected: EvidenceManifest,
): Promise<void> {
  if (bytes === null) throw new EvidenceInvalid("missing");
  if (
    !Number.isInteger(expected.byteSize) || expected.byteSize < 1 ||
    expected.byteSize > MAX_BYTES || bytes.length !== expected.byteSize
  ) {
    throw new EvidenceInvalid("size");
  }
  const [width, height] = jpegDimensions(bytes);
  if (
    !Number.isInteger(expected.width) || !Number.isInteger(expected.height) ||
    expected.width < 1 || expected.height < 1 ||
    expected.width > MAX_SIDE || expected.height > MAX_SIDE ||
    width !== expected.width || height !== expected.height
  ) {
    throw new EvidenceInvalid("dimensions");
  }
  if (!/^[0-9a-f]{64}$/.test(expected.sha256)) {
    throw new EvidenceInvalid("digest");
  }
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", copy));
  const actual = Array.from(
    digest,
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  if (actual !== expected.sha256) throw new EvidenceInvalid("digest");
}
