import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("GPUI font sources", () => {
  it("loads the exact static Inter faces used by GPUI", () => {
    const css = readFileSync("src/renderer/design/fonts.css", "utf8");
    for (const weight of [400, 500, 600, 650, 700, 750, 800]) {
      const name = `Inter-${weight}.ttf`;
      expect(
        readFileSync(`src/renderer/assets/fonts/${name}`).equals(
          readFileSync(`../native/ui/assets/fonts/${name}`),
        ),
      ).toBe(true);
      expect(css).toContain(`font-weight: ${weight};`);
      expect(css).toContain(name);
    }
  });
  it("uses the same display and mono font bytes", () => {
    for (const name of ["Rajdhani.ttf", "SpaceMono.ttf"])
      expect(
        readFileSync(`src/renderer/assets/fonts/${name}`).equals(
          readFileSync(`../native/ui/assets/fonts/${name}`),
        ),
      ).toBe(true);
  });
});
