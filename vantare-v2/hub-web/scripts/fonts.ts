import { copyFile, mkdir } from "node:fs/promises";

const output = "src/renderer/assets/fonts";
await mkdir(output, { recursive: true });
await copyFile(
  "../native/ui/assets/Inter-Variable.woff2",
  `${output}/Inter-Variable.woff2`,
);
for (const file of [
  "Rajdhani.ttf",
  "SpaceMono.ttf",
  "OFL-Inter.txt",
  "Rajdhani-OFL.txt",
  "SpaceMono-OFL.txt",
])
  await copyFile(`../native/ui/assets/fonts/${file}`, `${output}/${file}`);
