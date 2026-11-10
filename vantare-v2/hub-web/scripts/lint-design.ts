import { readdir, readFile } from "node:fs/promises";
import { parse } from "@babel/parser";

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
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (
      node.type === "JSXText" &&
      typeof node.value === "string" &&
      node.value.trim()
    ) {
      console.error(`${path}: literal JSX text`);
      failed = true;
    }
    if (
      node.type === "JSXAttribute" &&
      node.name &&
      typeof node.name === "object" &&
      node.value &&
      typeof node.value === "object"
    ) {
      const name = (node.name as Record<string, unknown>).name;
      if (
        typeof name === "string" &&
        ["aria-label", "placeholder", "title", "alt"].includes(name) &&
        (node.value as Record<string, unknown>).type === "StringLiteral"
      ) {
        console.error(`${path}: literal translated attribute`);
        failed = true;
      }
    }
    for (const child of Object.values(node))
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
  }
  visit(ast);
}
if (failed) process.exitCode = 1;
