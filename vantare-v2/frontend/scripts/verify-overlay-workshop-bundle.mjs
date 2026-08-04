import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

function fail(message) {
  throw new Error(`Overlay Workshop bundle verification failed: ${message}`);
}

function readAssets(directory) {
  if (!existsSync(directory)) fail(`missing asset directory ${directory}`);
  return readdirSync(directory, { recursive: true })
    .map((relative) => join(directory, relative))
    .filter((file) => file.endsWith(".js") || file.endsWith(".css"))
    .map((file) => ({ file, source: readFileSync(file, "utf8") }));
}

function parseArgs(args) {
  const parsed = { dist: "dist", expect: "" };
  const normalized = args[0] === "--" ? args.slice(1) : args;
  for (let index = 0; index < normalized.length; index += 2) {
    const flag = normalized[index];
    const value = normalized[index + 1];
    if (flag === "--dist") parsed.dist = value;
    else if (flag === "--expect") parsed.expect = value;
    else fail(`unknown argument ${flag}`);
  }
  if (!parsed.expect || !["internal", "stable"].includes(parsed.expect)) {
    fail("--expect must be internal or stable");
  }
  return parsed;
}

const { dist, expect: expected } = parseArgs(process.argv.slice(2));
const absoluteDist = resolve(dist);
const assets = readAssets(join(absoluteDist, "assets"));
const markers = [
  "data-overlay-workshop-page",
  "Workshop selection",
  "Internal Workshop access denied.",
  ".overlay-workshop",
];
const workshopAssets = assets.filter(({ source }) =>
  markers.some((marker) => source.includes(marker)),
);
const workshopNamedAssets = assets.filter(({ file }) => file.endsWith(".js") &&
  basename(file).includes("OverlayWorkshopDevRoute"),
);

if (expected === "stable") {
  if (workshopAssets.length > 0 || workshopNamedAssets.length > 0) {
    fail("Stable contains a Workshop sentinel or chunk");
  }
  console.log("Workshop compile-out verified for Stable.");
  process.exit(0);
}

if (workshopNamedAssets.length !== 1) {
  fail("internal build must contain exactly one named Workshop route chunk");
}
const workshopAsset = workshopNamedAssets[0];
const missingMarkers = markers.slice(0, 3).filter((marker) => !workshopAsset.source.includes(marker));
if (missingMarkers.length > 0) fail(`Workshop chunk is missing markers: ${missingMarkers.join(", ")}`);
if (!workshopAssets.some(({ source }) => source.includes(".overlay-workshop"))) {
  fail("internal build is missing the Workshop stylesheet sentinel");
}
const workshopFilename = basename(workshopAsset.file);
const importedByEntry = assets.some(({ file, source }) =>
  file !== workshopAsset.file && source.includes(workshopFilename),
);
if (!importedByEntry) fail("Workshop lazy chunk is not referenced from the application import graph");

console.log(`Workshop internal bundle verified: ${workshopFilename}.`);
