import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PNG } from "pngjs";
import { compareImages } from "./visual-diff/image.ts";
import { referenceReceiptHash } from "./visual-diff/reference-hash.ts";

const evidence = resolve(process.argv[2]);
const references = resolve(process.argv[3]);
const docs = "docs/marco-barrido";
await mkdir(join(docs, "recortes"), { recursive: true });
await mkdir(join(evidence, "diffs"), { recursive: true });
const results = [];
const crops = [
  { id: "M01", expanded: false, rect: [1194, 0, 100, 52] },
  { id: "M02", expanded: true, rect: [900, 0, 200, 52] },
  { id: "M03", expanded: false, rect: [0, 780, 76, 74] },
];
for (const theme of ["dark", "light"]) {
  for (const expanded of [false, true]) {
    const sidebar = expanded ? "expanded" : "collapsed";
    const ref = join(references, theme, `ajustes-aplicacion-${sidebar}.png`);
    const original = await readFile(ref);
    const receipt = JSON.parse(await readFile(`${ref}.capture.json`, "utf8"));
    assert.equal(referenceReceiptHash(original), receipt.png);
    const sources = [original];
    const row = { theme, sidebar, reference: ref, before: 0, after: 0 };
    for (const phase of ["before", "after-fixed"] as const) {
      const current = await readFile(
        join(
          evidence,
          phase,
          "ajustes-aplicacion",
          theme,
          "ajustes-aplicacion",
          `sidebar-${sidebar}.png`,
        ),
      );
      sources.push(current);
      const result = compareImages(original, current);
      await writeFile(
        join(evidence, "diffs", `${theme}-${sidebar}-${phase}.png`),
        result.diff,
      );
      row[phase === "before" ? "before" : "after"] = result.perceptualPercent;
    }
    results.push(row);
    const images = sources.map((source) => PNG.sync.read(source));
    for (const crop of crops.filter((crop) => crop.expanded === expanded)) {
      const [x, y, width, height] = crop.rect;
      const output = new PNG({ width: width * 3, height });
      for (const [index, image] of images.entries())
        PNG.bitblt(image, output, x, y, width, height, index * width, 0);
      const name = `${crop.id}-${theme}.png`;
      await writeFile(join(docs, "recortes", name), PNG.sync.write(output));
    }
  }
}
await writeFile(
  join(docs, "resultados.json"),
  JSON.stringify(results, null, 2),
);
const report = `# Marco: paridad del barrido

M01: silueta v-side en el panel y en los controles compartidos del raíl. M02: pestañas parcialmente recortadas ocultas enteras; siguen en el orden del teclado, y End/Home desplazan la pestaña enfocada hasta mostrarla completa. M03: misma luz, borde y sombra del GPUI en el raíl contraído, con los tokens existentes. No cambia la API SectionChrome ni las pantallas de otros workers.

Capturas reales HWND 1440×900, Vantare, escala 1, oscuro/claro y raíl contraído/expandido, de una en una con captura.lock. Antes: producto nightly 3be885989; después: este cambio. Referencias y recibos del barrido #2114 sin modificar. Pixelmatch umbral 0,1, antialias incluido, imagen completa sin máscaras; las diferencias restantes de contenido y otras pantallas no se disimulan.

| Tema | Raíl | Antes % | Después % |
|---|---|---:|---:|
${results.map((row) => `| ${row.theme} | ${row.sidebar} | ${row.before.toFixed(4)} | ${row.after.toFixed(4)} |`).join("\n")}

## Recortes reales: GPUI · antes · después

${crops.map((crop) => `### ${crop.id}\n\n![Oscuro](recortes/${crop.id}-dark.png)\n\n![Claro](recortes/${crop.id}-light.png)`).join("\n\n")}

El chequeo del paquete prueba End → Diagnóstico → Home → Cuenta → General, recorte completo, SVG del panel y sombra activa en los cuatro estados. Recibos en after-fixed/ajustes-aplicacion/{dark,light}/ajustes-aplicacion/frame-checks.json. Un píxel libre al final del listado evita el redondeo entero de scrollWidth en Chromium; no cambia las medidas de las pestañas. ResizeObserver y el listener de scroll se retiran al desmontar.

Originales, diferencias y logs: ${evidence}. Reproducir con sweep-capture.ps1 y VANTARE_HUB_FRAME_ASSERT=1 para el paquete corregido; después node --experimental-strip-types scripts/frame-parity-report.ts <evidencia> <referencias-del-barrido>. No se compila GPUI, no se añaden dependencias y no se cambia el contrato ni el paquete distribuido.
`;
await writeFile(join(docs, "INFORME.md"), report);
await writeFile(join(evidence, "INFORME.md"), report);
console.log(JSON.stringify(results, null, 2));
