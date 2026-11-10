# Cola de compilación: como máximo dos slots globales, limitados además por RAM.
# Uso: native/scripts/compilar.ps1 <comando> [args...]
# Target persistente en D: por slot; cuatro jobs en el servidor (#1993).
# El mínimo y el umbral de memoria se releen de Machine en cada vuelta.
# VANTARE_SCCACHE=0 permite repetir un fallo sin caché.
# A synchronous nested build (packaging/lifecycle) reuses its ancestor's lease.
# A copied environment alone is insufficient: the owner must still be an ancestor.
if ($env:VANTARE_CARGO_QUEUE_OWNER) {
    $ancestor = $PID
    $leased = $false
    for ($depth = 0; $depth -lt 32 -and $ancestor -gt 0; $depth++) {
        if ($ancestor -eq [int]$env:VANTARE_CARGO_QUEUE_OWNER) { $leased = $true; break }
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ancestor"
        if (-not $process) { break }
        $ancestor = $process.ParentProcessId
    }
    if ($leased) {
        if ($env:CARGO_TARGET_DIR -notmatch '^[dD]:[\\/]') { throw 'Target anidado fuera de D:.' }
        $cmd, $rest = $args
        $global:LASTEXITCODE = 0
        & $cmd @rest
        exit $(if ($?) { [int]$global:LASTEXITCODE } else { [math]::Max(1, [int]$global:LASTEXITCODE) })
    }
}
$env:SCCACHE_DIR = 'D:\VantareServer\cache\sccache'
$env:SCCACHE_CACHE_SIZE = '5G'
if ($env:VANTARE_SCCACHE -ne '0' -and -not $env:RUSTC_WRAPPER -and (Get-Command sccache -ErrorAction SilentlyContinue)) { $env:RUSTC_WRAPPER = 'sccache' }
$slots = [math]::Min(2, [int]($env:VANTARE_CARGO_SLOTS ?? 2))
if ($slots -lt 1) { $slots = 1 }
$machineJobs = [Environment]::GetEnvironmentVariable('CARGO_BUILD_JOBS', 'Machine')
$jobs = [int]($machineJobs ?? $env:CARGO_BUILD_JOBS ?? 4)
$env:CARGO_BUILD_JOBS = [string]$jobs
$slotNumbers = @{}
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
        try { if ($m.WaitOne(0)) { $mine += $m; $slotNumbers[$m] = $i } else { $busy++; $m.Dispose() } }
        catch [Threading.AbandonedMutexException] { $mine += $m; $slotNumbers[$m] = $i }
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
$targetLease = $null
try {
    . (Join-Path $PSScriptRoot 'target-slot.ps1')
    $slotTarget = Initialize-VantareSlotTarget -Slot $slotNumbers[$held]
    $env:VANTARE_CARGO_QUEUE_OWNER = [string]$PID
    $env:VANTARE_SLOT_TARGET = $slotTarget
    $env:CARGO_TARGET_DIR = $slotTarget
    $env:TMP = Join-Path $slotTarget 'tmp'
    $env:TEMP = $env:TMP
    [IO.Directory]::CreateDirectory($env:TMP) | Out-Null
    $cmd, $rest = $args
    # Explicit targets remain available for controlled measurements/distribution, on D: only.
    for ($index = 0; $index -lt $rest.Count; $index++) {
        if ($rest[$index] -in @('--target-dir', '-TargetDirectory')) {
            if ($index + 1 -ge $rest.Count -or $rest[$index + 1] -notmatch '^[dD]:[\\/]') {
                throw 'El target explícito debe ser absoluto y estar en D:.'
            }
            $explicitTarget = [IO.Path]::GetFullPath($rest[$index + 1]).ToLowerInvariant()
            $digest = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($explicitTarget)))
            if ($targetLease) { throw 'Un solo target explícito por invocación.' }
            $targetLease = [Threading.Mutex]::new($false, "Global\VantareCargoTarget-$digest")
            try { $null = $targetLease.WaitOne() } catch [Threading.AbandonedMutexException] { }
        }
    }
    $global:LASTEXITCODE = 0
    & $cmd @rest
    $code = if ($?) { [int]$global:LASTEXITCODE } else { [math]::Max(1, [int]$global:LASTEXITCODE) }
} catch {
    Write-Host "[cola] el comando falló: $_"
    $code = 1
} finally {
    if ($targetLease) { $targetLease.ReleaseMutex(); $targetLease.Dispose() }
    Remove-Item Env:VANTARE_CARGO_QUEUE_OWNER -ErrorAction SilentlyContinue
    $held.ReleaseMutex(); $held.Dispose()
}
exit $code
