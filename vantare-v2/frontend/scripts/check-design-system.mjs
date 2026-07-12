import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../src/overlay/design-systems/", import.meta.url);
const rootPath = root.pathname.replace(/^\/(\w):/, "$1:");
const forbidden = [/from\s+["'][^"']*(?:wails|telemetry|supabase|profile|permissions)[^"']*["']/i, /https?:\/\//i];
const systems = readdirSync(rootPath).filter((name) => name !== "_template" && statSync(join(rootPath, name)).isDirectory());
const failures = [];
const coreWidgets = ["delta", "standings", "relative", "pedals"];

for (const system of systems) {
  const dir = join(rootPath, system);
  const files = readdirSync(dir, { recursive: true }).filter((file) => typeof file === "string");
  if (!files.some((file) => /manifest\.tsx?$/.test(file))) failures.push(`${system}: missing manifest`);
  if (!files.includes("tokens.css")) failures.push(`${system}: missing tokens.css`);
  if (!files.some((file) => /\.test\.tsx?$/.test(file))) failures.push(`${system}: missing contract test`);
  const manifestPath = join(dir, files.find((file) => /manifest\.tsx?$/.test(file)) ?? "manifest.ts");
  const manifest = readFileSync(manifestPath, "utf8");
  for (const contract of ["systemMigrations:", "widgets:", "configMigrations:", "defaultSettings:", "parseSettings(", "Renderer:"]) {
    if (!manifest.includes(contract)) failures.push(`${system}/manifest: missing ${contract}`);
  }
  for (const widget of coreWidgets) {
    if (!manifest.includes(`widgetType: "${widget}"`)) failures.push(`${system}/manifest: missing ${widget} compatibility`);
  }
  if (!/\b0\s*:/.test(manifest)) failures.push(`${system}/manifest: missing version 0 migration`);
  for (const file of files.filter((entry) => /\.(ts|tsx|css)$/.test(entry))) {
    const source = readFileSync(join(dir, file), "utf8");
    if (forbidden.some((pattern) => pattern.test(source))) failures.push(`${system}/${file}: forbidden import or remote URL`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`design-system:check: ${systems.length} registered systems passed`);
}
