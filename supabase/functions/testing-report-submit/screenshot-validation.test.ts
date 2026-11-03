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
