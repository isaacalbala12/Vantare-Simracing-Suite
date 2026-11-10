import { readdir, readFile } from "node:fs/promises";

async function* files(folder: string): AsyncGenerator<string> {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = `${folder}/${entry.name}`;
    if (entry.isDirectory()) yield* files(path);
    else if (/\.(css|tsx?|html)$/.test(path)) yield path;
  }
}
let failed = false;
for await (const path of files("src/renderer")) {
  if (path.includes("/generated/") || path.includes("/assets/")) continue;
  const source = await readFile(path, "utf8");
  if (
    /#[0-9a-f]{3,8}\b|\brgba?\s*\(|\[[^\]]*(?:\dpx|#[0-9a-f])[^\]]*\]|style=\{\{\s*(?:color|background|border)/i.test(
      source,
    )
  ) {
    console.error(`${path}: visual value outside tokens`);
    failed = true;
  }
  if (path.includes("/screens/") && /(?:className|style)=/.test(source)) {
    console.error(`${path}: screen must compose ui components`);
    failed = true;
  }
  if (!path.endsWith(".tsx") || path.includes("/i18n/")) continue;
  // Static JSX literals; translated expressions remain in i18n/es.ts.
  if (
    />[\t ]*[^<>{}\s][^<>{}]*</u.test(source) ||
    /(?:aria-label|placeholder|title|alt)="[^"]+"/u.test(source)
  ) {
    console.error(`${path}: literal translated JSX`);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
