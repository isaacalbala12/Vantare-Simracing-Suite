import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "tokens.css"), "utf8");

describe("Crystal performance budget", () => {
  it("uses at most one material layer per widget root and caps declared blur at 24px", () => {
    const blurValues = [...css.matchAll(/backdrop-filter:\s*blur\((\d+)px\)/g)].map((match) => Number(match[1]));
    expect(blurValues.length + (css.match(/backdrop-filter:\s*blur\(/g) ?? []).length).toBeGreaterThan(0);
    if (blurValues.length > 0) {
      expect(Math.max(...blurValues)).toBeLessThanOrEqual(16);
    }
    const declaredBlur = css.match(/--vc-blur-glass:\s*(\d+)px/);
    expect(Number(declaredBlur?.[1])).toBeLessThanOrEqual(24);
    expect((css.match(/backdrop-filter:\s*blur\(/g) ?? []).length).toBeLessThanOrEqual(6);
  });

  it("disables nonessential animation for reduced motion", () => {
    expect(css).toMatch(/prefers-reduced-motion/);
    expect(css).toMatch(/animation:\s*none/);
  });
});
