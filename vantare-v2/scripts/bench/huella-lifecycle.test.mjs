import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { execFileSync } from "node:child_process";

const cdpHelper = await readFile(new URL("./huella-cdp.mjs", import.meta.url), "utf8");
const bench = await readFile(new URL("./huella.ps1", import.meta.url), "utf8");
const buildMeasurement = await readFile(new URL("./build-measurement.ps1", import.meta.url), "utf8");

test("base admite LMU abierto sin activar PresentMon ni mezclar modos", {skip: process.platform !== "win32"}, () => {
  const header = bench.slice(0, bench.indexOf('$repoRoot ='));
  execFileSync('pwsh', ['-NoProfile', '-Command', `
  $ErrorActionPreference = 'Stop'
  $entry = { ${header}
    [pscustomobject]@{mode=$measurementMode;presentMon=$usePresentMon}
  }
  $live = & $entry -Condicion A0 -BaseRoute home
  if ($live.mode -ne 'base-with-game' -or $live.presentMon) { throw 'wrong live base mode' }
  $idle = & $entry -Condicion A0 -BaseRoute home -SinJuego
  if ($idle.mode -ne 'base-no-game' -or $idle.presentMon) { throw 'wrong base no-game mode' }
  $legacy = & $entry -Condicion A1
  if ($legacy.mode -ne 'full' -or -not $legacy.presentMon) { throw 'legacy game protocol changed' }
  $noGame = & $entry -Condicion A0 -SinJuego
  if ($noGame.mode -ne 'ram-only-no-game' -or $noGame.presentMon) { throw 'legacy no-game changed' }
  $rejected = $false
  try { & $entry -Condicion A1 -BaseRoute home } catch { $rejected = $true }
  if (-not $rejected) { throw 'base accepted HUD condition' }
  `]);
});

test("HUD visible exige evidencia nativa durante toda la captura, no sólo DOM", () => {
 assert.match(bench, /overlay-visibility-probe\.exe/);
 assert.match(bench, /\$visibilityValid = \$visibilityEvidence\.valid -eq \$true/);
 assert.match(bench, /if \(-not \$visibilityValid\) \{ \$row\.publishable = \$false \}/);
 assert.ok(bench.indexOf('$visibilityProcess.WaitForExit') < bench.indexOf("if ($Condicion -eq 'HubMin') {", bench.indexOf('$sampleDeadline')));
});

test("GPU conserva PID, adaptador y motor separados; ausencia no inventa muestras", {skip: process.platform !== "win32"}, () => {
  const gpu = bench.slice(bench.indexOf('function Get-GpuTotals'), bench.indexOf('function Get-VantareEtwSessions'));
  execFileSync('pwsh', ['-NoProfile', '-Command', `
    $ErrorActionPreference = 'Stop'
    function Get-Counter {
      [pscustomobject]@{CounterSamples=@(
        [pscustomobject]@{InstanceName='pid_7_luid_a_phys_0_eng_0_engtype_3D';Path='GPU Engine/Utilization Percentage';CookedValue=1.5},
        [pscustomobject]@{InstanceName='pid_7_luid_b_phys_0_eng_1_engtype_Copy';Path='GPU Engine/Utilization Percentage';CookedValue=2.5},
        [pscustomobject]@{InstanceName='pid_8_luid_a_phys_0_eng_0_engtype_3D';Path='GPU Engine/Utilization Percentage';CookedValue=99},
        [pscustomobject]@{InstanceName='pid_7_luid_a_phys_0';Path='GPU Process Memory/Dedicated Usage';CookedValue=4096}
      )}
    }
    ${gpu}
    $result=Get-GpuTotals
    if (-not $result.Valid -or $result.Totals[7].Engine -ne 4 -or $result.Totals[7].Engines.Count -ne 2) { throw 'PID aggregation changed' }
    $samples = @($result.Totals[7].Engines) | ConvertTo-Json -Compress | ConvertFrom-Json
    if ($samples[1].instance -ne 'pid_7_luid_b_phys_0_eng_1_engtype_Copy' -or $samples[1].percent -ne 2.5) { throw 'lost adapter/engine' }
    if ($result.Totals[7].Memory[0].dedicatedBytes -ne 4096 -or $result.Totals.ContainsKey(9)) { throw 'invented memory/process' }
    function Get-Counter { throw 'test counter unavailable' }
    $missing=Get-GpuTotals
    if ($missing.Valid -or $missing.Totals.Count) { throw 'missing counters accepted' }
  `]);
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
  assert.match(bench, /elseif \(\$SinJuego\) \{ 'ram-only-no-game' \}/);
  assert.match(bench, /\$publishable = -not \$hygieneForced -and -not \[bool\]\$SinJuego/);
  assert.match(bench, /if \(\$usePresentMon\) \{\s*\$sessionName = [^\n]+\s*\$presentMonArgs/);
  assert.match(bench, /PresentMon omitido: corrida RAM-only sin juego/);
});

test("sin juego no cambia PATH ni consulta o limpia sesiones ETW", () => {
  assert.match(bench, /\$usePresentMon = -not \$SinJuego -and -not \$isBase/);
  assert.match(bench, /if \(\$usePresentMon -and \(Test-Path -LiteralPath \$standalonePresentMon\)\)/);
  assert.match(bench, /if \(\$usePresentMon\) \{\s*foreach \(\$etwSession in @\(Get-VantareEtwSessions\)\)/);
  assert.match(bench, /if \(\$usePresentMon\) \{\s*\$sessionName = "VantareHuella-/);
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

test("build desde entorno valida configuracion y restaura estado incluso si falla", { skip: process.platform !== "win32" }, async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "vantare-build-contract-"));
  try {
    await mkdir(path.join(fixture, "scripts", "bench"), { recursive: true });
    await mkdir(path.join(fixture, "cmd", "vantare"), { recursive: true });
    await writeFile(path.join(fixture, "scripts", "bench", "build-measurement.ps1"), buildMeasurement);
    // Solo prueba orquestacion: los compiladores se sustituyen por funciones
    // locales. Estos artefactos no son builds ni evidencia de rendimiento.
    const check = String.raw`
$ErrorActionPreference = 'Stop'
$names = @('VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','VANTARE_SUPABASE_URL','VANTARE_SUPABASE_ANON_KEY','VANTARE_LICENSE_PUBLIC_KEYS')
foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
$env:VANTARE_SUPABASE_URL = 'https://example.invalid'
$env:VANTARE_SUPABASE_ANON_KEY = 'public-test-key'
$env:VANTARE_LICENSE_PUBLIC_KEYS = 'public-test-verifier'
$global:buildContractCalls = 0
$global:buildContractFail = $false
$global:buildContractEnvFile = $false
function Test-Path {
    param([string]$LiteralPath)
    if ($global:buildContractEnvFile -and (Split-Path -Leaf $LiteralPath) -eq '.env.production') { return $true }
    Microsoft.PowerShell.Management\Test-Path -LiteralPath $LiteralPath
}
function corepack {
    $global:buildContractCalls++
    if ($env:VITE_SUPABASE_URL -cne $env:VANTARE_SUPABASE_URL -or $env:VITE_SUPABASE_ANON_KEY -cne $env:VANTARE_SUPABASE_ANON_KEY) { throw 'frontend/backend mismatch' }
    $global:LASTEXITCODE = if ($global:buildContractFail) { 9 } else { 0 }
}
function powershell {
    $outputPath = $args[[Array]::IndexOf($args, '-OutFile') + 1]
    Set-Content -LiteralPath $outputPath -Value 'test-only generated config'
    $global:LASTEXITCODE = 0
}
function go {
    $flags = $args[[Array]::IndexOf($args, '-ldflags') + 1]
    if ($flags -cnotmatch '(?:^|\s)-X main.buildChannel=nightly(?:\s|$)') { throw 'diagnostic build has wrong channel' }
    $outputPath = $args[[Array]::IndexOf($args, '-o') + 1]
    Set-Content -LiteralPath $outputPath -Value 'test-only compiler result'
    $global:LASTEXITCODE = 0
}
$build = Join-Path $PSScriptRoot 'scripts/bench/build-measurement.ps1'
$generated = Join-Path $PSScriptRoot 'cmd/vantare/supabase_build.go'
function Assert-Restored {
    if ($env:VITE_SUPABASE_URL -or $env:VITE_SUPABASE_ANON_KEY -or $env:VANTARE_SUPABASE_URL -cne 'https://example.invalid' -or $env:VANTARE_SUPABASE_ANON_KEY -cne 'public-test-key' -or $env:VANTARE_LICENSE_PUBLIC_KEYS -cne 'public-test-verifier') { throw 'environment not restored' }
    if (Test-Path -LiteralPath $generated) { throw 'generated file leaked' }
}
& $build -FromEnvironment -BuildChannel Nightly
if ($global:buildContractCalls -ne 1) { throw 'build was not called' }
Assert-Restored
$global:buildContractFail = $true
$failed = $false
try { & $build -FromEnvironment } catch { $failed = $true }
if (-not $failed -or $global:buildContractCalls -ne 2) { throw 'build failure not propagated' }
Assert-Restored
$env:VITE_SUPABASE_URL = 'https://conflict.invalid'
$failed = $false
try { & $build -FromEnvironment } catch { $failed = $true }
if (-not $failed -or $global:buildContractCalls -ne 2 -or $env:VITE_SUPABASE_URL -cne 'https://conflict.invalid') { throw 'conflict not rejected or environment changed' }
$env:VITE_SUPABASE_URL = $null
$env:VANTARE_SUPABASE_ANON_KEY = $null
$failed = $false
try { & $build -FromEnvironment } catch { $failed = $true }
if (-not $failed -or $global:buildContractCalls -ne 2) { throw 'missing key reached compiler' }
$env:VANTARE_SUPABASE_ANON_KEY = 'public-test-key'
$global:buildContractEnvFile = $true
$failed = $false
try { & $build -FromEnvironment } catch { $failed = $true }
if (-not $failed -or $global:buildContractCalls -ne 2) { throw 'Vite environment file was not rejected before build' }
$global:buildContractEnvFile = $false
Assert-Restored
Set-Content -LiteralPath $generated -Value 'preexisting'
$failed = $false
try { & $build -FromEnvironment } catch { $failed = $true }
if (-not $failed -or (Get-Content -LiteralPath $generated -Raw).Trim() -ne 'preexisting') { throw 'preexisting artifact not preserved' }
Remove-Item -LiteralPath $generated
Assert-Restored
`;
    const checkPath = path.join(fixture, "check.ps1");
    await writeFile(checkPath, check);
    const output = execFileSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", checkPath], { encoding: "utf8", timeout: 30_000 });
    assert.doesNotMatch(output, /public-test-key|public-test-verifier|example\.invalid/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("la medida conserva prueba de seis widgets vivos después de muestrear", () => {
  assert.match(bench, /\$stem-overlay-end\.json/);
  assert.match(bench, /--action state --duration 1 --output \$overlayEndJson/);
  assert.match(bench, /\$endFrame\.sourceState -eq 'live'/);
  assert.match(bench, /\$endFrame\.sequence -gt \$startFrame\.sequence/);
  assert.match(bench, /\$overlayLiveAtEnd = \$false/);
  assert.match(bench, /\$row\.publishable = \$false/);
});
