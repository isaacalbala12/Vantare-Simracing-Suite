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
const code = (path: string) =>
  (sources.find((source) => source.path === path)?.text ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/`[^`]*`|"[^"\n]*"/g, '""');

// La regla de validez de los sectores (3 valores, todos > 0, suma = tiempo
// oficial) vive en el host: `native/hub-host/.../metadata.rs::valid_sectors`.
// El renderer solo estrecha el TIPO de lo que manda (`lapSectors`), ordena y
// formatea; nunca suma ni compara tiempos de vuelta.
it("reads sectorsMs only in analysis-sectors.ts", () => {
  expect(
    sources
      .filter(({ text }) => text.includes("sectorsMs"))
      .map(({ path }) => path),
  ).toEqual(["app/analysis-sectors.ts"]);
});
it.each([
  "app/analysis-sectors.ts",
  "ui/analysis/SectorCells.tsx",
  "ui/analysis/SectorComparison.tsx",
])("%s never adds up sector times", (path) => {
  expect(code(path)).not.toMatch(
    /\breduce\b|\bsum\b|\+=|[\w)\]]\s*\+\s*[\w([]/,
  );
});
it("only the narrowing function compares or measures sector values", () => {
  const text = code("app/analysis-sectors.ts");
  const narrowing = text.match(/export function lapSectors[\s\S]*?\n}\n/)?.[0];
  expect(narrowing).toBeTruthy();
  const rest = text.replace(narrowing ?? "", "").replaceAll("=>", "");
  expect(rest).not.toMatch(
    /\.length|isFinite|isNaN|Math\.abs|\s[<>]=?\s*-?0\b/,
  );
  expect(narrowing).not.toMatch(/\breduce\b|\bsum\b|[\w)\]]\s*\+\s*[\w([]/);
});
