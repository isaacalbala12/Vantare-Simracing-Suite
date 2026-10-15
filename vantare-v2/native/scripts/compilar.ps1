# Cola automática de compilación para workers (ISA-1494). Reglas en AGENTS.md.
# Uso: pwsh -File native/scripts/compilar.ps1 <comando> [args...]
#   p. ej. pwsh -File native/scripts/compilar.ps1 cargo nextest run --workspace
# Deja compilar a la vez como mucho $env:VANTARE_CARGO_SLOTS (por defecto 4) y solo si hay
# RAM libre suficiente: el primer hueco exige $env:VANTARE_CARGO_MIN_GB (por defecto 5) y
# cada worker que ya está compilando exige además lo suyo, estimado con los jobs por
# invocación ($env:CARGO_BUILD_JOBS), $env:VANTARE_CARGO_JOB_GB por job y
# $env:VANTARE_CARGO_RESERVE_GB para el resto del sistema (#1654 r3: un rustc llega a
# ~2,6 GB de pico y con dos workers la máquina entraba en swap). Si no hay hueco, espera.
# Usa mutex con nombre por hueco: si un worker muere, Windows libera su hueco solo.
# Con sccache instalado, las dependencias compiladas en otro worktree se reutilizan.
# No se toca CARGO_BUILD_JOBS: sccache mete las variables CARGO_* en su clave y bajarlo
# por worker partiría la caché (README, «Sccache»); el ajuste por memoria se hace
# esperando, no recortando jobs.
# VANTARE_SCCACHE=0 lo desactiva para repetir un fallo sospechoso sin caché.
if ($env:VANTARE_SCCACHE -ne '0' -and -not $env:RUSTC_WRAPPER -and (Get-Command sccache -ErrorAction SilentlyContinue)) { $env:RUSTC_WRAPPER = 'sccache' }
$slots = [int]($env:VANTARE_CARGO_SLOTS ?? 4)
$minGb = [double]($env:VANTARE_CARGO_MIN_GB ?? 5)
$jobs = [int]($env:CARGO_BUILD_JOBS ?? 2)
$jobGb = [double]($env:VANTARE_CARGO_JOB_GB ?? 1.5)
$reserveGb = [double]($env:VANTARE_CARGO_RESERVE_GB ?? 1)
# Un worker más exige jobs × jobGb, más lo que ya gastan WSL, navegadores y agentes.
$workerGb = $jobs * $jobGb + $reserveGb
$freeGb = 0.0
$busy = 0
$held = $null
$waited = [Diagnostics.Stopwatch]::StartNew()
while (-not $held) {
    $freeGb = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB
    $busy = 0
    $mine = @()
    if ($freeGb -ge $minGb) {
        for ($i = 0; $i -lt $slots; $i++) {
            $m = [Threading.Mutex]::new($false, "Global\VantareCargoSlot$i")
            try { if ($m.WaitOne(0)) { $mine += $m } else { $busy++; $m.Dispose() } }
            catch [Threading.AbandonedMutexException] { $mine += $m }
        }
    }
    $needGb = $minGb + $busy * $workerGb
    if ($mine.Count -gt 0 -and $freeGb -ge $needGb) {
        $held = $mine[0]
        for ($k = 1; $k -lt $mine.Count; $k++) { $mine[$k].ReleaseMutex(); $mine[$k].Dispose() }
    } else {
        foreach ($m in $mine) { $m.ReleaseMutex(); $m.Dispose() }
        Start-Sleep -Seconds 5
    }
}
$espera = [math]::Round($waited.Elapsed.TotalSeconds)
if ($espera -gt 5) {
    Write-Host ("[cola] esperé {0} s por un hueco ({1} ocupados; RAM libre {2:N1} GB, se piden {3:N1} GB)" -f $espera, $busy, $freeGb, $needGb)
}
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
