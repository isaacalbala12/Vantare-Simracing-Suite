import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { compareImages } from "./visual-diff/image.ts";
import { referenceReceiptHash } from "./visual-diff/reference-hash.ts";

const root = resolve(
  process.argv[2] ?? "D:/VantareServer/evidence/hub-web/barrido-paridad",
);
const references = "D:/VantareServer/evidence/hub-web/referencia-gpui";
const inventory = JSON.parse(
  await readFile("docs/barrido-paridad/scenes.json", "utf8"),
) as { scene: string; owner: string; section: string; frameless: boolean }[];
const aliases: Record<string, string> = {
  "calendario-r6-proximas": "calendario-proximas-contraida",
  "calendario-r6-mias": "calendario-mias-contraida",
  "calendario-r6-semana": "calendario-semana-contraida",
  "calendario-mes": "calendario-mes-contraida",
};
const results = [];
const rows = [];
for (const item of inventory) {
  const cells = [];
  for (const theme of ["dark", "light"])
    for (const expanded of [false, true]) {
      const current = join(
        root,
        "captures",
        item.scene,
        theme,
        item.scene,
        `sidebar-${expanded ? "expanded" : "collapsed"}.png`,
      );
      const special = join(
        root,
        "references",
        theme,
        `${item.scene}-${expanded ? "expanded" : "collapsed"}.png`,
      );
      let reference = special;
      try {
        await readFile(reference);
      } catch {
        const r6 = item.scene.startsWith("calendario-r6-");
        if (expanded && !item.frameless && !r6) {
          cells.push("Sin referencia expandida");
          results.push({
            ...item,
            theme,
            expanded,
            status: "missing-reference",
            current,
            reference,
          });
          continue;
        }
        reference = join(
          references,
          theme,
          `${expanded ? item.scene : (aliases[item.scene] ?? item.scene)}.png`,
        );
      }
      try {
        const actual = await readFile(current);
        const expected = await readFile(reference);
        const receipt = JSON.parse(
          await readFile(`${reference}.capture.json`, "utf8"),
        );
        if (referenceReceiptHash(expected) !== receipt.png)
          throw new Error("Reference receipt mismatch");
        const comparison = compareImages(expected, actual);
        const diff = join(
          root,
          "diff",
          theme,
          `${item.scene}-${expanded ? "expanded" : "collapsed"}.png`,
        );
        await mkdir(join(root, "diff", theme), { recursive: true });
        await writeFile(diff, comparison.diff);
        results.push({
          ...item,
          theme,
          expanded,
          status: "compared",
          current,
          reference,
          diff,
          perceptualPercent: comparison.perceptualPercent,
          exactPercent: comparison.exactPercent,
        });
        cells.push(
          `${comparison.perceptualPercent.toFixed(2).replace(".", ",")} %${item.frameless ? " †" : ""}`,
        );
      } catch (error) {
        cells.push("Pendiente / no comparable");
        results.push({
          ...item,
          theme,
          expanded,
          status: "unavailable",
          current,
          reference,
          error: String(error),
        });
      }
    }
  rows.push(
    `| ${item.section} · ${item.scene} | ${item.owner} | ${cells.join(" | ")} |`,
  );
}
const complete = results.every((result) => result.status === "compared");
const report = `# Barrido de paridad del Hub — ${complete ? "capturas completas" : "informe parcial"}

UI congelada: nightly \`9401501ea38f2e8fe65584511f27844c7efd157a\`. Candidato QA aislado construido una vez; no sustituye al Hub distribuido. Capturas HWND reales, 1440×900, Vantare, 100 %, seriadas mediante cerrojo global.

Porcentaje perceptual: pixelmatch 8.0.0, umbral 0,1, antialias incluido, imagen completa sin máscaras ni alineación. Se verifica el recibo de la referencia antes de comparar. No equivale a una valoración humana. † Puerta sin barra: ambos estados usan la misma captura real, no son dos disposiciones diferentes.

| Pantalla | Responsable | Oscuro contraída | Oscuro expandida | Claro contraída | Claro expandida |
|---|---|---:|---:|---:|---:|
${rows.join("\n")}

## Diferencias visibles

Revisión visual y recortes pendientes. Los fallos de captura y referencias ausentes se conservan en results.json; no se interpretan como diferencias del producto. Studio excluido por encargo. Buzón de Launcher pendiente de integración.
`;
await mkdir(root, { recursive: true });
await writeFile(join(root, "results.json"), JSON.stringify(results, null, 2));
await writeFile(join(root, "INFORME.md"), report);
await writeFile("docs/barrido-paridad/INFORME.md", report);
console.log(
  `${results.filter((result) => result.status === "compared").length}/${results.length} comparaciones disponibles`,
);
