import { EvidenceInvalid, validateEvidence } from "./screenshot-validation.ts";

const jpeg = await Deno.readFile(
  new URL("./testdata/valid-8x6.jpg", import.meta.url),
);
const digest = Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256", jpeg)),
  (byte) => byte.toString(16).padStart(2, "0"),
).join("");
const manifest = { sha256: digest, byteSize: jpeg.length, width: 8, height: 6 };

async function denied(
  bytes: Uint8Array | null,
  expected: EvidenceInvalid["reason"],
  item = manifest,
) {
  try {
    await validateEvidence(bytes, item);
  } catch (error) {
    if (error instanceof EvidenceInvalid && error.reason === expected) return;
    throw error;
  }
  throw new Error("unsafe evidence accepted");
}

Deno.test("valid JPEG matches digest, byte count and actual dimensions", async () => {
  await validateEvidence(jpeg, manifest);
});

Deno.test("missing Storage object and renamed PNG are rejected", async () => {
  await denied(null, "missing");
  const png = new Uint8Array(jpeg);
  png.set([0x89, 0x50, 0x4e, 0x47], 0);
  await denied(png, "format");
});

Deno.test("forged SHA, byte count and dimensions are rejected", async () => {
  await denied(jpeg, "digest", { ...manifest, sha256: "0".repeat(64) });
  await denied(jpeg, "size", { ...manifest, byteSize: jpeg.length - 1 });
  await denied(jpeg, "dimensions", { ...manifest, width: 9 });
});

Deno.test("truncated JPEG and hostile dimensions are rejected", async () => {
  const truncated = jpeg.subarray(0, jpeg.length - 2);
  await denied(truncated, "format", {
    ...manifest,
    byteSize: truncated.length,
  });
  await denied(jpeg, "dimensions", { ...manifest, width: 16_384 });
});

Deno.test("EXIF and progressive JPEG headers are refused before accepting a digest", async () => {
  const exif = new Uint8Array(jpeg.length + 8);
  exif.set(jpeg.subarray(0, 2));
  exif.set([0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66], 2);
  exif.set(jpeg.subarray(2), 10);
  await denied(exif, "format", { ...manifest, byteSize: exif.length });
  const progressive = new Uint8Array(jpeg);
  const frame = progressive.findIndex((byte, offset) =>
    byte === 0xff && progressive[offset + 1] === 0xc0
  );
  if (frame < 0) throw new Error("fixture has no baseline frame");
  progressive[frame + 1] = 0xc2;
  await denied(progressive, "format");
});

function withSegment(marker: number, payload: number[]): Uint8Array {
  const segment = [0xff, marker, 0, payload.length + 2, ...payload];
  return Uint8Array.from([
    ...jpeg.subarray(0, 2),
    ...segment,
    ...jpeg.subarray(2),
  ]);
}

function markerOffset(marker: number): number {
  const offset = jpeg.findIndex((byte, index) =>
    byte === 0xff && jpeg[index + 1] === marker
  );
  if (offset < 0) throw new Error("fixture marker absent");
  return offset;
}

Deno.test("scan rejects early EOI, appended bytes and unexpected markers", async () => {
  const earlyEoi = Uint8Array.from([
    ...jpeg.subarray(0, -2),
    0xff,
    0xd9,
    0,
    0xff,
    0xd9,
  ]);
  await denied(earlyEoi, "format", { ...manifest, byteSize: earlyEoi.length });
  const appended = Uint8Array.from([...jpeg, 0, 0xff, 0xd9]);
  await denied(appended, "format", { ...manifest, byteSize: appended.length });
  const scan = markerOffset(0xda);
  const scanLength = (jpeg[scan + 2] << 8) | jpeg[scan + 3];
  const inserted = Uint8Array.from([
    ...jpeg.subarray(0, scan + 2 + scanLength),
    0xff,
    0xe0,
    ...jpeg.subarray(scan + 2 + scanLength),
  ]);
  await denied(inserted, "format", { ...manifest, byteSize: inserted.length });
});

Deno.test("header accepts only bounded JFIF, DQT, DHT, SOF0 and SOS", async () => {
  for (const marker of [0xfe, 0xe2, 0xef, 0xdd]) {
    const bytes = withSegment(marker, [1, 2]);
    await denied(bytes, "format", { ...manifest, byteSize: bytes.length });
  }
  const fakeJfif = withSegment(0xe0, [1, 2, 3]);
  await denied(fakeJfif, "format", { ...manifest, byteSize: fakeJfif.length });
  const noDqt = jpeg.subarray(0, markerOffset(0xdb));
  await denied(noDqt, "format", { ...manifest, byteSize: noDqt.length });
  const noSos = Uint8Array.from([
    ...jpeg.subarray(0, markerOffset(0xda)),
    0xff,
    0xd9,
  ]);
  await denied(noSos, "format", { ...manifest, byteSize: noSos.length });
});

Deno.test("SOF components, segment lengths and one MiB limit are enforced", async () => {
  const sof = markerOffset(0xc0);
  const wrongComponents = new Uint8Array(jpeg);
  wrongComponents[sof + 9] = 4;
  await denied(wrongComponents, "format");
  const malformedLength = new Uint8Array(jpeg);
  malformedLength[markerOffset(0xdb) + 3] = 1;
  await denied(malformedLength, "format");
  const tooLarge = Uint8Array.from([
    ...jpeg.subarray(0, -2),
    ...new Uint8Array(1024 * 1024),
    0xff,
    0xd9,
  ]);
  await denied(tooLarge, "size", { ...manifest, byteSize: tooLarge.length });
  const sos = markerOffset(0xda);
  const wrongScanComponent = new Uint8Array(jpeg);
  wrongScanComponent[sos + 5] = 9;
  await denied(wrongScanComponent, "format");
});

Deno.test("stuffed FF00 remains valid scan data", async () => {
  const sos = markerOffset(0xda);
  const scanLength = (jpeg[sos + 2] << 8) | jpeg[sos + 3];
  const bytes = Uint8Array.from([
    ...jpeg.subarray(0, sos + 2 + scanLength),
    0xff,
    0x00,
    ...jpeg.subarray(sos + 2 + scanLength),
  ]);
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  await validateEvidence(bytes, {
    ...manifest,
    byteSize: bytes.length,
    sha256: hash,
  });
});

Deno.test("SOF sampling factors and referenced quantization tables are bounded", async () => {
  const sof = markerOffset(0xc0);
  for (const sampling of [0x01, 0x10, 0x51, 0x15]) {
    const bytes = new Uint8Array(jpeg);
    bytes[sof + 11] = sampling;
    await denied(bytes, "format");
  }
  const undefinedTable = new Uint8Array(jpeg);
  undefinedTable[sof + 12] = 2;
  await denied(undefinedTable, "format");
  const zeroWidth = new Uint8Array(jpeg);
  zeroWidth[sof + 7] = 0;
  zeroWidth[sof + 8] = 0;
  await denied(zeroWidth, "format");
  const zeroHeight = new Uint8Array(jpeg);
  zeroHeight[sof + 5] = 0;
  zeroHeight[sof + 6] = 0;
  await denied(zeroHeight, "format");
});

Deno.test("SOF accepts ten blocks per MCU and rejects eleven or more", async () => {
  const bytes = new Uint8Array(jpeg);
  const samplingOffset = markerOffset(0xc0) + 11;
  for (const [sampling, accepted] of [[0x42, true], [0x43, false]] as const) {
    bytes[samplingOffset] = sampling;
    const sha256 = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    if (accepted) await validateEvidence(bytes, { ...manifest, sha256 });
    else await denied(bytes, "format", { ...manifest, sha256 });
  }
});

Deno.test("SOS references defined Huffman tables and is unique", async () => {
  const sos = markerOffset(0xda);
  const dht = markerOffset(0xc4);
  const dhtLength = (jpeg[dht + 2] << 8) | jpeg[dht + 3];
  const missingTable = Uint8Array.from([
    ...jpeg.subarray(0, dht),
    ...jpeg.subarray(dht + 2 + dhtLength),
  ]);
  await denied(missingTable, "format", {
    ...manifest,
    byteSize: missingTable.length,
  });
  const scanLength = (jpeg[sos + 2] << 8) | jpeg[sos + 3];
  const secondSos = Uint8Array.from([
    ...jpeg.subarray(0, sos + 2 + scanLength),
    ...jpeg.subarray(sos, sos + 2 + scanLength),
    ...jpeg.subarray(sos + 2 + scanLength),
  ]);
  await denied(secondSos, "format", {
    ...manifest,
    byteSize: secondSos.length,
  });
});

Deno.test("restart markers without DRI and Huffman tables over 256 symbols are rejected", async () => {
  const sos = markerOffset(0xda);
  const scanLength = (jpeg[sos + 2] << 8) | jpeg[sos + 3];
  const restart = Uint8Array.from([
    ...jpeg.subarray(0, sos + 2 + scanLength),
    0xff,
    0xd0,
    ...jpeg.subarray(sos + 2 + scanLength),
  ]);
  await denied(restart, "format", { ...manifest, byteSize: restart.length });
  const counts = [255, 2, ...new Array(14).fill(0)];
  const payload = [0x02, ...counts, ...new Array(257).fill(1)];
  const length = payload.length + 2;
  const oversizedTable = Uint8Array.from([
    ...jpeg.subarray(0, 2),
    0xff,
    0xc4,
    length >> 8,
    length & 0xff,
    ...payload,
    ...jpeg.subarray(2),
  ]);
  await denied(oversizedTable, "format", {
    ...manifest,
    byteSize: oversizedTable.length,
  });
});
