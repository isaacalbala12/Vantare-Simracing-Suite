import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PNG } from "pngjs";

const root =
  process.argv[2] ?? "D:/VantareServer/evidence/hub-web/barrido-paridad";
const specifications = [
  {
    id: "M01",
    owner: "marco compartido",
    priority: "P2 visual",
    scene: "ajustes-aplicacion",
    expanded: false,
    rect: [1194, 0, 100, 52],
    description:
      "El botón del panel derecho usa i-panel; el GPUI usa v-side. La silueta es distinta en todas las pantallas con marco.",
  },
  {
    id: "M02",
    owner: "marco compartido",
    priority: "P2 visual",
    scene: "ajustes-aplicacion",
    expanded: true,
    rect: [900, 0, 200, 52],
    description:
      "Con la barra expandida, la última pestaña asoma cortada junto a las acciones; el GPUI la oculta completa. Revisar reparto de anchura y recorte de la barra superior.",
  },
  {
    id: "B01",
    owner: "pantalla de B · Roadmap",
    priority: "P2 visual",
    scene: "roadmap-base",
    expanded: false,
    rect: [100, 350, 996, 530],
    description:
      "Las tres columnas vacías de Circuito se compactan a unas filas; en GPUI ocupan el espacio vertical hasta el pie del contenido.",
  },
  {
    id: "B02",
    owner: "pantalla de B · Inicio",
    priority: "diferencia conocida",
    scene: "inicio-base",
    expanded: false,
    rect: [116, 428, 455, 230],
    description:
      "La vista previa de overlays usa SVG estáticos y tiene una composición distinta al layout real del GPUI. Esta diferencia fue autorizada; se conserva sin disfrazarla como paridad.",
  },
  {
    id: "D01",
    owner: "pantalla de D · Testing Center",
    priority: "P2 visual",
    scene: "testing-center-cuestionarios",
    expanded: false,
    rect: [100, 279, 996, 603],
    description:
      "La lista del cuestionario pierde la altura libre del GPUI y adelanta el formulario de respuesta aproximadamente 200 px. También cambia el texto de estado del doble QA.",
  },
  {
    id: "A01",
    owner: "pantalla de A · Cuenta",
    priority: "desviación deliberada",
    scene: "cuenta-base",
    expanded: false,
    rect: [1136, 370, 288, 115],
    description:
      "Restablecer dispositivo queda inactivo en la escena demo del Hub nuevo. La guarda de sesión y la confirmación fueron aprobadas expresamente; no se retiran para reducir la diferencia numérica.",
  },
];
const rows = [];
await mkdir(join(root, "recortes"), { recursive: true });
await mkdir("docs/barrido-paridad/recortes", { recursive: true });
for (const specification of specifications) {
  const { scene, expanded, rect, id } = specification;
  const mode = expanded ? "expanded" : "collapsed";
  let reference = join(root, "references", "dark", `${scene}-${mode}.png`);
  try {
    await readFile(reference);
  } catch {
    reference = join(
      "D:/VantareServer/evidence/hub-web/referencia-gpui/dark",
      `${scene}.png`,
    );
  }
  const current = join(
    root,
    "captures",
    scene,
    "dark",
    scene,
    `sidebar-${mode}.png`,
  );
  try {
    const buffers = await Promise.all([readFile(reference), readFile(current)]);
    const images = buffers.map((buffer) => PNG.sync.read(buffer));
    const [x, y, width, height] = rect;
    const pair = new PNG({ width: width * 2 + 8, height });
    pair.data.fill(255);
    for (const [index, image] of images.entries())
      for (let row = 0; row < height; row++) {
        const start = ((y + row) * image.width + x) * 4;
        image.data.copy(
          pair.data,
          (row * pair.width + index * (width + 8)) * 4,
          start,
          start + width * 4,
        );
      }
    const png = PNG.sync.write(pair);
    await writeFile(join(root, "recortes", `${id}.png`), png);
    await writeFile(`docs/barrido-paridad/recortes/${id}.png`, png);
    rows.push({
      ...specification,
      reference,
      current,
      sha256: buffers.map((buffer) =>
        createHash("sha256").update(buffer).digest("hex"),
      ),
    });
  } catch (error) {
    rows.push({ ...specification, error: String(error) });
  }
}
await writeFile(join(root, "recortes.json"), JSON.stringify(rows, null, 2));
await writeFile(
  "docs/barrido-paridad/recortes.json",
  JSON.stringify(rows, null, 2),
);
await writeFile(
  join(root, "DIFERENCIAS.md"),
  `## Diferencias visibles priorizadas\n\nRecortes sin escalar: GPUI a la izquierda, Hub nuevo a la derecha; la franja blanca solo separa ambas imágenes. Fuentes, coordenadas y SHA-256 en recortes.json.\n\n${rows.map((row) => `### ${row.id} · ${row.priority} · ${row.owner}\n\n${row.description}\n\n${"error" in row ? String(row.error) : `![${row.id}](recortes/${row.id}.png)`}`).join("\n\n")}\n`,
);
