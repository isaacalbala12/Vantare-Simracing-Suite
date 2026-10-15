# Cola automática de compilación para workers (ISA-1494). Reglas en AGENTS.md.
# Uso: pwsh -File native/scripts/compilar.ps1 <comando> [args...]
#   p. ej. pwsh -File native/scripts/compilar.ps1 cargo nextest run --workspace
# Deja compilar a la vez como mucho $env:VANTARE_CARGO_SLOTS (por defecto 4). Cada worker
# exige RAM libre: el primero, $VANTARE_CARGO_MIN_GB (se lee del entorno de MÁQUINA en cada
# vuelta, así un cambio aplica sin reiniciar T3); cada worker que ya compila exige además
# jobs × VANTARE_CARGO_JOB_GB + VANTARE_CARGO_RESERVE_GB (#1654 r3). Si no hay aire, espera
# y lo dice. NUNCA se bloquea del todo: si no hay ningún otro worker compilando, este trabajo
# entra aunque falte RAM (el servidor tirará de disco; 16 GB y agentes abiertos, #1654 r10).
# Usa mutex con nombre por hueco: si un worker muere, Windows libera su hueco solo.
# Con sccache instalado, las dependencias compiladas en otro worktree se reutilizan.
# No se toca CARGO_BUILD_JOBS: sccache mete las variables CARGO_* en su clave y bajarlo
# por worker partiría la caché (README, «Sccache»); el ajuste por memoria se hace
# esperando, no recortando jobs.
# VANTARE_SCCACHE=0 lo desactiva para repetir un fallo sospechoso sin caché.
if ($env:VANTARE_SCCACHE -ne '0' -and -not $env:RUSTC_WRAPPER -and (Get-Command sccache -ErrorAction SilentlyContinue)) { $env:RUSTC_WRAPPER = 'sccache' }
$slots = [int]($env:VANTARE_CARGO_SLOTS ?? 4)
$jobs = [int]($env:CARGO_BUILD_JOBS ?? 2)
$jobGb = [double]($env:VANTARE_CARGO_JOB_GB ?? 1.5)
$reserveGb = [double]($env:VANTARE_CARGO_RESERVE_GB ?? 1)
# Un worker más exige jobs × jobGb, más lo que ya gastan WSL, navegadores y agentes.
$workerGb = $jobs * $jobGb + $reserveGb
$freeGb = 0.0
$busy = 0
$minGb = 0.0
$fuente = ''
$held = $null
$waited = [Diagnostics.Stopwatch]::StartNew()
while (-not $held) {
    # Mínimo de RAM, leído en cada vuelta: Machine manda (cambio sin reiniciar T3), luego el
    # proceso y, si no hay nada, 5 GB.
    $minGb = 5.0
    $fuente = 'por defecto'
    $deMaquina = [Environment]::GetEnvironmentVariable('VANTARE_CARGO_MIN_GB', 'Machine')
    if ($deMaquina) { $minGb = [double]$deMaquina; $fuente = 'Machine' }
    elseif ($env:VANTARE_CARGO_MIN_GB) { $minGb = [double]$env:VANTARE_CARGO_MIN_GB; $fuente = 'proceso' }
    $freeGb = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB
    $busy = 0
    $mine = @()
    for ($i = 0; $i -lt $slots; $i++) {
        $m = [Threading.Mutex]::new($false, "Global\VantareCargoSlot$i")
        try { if ($m.WaitOne(0)) { $mine += $m } else { $busy++; $m.Dispose() } }
        catch [Threading.AbandonedMutexException] { $mine += $m }
    }
    $needGb = $minGb + $busy * $workerGb
    # Si no hay ningún otro worker compilando, este trabajo entra aunque falte RAM: mejor
    # tirar de disco que dejar a todo el mundo esperando una hora (aviso en el log).
    $solo = ($busy -eq 0 -and $mine.Count -gt 0)
    if ($mine.Count -gt 0 -and ($freeGb -ge $needGb -or $solo)) {
        $held = $mine[0]
        for ($k = 1; $k -lt $mine.Count; $k++) { $mine[$k].ReleaseMutex(); $mine[$k].Dispose() }
        if ($solo -and $freeGb -lt $needGb) {
            Write-Host ("[cola] nadie más compilaba y solo hay {0:N1} GB libres (mínimo {1:N1} GB de {2}): entro igual; el sistema tirará de disco" -f $freeGb, $minGb, $fuente)
        }
    } else {
        foreach ($m in $mine) { $m.ReleaseMutex(); $m.Dispose() }
        if ($mine.Count -eq 0) {
            Write-Host ("[cola] espero: {0} huecos ocupados (límite {1}) y RAM libre {2:N1} GB" -f $busy, $slots, $freeGb)
        } else {
            Write-Host ("[cola] espero: RAM libre {0:N1} GB < {1:N1} GB pedidos ({2} huecos ocupados; mínimo {3:N1} GB de {4})" -f $freeGb, $needGb, $busy, $minGb, $fuente)
        }
        Start-Sleep -Seconds 5
    }
}
$espera = [math]::Round($waited.Elapsed.TotalSeconds)
if ($espera -gt 5) {
    Write-Host ("[cola] esperé {0} s por un hueco ({1} ocupados; RAM libre {2:N1} GB, mínimo {3:N1} GB de {4})" -f $espera, $busy, $freeGb, $minGb, $fuente)
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
