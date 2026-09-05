import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ISA-894 E1b: la autoría/Studio ya no usa fixtures legacy con snapshot.
// Los dos módulos deben desaparecer; sus callers usan la frontera V2
// productiva (authoring-v2-scenario-fixture + authoring-v2-workshop-frame).
describe("ISA-894 E1b retirada autoría/Studio sin snapshot", () => {
  it("los dos módulos legacy están ausentes del árbol", () => {
    expect(
      existsSync(
        resolve(process.cwd(), "src", "overlay", "authoring", "fixtures", "authoring-v2-scenario-widget.ts"),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          process.cwd(),
          "src",
          "hub",
          "overlay-studio",
          "canvas",
          "fixtures",
          "studio-v1-snapshot-test-harness.ts",
        ),
      ),
    ).toBe(false);
  });

  it("ningún caller productivo importa los módulos retirados", () => {
    for (const relative of [
      ["src", "overlay", "authoring", "fixtures", "authoring-v2-workshop-frame.ts"],
      ["src", "overlay-harness", "OverlayParityHarness.tsx"],
      ["src", "overlay-harness", "OverlayParityHarness.test.tsx"],
    ] as const) {
      const source = readFileSync(resolve(process.cwd(), ...relative), "utf8");
      expect(source).not.toContain("authoring-v2-scenario-widget");
      expect(source).not.toContain("buildAuthoringV2ScenarioWidget");
      expect(source).not.toContain("useStudioV1SnapshotTestHarness");
    }
  });
});
