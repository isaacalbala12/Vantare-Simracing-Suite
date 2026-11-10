import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root =
  process.env.VANTARE_HUB_COMPARISON_ROOT ?? resolve("test-results/comparison");
const destination = join(root, "ajustes-general", "comparacion.html");
const rows = [
  {
    title: "General · claro",
    old: "light/ajustes-aplicacion.png",
    current: "general-light.png",
  },
  {
    title: "General · oscuro",
    old: "dark/ajustes-aplicacion.png",
    current: "general-dark.png",
  },
  {
    title: "Apariencia · claro (Iris en la nueva captura)",
    old: "light/ajustes-apariencia.png",
    current: "appearance-light.png",
  },
];
const url = (path: string) => pathToFileURL(resolve(path)).href;
const figures = rows
  .map(
    (row) =>
      `<section><h2>${row.title}</h2><div class="pair"><figure><figcaption>Hub GPUI · referencia inicial</figcaption><img alt="Referencia GPUI" src="${url(join(root, "referencia-gpui", row.old))}"></figure><figure><figcaption>Hub Electron · Chromium Windows · QA</figcaption><img alt="Hub nuevo" src="${url(join(root, "ajustes-general/web", row.current))}"></figure></div></section>`,
  )
  .join("\n");
await mkdir(join(root, "ajustes-general"), { recursive: true });
await writeFile(
  destination,
  `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VANTA-138 · Comparación de Ajustes</title><style>body{font:16px system-ui;margin:24px;background:#eee;color:#111}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%;height:auto}section{margin-block:32px}figcaption{margin-block:8px}</style><h1>Ajustes · GPUI y Hub nuevo</h1><p>Comparación para revisión humana. Es un rediseño: no se exige igualdad de píxeles. Las capturas del Hub nuevo muestran la escena QA y sus estados guardados durante la prueba; la paleta Iris está indicada en Apariencia.</p>${figures}</html>`,
  "utf8",
);
console.log(destination);
