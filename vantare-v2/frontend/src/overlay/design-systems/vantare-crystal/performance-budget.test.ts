import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "tokens.css"), "utf8");

describe("Crystal performance budget", () => {
  it("uses at most one material layer per widget root and caps blur at 16px", () => {
    const blurValues = [...css.matchAll(/backdrop-filter:\s*blur\((\d+)px\)/g)].map((match) => Number(match[1]));
    expect(blurValues.length).toBeGreaterThan(0);
    expect(Math.max(...blurValues)).toBeLessThanOrEqual(16);
    expect((css.match(/backdrop-filter:\s*blur\(/g) ?? []).length).toBeLessThanOrEqual(5);
  });

  it("disables nonessential animation for reduced motion", () => {
    expect(css).toMatch(/prefers-reduced-motion/);
    expect(css).toMatch(/animation:\s*none/);
  });
});
