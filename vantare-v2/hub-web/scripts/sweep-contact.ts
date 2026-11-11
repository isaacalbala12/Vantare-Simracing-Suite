import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PNG } from "pngjs";

const root =
  process.argv[2] ?? "D:/VantareServer/evidence/hub-web/barrido-paridad";
const inventory = JSON.parse(
  await readFile("docs/barrido-paridad/scenes.json", "utf8"),
) as { scene: string }[];
const theme = process.argv[3] ?? "dark";
const referenceMode = process.argv.includes("--references");
const sources: { scene: string; image: PNG }[] = [];
for (const { scene } of inventory) {
  try {
    const image = PNG.sync.read(
      await readFile(
        referenceMode
          ? join(
              "D:/VantareServer/evidence/hub-web/referencia-gpui",
              theme,
              `${scene}.png`,
            )
          : join(
              root,
              "captures",
              scene,
              theme,
              scene,
              "sidebar-collapsed.png",
            ),
      ),
    );
    sources.push({ scene, image });
  } catch {
    /* Missing captures remain listed in the report. */
  }
}
const sheet = new PNG({
  width: 1440,
  height: Math.max(1, Math.ceil(sources.length / 4)) * 225,
});
sheet.data.fill(255);
for (const [index, { image }] of sources.entries()) {
  const left = (index % 4) * 360;
  const top = Math.floor(index / 4) * 225;
  for (let y = 0; y < 225; y++)
    for (let x = 0; x < 360; x++) {
      const source = (y * 4 * image.width + x * 4) * 4;
      const destination = ((top + y) * sheet.width + left + x) * 4;
      image.data.copy(sheet.data, destination, source, source + 4);
    }
}
await writeFile(
  join(root, `contact-${referenceMode ? "reference-" : ""}${theme}.png`),
  PNG.sync.write(sheet),
);
await writeFile(
  join(root, `contact-${theme}.json`),
  JSON.stringify(
    sources.map(({ scene }, index) => ({
      scene,
      index,
      row: Math.floor(index / 4),
      column: index % 4,
    })),
    null,
    2,
  ),
);
