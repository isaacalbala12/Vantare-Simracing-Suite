import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PNG } from "pngjs";
import { compareImages } from "./visual-diff/image.ts";
import { referenceReceiptHash } from "./visual-diff/reference-hash.ts";
import { validateReferenceState } from "./visual-diff/reference-state.ts";

const root = process.argv[2];
assert.ok(root, "Usage: bun scripts/visual-pass-changes.ts <evidence>");
const changes: { pr: number; screen: string; scene: string }[] = JSON.parse(
  await readFile(join(root, "cambios.json"), "utf8"),
);
for (const change of changes) {
  const destination = join(root, `PR-${change.pr}`);
  await mkdir(destination, { recursive: true });
  const rows = [];
  const text = [
    `# ${change.screen} · PR #${change.pr}`,
    "",
    "Porcentaje perceptual de ventana completa: pixelmatch 8.0.0, umbral 0,1, antialias incluido; sin máscaras, recortes ni escalado. R = referencia GPUI; A = antes; D = después. El par muestra referencia a la izquierda y después a la derecha.",
    "",
    "El candidato QA reúne estilos independientes de las cuatro pantallas; sus archivos de UI coinciden con los de cada PR (CANDIDATO-DESPUES.json). No se distribuye ni integra esta rama. Los recibos de cierre se conservan: una finalización forzada de QA no se presenta como salida normal.",
    "",
    "| Tamaño | Tema | Barra | Diferencia antes → después | Capturas |",
    "|---|---|---|---:|---|",
  ];
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
  ])
    for (const theme of ["dark", "light"])
      for (const side of ["collapsed", "expanded"]) {
        const size = `${width}x${height}`;
        const reference = join(
          root,
          "referencias",
          size,
          theme,
          `${change.scene}-${side}.png`,
        );
        const before = join(
          root,
          "antes",
          size,
          change.scene,
          theme,
          change.scene,
          `sidebar-${side}.png`,
        );
        const after = join(
          root,
          "despues",
          size,
          change.scene,
          theme,
          change.scene,
          `sidebar-${side}.png`,
        );
        const original = await readFile(reference);
        const receipt = JSON.parse(
          await readFile(`${reference}.capture.json`, "utf8"),
        );
        assert.equal(referenceReceiptHash(original), receipt.png);
        validateReferenceState(
          change.scene,
          original,
          await readFile(
            join(
              root,
              "referencias",
              size,
              theme,
              `ajustes-aplicacion-${side}.png`,
            ),
          ),
          side === "expanded",
        );
        const a = compareImages(original, await readFile(before));
        const candidate = await readFile(after);
        const b = compareImages(original, candidate);
        const folder = join(destination, size, theme, side);
        await mkdir(folder, { recursive: true });
        await writeFile(join(folder, "diff-antes.png"), a.diff);
        await writeFile(join(folder, "diff-despues.png"), b.diff);
        const left = PNG.sync.read(original),
          right = PNG.sync.read(candidate);
        const pair = new PNG({ width: width * 2, height });
        for (let y = 0; y < height; y++) {
          left.data.copy(
            pair.data,
            y * width * 8,
            y * width * 4,
            (y + 1) * width * 4,
          );
          right.data.copy(
            pair.data,
            y * width * 8 + width * 4,
            y * width * 4,
            (y + 1) * width * 4,
          );
        }
        const pairPath = join(folder, "referencia-despues.png");
        await writeFile(pairPath, PNG.sync.write(pair));
        const instance = JSON.parse(
          await readFile(
            join(
              root,
              "despues",
              size,
              change.scene,
              theme,
              change.scene,
              "instance.json",
            ),
            "utf8",
          ),
        );
        rows.push({
          size,
          theme,
          side,
          beforePercent: a.perceptualPercent,
          afterPercent: b.perceptualPercent,
          beforeExact: a.exactPercent,
          afterExact: b.exactPercent,
          reference,
          before,
          after,
          afterAsar: instance.asarSha256,
          afterSource: instance.qaSource,
        });
        const link = (label: string, path: string) =>
          `[${label}](${path.replaceAll("\\", "/")})`;
        text.push(
          `| ${size} | ${theme} | ${side} | ${a.perceptualPercent.toFixed(2)} % → ${b.perceptualPercent.toFixed(2)} % | ${link("R", reference)} ${link("A", before)} ${link("D", after)} ${link("par", pairPath)} |`,
        );
      }
  await writeFile(join(destination, "RESULTADOS.md"), `${text.join("\n")}\n`);
  await writeFile(
    join(destination, "metricas.json"),
    JSON.stringify(rows, null, 2),
  );
}
