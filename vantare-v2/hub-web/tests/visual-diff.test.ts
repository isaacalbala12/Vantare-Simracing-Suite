import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import {
  captureOnlyMode,
  captureUncompared,
} from "../scripts/visual-diff/capture-only";
import { compareImages } from "../scripts/visual-diff/image";
import { referenceReceiptHash } from "../scripts/visual-diff/reference-hash";

function png(width = 2, height = 2) {
  const image = new PNG({ width, height });
  image.data.fill(255);
  return image;
}
describe("visual comparison", () => {
  it("accepts a live two-theme sweep and a supplied invalid single-theme capture", () => {
    expect(
      captureOnlyMode({
        enabled: true,
        scene: "ajustes-aplicacion",
        themes: 2,
      }),
    ).toBe("live");
    expect(
      captureOnlyMode({
        enabled: true,
        scene: "onboarding-2",
        themes: 1,
        current: "current.png",
        invalidReason: "empty bank",
      }),
    ).toBe("invalid");
    expect(() =>
      captureOnlyMode({
        enabled: true,
        scene: "ajustes-aplicacion",
        themes: 2,
        current: "current.png",
      }),
    ).toThrow();
    expect(() =>
      captureOnlyMode({
        enabled: true,
        scene: "onboarding-2",
        themes: 2,
        invalidReason: "empty bank",
      }),
    ).toThrow();
    expect(() =>
      captureOnlyMode({
        enabled: true,
        scene: "onboarding-2",
        themes: 1,
        invalidReason: " ",
      }),
    ).toThrow();
  });
  it("saves both sweep themes without reading any reference or producing metrics", async () => {
    const directory = mkdtempSync(join(tmpdir(), "live sweep "));
    const bytes = PNG.sync.write(png(1440, 900));
    const captured: string[] = [];
    try {
      for (const scheme of ["dark", "light"]) {
        const destination = join(directory, scheme, "ajustes-aplicacion");
        const result = await captureUncompared({
          scene: "ajustes-aplicacion",
          scheme,
          destination,
          capture: async () => {
            captured.push(scheme);
            return bytes;
          },
        });
        expect(result.status).toBe("captured-without-comparison");
        expect(result).not.toHaveProperty("referenceStatus");
        expect(result).not.toHaveProperty("perceptualPercent");
        expect(result).not.toHaveProperty("exactPercent");
        expect(readFileSync(join(destination, "current.png"))).toEqual(bytes);
        expect(existsSync(join(destination, "reference.png"))).toBe(false);
        expect(existsSync(join(destination, "diff.png"))).toBe(false);
      }
      expect(captured).toEqual(["dark", "light"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("captures without metrics or a diff when a reference is explicitly invalid", () => {
    const directory = mkdtempSync(join(tmpdir(), "invalid reference "));
    try {
      const refs = join(directory, "refs");
      mkdirSync(join(refs, "light"), { recursive: true });
      const bytes = PNG.sync.write(png(1440, 900));
      writeFileSync(join(refs, "light", "onboarding-2.png"), bytes);
      writeFileSync(
        join(refs, "light", "onboarding-2.png.capture.json"),
        JSON.stringify({ png: referenceReceiptHash(bytes) }),
      );
      writeFileSync(
        join(refs, "light", "capture-batch.json"),
        JSON.stringify([
          {
            scene: "onboarding-2",
            size: [1440, 900],
            appearance: "vantare-light",
          },
        ]),
      );
      const supplied = join(directory, "current.png");
      writeFileSync(supplied, bytes);
      const output = join(directory, "evidence");
      execFileSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "scripts/visual-diff.ts",
          "--scene",
          "onboarding-2",
          "--theme",
          "light",
          "--references",
          refs,
          "--output",
          output,
          "--current",
          supplied,
          "--capture-only",
          "--invalid-reference-reason",
          "bank panel empty",
        ],
        { encoding: "utf8" },
      );
      const [report] = JSON.parse(
        readFileSync(join(output, "report.json"), "utf8"),
      );
      expect(readFileSync(join(output, "report.md"), "utf8")).not.toContain(
        "%",
      );
      expect(report.status).toBe("captured");
      expect(report.referenceStatus).toBe("invalid");
      expect(report).not.toHaveProperty("exactPercent");
      expect(report).not.toHaveProperty("perceptualPercent");
      expect(
        existsSync(join(output, "light", "onboarding-2", "diff.png")),
      ).toBe(false);
      expect(
        existsSync(join(output, "light", "onboarding-2", "reference.png")),
      ).toBe(false);
      expect(
        readFileSync(join(output, "light", "onboarding-2", "current.png")),
      ).toEqual(bytes);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
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
