# Cola automática de compilación para workers (ISA-1494). Reglas en AGENTS.md.
# Uso: pwsh -File native/scripts/compilar.ps1 <comando> [args...]
#   p. ej. pwsh -File native/scripts/compilar.ps1 cargo nextest run --workspace
# Deja compilar a la vez como mucho $env:VANTARE_CARGO_SLOTS (por defecto 4), recortado por
# memoria COMPROMETIDA (#1654 r12): 2 slots mientras el comprometido no llegue a
# $VANTARE_CARGO_COMMIT_2GB (14 GB por defecto), 1 a partir de ahí; nunca 0 y nunca más de
# VANTARE_CARGO_SLOTS. Este umbral se lee del entorno de MÁQUINA en cada vuelta, igual que el
# mínimo, así un cambio aplica sin reiniciar T3. Cada worker exige RAM libre: el primero,
# $VANTARE_CARGO_MIN_GB (Machine > proceso > 5 GB, releído en cada vuelta); cada worker que ya
# compila exige además jobs × VANTARE_CARGO_JOB_GB + VANTARE_CARGO_RESERVE_GB (#1654 r3). Si
# no hay aire, espera y lo dice. NUNCA se bloquea del todo: si no hay ningún otro worker
# compilando, este trabajo entra aunque falte RAM (el servidor tirará de disco; #1654 r10).
# Usa mutex con nombre por hueco: si un worker muere, Windows libera su hueco solo.
# Con sccache instalado, las dependencias compiladas en otro worktree se reutilizan.
# Los jobs de compilación NO se recortan aquí; la palanca viva es `gates.ps1 -Jobs N` (#1654
# ronda 11, por línea de comandos) o $env:CARGO_BUILD_JOBS. Bajarlos cuando el comprometido
# pase de otro umbral es posible y ya no parte la caché de sccache: su clave incluye
# CARGO_TARGET_DIR y CARGO_INCREMENTAL, pero NO CARGO_BUILD_JOBS, CARGO_MAKEFLAGS ni
# CARGO_REGISTRIES_* (sccache 0.18, rust.rs; #1654 r12). Antes de fijarlo, medir (#1654).
# VANTARE_SCCACHE=0 lo desactiva para repetir un fallo sospechoso sin caché.
if ($env:VANTARE_SCCACHE -ne '0' -and -not $env:RUSTC_WRAPPER -and (Get-Command sccache -ErrorAction SilentlyContinue)) { $env:RUSTC_WRAPPER = 'sccache' }
$slots = [int]($env:VANTARE_CARGO_SLOTS ?? 4)
if ($slots -lt 1) { $slots = 1 }
$jobs = [int]($env:CARGO_BUILD_JOBS ?? 2)
$jobGb = [double]($env:VANTARE_CARGO_JOB_GB ?? 1.5)
$reserveGb = [double]($env:VANTARE_CARGO_RESERVE_GB ?? 1)
# Un worker más exige jobs × jobGb, más lo que ya gastan WSL, navegadores y agentes.
$workerGb = $jobs * $jobGb + $reserveGb
$freeGb = 0.0
$commitGb = 0.0
$busy = 0
$minGb = 0.0
$fuente = ''
$commitUmbral = 0.0
$commitFuente = ''
$efectivos = 0
$held = $null
$waited = [Diagnostics.Stopwatch]::StartNew()
while (-not $held) {
    # Mínimo de RAM libre, leído en cada vuelta: Machine manda (cambio sin reiniciar T3), luego el
    # proceso y, si no hay nada, 5 GB.
    $minGb = 5.0
    $fuente = 'por defecto'
    $deMaquina = [Environment]::GetEnvironmentVariable('VANTARE_CARGO_MIN_GB', 'Machine')
    if ($deMaquina) { $minGb = [double]$deMaquina; $fuente = 'Machine' }
    elseif ($env:VANTARE_CARGO_MIN_GB) { $minGb = [double]$env:VANTARE_CARGO_MIN_GB; $fuente = 'proceso' }
    # Umbral de memoria COMPROMETIDA, también en cada vuelta: Machine > proceso > 14 GB.
    $commitUmbral = 14.0
    $commitFuente = 'por defecto'
    $umbralMaquina = [Environment]::GetEnvironmentVariable('VANTARE_CARGO_COMMIT_2GB', 'Machine')
    if ($umbralMaquina) { $commitUmbral = [double]$umbralMaquina; $commitFuente = 'Machine' }
    elseif ($env:VANTARE_CARGO_COMMIT_2GB) { $commitUmbral = [double]$env:VANTARE_CARGO_COMMIT_2GB; $commitFuente = 'proceso' }
    $os = Get-CimInstance Win32_OperatingSystem
    $freeGb = $os.FreePhysicalMemory / 1MB
    # Comprometido = límite de commit (RAM + pagefile) menos lo libre de ese límite.
    $commitGb = ($os.TotalVirtualMemorySize - $os.FreeVirtualMemory) / 1MB
    # Slots efectivos por memoria: 2 bajo el umbral, 1 a partir de él; nunca 0 ni por encima
    # del tope de VANTARE_CARGO_SLOTS.
    $porMemoria = if ($commitGb -lt $commitUmbral) { 2 } else { 1 }
    $efectivos = [math]::Max(1, [math]::Min($porMemoria, $slots))
    $busy = 0
    $mine = @()
    for ($i = 0; $i -lt $slots; $i++) {
        $m = [Threading.Mutex]::new($false, "Global\VantareCargoSlot$i")
        try { if ($m.WaitOne(0)) { $mine += $m } else { $busy++; $m.Dispose() } }
        catch [Threading.AbandonedMutexException] { $mine += $m }
    }
    $needGb = $minGb + $busy * $workerGb
    $regla = if ($commitGb -lt $commitUmbral) { 'comprometido bajo el umbral' } else { 'comprometido igual o por encima del umbral' }
    $motivo = "{0}: {1:N1} GB comprometidos, umbral {2:N1} GB ({3})" -f $regla, $commitGb, $commitUmbral, $commitFuente
    # Entra si hay un hueco dentro de los slots efectivos y no los supera; con ningún otro
    # worker compilando, entra aunque falte RAM (mejor tirar de disco que esperar una hora).
    $solo = ($busy -eq 0 -and $mine.Count -gt 0)
    if ($mine.Count -gt 0 -and $busy -lt $efectivos -and ($freeGb -ge $needGb -or $solo)) {
        $held = $mine[0]
        for ($k = 1; $k -lt $mine.Count; $k++) { $mine[$k].ReleaseMutex(); $mine[$k].Dispose() }
        Write-Host ("[cola] {0} slot(s) efectivo(s) de {1} ({2}); RAM libre {3:N1} GB" -f $efectivos, $slots, $motivo, $freeGb)
        if ($solo -and $freeGb -lt $needGb) {
            Write-Host ("[cola] nadie más compilaba y solo hay {0:N1} GB libres (mínimo {1:N1} GB de {2}): entro igual; el sistema tirará de disco" -f $freeGb, $minGb, $fuente)
        }
    } else {
        foreach ($m in $mine) { $m.ReleaseMutex(); $m.Dispose() }
        if ($busy -ge $efectivos) {
            Write-Host ("[cola] espero: {0} slot(s) efectivo(s) de {1} ya ocupados ({2}); RAM libre {3:N1} GB" -f $efectivos, $slots, $motivo, $freeGb)
        } elseif ($mine.Count -eq 0) {
            Write-Host ("[cola] espero: {0} huecos ocupados (límite {1}) y RAM libre {2:N1} GB" -f $busy, $slots, $freeGb)
        } else {
            Write-Host ("[cola] espero: RAM libre {0:N1} GB < {1:N1} GB pedidos ({2} huecos ocupados; mínimo {3:N1} GB de {4})" -f $freeGb, $needGb, $busy, $minGb, $fuente)
        }
        Start-Sleep -Seconds 5
    }
}
$espera = [math]::Round($waited.Elapsed.TotalSeconds)
if ($espera -gt 5) {
    Write-Host ("[cola] esperé {0} s por un hueco ({1}); RAM libre {2:N1} GB, mínimo {3:N1} GB de {4}" -f $espera, $motivo, $freeGb, $minGb, $fuente)
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
