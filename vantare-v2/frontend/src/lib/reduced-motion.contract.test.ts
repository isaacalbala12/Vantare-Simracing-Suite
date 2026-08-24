/// <reference types="node" />

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const indexCss = readFileSync(join(process.cwd(), "src", "index.css"), "utf8");

describe("reduced motion contract", () => {
  it("does not create transitions on elements that never declared one", () => {
    const reducedMotion = indexCss.match(
      /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/,
    )?.[1];

    expect(reducedMotion).toBeDefined();
    expect(reducedMotion).toMatch(/transition-delay:\s*0s\s*!important;/);
    expect(reducedMotion).toMatch(/transition-duration:\s*0s\s*!important;/);
    expect(reducedMotion).not.toMatch(/transition-duration:\s*0\.01ms\s*!important;/);
  });
});
