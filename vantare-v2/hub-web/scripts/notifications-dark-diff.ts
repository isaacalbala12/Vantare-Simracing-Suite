import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { compareImages } from "./visual-diff/image.ts";
import { referenceReceiptHash } from "./visual-diff/reference-hash.ts";

// The supplied dark PNG exists with its receipt, but is absent from capture-batch.json.
// Do not edit the reference manifest or pretend its capture inputs were verified.
const references = process.env.VANTARE_HUB_REFERENCE_ROOT;
const evidence = process.env.VANTARE_HUB_EVIDENCE;
assert.ok(references && evidence);
const referencePath = join(
  resolve(references),
  "dark/shell-notificaciones-abiertas.png",
);
const currentPath = join(
  resolve(evidence),
  "shell-notificaciones-abiertas-dark.png",
);
const reference = await readFile(referencePath);
const current = await readFile(currentPath);
const receipt = JSON.parse(
  await readFile(`${referencePath}.capture.json`, "utf8"),
);
assert.equal(referenceReceiptHash(reference), receipt.png);
const { diff, ...metrics } = compareImages(reference, current);
const output = join(resolve(evidence), "visual-supplied-dark");
await mkdir(output, { recursive: true });
await writeFile(join(output, "reference.png"), reference);
await writeFile(join(output, "current.png"), current);
await writeFile(join(output, "diff.png"), diff);
await writeFile(
  join(output, "report.json"),
  JSON.stringify(
    {
      ...metrics,
      suppliedCapture: true,
      referenceManifestMissing: true,
      referenceReceiptVerified: true,
      captureInputsVerified: false,
      referencePath,
      currentPath,
    },
    null,
    2,
  ),
);
