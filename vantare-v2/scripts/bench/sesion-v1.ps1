[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('S1', 'S2', 'S3', 'S4', 'S5')]
    [string]$Sesion,
    [Parameter(Mandatory)]
    [ValidateSet('on', 'off')]
    [string]$Fase,
    [Parameter(Mandatory)]
    [ValidateRange(1, 480)]
    [int]$Duracion,
    [Parameter(Mandatory)]
    [string]$Exe,
    [Parameter(Mandatory)]
    [ValidateRange(1024, 65535)]
    [int]$Puerto,
    [string]$Perfil = 'testdata/bench/huella-endurance-3.json',
    [string]$Salida = 'results/isa-894/sesiones',
    [string]$Escena = '',
    [ValidateRange(0, 200)]
    [int]$Coches = 0,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'sesion-v1-state.ps1')

if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'sesion-v1.ps1 requiere PowerShell 7 o posterior.' }
if ($Puerto -in @(9222, 9231)) { throw "El puerto $Puerto está reservado por otros bancos." }

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
[string[]]$expectedWindows = if ($Sesion -eq 'S5') { 'desktop', 'studio-or-obs' } else { 'desktop' }
function Resolve-SessionPath([string]$Path, [switch]$MustExist) {
    $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repoRoot $Path }
    if ($MustExist) { return (Resolve-Path -LiteralPath $candidate).Path }
    return [IO.Path]::GetFullPath($candidate)
}

$plan = [ordered]@{
    schema = 'vantare.session.dry-run.v1'
    session = $Sesion
    phase = $Fase
    durationMinutes = $Duracion
    executable = Resolve-SessionPath $Exe
    profile = Resolve-SessionPath $Perfil
    cdpPort = $Puerto
    outputRoot = Resolve-SessionPath $Salida
    v1Environment = if ($Fase -eq 'on') { '1' } else { $null }
    processSampleSeconds = 60
    cdpCheckpointSeconds = 300
    statePollSeconds = 5
    expectedWindows = $expectedWindows
    forceHygiene = $false
}
if ($DryRun) {
    $plan | ConvertTo-Json -Depth 4
    exit 0
}

if ($Duracion -lt 20) { throw 'Una sesión real no puede durar menos de 20 minutos.' }
if ($Sesion -eq 'S3' -and $Fase -eq 'off' -and $Duracion -lt 60) { throw 'S3 OFF es el soak prolongado y requiere al menos 60 minutos.' }
if ([string]::IsNullOrWhiteSpace($Escena)) {
    if ([Console]::IsInputRedirected) { throw '-Escena es obligatorio sin consola interactiva.' }
    $Escena = Read-Host 'escena LMU (circuito, tipo y estado inicial)'
}
if ($Coches -lt 1) {
    if ([Console]::IsInputRedirected) { throw '-Coches es obligatorio sin consola interactiva.' }
    $Coches = [int](Read-Host 'coches observados en LMU')
}
if ($Sesion -eq 'S3' -and $Coches -le 40) { throw 'S3 requiere más de 40 coches confirmados.' }

$exePath = Resolve-SessionPath $Exe -MustExist
$profilePath = Resolve-SessionPath $Perfil -MustExist
$distPath = Resolve-SessionPath 'frontend/dist' -MustExist
$processHelper = Resolve-SessionPath 'scripts/bench/huella-procesos.mjs' -MustExist
$cdpHelper = Resolve-SessionPath 'scripts/bench/huella-cdp.mjs' -MustExist
$summaryHelper = Resolve-SessionPath 'scripts/bench/sesion-v1-resumen.mjs' -MustExist
if ([IO.Path]::GetExtension($exePath) -ne '.exe') { throw '-Exe debe apuntar a un ejecutable .exe.' }
if (Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue) { throw "El puerto CDP $Puerto ya está escuchando." }

$hygieneCandidates = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -in @('msedge.exe', 'msedgewebview2.exe') -or $_.Name -like 'vantare*.exe'
} | Select-Object Name, ProcessId, ParentProcessId, CommandLine)
$hygieneInput = $hygieneCandidates | ConvertTo-Json -Compress -Depth 3 -AsArray
$hygiene = $hygieneInput | & node $processHelper --hygiene | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $hygiene) { throw 'No se pudo aplicar la allow-list de higiene de huella.ps1.' }
$foreign = @(Get-SessionOptionalProperty -InputObject $hygiene -Name 'foreign')
if ($foreign.Count -gt 0) {
    $foreign | Select-Object ProcessId, ParentProcessId, Name | Format-Table -AutoSize | Out-Host
    throw 'Higiene fallida: cierra manualmente los procesos bloqueantes. Este colector no admite -Forzar.'
}

function Get-DirectorySha256([string]$Directory) {
    $lines = @(Get-ChildItem -LiteralPath $Directory -File -Recurse | Sort-Object FullName | ForEach-Object {
        $relative = [IO.Path]::GetRelativePath($Directory, $_.FullName).Replace('\', '/')
        '{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $relative
    })
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes(($lines -join "`n") + "`n")
        return ([Convert]::ToHexString($sha.ComputeHash($bytes))).ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

$exeShaStart = (Get-FileHash -LiteralPath $exePath -Algorithm SHA256).Hash.ToLowerInvariant()
$distShaStart = Get-DirectorySha256 $distPath

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runDirectory = Join-Path (Resolve-SessionPath $Salida) ("{0}-{1}-{2}" -f $Sesion.ToLowerInvariant(), $Fase, $stamp)
if (Test-Path -LiteralPath $runDirectory) { throw "La salida ya existe: $runDirectory" }
New-Item -ItemType Directory -Path $runDirectory | Out-Null
$diagnosticDirectory = Join-Path $runDirectory 'diagnostics'
$initialScreenshotDirectory = Join-Path $runDirectory 'screenshots/initial'
$finalScreenshotDirectory = Join-Path $runDirectory 'screenshots/final'
$runtimeDirectory = Join-Path $runDirectory 'runtime'
New-Item -ItemType Directory -Force -Path $diagnosticDirectory, (Join-Path $runtimeDirectory 'configs') | Out-Null

$rawPath = Join-Path $runDirectory 'sesion.json'
$processCsv = Join-Path $runDirectory 'procesos.csv'
$summaryJson = Join-Path $runDirectory 'resumen.json'
$summaryMarkdown = Join-Path $runDirectory 'resumen.md'
$stdoutLog = Join-Path $runDirectory 'stdout.log'
$stderrLog = Join-Path $runDirectory 'stderr.log'
$processScratch = Join-Path $runDirectory 'processes.tmp.json'
$exeName = [IO.Path]::GetFileName($exePath)
$profileDocument = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json
$profileLayouts = Get-SessionOptionalProperty -InputObject $profileDocument -Name 'layouts'
if ($null -eq $profileLayouts) { throw 'El perfil de sesión no contiene layouts.' }
$expectedWidgets = @(
    $profileLayouts.PSObject.Properties.Value |
        ForEach-Object { @(Get-SessionOptionalProperty -InputObject $_ -Name 'widgets') } |
        Where-Object {
            $behavior = Get-SessionOptionalProperty -InputObject $_ -Name 'behavior'
            $enabled = Get-SessionOptionalProperty -InputObject $behavior -Name 'enabled'
            $null -eq $enabled -or [bool]$enabled
        }
).Count

$samples = [Collections.Generic.List[object]]::new()
$diagnostics = [Collections.Generic.List[object]]::new()
$transitions = [Collections.Generic.List[object]]::new()
$initialScreenshots = [Collections.Generic.List[string]]::new()
$finalScreenshots = [Collections.Generic.List[string]]::new()
$previousCpu = @{}
$knownSource = @{}
$knownPit = @{}
$knownWindows = @{}
$widgetReady = @{}
$knownV2Revision = @{}
$logicalProcessors = [Environment]::ProcessorCount
$app = $null
$startedAt = $null
$endedAt = $null
$shutdownClean = $false
$failure = $null

function Get-OwnCimProcesses {
    @(Get-CimInstance Win32_Process | Where-Object {
        $_.ProcessId -eq $app.Id -or ($_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -like "*$exeName*EBWebView*")
    })
}

function Get-ProcessRoles {
    Get-OwnCimProcesses | Select-Object Name, ProcessId, ParentProcessId, CreationDate, CommandLine |
        ConvertTo-Json -Depth 4 -AsArray | Set-Content -LiteralPath $processScratch -Encoding utf8
    $classified = @(& node $processHelper --input $processScratch --exe-name $exeName --host-pid $app.Id --renderer-roles '{}' | ConvertFrom-Json)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo clasificar el árbol de procesos propio.' }
    $roles = @{}
    foreach ($entry in $classified) { $roles[[int]$entry.pid] = [string]$entry.role }
    return $roles
}

function Add-ProcessSample([datetime]$Now) {
    $roles = Get-ProcessRoles
    foreach ($processId in @($roles.Keys)) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if (-not $process) { continue }
        $cpuSeconds = $process.TotalProcessorTime.TotalSeconds
        $cpuPct = 0.0
        if ($previousCpu.ContainsKey($processId)) {
            $elapsedSeconds = ($Now - $previousCpu[$processId].At).TotalSeconds
            if ($elapsedSeconds -gt 0) {
                $cpuPct = (($cpuSeconds - $previousCpu[$processId].Cpu) / $elapsedSeconds / $logicalProcessors) * 100
            }
        }
        $previousCpu[$processId] = @{ Cpu = $cpuSeconds; At = $Now }
        $samples.Add([pscustomobject][ordered]@{
            timestamp = $Now.ToString('o')
            pid = [int]$processId
            role = $roles[$processId]
            cpuPct = [Math]::Max(0, $cpuPct)
            privateBytes = [int64]$process.PrivateMemorySize64
        })
    }
}

function Invoke-Cdp([string]$Action, [string]$Label, [string]$ScreenshotDirectory = '') {
    $arguments = @($cdpHelper, '--cdp', "http://127.0.0.1:$Puerto", '--action', $Action, '--duration', '1', '--expected-widgets', [string]$expectedWidgets)
    $outputPath = ''
    if ($Label) {
        $outputPath = Join-Path $diagnosticDirectory "$Label.json"
        $arguments += @('--output', $outputPath)
    }
    if ($ScreenshotDirectory) { $arguments += @('--screenshot-dir', $ScreenshotDirectory) }
    $text = (& node @arguments) -join [Environment]::NewLine
    if ($LASTEXITCODE -ne 0) { throw "CDP $Action falló para $Label." }
    if ($outputPath) { return Get-Content -LiteralPath $outputPath -Raw | ConvertFrom-Json }
    return $text | ConvertFrom-Json
}

function Register-State([object]$Capture) {
    $capturedAt = [string](Get-SessionOptionalProperty -InputObject $Capture -Name 'capturedAt')
    foreach ($target in @(ConvertTo-SessionCdpTargets -Capture $Capture)) {
        $surface = $target.surface
        $key = '{0}|{1}|{2}|{3}' -f $surface, $target.role, $target.url, $target.title
        $now = $capturedAt
        if (-not $knownWindows.ContainsKey($key)) {
            $knownWindows[$key] = $true
            $transitions.Add([pscustomobject]@{ kind = 'window-first-seen'; surface = $surface; window = $key; timestamp = $now })
        }
        if ([int]$target.widgetCount -gt 0 -and -not $widgetReady.ContainsKey($key)) {
            $widgetReady[$key] = $true
            $transitions.Add([pscustomobject]@{ kind = 'window-widget-ready'; surface = $surface; window = $key; timestamp = $now })
        }
        $transport = $target.transport
        if (-not $transport) { continue }
        $source = [string]$transport.sourceState
        if ($source -and $knownSource.ContainsKey($key) -and $knownSource[$key] -ne $source) {
            $transitions.Add([pscustomobject]@{ kind = 'source-state'; surface = $surface; window = $key; from = $knownSource[$key]; to = $source; frameRevision = $transport.frameRevision; sequence = $transport.sequence; timestamp = $now })
        }
        if ($source) { $knownSource[$key] = $source }
        if ($null -ne $transport.frameRevision) {
            $revision = [long]$transport.frameRevision
            if ($knownV2Revision.ContainsKey($key) -and $revision -gt [long]$knownV2Revision[$key]) {
                $transitions.Add([pscustomobject]@{ kind = 'v2-progress'; surface = $surface; window = $key; frameRevision = $revision; sequence = $transport.sequence; timestamp = $now })
            }
            $knownV2Revision[$key] = $revision
        }
        $pit = [string]$transport.playerPit
        if ($pit -and $knownPit.ContainsKey($key) -and $knownPit[$key] -ne $pit) {
            $transitions.Add([pscustomobject]@{ kind = 'pit-state'; window = $key; from = $knownPit[$key]; to = $pit; timestamp = $now })
        }
        if ($pit) { $knownPit[$key] = $pit }
    }
}

function Add-Diagnostic([string]$Label, [string]$ScreenshotDirectory = '') {
    $capture = Invoke-Cdp -Action 'inspect' -Label $Label -ScreenshotDirectory $ScreenshotDirectory
    $diagnostics.Add($capture)
    Register-State $capture
    if ($ScreenshotDirectory) {
        if ($ScreenshotDirectory -eq $initialScreenshotDirectory) {
            Add-SessionScreenshotPaths -Capture $capture -Destination $initialScreenshots
        } else {
            Add-SessionScreenshotPaths -Capture $capture -Destination $finalScreenshots
        }
    }
}

$oldV1Value = $env:VANTARE_OVERLAY_V1_EMIT
$oldDebugPort = $env:VANTARE_WEBVIEW_DEBUG_PORT
try {
    $env:VANTARE_OVERLAY_V1_EMIT = if ($Fase -eq 'on') { '1' } else { $null }
    $env:VANTARE_WEBVIEW_DEBUG_PORT = [string]$Puerto
    $quotedProfile = '"{0}"' -f $profilePath.Replace('"', '\"')
    $httpPort = if ($Puerto -le 45535) { $Puerto + 20000 } else { $Puerto - 1000 }
    $app = Start-Process -FilePath $exePath -ArgumentList @('-profile', $quotedProfile, '-http', "127.0.0.1:$httpPort") -WorkingDirectory $runtimeDirectory -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -WindowStyle Normal -PassThru
    $deadline = (Get-Date).AddSeconds(30)
    do {
        if ($app.HasExited) { throw "Vantare terminó durante el arranque con código $($app.ExitCode)." }
        try { $null = Invoke-RestMethod -Uri "http://127.0.0.1:$Puerto/json/version" -TimeoutSec 1; $ready = $true } catch { $ready = $false }
        if (-not $ready) { Start-Sleep -Milliseconds 250 }
    } until ($ready -or (Get-Date) -ge $deadline)
    if (-not $ready) { throw 'CDP no respondió en 30 segundos.' }

    $startedAt = Get-Date
    if ($Sesion -ne 'S5') {
        $opened = Invoke-Cdp -Action 'overlay-start' -Label '000-overlay-start' -ScreenshotDirectory $initialScreenshotDirectory
        $diagnostics.Add($opened)
        Register-State $opened
        Add-SessionScreenshotPaths -Capture $opened -Destination $initialScreenshots
    } else {
        Add-Diagnostic -Label '000-initial' -ScreenshotDirectory $initialScreenshotDirectory
    }
    Add-ProcessSample $startedAt

    Write-Host 'marca de transición: <texto>' -ForegroundColor Cyan
    Write-Host 'Escribe la transición y pulsa Enter; el muestreo continúa entre marcas.'
    $nextProcessSample = $startedAt.AddSeconds(60)
    $nextCheckpoint = $startedAt.AddMinutes(5)
    $nextStatePoll = $startedAt
    $finishAt = $startedAt.AddMinutes($Duracion)
    while ((Get-Date) -lt $finishAt) {
        $now = Get-Date
        if ($now -ge $nextStatePoll) {
            $state = Invoke-Cdp -Action 'state' -Label ''
            Register-State $state
            $nextStatePoll = $nextStatePoll.AddSeconds(5)
        }
        if ($now -ge $nextProcessSample) {
            Add-ProcessSample $now
            $nextProcessSample = $nextProcessSample.AddSeconds(60)
        }
        if ($now -ge $nextCheckpoint) {
            $elapsed = [int][Math]::Floor(($now - $startedAt).TotalMinutes)
            Add-Diagnostic -Label ('{0:d3}m' -f $elapsed)
            $nextCheckpoint = $nextCheckpoint.AddMinutes(5)
        }
        if (-not [Console]::IsInputRedirected -and [Console]::KeyAvailable) {
            $text = [Console]::ReadLine()
            if (-not [string]::IsNullOrWhiteSpace($text)) {
                $transitions.Add([pscustomobject]@{ kind = 'human'; text = $text.Trim(); timestamp = (Get-Date).ToString('o') })
                Write-Host 'marca de transición: <texto>' -ForegroundColor Cyan
            }
        }
        Start-Sleep -Milliseconds 200
    }
    $endedAt = Get-Date
    Add-ProcessSample $endedAt
    Add-Diagnostic -Label '999-final' -ScreenshotDirectory $finalScreenshotDirectory
} catch {
    $failure = $_.Exception.Message
    Write-Error $failure -ErrorAction Continue
} finally {
    $env:VANTARE_OVERLAY_V1_EMIT = $oldV1Value
    $env:VANTARE_WEBVIEW_DEBUG_PORT = $oldDebugPort
    if ($app -and -not $app.HasExited) {
        try { $null = Invoke-Cdp -Action 'app-quit' -Label '' } catch { Write-Warning $_.Exception.Message }
        $shutdownClean = $app.WaitForExit(10000)
        if (-not $shutdownClean -and -not $app.HasExited) {
            $app.Refresh()
            $null = $app.CloseMainWindow()
            $shutdownClean = $app.WaitForExit(5000)
        }
        if (-not $shutdownClean -and -not $app.HasExited) {
            Write-Warning 'Cierre limpio fallido; se termina únicamente el ejecutable propio y el resumen fallará.'
            Stop-Process -Id $app.Id -Force
            $app.WaitForExit(5000) | Out-Null
        }
    }
    if (-not $endedAt) { $endedAt = Get-Date }
}

$exeShaEnd = (Get-FileHash -LiteralPath $exePath -Algorithm SHA256).Hash.ToLowerInvariant()
$distShaEnd = Get-DirectorySha256 $distPath
$gitHeadOutput = @(git -C $repoRoot rev-parse HEAD)
if ($LASTEXITCODE -ne 0 -or $gitHeadOutput.Count -eq 0) { throw 'No se pudo resolver el HEAD Git de la sesión.' }
$gitHead = ([string]::Join([Environment]::NewLine, $gitHeadOutput)).Trim()
$raw = [ordered]@{
    schema = 'vantare.session.v1'
    session = $Sesion
    phase = $Fase
    expectedWindows = $expectedWindows
    durationMinutes = $Duracion
    startedAt = if ($startedAt) { $startedAt.ToString('o') } else { $endedAt.ToString('o') }
    endedAt = $endedAt.ToString('o')
    executable = [ordered]@{
        path = $exePath
        sha256 = $exeShaStart
        sha256End = $exeShaEnd
        distPath = $distPath
        distSha256 = $distShaStart
        distSha256End = $distShaEnd
        stable = $exeShaStart -eq $exeShaEnd -and $distShaStart -eq $distShaEnd
        gitHead = $gitHead
    }
    scene = [ordered]@{ description = $Escena; cars = $Coches }
    hygiene = [ordered]@{
        foreign = @($foreign)
        systemWebView2 = @(Get-SessionOptionalProperty -InputObject $hygiene -Name 'systemWebView2')
    }
    samples = @($samples)
    diagnostics = @($diagnostics)
    transitions = @($transitions)
    screenshots = [ordered]@{ initial = @($initialScreenshots); final = @($finalScreenshots) }
    shutdownClean = $shutdownClean
    failure = $failure
}
$raw | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $rawPath -Encoding utf8
@($samples) | Export-Csv -LiteralPath $processCsv -NoTypeInformation -Encoding utf8
Remove-Item -LiteralPath $processScratch -Force -ErrorAction SilentlyContinue

& node $summaryHelper --input $rawPath --json $summaryJson --markdown $summaryMarkdown | Out-Host
$summaryExit = $LASTEXITCODE
Write-Host "Sesión cruda: $rawPath"
Write-Host "Procesos: $processCsv"
Write-Host "Resumen JSON: $summaryJson"
Write-Host "Resumen Markdown: $summaryMarkdown"
if ($summaryExit -ne 0) { exit $summaryExit }
