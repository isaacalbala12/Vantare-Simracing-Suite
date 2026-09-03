import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED = new Map([
  [9, "standings|standings-redline|widget-standings-redline"],
  [13, "relative|relative-redline-mirror|widget-relative-redline-mirror"],
  [14, "relative|relative-redline-proximity|widget-relative-redline-proximity"],
  [15, "relative|relative-redline-traffic|widget-relative-redline-traffic"],
  [22, "pedals|pedals-redline|widget-pedals-redline"],
]);

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`Falta ${name}`);
  }
  return process.argv[index + 1];
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

const head = argument("--head").toLowerCase();
if (!/^[0-9a-f]{40}$/.test(head)) {
  throw new Error("--head debe ser un SHA Git completo");
}
const outputRoot = path.resolve(argument("--out"));
const sourcePath = fileURLToPath(
  new URL("../../testdata/bench/s3-redline-catalog.json", import.meta.url),
);
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const profiles = [...(source.profiles ?? [])].sort((a, b) => a.ordinal - b.ordinal);

if (source.candidateHead !== undefined || profiles.length !== EXPECTED.size) {
  throw new Error("El catálogo fuente debe ser estable y contener exactamente cinco perfiles");
}
const seen = new Set();
for (const entry of profiles) {
  const contract = `${entry.family}|${entry.templateId}|${entry.widgetId}`;
  if (EXPECTED.get(entry.ordinal) !== contract || seen.has(entry.ordinal)) {
    throw new Error(`Contrato S3 inesperado: ${entry.ordinal} ${contract}`);
  }
  if (entry.family === "delta" || entry.type === "delta") {
    throw new Error("S3 excluye Delta por decisión de producto");
  }
  seen.add(entry.ordinal);
}

await mkdir(outputRoot, { recursive: true });
const materialized = [];
for (const entry of profiles) {
  const profile = {
    schemaVersion: 3,
    id: entry.profileId,
    name: `S3 gate - ${entry.templateId}`,
    displayMode: "racing",
    monitorIndex: 0,
    layoutViewport: { width: 1920, height: 1080 },
    defaultVisualSystemId: "vantare-endurance",
    layouts: {
      general: {
        type: "general",
        widgets: [{
          id: entry.widgetId,
          type: entry.type,
          name: entry.templateId,
          layout: { x: 40, y: 40, w: entry.layout.w, h: entry.layout.h, zIndex: 0, aspectLocked: false },
          behavior: { enabled: true, updateHz: entry.updateHz },
          content: entry.content,
          visual: {
            systemId: "vantare-endurance",
            systemVersion: 1,
            configVersion: 1,
            baseSettings: entry.baseSettings,
            appearanceOverrides: {},
          },
        }],
      },
    },
  };
  const bytes = `${JSON.stringify(profile, null, 2)}\n`;
  await writeFile(path.join(outputRoot, entry.file), bytes, "utf8");
  materialized.push({
    ordinal: entry.ordinal,
    family: entry.family,
    templateId: entry.templateId,
    profileId: entry.profileId,
    file: entry.file,
    widgetId: entry.widgetId,
    persistedFrameWidth: entry.layout.w,
    expectedFrameWidth: entry.expectedPhysicalFrameWidth ?? entry.layout.w,
    expectedFrameHeight: entry.layout.h,
    sha256: sha256(bytes),
  });
}

const index = { schemaVersion: 1, candidateHead: head, count: materialized.length, profiles: materialized };
await writeFile(path.join(outputRoot, "redline-index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
console.log(`S3 Redline materializado: ${materialized.length} perfiles, sin Delta, HEAD ${head}`);
