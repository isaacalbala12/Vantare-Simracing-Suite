import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const directory = dirname(fileURLToPath(import.meta.url));
const assetDirectory = join(directory, "../../../assets/fonts/vantare-crystal");

const expectedAssets = {
  "inter-latin-wght-400-800-v20.woff2": "3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62",
  "plus-jakarta-sans-latin-wght-700-800-v12.woff2": "153fc85b70298beeb1d61a5f723331649e7f23bb77302a66e61cb3e2fbdb5e79",
  "jetbrains-mono-latin-wght-500-800-v24.woff2": "83c005d49d8a6a50474c73a5a36ac0468076e9c4a29da7bdb14995d80560a5be",
} as const;

describe("Vantare Crystal local font assets", () => {
  it("pins the official latin WOFF2 files by SHA-256", () => {
    for (const [file, expectedHash] of Object.entries(expectedAssets)) {
      const hash = createHash("sha256").update(readFileSync(join(assetDirectory, file))).digest("hex");
      expect(hash).toBe(expectedHash);
    }
  });

  it("ships one OFL license per family", () => {
    for (const file of ["OFL-Inter.txt", "OFL-Plus-Jakarta-Sans.txt", "OFL-JetBrains-Mono.txt"]) {
      expect(readFileSync(join(assetDirectory, file), "utf8")).toContain("SIL OPEN FONT LICENSE Version 1.1");
    }
  });

  it("references only local WOFF2 assets at runtime", () => {
    const css = readFileSync(join(directory, "tokens.css"), "utf8");
    expect(css).toContain('font-family: "Inter"');
    expect(css).toContain('font-family: "Plus Jakarta Sans"');
    expect(css).toContain('font-family: "JetBrains Mono"');
    expect(css).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(css.match(/@font-face/g)).toHaveLength(3);
  });
});
