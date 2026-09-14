import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ISA-894 E1b: cae el harness snapshot de Studio, sin importadores.
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
});
