import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ISA-894 E1b (corte mínimo tras P1): solo cae el harness snapshot de
// Studio, sin importadores. El helper visual de autoría y el megamódulo
// se conservan con dueño explícito E1c y caen juntos.
describe("ISA-894 E1b retirada harness Studio sin snapshot", () => {
  it("el harness snapshot V1 de Studio está ausente del árbol", () => {
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

  it("el helper visual de autoría se conserva hasta E1c (dueño explícito, no ausencia)", () => {
    expect(
      existsSync(
        resolve(process.cwd(), "src", "overlay", "authoring", "fixtures", "authoring-v2-scenario-widget.ts"),
      ),
    ).toBe(true);
  });
});
