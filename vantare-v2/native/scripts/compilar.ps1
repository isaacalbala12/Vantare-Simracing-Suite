# Cola automática de compilación para workers (ISA-1494). Reglas en AGENTS.md.
# Uso: pwsh -File native/scripts/compilar.ps1 <comando> [args...]
#   p. ej. pwsh -File native/scripts/compilar.ps1 cargo nextest run --workspace
# Deja compilar a la vez como mucho $env:VANTARE_CARGO_SLOTS (por defecto 4) y solo si hay
# RAM libre suficiente ($env:VANTARE_CARGO_MIN_GB, por defecto 5). Si no hay hueco, espera.
# Usa mutex con nombre por hueco: si un worker muere, Windows libera su hueco solo.
# Con sccache instalado, las dependencias compiladas en otro worktree se reutilizan.
if (-not $env:RUSTC_WRAPPER -and (Get-Command sccache -ErrorAction SilentlyContinue)) { $env:RUSTC_WRAPPER = 'sccache' }
$slots = [int]($env:VANTARE_CARGO_SLOTS ?? 4)
$minGb = [double]($env:VANTARE_CARGO_MIN_GB ?? 5)
$held = $null
$waited = [Diagnostics.Stopwatch]::StartNew()
while (-not $held) {
    $freeGb = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB
    if ($freeGb -ge $minGb) {
        for ($i = 0; $i -lt $slots -and -not $held; $i++) {
            $m = [Threading.Mutex]::new($false, "Global\VantareCargoSlot$i")
            try { if ($m.WaitOne(0)) { $held = $m } else { $m.Dispose() } }
            catch [Threading.AbandonedMutexException] { $held = $m }
        }
    }
    if (-not $held) { Start-Sleep -Seconds 5 }
}
$espera = [math]::Round($waited.Elapsed.TotalSeconds)
if ($espera -gt 5) { Write-Host "[cola] esperé $espera s por un hueco de compilación" }
$code = 1
try {
    $cmd, $rest = $args
    $global:LASTEXITCODE = 0
    & $cmd @rest
    $code = if ($?) { [int]$global:LASTEXITCODE } else { [math]::Max(1, [int]$global:LASTEXITCODE) }
} catch {
    Write-Host "[cola] el comando falló: $_"
    $code = 1
} finally {
    $held.ReleaseMutex(); $held.Dispose()
}
exit $code
