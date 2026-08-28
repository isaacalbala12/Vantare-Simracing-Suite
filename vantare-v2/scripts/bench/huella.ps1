[CmdletBinding()]
param(
    [ValidateSet('A0', 'A1', 'HubVisible', 'HubMin')]
    [string]$Condicion = 'A1',
    [string]$Exe = 'bin/vantare-isa924.exe',
    [string]$Perfil = 'testdata/bench/huella-endurance-3.json',
    [ValidateRange(1, 3600)]
    [int]$Duracion = 180,
    [ValidateRange(1024, 65535)]
    [int]$Puerto = 9247,
    [string]$Juego = 'Le Mans Ultimate',
    [string]$Salida = 'results',
    [switch]$Forzar,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw 'huella.ps1 requiere PowerShell 7 o posterior.'
}
if ($Puerto -in @(9222, 9231)) {
    throw "El puerto $Puerto está reservado por otros bancos; usa un puerto propio."
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
function Resolve-BenchPath([string]$Path, [switch]$MustExist) {
    $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repoRoot $Path }
    if ($MustExist) { return (Resolve-Path -LiteralPath $candidate).Path }
    return [IO.Path]::GetFullPath($candidate)
}

$exePath = Resolve-BenchPath $Exe -MustExist
$profilePath = Resolve-BenchPath $Perfil -MustExist
$outputDir = Resolve-BenchPath $Salida
$processHelper = Resolve-BenchPath 'scripts/bench/huella-procesos.mjs' -MustExist
$cdpHelper = Resolve-BenchPath 'scripts/bench/huella-cdp.mjs' -MustExist
$summaryHelper = Resolve-BenchPath 'scripts/bench/huella-resumen.mjs' -MustExist
if ([IO.Path]::GetExtension($exePath) -ne '.exe') { throw '-Exe debe apuntar a un ejecutable .exe.' }
if ([IO.Path]::GetExtension($profilePath) -ne '.json') { throw '-Perfil debe apuntar a un perfil JSON.' }

$presentMonDirectory = Join-Path $env:LOCALAPPDATA 'Programs\PresentMon'
$standalonePresentMon = Join-Path $presentMonDirectory 'PresentMon.exe'
$presentMonCommand = Get-Command PresentMon.exe -CommandType Application -ErrorAction SilentlyContinue
$presentMonPath = if ($presentMonCommand) {
    $presentMonCommand.Source
} elseif (Test-Path -LiteralPath $standalonePresentMon) {
    $standalonePresentMon
} else {
    $null
}
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$userPathParts = @($userPath -split ';' | Where-Object { $_ })

$profileDocument = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json
$expectedWidgetCount = @(
    $profileDocument.layouts.PSObject.Properties.Value |
        ForEach-Object { $_.widgets } |
        Where-Object { $null -eq $_.behavior.enabled -or $_.behavior.enabled }
).Count
if ($Condicion -ne 'A0' -and $expectedWidgetCount -lt 1) {
    throw 'El perfil no contiene widgets habilitados; no se puede validar que el overlay pinte.'
}

$plan = [ordered]@{
    schema = 'vantare.huella.dry-run.v1'
    condition = $Condicion
    executable = $exePath
    profile = $profilePath
    durationSeconds = $Duracion
    cdpPort = $Puerto
    game = $Juego
    outputDirectory = $outputDir
    presentMon = $presentMonPath
    presentMonUserPathPersisted = $presentMonDirectory -in $userPathParts
    expectedWidgets = $expectedWidgetCount
    forceHygiene = [bool]$Forzar
}
if ($DryRun) {
    $plan | ConvertTo-Json -Depth 4
    exit 0
}
if (Test-Path -LiteralPath $standalonePresentMon) {
    if ($presentMonDirectory -notin $userPathParts) {
        $updatedUserPath = (@($userPathParts) + $presentMonDirectory) -join ';'
        [Environment]::SetEnvironmentVariable('Path', $updatedUserPath, 'User')
    }
    if ($presentMonDirectory -notin @($env:Path -split ';')) {
        $env:Path = "$env:Path;$presentMonDirectory"
    }
}
if (-not $presentMonPath) {
    throw 'PresentMon 2.x no está en PATH ni en la ruta standalone documentada. Instala Intel.PresentMon antes de medir.'
}
if (Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue) {
    throw "El puerto CDP $Puerto ya está escuchando."
}

$hygieneCandidates = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -in @('msedge.exe', 'msedgewebview2.exe') -or $_.Name -like 'vantare*.exe'
} | Select-Object Name, ProcessId, ParentProcessId, CommandLine)
$hygieneInput = $hygieneCandidates | ConvertTo-Json -Compress -Depth 3 -AsArray
$hygieneClassification = $hygieneInput | & node $processHelper --hygiene | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $hygieneClassification) { throw 'No se pudo clasificar la higiene de procesos.' }
$systemWebView2 = @($hygieneClassification.systemWebView2)
$foreignBrowsers = @($hygieneClassification.foreign)
$systemWebView2Paths = @($systemWebView2.userDataDir | Where-Object { $_ } | Sort-Object -Unique)
$systemWebView2PathsJson = if ($systemWebView2Paths.Count) { $systemWebView2Paths | ConvertTo-Json -Compress -AsArray } else { '[]' }
$foreignProcessesJson = if ($foreignBrowsers.Count) { $foreignBrowsers | ConvertTo-Json -Compress -Depth 3 } else { '[]' }
$hygieneForced = [bool]$Forzar
$publishable = -not $hygieneForced
Write-Host "WebView2 del sistema permitidos: $($systemWebView2.Count)"
$systemWebView2Paths | ForEach-Object { Write-Host "  $_" }
if ($foreignBrowsers.Count -gt 0) {
    Write-Warning 'Procesos Edge/WebView2/Vantare bloqueantes detectados (no se cerrará ninguno):'
    $foreignBrowsers | Select-Object ProcessId, ParentProcessId, Name | Format-Table -AutoSize | Out-Host
    if (-not $Forzar) {
        throw 'Higiene fallida: cierra manualmente Edge/WebView2/Vantare ajenos o repite conscientemente con -Forzar.'
    }
}
if ($Forzar) {
    Write-Host '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!' -ForegroundColor Red
    Write-Host 'NO PUBLICABLE: -Forzar omite el gate de higiene.' -ForegroundColor Red
    Write-Host "Procesos ajenos registrados: $($foreignBrowsers.Count)" -ForegroundColor Red
    Write-Host '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!' -ForegroundColor Red
}

$gameProcessName = [IO.Path]::GetFileNameWithoutExtension($Juego)
$gameProcess = Get-Process -Name $gameProcessName -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $gameProcess) { throw "No se encontró el juego '$Juego'; PresentMon necesita un proceso vivo." }

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stem = '{0}-{1}' -f $Condicion.ToLowerInvariant(), $stamp
$rawCsv = Join-Path $outputDir "$stem.csv"
$presentMonCsv = Join-Path $outputDir "$stem-presentmon.csv"
$summaryMd = Join-Path $outputDir "$stem.md"
$cdpJson = Join-Path $outputDir "$stem-cdp.json"
$stdoutLog = Join-Path $outputDir "$stem-stdout.log"
$stderrLog = Join-Path $outputDir "$stem-stderr.log"
$presentMonLog = Join-Path $outputDir "$stem-presentmon.log"
$presentMonErrorLog = Join-Path $outputDir "$stem-presentmon-error.log"
$processJson = Join-Path $outputDir "$stem-processes.json"
$runtimeDir = Join-Path $outputDir "$stem-runtime"
New-Item -ItemType Directory -Force -Path (Join-Path $runtimeDir 'configs') | Out-Null

$app = $null
$presentMon = $null
$sessionName = $null
$rows = [Collections.Generic.List[object]]::new()
$shutdownClean = $false
$gameFrametimeValid = $false
$orphanEtwSessionsStopped = @()
$orphanEtwSessionsStoppedJson = '[]'
$previousCpu = @{}
$previousAt = Get-Date
$logicalProcessors = [Environment]::ProcessorCount
$exeName = [IO.Path]::GetFileName($exePath)
$gameExeName = "$gameProcessName.exe"

function Get-OwnCimProcesses {
    @(Get-CimInstance Win32_Process | Where-Object {
        $_.ProcessId -eq $app.Id -or ($_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -like "*$exeName*EBWebView*")
    })
}

function Get-GpuTotals {
    $totals = @{}
    try {
        $samples = (Get-Counter -Counter @('\GPU Engine(*)\Utilization Percentage', '\GPU Process Memory(*)\Dedicated Usage') -ErrorAction Stop).CounterSamples
        foreach ($sample in $samples) {
            if ($sample.InstanceName -notmatch 'pid_(\d+)') { continue }
            $processId = [int]$Matches[1]
            if (-not $totals.ContainsKey($processId)) { $totals[$processId] = @{ Engine = 0.0; Dedicated = 0.0 } }
            if ($sample.Path -like '*Utilization Percentage') { $totals[$processId].Engine += [double]$sample.CookedValue }
            elseif ($sample.Path -like '*Dedicated Usage') { $totals[$processId].Dedicated += [double]$sample.CookedValue }
        }
        return [pscustomobject]@{ Valid = $true; Totals = $totals; Error = $null }
    } catch {
        Write-Warning "Contadores GPU no disponibles en esta muestra: $($_.Exception.Message)"
        return [pscustomobject]@{ Valid = $false; Totals = @{}; Error = $_.Exception.Message }
    }
}

function Get-VantareEtwSessions {
    $queryOutput = & logman.exe query -ets 2>&1
    $queryExitCode = $LASTEXITCODE
    $queryText = ($queryOutput | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
    if ($queryExitCode -ne 0 -and (Get-Command Get-EtwTraceSession -ErrorAction SilentlyContinue)) {
        $fallbackNames = @(Get-EtwTraceSession -Name 'VantareHuella-*' | ForEach-Object { $_.Name })
        if ($fallbackNames.Count) { $queryText += [Environment]::NewLine + ($fallbackNames -join [Environment]::NewLine) }
    }
    $sessions = @($queryText | & node $processHelper --etw-sessions | ConvertFrom-Json)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo interpretar la lista de sesiones ETW.' }
    if ($queryExitCode -ne 0) {
        Write-Warning "logman query -ets terminó con código $queryExitCode; se conservaron las sesiones VantareHuella reconocibles de su salida."
    }
    return $sessions
}

function Stop-HuellaEtwSession([string]$Name) {
    if (-not $Name) { return $true }
    $null = & logman.exe stop $Name -ets 2>&1
    if ($LASTEXITCODE -eq 0) { return $true }
    if (Get-Command Stop-EtwTraceSession -ErrorAction SilentlyContinue) {
        try {
            Stop-EtwTraceSession -Name $Name -ErrorAction Stop
            return $true
        } catch { return $false }
    }
    return $false
}

function Format-Invariant([double]$Value) {
    $Value.ToString('R', [Globalization.CultureInfo]::InvariantCulture)
}

function Update-ProcessClassification {
    $ownProcesses = Get-OwnCimProcesses
    foreach ($processInfo in $ownProcesses | Where-Object { $_.CommandLine -match '--type=renderer(?:\s|$)' }) {
        $rendererKey = [string]$processInfo.ProcessId
        if (-not $rendererRoles.ContainsKey($rendererKey)) {
            $rendererRoles[$rendererKey] = if ([int]$processInfo.ProcessId -in $hubRendererIds) { 'renderer-hub' } else { 'renderer-unassigned' }
        }
    }
    $ownProcesses | Select-Object Name, ProcessId, ParentProcessId, CreationDate, CommandLine | ConvertTo-Json -Depth 4 -AsArray | Set-Content -LiteralPath $processJson -Encoding utf8
    $roleJson = $rendererRoles | ConvertTo-Json -Compress
    $classifiedProcesses = @(& node $processHelper --input $processJson --exe-name $exeName --host-pid $app.Id --renderer-roles $roleJson | ConvertFrom-Json)
    if ($LASTEXITCODE -ne 0 -or -not $classifiedProcesses) { throw 'No se pudo clasificar el árbol de procesos propio.' }
    $currentRoles = @{}
    foreach ($entry in $classifiedProcesses) { $currentRoles[[int]$entry.pid] = [string]$entry.role }
    return $currentRoles
}

try {
    foreach ($etwSession in @(Get-VantareEtwSessions)) {
        $owner = Get-Process -Id ([int]$etwSession.pid) -ErrorAction SilentlyContinue
        if ($owner -and $owner.ProcessName -like 'vantare*') {
            Write-Host "Sesión ETW activa conservada: $($etwSession.name) (Vantare PID $($etwSession.pid))."
            continue
        }
        if (-not (Stop-HuellaEtwSession $etwSession.name)) {
            throw "No se pudo detener la sesión ETW huérfana '$($etwSession.name)'."
        }
        $orphanEtwSessionsStopped += [string]$etwSession.name
        Write-Warning "Sesión ETW huérfana detenida: $($etwSession.name)"
    }
    $orphanEtwSessionsStoppedJson = ConvertTo-Json -InputObject @($orphanEtwSessionsStopped) -Compress

    $oldDebugPort = $env:VANTARE_WEBVIEW_DEBUG_PORT
    $env:VANTARE_WEBVIEW_DEBUG_PORT = [string]$Puerto
    try {
        $quotedProfilePath = '"{0}"' -f $profilePath.Replace('"', '\"')
        $httpPort = if ($Puerto -le 45535) { $Puerto + 20000 } else { $Puerto - 1000 }
        $app = Start-Process -FilePath $exePath -ArgumentList @('-profile', $quotedProfilePath, '-http', "127.0.0.1:$httpPort") -WorkingDirectory $runtimeDir -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -WindowStyle Normal -PassThru
    } finally {
        $env:VANTARE_WEBVIEW_DEBUG_PORT = $oldDebugPort
    }

    $deadline = (Get-Date).AddSeconds(30)
    do {
        if ($app.HasExited) { throw "Vantare terminó durante el arranque con código $($app.ExitCode)." }
        try { $null = Invoke-RestMethod -Uri "http://127.0.0.1:$Puerto/json/version" -TimeoutSec 1; $cdpReady = $true } catch { $cdpReady = $false }
        if (-not $cdpReady) { Start-Sleep -Milliseconds 250 }
    } until ($cdpReady -or (Get-Date) -ge $deadline)
    if (-not $cdpReady) { throw "CDP no respondió en el puerto $Puerto dentro de 30 s." }

    if ($Condicion -ne 'A0') {
        & node $cdpHelper --cdp "http://127.0.0.1:$Puerto" --action overlay-stop --duration 1 --expected-widgets 0 | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo fijar el estado inicial con el overlay detenido.' }
    }
    $beforeAction = Get-OwnCimProcesses
    $hubRendererIds = @($beforeAction | Where-Object { $_.CommandLine -match '--type=renderer(?:\s|$)' } | ForEach-Object { [int]$_.ProcessId })
    $action = if ($Condicion -eq 'A0') { 'overlay-stop' } else { 'overlay-start' }
    & node $cdpHelper --cdp "http://127.0.0.1:$Puerto" --action $action --duration 10 --expected-widgets $expectedWidgetCount --output $cdpJson | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "El helper CDP falló con código $LASTEXITCODE." }
    $cdpResult = Get-Content -LiteralPath $cdpJson -Raw | ConvertFrom-Json
    if ($cdpResult.rendererProcessInfoError) {
        Write-Warning "SystemInfo.getProcessInfo no estuvo disponible: $($cdpResult.rendererProcessInfoError)"
    }
    if ($Condicion -eq 'A0') {
        $hubRendererIds = @(Get-OwnCimProcesses | Where-Object { $_.CommandLine -match '--type=renderer(?:\s|$)' } | ForEach-Object { [int]$_.ProcessId })
    }

    $app.Refresh()
    if ($Condicion -eq 'HubMin') {
        & node $cdpHelper --cdp "http://127.0.0.1:$Puerto" --action hub-minimise --duration 1 | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "No se pudo minimizar el Hub por su target Wails (código $LASTEXITCODE)." }
    } elseif ($Condicion -eq 'HubVisible') {
        & node $cdpHelper --cdp "http://127.0.0.1:$Puerto" --action hub-restore --duration 1 | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "No se pudo restaurar el Hub por su target Wails (código $LASTEXITCODE)." }
    }

    $ownCim = Get-OwnCimProcesses
    $ownCim | Select-Object Name, ProcessId, ParentProcessId, CreationDate, CommandLine | ConvertTo-Json -Depth 4 -AsArray | Set-Content -LiteralPath $processJson -Encoding utf8
    $hubRendererIdsJson = ConvertTo-Json -InputObject @($hubRendererIds) -Compress
    $cdpRendererIdsJson = ConvertTo-Json -InputObject @($cdpResult.rendererProcessIds) -Compress
    $overlayStarted = $action -eq 'overlay-start' -and [bool]$cdpResult.control.changed
    $assignmentJson = & node $processHelper --assign-renderers --input $processJson --hub-renderer-ids $hubRendererIdsJson --activation-started-at ([string]$cdpResult.control.emittedAt) --overlay-ready-at ([string]$cdpResult.overlayReadyAt) --cdp-renderer-pids $cdpRendererIdsJson --overlay-started ([string]$overlayStarted).ToLowerInvariant()
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo atribuir el renderer del overlay.' }
    $assignment = $assignmentJson | ConvertFrom-Json
    $rendererRoles = @{}
    foreach ($property in $assignment.roles.PSObject.Properties) { $rendererRoles[[string]$property.Name] = [string]$property.Value }
    Write-Host "Atribución renderer overlay: $($assignment.reason); PID=$($assignment.overlayRendererPid)"
    $roleByPid = Update-ProcessClassification

    $sessionName = "VantareHuella-$($app.Id)-$stamp"
    $presentMonArgs = @('--process_name', ('"{0}"' -f $gameExeName), '--output_file', ('"{0}"' -f $presentMonCsv), '--v2_metrics', '--timed', [string]$Duracion, '--terminate_after_timed', '--session_name', $sessionName, '--no_console_stats')
    $presentMon = Start-Process -FilePath $presentMonPath -ArgumentList $presentMonArgs -RedirectStandardOutput $presentMonLog -RedirectStandardError $presentMonErrorLog -WindowStyle Hidden -PassThru

    foreach ($processId in $roleByPid.Keys) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($process) { $previousCpu[$processId] = $process.TotalProcessorTime.TotalSeconds }
    }
    $previousAt = Get-Date
    for ($sampleIndex = 0; $sampleIndex -lt $Duracion; $sampleIndex++) {
        Start-Sleep -Seconds 1
        $now = Get-Date
        $elapsed = ($now - $previousAt).TotalSeconds
        if ($sampleIndex % 5 -eq 0) {
            $roleByPid = Update-ProcessClassification
        }
        $gpuSample = Get-GpuTotals
        foreach ($processId in @($roleByPid.Keys)) {
            $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
            if (-not $process) { continue }
            $cpuSeconds = $process.TotalProcessorTime.TotalSeconds
            $cpuPct = if ($previousCpu.ContainsKey($processId) -and $elapsed -gt 0) { (($cpuSeconds - $previousCpu[$processId]) / $elapsed / $logicalProcessors) * 100 } else { 0 }
            $previousCpu[$processId] = $cpuSeconds
            $gpuValues = if ($gpuSample.Valid -and $gpuSample.Totals.ContainsKey($processId)) { $gpuSample.Totals[$processId] } else { @{ Engine = 0.0; Dedicated = 0.0 } }
            $rows.Add([pscustomobject][ordered]@{
                timestamp = $now.ToString('o'); condition = $Condicion; pid = $processId; role = $roleByPid[$processId]
                hygieneForced = $hygieneForced; foreignProcesses = $foreignProcessesJson; publishable = $publishable
                systemWebView2Count = $systemWebView2.Count; systemWebView2Paths = $systemWebView2PathsJson
                orphanEtwSessionsStopped = $orphanEtwSessionsStoppedJson; gameFrametimeValid = $false; frametimePublishable = $false
                privateBytes = [int64]$process.PrivateMemorySize64; workingSetBytes = [int64]$process.WorkingSet64
                cpuPct = Format-Invariant ([Math]::Max(0, $cpuPct)); gpuSampleValid = [bool]$gpuSample.Valid
                gpuPct = if ($gpuSample.Valid) { Format-Invariant ([double]$gpuValues.Engine) } else { $null }
                gpuDedicatedBytes = if ($gpuSample.Valid) { Format-Invariant ([double]$gpuValues.Dedicated) } else { $null }
                frameTimeMs = $null; dropped = $null
            })
        }
        $previousAt = $now
    }

    if ($presentMon -and -not $presentMon.HasExited) { $presentMon.WaitForExit(($Duracion + 30) * 1000) | Out-Null }
    if (Test-Path -LiteralPath $presentMonCsv) {
        $presentMonFrames = @(Import-Csv -LiteralPath $presentMonCsv)
        if ($presentMonFrames.Count -gt 0) {
            $presentMonColumns = @($presentMonFrames[0].PSObject.Properties.Name)
            if ('FrameTime' -notin $presentMonColumns -or 'DisplayedTime' -notin $presentMonColumns) {
                throw 'CSV de PresentMon incompatible: se requieren FrameTime y DisplayedTime del contrato v2.'
            }
        }
        $droppedFrames = 0
        $validPresentMonFrames = 0
        foreach ($frame in $presentMonFrames) {
            [double]$frameValue = 0
            if (-not [double]::TryParse([string]$frame.FrameTime, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$frameValue)) { continue }
            $displayedTime = [string]$frame.DisplayedTime
            [double]$displayedValue = 0
            $dropped = if ($displayedTime -eq 'NA') {
                1
            } elseif ([double]::TryParse($displayedTime, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$displayedValue) -and $displayedValue -gt 0) {
                0
            } else {
                throw "DisplayedTime inesperado en CSV PresentMon v2: '$displayedTime'."
            }
            $droppedFrames += $dropped
            $validPresentMonFrames += 1
            $rows.Add([pscustomobject][ordered]@{
                timestamp = [string]$frame.CPUStartTime
                condition = $Condicion; pid = $gameProcess.Id; role = 'game'; privateBytes = $null; workingSetBytes = $null
                hygieneForced = $hygieneForced; foreignProcesses = $foreignProcessesJson; publishable = $publishable
                systemWebView2Count = $systemWebView2.Count; systemWebView2Paths = $systemWebView2PathsJson
                orphanEtwSessionsStopped = $orphanEtwSessionsStoppedJson; gameFrametimeValid = $false; frametimePublishable = $false
                cpuPct = $null; gpuSampleValid = $null; gpuPct = $null; gpuDedicatedBytes = $null; frameTimeMs = Format-Invariant ([double]$frameValue)
                dropped = [string]$dropped
            })
        }
        $gameFrametimeValid = $validPresentMonFrames -gt 0
        $droppedPercent = if ($validPresentMonFrames) { 100 * $droppedFrames / $validPresentMonFrames } else { 0 }
        Write-Host ("Frames perdidos: {0}/{1} ({2:N3} %)" -f $droppedFrames, $validPresentMonFrames, $droppedPercent)
    } else {
        Write-Warning 'PresentMon no produjo CSV; el resumen conservará las métricas de Vantare y marcará frametime ausente.'
    }

    if (-not $gameFrametimeValid) {
        Write-Warning 'FRAMETIME NO PUBLICABLE: PresentMon no produjo ningún frame válido; RAM/CPU/GPU de Vantare siguen siendo utilizables.'
    }
    foreach ($row in $rows) {
        $row.gameFrametimeValid = $gameFrametimeValid
        $row.frametimePublishable = $gameFrametimeValid
    }

    $rows | Export-Csv -LiteralPath $rawCsv -NoTypeInformation -Encoding utf8
    & node $summaryHelper --run-summary --condition $Condicion --output $summaryMd $rawCsv | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "El resumen falló con código $LASTEXITCODE." }
} finally {
    try {
        if ($presentMon -and -not $presentMon.HasExited) {
            if (-not $presentMon.WaitForExit(5000)) {
                Write-Warning 'La captura PresentMon propia no terminó tras su ventana --timed; se termina solo ese proceso.'
                Stop-Process -Id $presentMon.Id -Force -ErrorAction SilentlyContinue
                $presentMon.WaitForExit(5000) | Out-Null
            }
        }
    } catch {
        Write-Warning "No se pudo cerrar el proceso PresentMon propio: $($_.Exception.Message)"
    }
    if ($sessionName) {
        try { $null = Stop-HuellaEtwSession $sessionName } catch { Write-Verbose "La sesión ETW ya no existe o logman no pudo detenerla: $sessionName" }
    }
    if ($app -and -not $app.HasExited) {
        try { & node $cdpHelper --cdp "http://127.0.0.1:$Puerto" --action app-quit --duration 1 | Out-Host } catch { Write-Warning "No se pudo pedir Application.Quit por CDP: $($_.Exception.Message)" }
        $shutdownClean = $app.WaitForExit(10000)
        if (-not $shutdownClean -and -not $app.HasExited) {
            $app.Refresh()
            $null = $app.CloseMainWindow()
            $shutdownClean = $app.WaitForExit(5000)
        }
        if (-not $shutdownClean -and -not $app.HasExited) {
            Write-Warning 'La ventana propia no respondió a WM_CLOSE; se termina únicamente bin/vantare-isa924.exe.'
            Stop-Process -Id $app.Id -Force
            $app.WaitForExit(5000) | Out-Null
        }
    }
    if (Test-Path -LiteralPath $processJson) { Remove-Item -LiteralPath $processJson -Force }
}

Write-Host "CSV: $rawCsv"
Write-Host "Resumen: $summaryMd"
Write-Host "CDP: $cdpJson"
Write-Host "Cierre limpio: $shutdownClean"
