# Cola de compilación: como máximo dos slots globales, limitados además por RAM.
# Uso: native/scripts/compilar.ps1 <comando> [args...]
# Target persistente configurable por slot; cuatro jobs en el servidor (#1993).
# El mínimo y el umbral de memoria se releen de Machine en cada vuelta.
# VANTARE_SCCACHE=0 permite repetir un fallo sin caché.
. (Join-Path $PSScriptRoot 'target-slot.ps1')
# Normalize Cargo's inline spelling before validating or acquiring a target.
$normalized = @()
foreach ($argument in $args) {
    if ($argument -like '--target-dir=*') { $normalized += @('--target-dir', $argument.Substring(13)) }
    else { $normalized += $argument }
}
$args = $normalized
for ($index = 0; $index -lt $args.Count; $index++) {
    if ($args[$index] -in @('--target-dir', '-TargetDirectory')) {
        if ($index + 1 -ge $args.Count -or -not (Test-VantareTargetPath $args[$index + 1])) {
            throw 'El target explícito debe ser absoluto y respetar la raíz configurada.'
        }
    }
}
function Invoke-VantareQueuedCommand {
    param([string]$CommandName, [object[]]$CommandArguments)
    $previousTarget = [Environment]::GetEnvironmentVariable('CARGO_TARGET_DIR', 'Process')
    try {
        if ([IO.Path]::GetFileNameWithoutExtension($CommandName) -ieq 'cargo' -and
            $CommandArguments.Count -and $CommandArguments[0] -in @('build', 'check', 'clippy', 'test', 'nextest', 'run', 'rustc', 'bench', 'doc', 'install')) {
            if (-not ($CommandArguments | Where-Object { $_ -eq '--target-dir' -or $_ -like '--target-dir=*' })) {
                $separator = [array]::IndexOf($CommandArguments, '--')
                if ($separator -lt 0) { $CommandArguments += @('--target-dir', $previousTarget) }
                else {
                    $CommandArguments = @($CommandArguments[0..($separator - 1)]) +
                        @('--target-dir', $previousTarget) + @($CommandArguments[$separator..($CommandArguments.Count - 1)])
                }
            }
            # sccache keys CARGO_TARGET_DIR; use the CLI path to share dependencies across slots.
            Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
        }
        $global:LASTEXITCODE = 0
        & $CommandName @CommandArguments
        $script:commandExitCode = if ($?) { [int]$global:LASTEXITCODE } else { [math]::Max(1, [int]$global:LASTEXITCODE) }
    } finally {
        [Environment]::SetEnvironmentVariable('CARGO_TARGET_DIR', $previousTarget, 'Process')
    }
}
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
        if (-not (Test-VantareTargetPath $env:CARGO_TARGET_DIR)) { throw 'Target anidado fuera del volumen configurado.' }
        . (Join-Path $PSScriptRoot 'slot-workspace.ps1')
        Set-VantareSlotWorkspace -Target $env:CARGO_TARGET_DIR -NativeRoot (Split-Path $PSScriptRoot)
        $cmd, $rest = $args
        Invoke-VantareQueuedCommand -CommandName $cmd -CommandArguments $rest
        exit $script:commandExitCode
    }
}
if (-not $env:SCCACHE_DIR) {
    $cacheDirectory = if ($IsWindows) { [Environment]::GetEnvironmentVariable('SCCACHE_DIR', 'Machine') } else { $null }
    $env:SCCACHE_DIR = $cacheDirectory ?? $(if ($env:RUNNER_ENVIRONMENT -eq 'github-hosted') {
        Join-Path $env:RUNNER_TEMP 'vantare-cache/sccache'
    } else { Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Vantare/sccache' })
}
$env:SCCACHE_SERVER_PORT = $env:SCCACHE_SERVER_PORT ?? '4227'
$env:SCCACHE_CACHE_SIZE = $(if ($IsWindows) { [Environment]::GetEnvironmentVariable('SCCACHE_CACHE_SIZE', 'Machine') }) ?? $env:SCCACHE_CACHE_SIZE ?? '5G'
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
$ciLease = $null
$targetRoot = Get-VantareTargetRoot
try {
    if ($env:VANTARE_CI_TARGET -eq '1') {
        $ciPath = [IO.Path]::GetFullPath((Join-Path $targetRoot 'ci')).ToLowerInvariant()
        $ciDigest = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($ciPath)))
        $ciLease = [Threading.Mutex]::new($false, "Global\VantareCargoTarget-$ciDigest")
        try { $null = $ciLease.WaitOne() } catch [Threading.AbandonedMutexException] { }
    }
    . (Join-Path $PSScriptRoot 'target-slot.ps1')
    $slotTarget = Initialize-VantareSlotTarget -Slot $slotNumbers[$held] -Root $targetRoot -Ci:($env:VANTARE_CI_TARGET -eq '1')
    $env:VANTARE_CARGO_QUEUE_OWNER = [string]$PID
    $env:VANTARE_SLOT_TARGET = $slotTarget
    $env:CARGO_TARGET_DIR = $slotTarget
    $env:TMP = Join-Path $slotTarget 'tmp'
    $env:TEMP = $env:TMP
    [IO.Directory]::CreateDirectory($env:TMP) | Out-Null
    $cmd, $rest = $args
    # Explicit targets for measurements/distribution stay on the configured volume.
    for ($index = 0; $index -lt $rest.Count; $index++) {
        if ($rest[$index] -in @('--target-dir', '-TargetDirectory')) {
            if ($index + 1 -ge $rest.Count -or -not (Test-VantareTargetPath $rest[$index + 1])) {
                throw 'El target explícito debe ser absoluto y respetar la raíz configurada.'
            }
            $explicitTarget = [IO.Path]::GetFullPath($rest[$index + 1]).ToLowerInvariant()
            $reserved = @('slot-0', 'slot-1', 'ci') | ForEach-Object { [IO.Path]::GetFullPath((Join-Path $targetRoot $_)) }
            if ($explicitTarget -iin $reserved -and $explicitTarget -ine $slotTarget) {
                throw 'No se puede usar explícitamente el target reservado a otro slot o al runner.'
            }
            $digest = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($explicitTarget)))
            if ($targetLease) { throw 'Un solo target explícito por invocación.' }
            $targetLease = [Threading.Mutex]::new($false, "Global\VantareCargoTarget-$digest")
            try { $null = $targetLease.WaitOne() } catch [Threading.AbandonedMutexException] { }
        }
    }
    if ($targetLease) { $env:CARGO_TARGET_DIR = $explicitTarget; $env:VANTARE_SLOT_TARGET = $explicitTarget }
    . (Join-Path $PSScriptRoot 'slot-workspace.ps1')
    Set-VantareSlotWorkspace -Target $env:CARGO_TARGET_DIR -NativeRoot (Split-Path $PSScriptRoot)
    Invoke-VantareQueuedCommand -CommandName $cmd -CommandArguments $rest
    $code = $script:commandExitCode
} catch {
    Write-Host "[cola] el comando falló: $_"
    $code = 1
} finally {
    if ($targetLease) { $targetLease.ReleaseMutex(); $targetLease.Dispose() }
    if ($ciLease) { $ciLease.ReleaseMutex(); $ciLease.Dispose() }
    Remove-Item Env:VANTARE_CARGO_QUEUE_OWNER -ErrorAction SilentlyContinue
    $held.ReleaseMutex(); $held.Dispose()
}
exit $code
