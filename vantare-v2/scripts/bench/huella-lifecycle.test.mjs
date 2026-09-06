import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { execFileSync } from "node:child_process";

const cdpHelper = await readFile(new URL("./huella-cdp.mjs", import.meta.url), "utf8");
const bench = await readFile(new URL("./huella.ps1", import.meta.url), "utf8");
const buildMeasurement = await readFile(new URL("./build-measurement.ps1", import.meta.url), "utf8");

test("HUD visible exige evidencia nativa durante toda la captura, no sólo DOM", () => {
 assert.match(bench, /overlay-visibility-probe\.exe/);
 assert.match(bench, /\$visibilityValid = \$visibilityEvidence\.valid -eq \$true/);
 assert.match(bench, /if \(-not \$visibilityValid\) \{ \$row\.publishable = \$false \}/);
 assert.ok(bench.indexOf('$visibilityProcess.WaitForExit') < bench.indexOf("if ($Condicion -eq 'HubMin') {", bench.indexOf('$sampleDeadline')));
});

test("cobertura temporal compara UTC con UTC", {skip: process.platform !== "win32"}, () => {
 const start=bench.indexOf('        $visibilityValid = $visibilityEvidence.valid');
 const end=bench.indexOf('        [pscustomobject]@{start=',start);
 assert.ok(start>0 && end>start);
 execFileSync('pwsh',['-NoProfile','-Command',`
 $visibilityEvidence = '{"valid":true,"samples":[{"at":"2026-09-06T15:00:00Z"},{"at":"2026-09-06T15:02:00Z"}]}' | ConvertFrom-Json
 $visibilityStart=[datetime]'2026-09-06T17:00:01+02:00';$visibilityEnd=[datetime]'2026-09-06T17:01:59+02:00'
 ${bench.slice(start,end)}
 if(-not $visibilityValid){throw 'UTC/local coverage mismatch'}
 `]);
});

test("el aislamiento visual nunca se publica como ahorro de producto", () => {
  assert.match(bench, /\[switch\]\$OcultarPintura/);
  assert.match(bench, /\$publishable = [^\n]+-not \[bool\]\$OcultarPintura/);
  assert.ok(bench.indexOf('--action diagnostic-hide-paint') < bench.indexOf('if ($Calentamiento -gt 0)'));
  assert.match(cdpHelper, /diagnostic-hide-paint/);
});

test("frontend legible es opt-in y conserva el build normal por defecto", () => {
  assert.match(buildMeasurement, /\[switch\]\$ReadableFrontend/);
  assert.match(buildMeasurement, /if \(\$ReadableFrontend\) \{[\s\S]*?build --minify false[\s\S]*?\} else \{\s*corepack pnpm --dir frontend build\s*\}/);
});

test("A0 no exige emittedAt cuando el overlay ya estaba detenido", { skip: process.platform !== "win32" }, () => {
  const start = bench.indexOf("    $overlayStarted =");
  const end = bench.indexOf("    if ($LASTEXITCODE", start);
  assert.ok(start >= 0 && end > start);
  execFileSync("pwsh", ["-NoProfile", "-Command", `
    Set-StrictMode -Version Latest
    $ErrorActionPreference = 'Stop'
    function node { '{}' }
    $action = 'overlay-stop'
    $cdpResult = [pscustomobject]@{control=[pscustomobject]@{changed=$false};overlayReadyAt=$null}
    $processHelper=$processJson=$hubRendererIdsJson=$cdpRendererIdsJson='unused'
    ${bench.slice(start, end)}
  `]);
});

test("CPU conserva fracciones en el clamp productivo", { skip: process.platform !== "win32" }, () => {
  const expression = bench.match(/cpuPct = Format-Invariant \((\[Math\]::Max\([^\n]+?)\); gpuSampleValid/);
  assert.ok(expression);
  execFileSync("pwsh", ["-NoProfile", "-Command", `
    $cpuPct = 1.25
    if ((${expression[1]}) -ne 1.25) { throw 'CPU rounded' }
    $cpuPct = -0.25
    if ((${expression[1]}) -ne 0) { throw 'Negative CPU not clamped' }
  `]);
});

test("CPU mide el intervalo real después de consultar GPU y procesos", () => {
  const sample = bench.slice(bench.indexOf("while ((Get-Date) -lt $sampleDeadline)"), bench.indexOf("    if ($Condicion -eq 'HubMin') {", bench.indexOf("$sampleDeadline =")));
  assert.ok(sample.indexOf("$cpuSampleAt = $cpuClock.Elapsed.TotalSeconds") > sample.indexOf("$gpuSample = Get-GpuTotals"));
  assert.match(sample, /\$elapsed = \$cpuSampleAt - \$previousCpuAt\[\$processId\]/);
  assert.match(bench, /warmupSeconds = \$Calentamiento/);
});

test("CPU normaliza usando tiempo monotónico por PID y admite procesos nuevos", { skip: process.platform !== "win32" }, () => {
  const start = bench.indexOf("            $cpuSeconds =");
  const end = bench.indexOf("            $gpuValues =", start);
  assert.ok(start >= 0 && end > start);
  execFileSync("pwsh", ["-NoProfile", "-Command", `
    Set-StrictMode -Version Latest
    $ErrorActionPreference='Stop'
    $logicalProcessors=16
    $processId=7
    $process=[pscustomobject]@{TotalProcessorTime=[timespan]::FromSeconds(4)}
    $cpuClock=[pscustomobject]@{Elapsed=[timespan]::FromSeconds(5)}
    $previousCpu=@{7=2.0}
    $previousCpuAt=@{7=1.0}
    ${bench.slice(start, end)}
    if ($cpuPct -ne 3.125) { throw "Wrong interval: $cpuPct" }
    $processId=8
    ${bench.slice(start, end)}
    if ($cpuPct -ne 0 -or $previousCpuAt[8] -ne 5) { throw 'New process not initialised' }
  `]);
});

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
  assert.match(bench, /\$licenseResult\.account -ne 'authenticated'/);
  assert.match(bench, /Prohibido medir una build sin licencia configurada/);
  assert.match(bench, /licenseState = \$licenseState/);
  assert.match(bench, /licenseAccount = \$licenseAccount/);
});

test("la build de medida embebe Supabase sin copiar ni mostrar env.local", () => {
  assert.match(buildMeasurement, /VITE_SUPABASE_URL/);
  assert.match(buildMeasurement, /VANTARE_SUPABASE_URL = \$values\['VITE_SUPABASE_URL'\]/);
  assert.match(buildMeasurement, /generate_supabase_config\.ps1/);
  assert.match(buildMeasurement, /go build -trimpath/);
  assert.doesNotMatch(buildMeasurement, /go build -tags production/);
  assert.match(buildMeasurement, /Remove-Item -LiteralPath \$generatedPath/);
  assert.doesNotMatch(buildMeasurement, /Write-Host.*\$values/);
});

test("la medida conserva prueba de seis widgets vivos después de muestrear", () => {
  assert.match(bench, /\$stem-overlay-end\.json/);
  assert.match(bench, /--action state --duration 1 --output \$overlayEndJson/);
  assert.match(bench, /\$endFrame\.sourceState -eq 'live'/);
  assert.match(bench, /\$endFrame\.sequence -gt \$startFrame\.sequence/);
  assert.match(bench, /\$overlayLiveAtEnd = \$false/);
  assert.match(bench, /\$row\.publishable = \$false/);
});
