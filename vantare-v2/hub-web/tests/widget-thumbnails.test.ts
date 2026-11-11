import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { anonymize, pngDimensions } from "../scripts/widget-thumbnails";
import { studioKinds, studioSizes } from "../src/contract/generated/studio";
import { thumbnailGeometry } from "../src/renderer/ui/widgets/WidgetThumb";

const directory = resolve("src/renderer/assets/widgets/thumbs");
const manifest = JSON.parse(
  readFileSync(resolve(directory, "manifest.json"), "utf8"),
);
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
describe("thumbnail assets and deferred recipe", () => {
  it("has exactly one entry per native kind and tracks the native defaults", () => {
    expect(
      manifest.widgets.map((item: { kind: string }) => item.kind).sort(),
    ).toEqual([...studioKinds].sort());
    expect(manifest.defaultsSha256).toBe(
      sha(
        readFileSync(resolve("../native/hub-host/data/widget-defaults.json")),
      ),
    );
    for (const item of manifest.widgets) {
      expect(item.scale).toBe(1);
      expect({ width: item.width, height: item.height }).toEqual(
        studioSizes[item.kind as keyof typeof studioSizes],
      );
      expect(item.source).toMatch(
        /^native\/ui\/fixtures\/telemetry-real\/[a-z0-9.-]+\.json$/,
      );
      expect(sha(readFileSync(resolve("..", item.source)))).toBe(
        item.sourceSha256,
      );
      const png = resolve(directory, `${item.kind}.png`);
      if (existsSync(png)) {
        expect(manifest.engineCommit).toMatch(/^[0-9a-f]{40}$/);
        expect(manifest.executableSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(item.engineCommit).toBe(manifest.engineCommit);
        pngDimensions(
          readFileSync(png),
          item.width * item.scale,
          item.height * item.scale,
        );
        expect(item.engineCommit).toMatch(/^[0-9a-f]{40}$/);
        expect(Date.parse(item.capturedAt)).not.toBeNaN();
      } else
        expect(
          existsSync(
            resolve("src/renderer/assets/widgets", `${item.kind}.svg`),
          ),
          item.kind,
        ).toBe(true);
    }
  });
  it("fits tall widgets, keeps Delta natural and clips wide bars at a readable height", () => {
    expect(thumbnailGeometry("delta", 293, 132)).toEqual({
      width: 150,
      height: 36,
      cropped: false,
    });
    expect(thumbnailGeometry("pedals", 293, 132).width).toBeCloseTo(79.2);
    expect(thumbnailGeometry("standings", 293, 132).height).toBe(132);
    expect(thumbnailGeometry("broadcast-tower", 293, 132)).toMatchObject({
      width: 800,
      height: 32,
      cropped: true,
    });
    expect(thumbnailGeometry("broadcast-tower", 124, 60, 20).height).toBe(20);
  });
  it("anonymizes names consistently while preserving telemetry and the original input", () => {
    const source = JSON.parse(
      readFileSync(
        resolve(
          "../native/ui/fixtures/telemetry-real/lmu47-input.sequence.json",
        ),
        "utf8",
      ),
    );
    const before = JSON.stringify(source),
      output = anonymize(source);
    expect(JSON.stringify(source)).toBe(before);
    for (let i = 0; i < output.length; i++) {
      const original = structuredClone(source[i]);
      for (let j = 0; j < original.state.cars.length; j++) {
        expect(output[i].state.cars[j].driver_name).toMatch(
          /^(Tú|Piloto de ejemplo [0-9]+)$/,
        );
        original.state.cars[j].driver_name =
          output[i].state.cars[j].driver_name;
      }
      expect(output[i]).toEqual(original);
    }
  });
  it("rejects opaque RGB captures and wrong dimensions", () => {
    const image = new PNG({ width: 2, height: 3 });
    image.data.fill(255);
    const rgba = PNG.sync.write(image, { colorType: 6 });
    expect(() => pngDimensions(rgba, 2, 3)).not.toThrow();
    expect(() => pngDimensions(rgba, 3, 2)).toThrow();
    expect(() =>
      pngDimensions(PNG.sync.write(image, { colorType: 2 }), 2, 3),
    ).toThrow();
  });
});
