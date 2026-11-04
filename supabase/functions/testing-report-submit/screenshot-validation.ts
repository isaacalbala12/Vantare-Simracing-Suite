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
  let components = 0;
  const frameIds = new Set<number>();
  const quantizationTables = new Set<number>();
  const dcTables = new Set<number>();
  const acTables = new Set<number>();
  let jfif = false;
  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) throw new EvidenceInvalid("format");
    const marker = bytes[offset + 1];
    if (
      marker === undefined || ![0xe0, 0xdb, 0xc4, 0xc0, 0xda].includes(marker)
    ) {
      throw new EvidenceInvalid("format");
    }
    offset += 2;
    if (offset + 2 > bytes.length - 2) throw new EvidenceInvalid("format");
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length - 2) {
      throw new EvidenceInvalid("format");
    }
    const start = offset + 2;
    if (marker === 0xe0) {
      if (
        jfif || length !== 16 || bytes[start] !== 0x4a ||
        bytes[start + 1] !== 0x46 || bytes[start + 2] !== 0x49 ||
        bytes[start + 3] !== 0x46 || bytes[start + 4] !== 0 ||
        bytes[start + 5] !== 1 || bytes[start + 12] !== 0 ||
        bytes[start + 13] !== 0
      ) throw new EvidenceInvalid("format");
      jfif = true;
    } else if (marker === 0xdb) {
      // At least one 8-bit quantization table, with an exact segment size.
      if ((length - 2) % 65 !== 0 || length < 67) {
        throw new EvidenceInvalid("format");
      }
      for (let index = start; index < offset + length; index += 65) {
        if (bytes[index] > 3) throw new EvidenceInvalid("format");
        quantizationTables.add(bytes[index]);
      }
    } else if (marker === 0xc4) {
      let index = start;
      while (index < offset + length) {
        if (index + 17 > offset + length || (bytes[index] & 0xee) !== 0) {
          throw new EvidenceInvalid("format");
        }
        const selector = bytes[index];
        let symbols = 0;
        for (let n = 1; n <= 16; n++) symbols += bytes[index + n];
        index += 17 + symbols;
        if (symbols === 0 || symbols > 256 || index > offset + length) {
          throw new EvidenceInvalid("format");
        }
        (selector >> 4 === 0 ? dcTables : acTables).add(selector & 0x0f);
      }
    } else if (marker === 0xc0) {
      components = bytes[start + 5];
      if (
        dimensions || bytes[start] !== 8 ||
        ![1, 3].includes(components) || length !== 8 + components * 3
      ) {
        throw new EvidenceInvalid("format");
      }
      let blocksPerMcu = 0;
      for (let index = start + 6; index < offset + length; index += 3) {
        if (
          frameIds.has(bytes[index]) ||
          (bytes[index + 1] >> 4) < 1 ||
          (bytes[index + 1] >> 4) > 4 ||
          (bytes[index + 1] & 0x0f) < 1 ||
          (bytes[index + 1] & 0x0f) > 4 ||
          !quantizationTables.has(bytes[index + 2])
        ) {
          throw new EvidenceInvalid("format");
        }
        blocksPerMcu += (bytes[index + 1] >> 4) *
          (bytes[index + 1] & 0x0f);
        if (blocksPerMcu > 10) throw new EvidenceInvalid("format");
        frameIds.add(bytes[index]);
      }
      dimensions = [
        (bytes[start + 3] << 8) | bytes[start + 4],
        (bytes[start + 1] << 8) | bytes[start + 2],
      ];
      if (dimensions[0] === 0 || dimensions[1] === 0) {
        throw new EvidenceInvalid("format");
      }
    } else {
      if (
        !dimensions || quantizationTables.size === 0 ||
        dcTables.size === 0 || acTables.size === 0 ||
        length !== 6 + components * 2 || bytes[start] !== components ||
        bytes[offset + length - 3] !== 0 ||
        bytes[offset + length - 2] !== 63 ||
        bytes[offset + length - 1] !== 0
      ) {
        throw new EvidenceInvalid("format");
      }
      const scanIds = new Set<number>();
      for (let index = start + 1; index < offset + length - 3; index += 2) {
        if (
          !frameIds.has(bytes[index]) || scanIds.has(bytes[index]) ||
          (bytes[index + 1] & 0xee) !== 0 ||
          !dcTables.has(bytes[index + 1] >> 4) ||
          !acTables.has(bytes[index + 1] & 0x0f)
        ) throw new EvidenceInvalid("format");
        scanIds.add(bytes[index]);
      }
      offset += length;
      const scanStart = offset;
      while (offset < bytes.length - 1) {
        if (bytes[offset] !== 0xff) {
          offset++;
          continue;
        }
        const next = bytes[offset + 1];
        if (
          next === 0xd9 && offset === bytes.length - 2 && offset > scanStart
        ) {
          return dimensions;
        }
        if (next !== 0) {
          throw new EvidenceInvalid("format");
        }
        offset += 2;
      }
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
