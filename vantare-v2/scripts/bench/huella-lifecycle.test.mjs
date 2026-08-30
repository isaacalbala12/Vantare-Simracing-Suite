import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const cdpHelper = await readFile(new URL("./huella-cdp.mjs", import.meta.url), "utf8");
const bench = await readFile(new URL("./huella.ps1", import.meta.url), "utf8");

test("reconoce la entrada overlay dedicada", () => {
  assert.match(cdpHelper, /wails\.localhost\/overlay\.html/);
  assert.doesNotMatch(cdpHelper, /window\.location\.href === "http:\/\/wails\.localhost\/"/);
});

test("HubMin actúa sobre el target Wails y no sobre un HWND ambiguo", () => {
  assert.match(bench, /--action hub-minimise/);
  assert.match(cdpHelper, /requestedAction === "hub-minimise"/);
  assert.match(cdpHelper, /Window\.Minimise\(\)/);
  assert.doesNotMatch(bench, /ShowWindowAsync/);
});

test("el cierre limpio sobrevive a la destrucción del Hub", () => {
  assert.match(cdpHelper, /pages\.find\(\(\{ description \}\) => description\.hub\)\?\.page/);
  assert.match(cdpHelper, /pages\.find\(\(\{ description \}\) => description\.overlay\)\?\.page/);
  assert.match(cdpHelper, /Events\.Emit\("hub:open"\)/);
});

test("HubMin mide la reapertura después de finalizar las muestras", () => {
  const sampleLoop = bench.indexOf("while ((Get-Date) -lt $sampleDeadline)");
  const reopen = bench.indexOf("--action hub-open");
  assert.ok(sampleLoop >= 0);
  assert.ok(reopen > sampleLoop);
  assert.match(bench, /\$stem-hub-reopen\.json/);
  assert.match(cdpHelper, /await writeResult\(\{ schema: "vantare\.huella\.cdp\.v1", action, requested: true, reopenMs \}\)/);
});

test("el modo sin juego conserva RAM/CDP y omite solo PresentMon", () => {
  assert.match(bench, /\[switch\]\$SinJuego/);
  assert.match(bench, /measurementMode = if \(\$SinJuego\) \{ 'ram-only-no-game' \}/);
  assert.match(bench, /\$publishable = -not \$hygieneForced -and -not \[bool\]\$SinJuego/);
  assert.match(bench, /if \(-not \$SinJuego\) \{\s*\$presentMonArgs/);
  assert.match(bench, /PresentMon omitido: corrida RAM-only sin juego/);
});
