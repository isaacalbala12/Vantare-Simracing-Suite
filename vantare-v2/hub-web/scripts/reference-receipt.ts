import { readFile } from "node:fs/promises";
import { referenceReceiptHash } from "./visual-diff/reference-hash.ts";

const path = process.argv[2];
if (!path || process.argv.length !== 3)
  throw new Error(
    "Usage: node --experimental-strip-types scripts/reference-receipt.ts <png>",
  );
console.log(referenceReceiptHash(await readFile(path)));
