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
        cells.push(
          item.scene === "calendario-mes"
            ? "No integrada"
            : "No comparable; ver límites",
        );
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
const complete = process.argv.includes("--complete");
const differences = await readFile(join(root, "DIFERENCIAS.md"), "utf8").catch(
  () => "## Diferencias visibles\n\nRevisión y recortes pendientes.\n",
);
const unavailable = results.filter((result) => result.status !== "compared");
const report = `# Barrido de paridad del Hub — ${complete ? "primera versión completa, con límites" : "informe parcial"}

UI congelada: nightly \`9401501ea38f2e8fe65584511f27844c7efd157a\`. Candidato QA aislado construido una vez; no sustituye al Hub distribuido. Capturas HWND reales, 1440×900, Vantare, 100 %, seriadas mediante cerrojo global.

Porcentaje perceptual: pixelmatch 8.0.0, umbral 0,1, antialias incluido, imagen completa sin máscaras ni alineación. Se verifica el recibo de la referencia antes de comparar. No equivale a una valoración humana. † Puerta sin barra: ambos estados usan la misma captura real, no son dos disposiciones diferentes.

Fuentes verificadas en los recibos fonts.json: Inter 400/500/600/650/700/750/800, Space Mono y Rajdhani. devicePixelRatio=1 y zoom=1. El inventario contiene ${inventory.length} escenas y cuatro columnas; los PNG de diferencia representan el cambio RGBA exacto y los porcentajes de la tabla usan el criterio perceptual anterior.

| Pantalla | Responsable | Oscuro contraída | Oscuro expandida | Claro contraída | Claro expandida |
|---|---|---:|---:|---:|---:|
${rows.join("\n")}

${differences}

## Límites y diferencias de datos

- Studio se excluye por encargo. El buzón de Launcher y los módulos sin entry.tsx en el corte (Workshop y Telemetría) no están en este candidato. Las integraciones posteriores al corte requieren otro barrido; no se atribuyen al binario congelado.
- Mes no está integrada: CalendarWeekView recibe onSpan undefined y el control queda deshabilitado. Se conserva la captura de diagnóstico del intento; no se presenta Semana como si fuera Mes.
- Notificaciones: el doble actual arranca vacío. Se abrió la vista completa mediante una notificación de prueba local; la referencia GPUI contiene cinco avisos preparados. Sus porcentajes incluyen esa diferencia de datos y no sirven para atribuir todo el cambio al estilo. No se modificó la pantalla ni su mock para disimularlo.
- Cuestionarios y Comunidad tienen algunas leyendas de estado QA distintas; quedan visibles en las imágenes. Inicio usa SVG estáticos de widgets, diferencia autorizada frente al renderizado real del GPUI.
- En Calendario se conservan las referencias contraídas del worker D y las R6 expandidas originales, con sus recibos. Las nuevas referencias se guardan en references/ sin sobrescribir las originales. Las puertas no tienen disposición expandida.
- Resultados no comparables: ${unavailable.length}. Detalle completo y errores en resultados.json/results.json; los fallos de captura no se cuentan como diferencias del producto.

${unavailable.map((item) => `- ${item.scene} / ${item.theme} / ${item.expanded ? "expandida" : "contraída"}: ${"error" in item ? item.error : item.status}`).join("\n")}

## Reproducción y evidencia

Desde hub-web: scripts/sweep-capture.ps1 -Scenes <escenas> -Output <evidencia>/captures -Binary <candidato>/vantare-hub-ui.exe; scripts/sweep-references.ps1 -Scenes <escenas> -Output <evidencia>/references; node --experimental-strip-types scripts/sweep-report.ts <evidencia> --complete. Solo Windows, cerrojo global obligatorio y ninguna compilación propia simultánea. Las herramientas toman el cerrojo y lo liberan al terminar cada escena.

Cada captura incluye instancia, ventana, fuentes, stderr y cierre del proceso; cada referencia nueva incluye bank.json/recibo de captura y recibo de la entrada para cambiar la barra. Los recortes se versionan; los originales a resolución completa permanecen en D:/VantareServer/evidence/hub-web/barrido-paridad/.
`;
await mkdir(root, { recursive: true });
await writeFile(join(root, "results.json"), JSON.stringify(results, null, 2));
await writeFile(
  "docs/barrido-paridad/resultados.json",
  JSON.stringify(results, null, 2),
);
await writeFile(join(root, "INFORME.md"), report);
await writeFile("docs/barrido-paridad/INFORME.md", report);
console.log(
  `${results.filter((result) => result.status === "compared").length}/${results.length} comparaciones disponibles`,
);
