[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('no-game', 'game')]
    [string]$Scenario,

    [string]$OutputDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $repoRoot "docs\telemetry-core\evidence\isa-944\run-$Scenario-$stamp"
}
$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)
if (Test-Path -LiteralPath $OutputDir) {
    throw "El directorio de salida ya existe: $OutputDir"
}

$processes = @(Get-CimInstance Win32_Process)
$vantareBlockers = @($processes | Where-Object { $_.Name -like 'vantare-*.exe' })
if ($vantareBlockers.Count -gt 0) {
    throw "Ya existe otro Vantare: $($vantareBlockers.ProcessId -join ', ')"
}
$lmu = @($processes | Where-Object { $_.Name -eq 'Le Mans Ultimate.exe' })
if ($Scenario -eq 'no-game' -and $lmu.Count -gt 0) {
    throw "La prueba sin juego exige LMU cerrado; PID: $($lmu.ProcessId -join ', ')"
}
if ($Scenario -eq 'game' -and $lmu.Count -eq 0) {
    throw 'La prueba con juego exige LMU abierto y en una sesión de práctica.'
}

$sessions = (& logman query -ets 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) {
    throw "No se pudo inventariar ETW: $sessions"
}
if ($sessions -match 'VantareSensor-' -or $sessions -match 'VantareHuella-') {
    throw 'Hay otro medidor Vantare o una sesión huérfana. Inspecciónala antes de ejecutar; este guion no toca sesiones ajenas.'
}

$runtimeRoot = Join-Path $env:TEMP "vantare-isa944-$Scenario-$stamp"
if (Test-Path -LiteralPath $runtimeRoot) {
    throw "El runtime temporal ya existe: $runtimeRoot"
}
New-Item -ItemType Directory -Path $runtimeRoot | Out-Null
New-Item -ItemType Directory -Path $OutputDir | Out-Null
Copy-Item -Recurse -LiteralPath (Join-Path $repoRoot 'configs') -Destination (Join-Path $runtimeRoot 'configs')
Copy-Item -LiteralPath (Join-Path $repoRoot 'docs\telemetry-core\evidence\isa-944\app-settings-auto.json') -Destination (Join-Path $runtimeRoot 'configs\app-settings.json')

$exePath = Join-Path $runtimeRoot 'vantare-isa944-auto.exe'
Push-Location $repoRoot
try {
    & go build -o $exePath ./cmd/vantare
    if ($LASTEXITCODE -ne 0) { throw 'go build de la prueba falló' }
} finally {
    Pop-Location
}

# El build puede tardar: repetir el guard inmediatamente antes de arrancar.
$lateBlockers = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -like 'vantare-*.exe' -or
    ($Scenario -eq 'no-game' -and $_.Name -eq 'Le Mans Ultimate.exe')
})
if ($lateBlockers.Count -gt 0) {
    throw "El guard cambió durante el build: $($lateBlockers.Name -join ', ')"
}

$stderrPath = Join-Path $runtimeRoot 'stderr.log'
$stdoutPath = Join-Path $runtimeRoot 'stdout.log'
$previousPort = $env:VANTARE_WEBVIEW_DEBUG_PORT
$previousProfile = $env:VANTARE_WEBVIEW_USER_DATA_FOLDER
$previousTrace = $env:VANTARE_PERFORMANCE_SENSOR_TRACE
$appProcess = $null
try {
    $env:VANTARE_WEBVIEW_DEBUG_PORT = '9246'
    $env:VANTARE_WEBVIEW_USER_DATA_FOLDER = Join-Path $runtimeRoot 'webview-profile'
    $env:VANTARE_PERFORMANCE_SENSOR_TRACE = '1'
    $appProcess = Start-Process -FilePath $exePath -WorkingDirectory $runtimeRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
} finally {
    $env:VANTARE_WEBVIEW_DEBUG_PORT = $previousPort
    $env:VANTARE_WEBVIEW_USER_DATA_FOLDER = $previousProfile
    $env:VANTARE_PERFORMANCE_SENSOR_TRACE = $previousTrace
}

$sessionName = "VantareSensor-$($appProcess.Id)"
try {
    $deadline = (Get-Date).AddSeconds(30)
    do {
        try {
            Invoke-RestMethod -Uri 'http://127.0.0.1:9246/json' -TimeoutSec 1 | Out-Null
            $cdpReady = $true
        } catch {
            $cdpReady = $false
            Start-Sleep -Milliseconds 250
        }
    } while (-not $cdpReady -and (Get-Date) -lt $deadline)
    if (-not $cdpReady) { throw 'CDP 9246 no estuvo disponible en 30 segundos' }

    $captureScript = Join-Path $repoRoot 'scripts\bench\huella-cdp.mjs'
    & node $captureScript --cdp http://127.0.0.1:9246 --action performance --duration 15 --output (Join-Path $OutputDir 'performance-start.json')
    if ($LASTEXITCODE -ne 0) { throw 'Falló la captura CDP inicial' }

    if ($Scenario -eq 'game') {
        Write-Host 'Mantén LMU en primer plano y la práctica estable durante 180 segundos.'
        Start-Sleep -Seconds 180
        & node $captureScript --cdp http://127.0.0.1:9246 --action performance --duration 15 --output (Join-Path $OutputDir 'performance-end.json')
        if ($LASTEXITCODE -ne 0) { throw 'Falló la captura CDP final' }
    }

    & node $captureScript --cdp http://127.0.0.1:9246 --action app-quit
    if ($LASTEXITCODE -ne 0) { throw 'Application.Quit no pudo solicitarse por CDP' }
    Wait-Process -Id $appProcess.Id -Timeout 15 -ErrorAction SilentlyContinue
    if (Get-Process -Id $appProcess.Id -ErrorAction SilentlyContinue) {
        throw "Vantare PID $($appProcess.Id) no terminó tras Application.Quit"
    }
} finally {
    if ($appProcess -and (Get-Process -Id $appProcess.Id -ErrorAction SilentlyContinue)) {
        $ownedChildren = @(Get-CimInstance Win32_Process | Where-Object {
            $_.ParentProcessId -eq $appProcess.Id -and $_.Name -like 'PresentMon*.exe'
        })
        Stop-Process -Id $appProcess.Id -Force -ErrorAction SilentlyContinue
        foreach ($child in $ownedChildren) {
            Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue
        }
        & logman stop $sessionName -ets 2>&1 | Out-Null
        & logman stop $sessionName -ets 2>&1 | Out-Null
    }
    if (Test-Path -LiteralPath $stderrPath) {
        Copy-Item -LiteralPath $stderrPath -Destination (Join-Path $OutputDir 'sensor.log') -Force
    }
    if (Test-Path -LiteralPath $stdoutPath) {
        Copy-Item -LiteralPath $stdoutPath -Destination (Join-Path $OutputDir 'stdout.log') -Force
    }
}

$remaining = (& logman query -ets 2>&1 | Out-String)
if ($remaining -match [regex]::Escape($sessionName)) {
    throw "La sesión propia quedó activa tras cerrar: $sessionName"
}
Write-Output "PASS scenario=$Scenario appPid=$($appProcess.Id) session=$sessionName output=$OutputDir"
