import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { compareImages } from "../scripts/visual-diff/image";
import { referenceReceiptHash } from "../scripts/visual-diff/reference-hash";

function png(width = 2, height = 2) {
  const image = new PNG({ width, height });
  image.data.fill(255);
  return image;
}
describe("visual comparison", () => {
  it("bank CLI produces the native receipt for a path with spaces", () => {
    const directory = mkdtempSync(join(tmpdir(), "bank receipt "));
    try {
      const path = join(directory, "capture with spaces.png");
      const bytes = Buffer.alloc(1024 * 1024 + 1, 7);
      writeFileSync(path, bytes);
      const actual = execFileSync(
        process.execPath,
        ["--experimental-strip-types", "scripts/reference-receipt.ts", path],
        { encoding: "utf8" },
      ).trim();
      expect(actual).toBe(referenceReceiptHash(bytes));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("validates the native receipt format including multiple 1 MiB blocks", () => {
    const sha = (value: Uint8Array | string) =>
      createHash("sha256").update(value).digest("hex");
    const bytes = Buffer.alloc(1024 * 1024 + 1, 7);
    expect(referenceReceiptHash(bytes)).toBe(
      sha(
        sha(bytes.subarray(0, 1024 * 1024)) + sha(bytes.subarray(1024 * 1024)),
      ),
    );
    expect(referenceReceiptHash(bytes)).not.toBe(sha(bytes));
  });
  it("reports identical captures as zero", () => {
    const bytes = PNG.sync.write(png());
    expect(compareImages(bytes, bytes).exactPercent).toBe(0);
  });
  it("counts a changed pixel once, includes alpha and never hides AA", () => {
    const a = png();
    const b = png();
    b.data[3] = 0;
    expect(
      compareImages(PNG.sync.write(a), PNG.sync.write(b)).exactPercent,
    ).toBe(25);
    b.data.fill(0);
    expect(
      compareImages(PNG.sync.write(a), PNG.sync.write(b)).exactPercent,
    ).toBe(100);
  });
  it("rejects different dimensions and invalid PNGs", () => {
    expect(() =>
      compareImages(PNG.sync.write(png()), PNG.sync.write(png(3))),
    ).toThrow();
    expect(() =>
      compareImages(Buffer.from("bad"), PNG.sync.write(png())),
    ).toThrow();
  });
});
