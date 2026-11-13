import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PNG } from "pngjs";
import { compareImages } from "./visual-diff/image.ts";
import { referenceReceiptHash } from "./visual-diff/reference-hash.ts";

const root = process.argv[2];
if (!root)
  throw new Error("Usage: bun scripts/visual-pass-report.ts <evidence>");
const scenes: { screen: string; scene: string }[] = JSON.parse(
  await readFile(join(root, "escenas.json"), "utf8"),
);
const limit = Number(process.argv[3] ?? scenes.length);
if (!Number.isInteger(limit) || limit < 1)
  throw new Error("Invalid scene limit");
const defects: Record<string, string[]> = JSON.parse(
  await readFile(join(root, "defectos.json"), "utf8").catch(() => "{}"),
);
const link = (label: string, path: string) =>
  `[${label}](${path.replaceAll("\\", "/")})`;
const records = [];
const lines = [
  "# Pasada visual completa · VANTA-138",
  "",
  "Producto: nightly e689cba4f, candidato QA aislado. 100 %, paleta Vantare, fuentes locales. Sin cuentas ni servicios reales. Capturas seriadas con captura.lock y sin compilaciones simultáneas.",
  "",
  "Porcentaje perceptual: pixelmatch 8.0.0, umbral 0,1 y antialias incluido, ventana completa sin máscaras, escalado ni alineación. Se valida el recibo de cada referencia GPUI. Studio usa la maqueta A vigente con las mismas fuentes y Chromium. Una referencia ausente no recibe un porcentaje inventado. P1: roto/ilegible; P2: claramente distinto; P3: detalle. Las cifras no sustituyen la inspección visual.",
  "",
  "Cada celda enlaza referencia, producto y diferencia. D/C = oscuro/claro; P/A = barra plegada/abierta. Pendiente de inspección no significa ausencia de defectos.",
  "",
  "| Pantalla / escena | 1440 D/P | 1440 D/A | 1440 C/P | 1440 C/A | 1280 D/P | 1280 D/A | 1280 C/P | 1280 C/A | Defectos concretos |",
  "|---|---|---|---|---|---|---|---|---|---|",
];
for (const [index, { screen, scene }] of scenes.entries()) {
  if (index >= limit) {
    lines.push(
      `| ${screen} · ${scene} | ${Array(8).fill("Métrica pendiente").join(" | ")} | ${(defects[scene] ?? ["Pendiente de inspección visual"]).join("<br>")} |`,
    );
    continue;
  }
  const cells = [];
  for (const width of [1440, 1280]) {
    const size = `${width}x${width === 1440 ? 900 : 800}`;
    for (const theme of ["dark", "light"]) {
      const directory = join(root, "antes", size, scene, theme, scene);
      for (const expanded of [false, true]) {
        const side = expanded ? "expanded" : "collapsed";
        const current = join(directory, `sidebar-${side}.png`);
        const reference = scene.startsWith("studio-")
          ? join(
              root,
              "comparaciones",
              size,
              theme,
              scene,
              side,
              "reference.png",
            )
          : join(root, "referencias", size, theme, `${scene}-${side}.png`);
        const destination = join(root, "diferencias", size, theme, scene, side);
        try {
          const candidate = await readFile(current);
          const original = await readFile(reference);
          const receipt = scene.startsWith("studio-")
            ? undefined
            : JSON.parse(await readFile(`${reference}.capture.json`, "utf8"));
          if (receipt && receipt.png !== referenceReceiptHash(original))
            throw new Error("Recibo de referencia incorrecto");
          const result = compareImages(original, candidate);
          await mkdir(destination, { recursive: true });
          await writeFile(join(destination, "diff.png"), result.diff);
          const a = PNG.sync.read(original);
          const b = PNG.sync.read(candidate);
          const pair = new PNG({ width: a.width * 2, height: a.height });
          const row = a.width * 4;
          for (let y = 0; y < a.height; y++) {
            a.data.copy(pair.data, y * row * 2, y * row, (y + 1) * row);
            b.data.copy(pair.data, y * row * 2 + row, y * row, (y + 1) * row);
          }
          await writeFile(join(destination, "par.png"), PNG.sync.write(pair));
          records.push({
            scene,
            screen,
            size,
            theme,
            side,
            percent: result.perceptualPercent,
            reference,
            current,
            referenceSha256: createHash("sha256")
              .update(original)
              .digest("hex"),
            currentSha256: createHash("sha256").update(candidate).digest("hex"),
          });
          cells.push(
            `${result.perceptualPercent.toFixed(2)} % · ${link("R", reference)} ${link("P", current)} ${link("par", join(destination, "par.png"))} ${link("Δ", join(destination, "diff.png"))}`,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          records.push({ scene, screen, size, theme, side, error: message });
          cells.push(
            (await readFile(current).catch(() => undefined))
              ? `${link("P", current)} · referencia pendiente/no válida`
              : "Captura pendiente",
          );
        }
      }
    }
  }
  lines.push(
    `| ${screen} · ${scene} | ${cells.join(" | ")} | ${(defects[scene] ?? ["Pendiente de inspección visual"]).join("<br>")} |`,
  );
  await writeFile(join(root, "TABLA.md"), `${lines.join("\n")}\n`);
  await writeFile(
    join(root, "metricas.json"),
    JSON.stringify(records, null, 2),
  );
}
await writeFile(join(root, "TABLA.md"), `${lines.join("\n")}\n`);
await writeFile(join(root, "metricas.json"), JSON.stringify(records, null, 2));
