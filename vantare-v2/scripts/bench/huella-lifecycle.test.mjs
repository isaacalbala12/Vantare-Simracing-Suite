import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const cdpHelper = await readFile(new URL("./huella-cdp.mjs", import.meta.url), "utf8");
const bench = await readFile(new URL("./huella.ps1", import.meta.url), "utf8");
const buildMeasurement = await readFile(new URL("./build-measurement.ps1", import.meta.url), "utf8");

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

test("la medida falla cerrada si la build arranca sin licencia configurada", () => {
  assert.match(cdpHelper, /Events\.On\("license:changed"/);
  assert.match(cdpHelper, /Events\.Emit\("license:cached:get"/);
  assert.match(cdpHelper, /account: payload\.userId \? "authenticated" : "anonymous"/);
  assert.match(bench, /--action license/);
  assert.match(bench, /\$licenseResult\.configured -ne \$true/);
  assert.match(bench, /Prohibido medir una build sin licencia configurada/);
  assert.match(bench, /licenseState = \$licenseState/);
  assert.match(bench, /licenseAccount = \$licenseAccount/);
});

test("la build de medida embebe Supabase sin copiar ni mostrar env.local", () => {
  assert.match(buildMeasurement, /VITE_SUPABASE_URL/);
  assert.match(buildMeasurement, /VANTARE_SUPABASE_URL = \$values\['VITE_SUPABASE_URL'\]/);
  assert.match(buildMeasurement, /generate_supabase_config\.ps1/);
  assert.match(buildMeasurement, /go build -tags production/);
  assert.match(buildMeasurement, /Remove-Item -LiteralPath \$generatedPath/);
  assert.doesNotMatch(buildMeasurement, /Write-Host.*\$values/);
});
