import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";
import { compareImages } from "./visual-diff/image.ts";
import { referenceReceiptHash } from "./visual-diff/reference-hash.ts";
import { validateReferenceState } from "./visual-diff/reference-state.ts";
import { verifyPrototypeReceipt } from "./visual-pass-prototype.ts";

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
const prototypeBytes = await readFile(
  join(root, "../studio-rediseno/variante-a.html"),
).catch(() => undefined);
const prototypeHash = prototypeBytes
  ? createHash("sha256").update(prototypeBytes).digest("hex")
  : undefined;
const referenceLimitations: {
  id: string;
  sourceSha256: string;
  screen: string;
  sidebar: string;
  sizes: string[];
  reason: string;
}[] = JSON.parse(
  await readFile(join(root, "referencias-defectuosas.json"), "utf8").catch(
    () => "[]",
  ),
);
const records = [];
const lines = [
  "# Pasada visual · VANTA-138",
  "",
  "Línea base: nightly e689cba4f. Se muestran las capturas posteriores cuando existen (D), y la base (A) en el resto. Cada candidato es exclusivamente QA, con procedencia por ASAR y blobs en CANDIDATO-DESPUES.json. 100 %, paleta Vantare, fuentes locales; sin cuentas ni servicios reales. Capturas en serie con captura.lock, sin compilaciones simultáneas y con huecos entre bloques.",
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
        const before = join(directory, `sidebar-${side}.png`);
        const after = join(
          root,
          "despues",
          size,
          scene,
          theme,
          scene,
          `sidebar-${side}.png`,
        );
        const current = existsSync(after) ? after : before;
        const phase = current === after ? "D" : "A";
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
          if (!scene.startsWith("studio-")) {
            const template = await readFile(
              join(
                root,
                "referencias",
                size,
                theme,
                `ajustes-aplicacion-${side}.png`,
              ),
            );
            const bank = JSON.parse(
              await readFile(`${reference}.bank.json`, "utf8").catch(
                () => "null",
              ),
            );
            validateReferenceState(
              scene,
              original,
              template,
              expanded,
              bank ?? undefined,
            );
          }
          if (scene.startsWith("studio-")) {
            if (!prototypeHash) throw new Error("Missing prototype source");
            const receipt = JSON.parse(
              await readFile(
                join(dirname(reference), "reference.json"),
                "utf8",
              ),
            );
            const browser = JSON.parse(
              await readFile(join(dirname(current), "browser.json"), "utf8"),
            );
            const fonts = JSON.parse(
              await readFile(
                join(dirname(current), "../..", "font-sources.json"),
                "utf8",
              ),
            );
            verifyPrototypeReceipt(receipt, {
              sourceSha256: prototypeHash,
              state: scene.replace("studio-estado-", ""),
              theme,
              sidebar: expanded ? "open" : "closed",
              dimensions: [width, width === 1440 ? 900 : 800],
              browser,
              fontHashes: fonts.native.map(
                (font: { sha256: string }) => font.sha256,
              ),
            });
          }
          const limitation = referenceLimitations.find(
            (item) =>
              item.screen === screen &&
              item.sidebar === side &&
              item.sizes.includes(size) &&
              item.sourceSha256 === prototypeHash,
          );
          const instance = JSON.parse(
            await readFile(
              join(dirname(current), "instance.json"),
              "utf8",
            ).catch(() => "null"),
          );
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
            phase,
            productAsar: instance?.asarSha256,
            productSource: instance?.qaSource,
            referenceLimitation: limitation,
            reference,
            current,
            referenceSha256: createHash("sha256")
              .update(original)
              .digest("hex"),
            currentSha256: createHash("sha256").update(candidate).digest("hex"),
          });
          cells.push(
            `${phase} ${result.perceptualPercent.toFixed(2)} %${limitation ? ` · ${limitation.id} (referencia contradictoria; cifra bruta)` : ""} · ${link("R", reference)} ${link("P", current)} ${link("par", join(destination, "par.png"))} ${link("Δ", join(destination, "diff.png"))}${existsSync(join(dirname(current), `focus-${side}.png`)) ? ` ${link("foco", join(dirname(current), `focus-${side}.png`))}` : ""}`,
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
