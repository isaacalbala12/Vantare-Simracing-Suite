import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const directory = __dirname;
const css = readFileSync(join(directory, "tokens.css"), "utf8");
const originalCss = readFileSync(join(directory, "../vantare-original/tokens.css"), "utf8");
const referenceManifest = JSON.parse(
  readFileSync(join(directory, "../../../../testdata/crystal-reference/manifest.json"), "utf8"),
) as {
  fontContract?: {
    resolution?: string;
    pixelDelta?: string;
  };
};

describe("Crystal canonical glass contract", () => {
  it("freezes the HTML page, font, surface, radius, shadow, and blur tokens", () => {
    expect(css).toContain('[data-widget-system="vantare-crystal"] {');
    expect(css).toMatch(/--vc-page-bg:\s*#060608;/);
    expect(css).toMatch(/--vc-font-sans:\s*["']Inter["']/);
    expect(css).toMatch(/--vc-font-display:\s*["']Plus Jakarta Sans["']/);
    expect(css).toMatch(/--vc-font-mono:\s*["']JetBrains Mono["']/);
    expect(css).toMatch(/--vc-glass-surface:\s*rgba\(18, 18, 22, 0\.82\);/);
    expect(css).toMatch(/--vc-glass-border:\s*rgba\(255, 255, 255, 0\.09\);/);
    expect(css).toMatch(/--vc-radius-sm:\s*8px;/);
    expect(css).toMatch(/--vc-radius-md:\s*12px;/);
    expect(css).toMatch(/--vc-radius-lg:\s*16px;/);
    expect(css).toMatch(/--vc-glass-shadow:\s*0 24px 60px rgba\(0, 0, 0, 0\.75\)/);
    expect(css).toMatch(/--vc-blur-soft:\s*20px;/);
    expect(css).toMatch(/--vc-blur-glass:\s*24px;/);
    expect(css).toMatch(/--vc-blur-strong:\s*25px;/);
  });

  it("keeps the token contract scoped to Crystal and leaves Original untouched", () => {
    expect(css).not.toContain('[data-widget-system="vantare-original"]');
    expect(originalCss).not.toContain("--vc-glass-");
    expect(originalCss).not.toContain("--vc-blur-");
  });

  it("registers the exact authority font families as a parity gate", () => {
    expect(referenceManifest.fontContract.resolution).toBe("authority-web-font-faces");
    expect(referenceManifest.fontContract.requiredFamilies).toEqual([
      "Inter",
      "Plus Jakarta Sans",
      "JetBrains Mono",
    ]);
    expect(referenceManifest.fontContract.runtimeRequirement).toContain("same local font faces");
    expect(referenceManifest.fontContract.captured.faces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ family: "Inter", weight: "400" }),
        expect.objectContaining({ family: "Plus Jakarta Sans", weight: "800" }),
        expect.objectContaining({ family: "JetBrains Mono", weight: "500" }),
      ]),
    );
  });
});
