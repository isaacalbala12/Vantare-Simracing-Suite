# Mide un conjunto de procesos cualquiera (app nativa, Wails, otro) sin CDP ni WebView2:
# CPU total, memoria privada, working set y GPU dedicada de los procesos pedidos (rol `app`),
# opcionalmente dwm.exe (rol `dwm`), más frame time del juego con PresentMon (rol `game`).
# Genera el mismo CSV que huella.ps1, así que huella-resumen.mjs sirve tal cual
# (--condition o --compare wails,nativo). Los procesos deben estar ya en marcha.
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string[]]$Procesos,
    [string]$Etiqueta = 'medir',
    [switch]$IncluirHijos,
    [switch]$IncluirDwm,
    [string]$Juego = 'Le Mans Ultimate',
    [switch]$SinJuego,
    [ValidateRange(1, 3600)]
    [int]$Duracion = 180,
    [ValidateRange(0, 60)]
    [int]$Calentamiento = 0,
    [string]$Escena = '',
    [string]$SesionLmu = '',
    [ValidateRange(0, 200)]
    [int]$Coches = 0,
    [string]$Salida = 'results',
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'huella-medir.ps1 requiere PowerShell 7 o posterior.' }
# Con `pwsh -File`, `-Procesos a,b` llega como un solo texto.
$Procesos = @($Procesos -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
. (Join-Path $PSScriptRoot 'huella-comun.ps1')
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$summaryHelper = Join-Path $PSScriptRoot 'huella-resumen.mjs'
$baseDir = if ([IO.Path]::IsPathRooted($Salida)) { $Salida } else { Join-Path $repoRoot $Salida }
$outputDir = [IO.Path]::GetFullPath($baseDir)
$logicalProcessors = [Environment]::ProcessorCount

# Roles por PID: `app` = coincidencias por nombre/PID (+ descendientes), `dwm` = dwm.exe.
function Get-TargetRoles {
    $all = @(Get-CimInstance Win32_Process)
    $roles = @{}
    foreach ($entry in $all) {
        foreach ($target in $Procesos) {
            $hit = if ($target -match '^\d+$') { [int]$entry.ProcessId -eq [int]$target } else { $entry.Name -ieq ($target -replace '(?i)(\.exe)?$', '.exe') }
            if ($hit) { $roles[[int]$entry.ProcessId] = 'app' }
        }
        if ($IncluirDwm -and $entry.Name -ieq 'dwm.exe') { $roles[[int]$entry.ProcessId] = 'dwm' }
    }
    if ($IncluirHijos) {
        do {
            $added = $false
            foreach ($entry in $all) {
                $parent = [int]$entry.ParentProcessId
                if (-not $roles.ContainsKey([int]$entry.ProcessId) -and $roles.ContainsKey($parent) -and $roles[$parent] -eq 'app') {
                    $roles[[int]$entry.ProcessId] = 'app'
                    $added = $true
                }
            }
        } while ($added)
    }
    $roles
}

$gameName = [IO.Path]::GetFileNameWithoutExtension($Juego)
$gameProcess = if ($SinJuego) { $null } else { Get-Process -Name $gameName -ErrorAction SilentlyContinue | Select-Object -First 1 }
$presentMonPath = (Get-Command PresentMon.exe -CommandType Application -ErrorAction SilentlyContinue)?.Source
if (-not $presentMonPath) {
    $standalone = Join-Path $env:LOCALAPPDATA 'Programs\PresentMon\PresentMon.exe'
    if (Test-Path -LiteralPath $standalone) { $presentMonPath = $standalone }
}
$roleByPid = Get-TargetRoles
$appExes = @(Get-CimInstance Win32_Process | Where-Object { $roleByPid[[int]$_.ProcessId] -eq 'app' -and $_.ExecutablePath } | Select-Object -ExpandProperty ExecutablePath -Unique)

if ($DryRun) {
    [ordered]@{
        schema = 'vantare.huella.medir.dry-run.v1'; label = $Etiqueta; targets = $Procesos; includeChildren = [bool]$IncluirHijos
        includeDwm = [bool]$IncluirDwm
        matchedProcesses = @($roleByPid.GetEnumerator() | Sort-Object Name | ForEach-Object { [ordered]@{ pid = $_.Key; role = $_.Value } })
        executables = $appExes; game = if ($SinJuego) { $null } else { $Juego }; gameRunning = [bool]$gameProcess
        presentMon = if ($SinJuego) { $null } else { $presentMonPath }; durationSeconds = $Duracion; outputDirectory = $outputDir
    } | ConvertTo-Json -Depth 4
    exit 0
}

if (-not ($roleByPid.Values -contains 'app')) { throw "Ningún proceso coincide con: $($Procesos -join ', '). Arranca la app antes de medir." }
if (-not $SinJuego -and -not $gameProcess) { throw "No se encontró el juego '$Juego'; usa -SinJuego para medir solo procesos." }
if (-not $SinJuego -and -not $presentMonPath) { throw 'PresentMon 2.x no está en PATH ni en la ruta standalone documentada.' }

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stem = '{0}-{1}' -f $Etiqueta.ToLowerInvariant(), $stamp
$rawCsv = Join-Path $outputDir "$stem.csv"
$summaryMd = Join-Path $outputDir "$stem.md"
$presentMonCsv = Join-Path $outputDir "$stem-presentmon.csv"
$exeSha256 = ($appExes | ForEach-Object { '{0}:{1}' -f (Split-Path $_ -Leaf), (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant() }) -join ';'
$gameStartedAt = if ($gameProcess) { $gameProcess.StartTime.ToUniversalTime() } else { $null }

$rows = [Collections.Generic.List[object]]::new()
$previousCpu = @{}
$previousCpuAt = @{}
$cpuClock = [Diagnostics.Stopwatch]::StartNew()
$presentMon = $null
$sessionName = $null
$gameStable = $true
$gameFrametimeValid = $false

# Misma forma de fila que huella.ps1 para que huella-resumen.mjs la agregue igual.
function New-Row([hashtable]$Values) {
    $row = [ordered]@{
        timestamp = ''; condition = $Etiqueta; pid = $null; role = ''; processName = ''
        buildSha256 = ''; distSha256 = ''; exeSha256 = $exeSha256; buildStable = $true
        scene = $Escena; lmuSession = $SesionLmu; cars = $Coches; gamePresent = -not [bool]$SinJuego
        hygieneForced = $false; publishable = $true; measurementMode = 'procesos'; gameFrametimeValid = $false; frametimePublishable = $false
        privateBytes = $null; workingSetBytes = $null; cpuPct = $null; gpuSampleValid = $null; gpuPct = $null; gpuDedicatedBytes = $null
        frameTimeMs = $null; dropped = $null
    }
    foreach ($key in $Values.Keys) { $row[$key] = $Values[$key] }
    [pscustomobject]$row
}

try {
    if (-not $SinJuego) {
        $sessionName = "VantareHuella-$PID-$stamp"
        $presentMonArgs = @('--process_name', ('"{0}"' -f "$gameName.exe"), '--output_file', ('"{0}"' -f $presentMonCsv), '--v2_metrics', '--timed', [string]$Duracion, '--terminate_after_timed', '--session_name', $sessionName, '--no_console_stats')
        $presentMon = Start-Process -FilePath $presentMonPath -ArgumentList $presentMonArgs -RedirectStandardOutput (Join-Path $outputDir "$stem-presentmon.log") -RedirectStandardError (Join-Path $outputDir "$stem-presentmon-error.log") -WindowStyle Hidden -PassThru
    }
    if ($Calentamiento -gt 0) { Start-Sleep -Seconds $Calentamiento }
    foreach ($processId in $roleByPid.Keys) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        $seconds = if ($process) { try { $process.TotalProcessorTime.TotalSeconds } catch { $null } }
        if ($null -ne $seconds) { $previousCpu[$processId] = $seconds; $previousCpuAt[$processId] = $cpuClock.Elapsed.TotalSeconds }
    }
    $sampleIndex = 0
    $sampleDeadline = (Get-Date).AddSeconds($Duracion)
    while ((Get-Date) -lt $sampleDeadline) {
        Start-Sleep -Seconds 1
        $now = Get-Date
        if ($sampleIndex % 5 -eq 0) { $roleByPid = Get-TargetRoles }
        $gpuSample = Get-GpuTotals
        foreach ($processId in @($roleByPid.Keys)) {
            $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
            if (-not $process) { continue }
            # dwm.exe y otros protegidos niegan TotalProcessorTime sin consola elevada: CPU vacío, memoria y GPU siguen.
            $cpuSeconds = try { $process.TotalProcessorTime.TotalSeconds } catch { $null }
            $cpuPct = $null
            if ($null -ne $cpuSeconds) {
                $cpuSampleAt = $cpuClock.Elapsed.TotalSeconds
                $elapsed = if ($previousCpuAt.ContainsKey($processId)) { $cpuSampleAt - $previousCpuAt[$processId] } else { 0 }
                $cpuPct = if ($elapsed -gt 0) { [Math]::Max(0.0, (($cpuSeconds - $previousCpu[$processId]) / $elapsed / $logicalProcessors) * 100) } else { 0 }
                $previousCpu[$processId] = $cpuSeconds
                $previousCpuAt[$processId] = $cpuSampleAt
            }
            $gpu = if ($gpuSample.Valid -and $gpuSample.Totals.ContainsKey($processId)) { $gpuSample.Totals[$processId] } else { @{ Engine = 0.0; Dedicated = 0.0 } }
            $rows.Add((New-Row @{
                timestamp = $now.ToString('o'); pid = $processId; role = $roleByPid[$processId]; processName = $process.ProcessName
                privateBytes = [int64]$process.PrivateMemorySize64; workingSetBytes = [int64]$process.WorkingSet64
                cpuPct = if ($null -ne $cpuPct) { Format-Invariant $cpuPct } else { $null }; gpuSampleValid = [bool]$gpuSample.Valid
                gpuPct = if ($gpuSample.Valid) { Format-Invariant ([double]$gpu.Engine) } else { $null }
                gpuDedicatedBytes = if ($gpuSample.Valid) { Format-Invariant ([double]$gpu.Dedicated) } else { $null }
            }))
        }
        if ($gameProcess) {
            $current = Get-Process -Id $gameProcess.Id -ErrorAction SilentlyContinue
            $gameStable = $gameStable -and $null -ne $current -and $current.StartTime.ToUniversalTime() -eq $gameStartedAt
        }
        $sampleIndex += 1
    }

    if ($presentMon -and -not $presentMon.HasExited) { $presentMon.WaitForExit(($Duracion + 30) * 1000) | Out-Null }
    if ($presentMon -and (Test-Path -LiteralPath $presentMonCsv)) {
        $pmFrames = Read-PresentMonFrames $presentMonCsv
        foreach ($frame in $pmFrames.Frames) {
            $rows.Add((New-Row @{ timestamp = $frame.Timestamp; pid = $gameProcess.Id; role = 'game'; processName = $gameName; frameTimeMs = Format-Invariant $frame.FrameTimeMs; dropped = [string]$frame.Dropped }))
        }
        $gameFrametimeValid = $pmFrames.Frames.Count -gt 0
        Write-Host ("Frames perdidos: {0}/{1}" -f $pmFrames.Dropped, $pmFrames.Frames.Count)
    }
    if (-not $SinJuego -and -not $gameFrametimeValid) { Write-Warning 'FRAMETIME NO PUBLICABLE: PresentMon no produjo ningún frame válido.' }
    if (-not $SinJuego -and -not $gameStable) { Write-Warning 'El juego se reinició durante la medida: no publicable.' }
    foreach ($row in $rows) {
        $row.gameFrametimeValid = $gameFrametimeValid
        $row.frametimePublishable = $gameFrametimeValid -and $gameStable
        $row.publishable = -not [bool]$SinJuego -and $gameStable
    }
    $rows | Export-Csv -LiteralPath $rawCsv -NoTypeInformation -Encoding utf8
    & node $summaryHelper --run-summary --condition $Etiqueta --output $summaryMd $rawCsv | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "El resumen falló con código $LASTEXITCODE." }
} finally {
    try {
        if ($presentMon -and -not $presentMon.HasExited -and -not $presentMon.WaitForExit(5000)) { Stop-Process -Id $presentMon.Id -Force -ErrorAction SilentlyContinue }
    } catch { Write-Warning "No se pudo cerrar el PresentMon propio: $($_.Exception.Message)" }
    if ($sessionName) { try { $null = Stop-HuellaEtwSession $sessionName } catch { Write-Verbose "Sesión ETW ya detenida: $sessionName" } }
}

Write-Host "CSV: $rawCsv"
Write-Host "Resumen: $summaryMd"
