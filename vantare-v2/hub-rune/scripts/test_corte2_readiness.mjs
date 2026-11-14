import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { launcherHeading } from "./corte2-readiness.mjs";
const files = process.argv.slice(2);
assert.equal(files.length, 3, "Pass the exported inicio-base, studio-base and launcher-base snapshots");
for (const [index, expected] of ["Carrera LMU", "Creador de Contenido", "Creador de Contenido"].entries()) {
  assert.equal(launcherHeading(JSON.parse(await readFile(files[index], "utf8"))), expected);
}
assert.throws(() => launcherHeading([]), /no named default/);
console.log("Three initial scenes preserve the real Launcher readiness target; empty data rejected");
