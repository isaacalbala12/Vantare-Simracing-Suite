import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../src/renderer");
const sources = readdirSync(root, { recursive: true, encoding: "utf8" })
  .filter((path) => /\.tsx?$/.test(path))
  .map((path) => ({
    path: path.replaceAll("\\", "/"),
    text: readFileSync(resolve(root, path), "utf8"),
  }));

// La regla de validez de los sectores (3 valores, todos > 0, suma = tiempo
// oficial) vive solo en el host: `native/hub-host/.../metadata.rs::valid_sectors`.
it("reads sectorsMs only in analysis-sectors.ts", () => {
  expect(
    sources
      .filter(({ text }) => text.includes("sectorsMs"))
      .map(({ path }) => path),
  ).toEqual(["app/analysis-sectors.ts"]);
});
it("never adds up or validates sector times in the renderer", () => {
  const { text } = sources.find(
    ({ path }) => path === "app/analysis-sectors.ts",
  ) ?? { text: "" };
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  expect(code).not.toMatch(/reduce\(|isFinite|isNaN|\bsum\b|[>≥]\s*0\b/);
});
