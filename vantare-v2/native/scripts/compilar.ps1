# Cola de compilación: como máximo dos slots globales, limitados además por RAM.
# Uso: native/scripts/compilar.ps1 <comando> [args...]
# Target persistente configurable por slot; cuatro jobs en el servidor (#1993).
# El mínimo y el umbral de memoria se releen de Machine en cada vuelta.
# En local sccache está activado por defecto. Si cargo o rustc terminan con
# 0xC0000005 (STATUS_ACCESS_VIOLATION), el comando se reintenta una vez con
# VANTARE_SCCACHE=0 y se conservan ambos resultados.
. (Join-Path $PSScriptRoot 'target-slot.ps1')
. (Join-Path $PSScriptRoot 'queue-decision.ps1')
# Insert Cargo's target as an option right after the subcommand. Appending it
# after a trailing argument makes the binary receive `--target-dir` (PowerShell
# drops the literal `--` when a script is invoked with `&`).
function Add-VantareTargetArgument {
    param([object[]]$Arguments, [int]$SubcommandIndex, [string]$Target)
    if (-not $Target) { throw 'La cola no tiene target para el comando.' }
    $insert = if ($Arguments[$SubcommandIndex] -ieq 'nextest') { $SubcommandIndex + 2 } else { $SubcommandIndex + 1 }
    if ($Arguments.Count -le $insert) {
        return @($Arguments) + @('--target-dir', $Target)
    }
    return @($Arguments[0..($insert - 1)]) + @('--target-dir', $Target) + @($Arguments[$insert..($Arguments.Count - 1)])
}
# Normalize Cargo's inline spelling before validating or acquiring a target.
$normalized = @()
foreach ($argument in $args) {
    if ($argument -like '--target-dir=*') { $normalized += @('--target-dir', $argument.Substring(13)) }
    else { $normalized += $argument }
}
$args = $normalized
# Packaging supplies its own output target through the environment. Treat it
# exactly like an explicit CLI target, including validation and the target lease.
if ($env:CARGO_TARGET_DIR -and $args.Count -gt 1 -and
    [IO.Path]::GetFileNameWithoutExtension($args[0]) -ieq 'cargo' -and
    $args[1] -in @('build', 'check', 'clippy', 'test', 'nextest', 'run', 'rustc', 'bench', 'doc', 'install') -and
    '--target-dir' -notin $args) {
    $args = Add-VantareTargetArgument -Arguments $args -SubcommandIndex 1 -Target $env:CARGO_TARGET_DIR
}
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
                $CommandArguments = Add-VantareTargetArgument -Arguments $CommandArguments -SubcommandIndex 0 -Target $previousTarget
            }
            # sccache keys CARGO_TARGET_DIR; use the CLI path to share dependencies across slots.
            Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
        }
        $attempt = 0
        while ($true) {
            $attempt++
            $global:LASTEXITCODE = 0
            $script:commandOutput = @()
            & $CommandName @CommandArguments 2>&1 | ForEach-Object {
                $script:commandOutput += $_
                $_
            }
            $script:commandExitCode = [int]$global:LASTEXITCODE
            if (-not $? -and $script:commandExitCode -eq 0) { $script:commandExitCode = 1 }
            $text = ($script:commandOutput | Out-String)
            $crashed = ($script:commandExitCode -in @(-1073741819, 3221225477)) -or
                ($text -match '0xC0000005|STATUS_ACCESS_VIOLATION|3221225477|-1073741819')
            if ($crashed -and $attempt -eq 1 -and $env:VANTARE_SCCACHE -ne '0') {
                Write-Host '[cola] 0xC0000005 en la compilación; reintento una vez sin sccache (VANTARE_SCCACHE=0).'
                $env:VANTARE_SCCACHE = '0'
                Remove-Item Env:RUSTC_WRAPPER -ErrorAction SilentlyContinue
                continue
            }
            break
        }
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
$sccacheEnabled = $env:VANTARE_SCCACHE -ne '0'
if ($sccacheEnabled -and -not $env:RUSTC_WRAPPER -and (Get-Command sccache -ErrorAction SilentlyContinue)) { $env:RUSTC_WRAPPER = 'sccache' }
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
# Fase 1 (#1993): los gates de worker se reparten por clase. `heavy` (runtime y
# hub-host) entra solo con 4 jobs y las dos ranuras; `light` comparte las dos
# ranuras con 2 jobs. `direct` conserva la decisión actual (CI, release y
# cualquier comando que no venga de comprobar.ps1).
$queueMode = [Environment]::GetEnvironmentVariable('VANTARE_CARGO_QUEUE_MODE', 'Machine')
if (-not $queueMode) { $queueMode = $env:VANTARE_CARGO_QUEUE_MODE }
if (-not $queueMode) { $queueMode = 'fase1' }
$queueClass = 'direct'
if ($queueMode -eq 'fase1') {
    if ($env:VANTARE_QUEUE_CLASS -in @('heavy', 'light')) { $queueClass = $env:VANTARE_QUEUE_CLASS }
    elseif (($args -join ' ') -match 'overlays-rune') { $queueClass = 'light' }
}
function Get-VantareQueueSetting {
    param([string]$Name, [string]$Default)
    $value = [Environment]::GetEnvironmentVariable($Name, 'Machine')
    if (-not $value) { $value = [Environment]::GetEnvironmentVariable($Name, 'Process') }
    if ($value) { return $value }
    return $Default
}
$limits = @{
    CommitCeiling = [double](Get-VantareQueueSetting 'VANTARE_CARGO_COMMIT_CEILING' '20')
    FreeFloor = [double](Get-VantareQueueSetting 'VANTARE_CARGO_FREE_FLOOR' '3')
    HeavyGB = [double](Get-VantareQueueSetting 'VANTARE_CARGO_HEAVY_GB' '4')
    LightGB = [double](Get-VantareQueueSetting 'VANTARE_CARGO_LIGHT_GB' '2.5')
    HeavyJobs = [int](Get-VantareQueueSetting 'VANTARE_CARGO_HEAVY_JOBS' '4')
    LightJobs = [int](Get-VantareQueueSetting 'VANTARE_CARGO_LIGHT_JOBS' '2')
}
$buildJobs = $jobs
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
    $busy = 0
    $mine = @()
    for ($i = 0; $i -lt $slots; $i++) {
        $m = [Threading.Mutex]::new($false, "Global\VantareCargoSlot$i")
        try { if ($m.WaitOne(0)) { $mine += $m; $slotNumbers[$m] = $i } else { $busy++; $m.Dispose() } }
        catch [Threading.AbandonedMutexException] { $mine += $m; $slotNumbers[$m] = $i }
    }
    if ($queueClass -eq 'direct') {
        # Slots efectivos por memoria: 2 bajo el umbral, 1 a partir de él; nunca 0 ni por encima
        # del tope de VANTARE_CARGO_SLOTS.
        $porMemoria = if ($commitGb -lt $commitUmbral) { 2 } else { 1 }
        $efectivos = [math]::Max(1, [math]::Min($porMemoria, $slots))
        $needGb = $minGb + $busy * $workerGb
        $regla = if ($commitGb -lt $commitUmbral) { 'comprometido bajo el umbral' } else { 'comprometido igual o por encima del umbral' }
        $motivo = "{0}: {1:N1} GB comprometidos, umbral {2:N1} GB ({3})" -f $regla, $commitGb, $commitUmbral, $commitFuente
        # Entra si hay un hueco dentro de los slots efectivos y no los supera; con ningún otro
        # worker compilando, entra aunque falte RAM (mejor tirar de disco que esperar una hora).
        $solo = ($busy -eq 0 -and $mine.Count -gt 0)
        if ($mine.Count -gt 0 -and $busy -lt $efectivos -and ($freeGb -ge $needGb -or $solo)) {
            $held = @($mine[0])
            for ($k = 1; $k -lt $mine.Count; $k++) { $mine[$k].ReleaseMutex(); $mine[$k].Dispose() }
            $buildJobs = $jobs
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
    } else {
        # Fase 1: pesados exclusivos con 4 jobs; ligeros 2 jobs en las dos ranuras.
        $minGb = [double]$limits.FreeFloor
        $fuente = 'fase1'
        $commitUmbral = [double]$limits.CommitCeiling
        $commitFuente = 'fase1'
        $decision = Get-VantareQueueDecision -Class $queueClass -FreeSlots $mine.Count -ActiveSlots $busy `
            -Slots $slots -FreeGB $freeGb -CommitGB $commitGb -Limits $limits
        $needGb = [double]$decision.NeedGB
        $motivo = "fase1 {0}: commit {1:N1}/{2:N1} GB, libre {3:N1} GB, otras {4}" -f $queueClass, $commitGb, $commitUmbral, $freeGb, $busy
        $hold = [int]$decision.HoldSlots
        if ($decision.Enter -and $mine.Count -ge $hold) {
            $held = @($mine[0..($hold - 1)])
            for ($k = $hold; $k -lt $mine.Count; $k++) { $mine[$k].ReleaseMutex(); $mine[$k].Dispose() }
            $buildJobs = [int]$decision.Jobs
            Write-Host ("[cola] fase1 {0}: {1} job(s), {2} ranura(s) ({3})" -f $queueClass, $buildJobs, $hold, $decision.Reason)
        } else {
            foreach ($m in $mine) { $m.ReleaseMutex(); $m.Dispose() }
            Write-Host ("[cola] espero: {0} ({1})" -f $decision.Reason, $motivo)
            Start-Sleep -Seconds 5
        }
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
    $slotTarget = Initialize-VantareSlotTarget -Slot $slotNumbers[$held[0]] -Root $targetRoot -Ci:($env:VANTARE_CI_TARGET -eq '1')
    $env:VANTARE_CARGO_QUEUE_OWNER = [string]$PID
    $env:VANTARE_SLOT_TARGET = $slotTarget
    $env:CARGO_TARGET_DIR = $slotTarget
    $env:TMP = Join-Path $slotTarget 'tmp'
    $env:TEMP = $env:TMP
    [IO.Directory]::CreateDirectory($env:TMP) | Out-Null
    # gates.ps1 lee VANTARE_BUILD_JOBS para -j/--build-jobs; no toca CARGO_BUILD_JOBS,
    # que forma parte de la clave de sccache. `direct` no lo define (comportamiento actual).
    if ($queueClass -ne 'direct') { $env:VANTARE_BUILD_JOBS = [string]$buildJobs }
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
    foreach ($m in $held) { $m.ReleaseMutex(); $m.Dispose() }
}
exit $code
