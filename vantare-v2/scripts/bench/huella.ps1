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

$presentMonCommand = Get-Command PresentMon* -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $presentMonCommand) {
    $standalonePresentMon = Join-Path $env:LOCALAPPDATA 'Programs\PresentMon\PresentMon.exe'
    if (Test-Path -LiteralPath $standalonePresentMon) {
        $presentMonPath = $standalonePresentMon
    } else {
        $presentMonPath = $null
    }
} else {
    $presentMonPath = $presentMonCommand.Source
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
    forceHygiene = [bool]$Forzar
}
if ($DryRun) {
    $plan | ConvertTo-Json -Depth 4
    exit 0
}
if (-not $presentMonPath) {
    throw 'PresentMon 2.x no está en PATH ni en la ruta standalone documentada. Instala Intel.PresentMon antes de medir.'
}
if (Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue) {
    throw "El puerto CDP $Puerto ya está escuchando."
}

$foreignBrowsers = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -in @('msedge.exe', 'msedgewebview2.exe')
})
if ($foreignBrowsers.Count -gt 0) {
    Write-Warning 'Procesos Edge/WebView2 ajenos detectados (no se cerrará ninguno):'
    $foreignBrowsers | Select-Object ProcessId, ParentProcessId, Name | Format-Table -AutoSize | Out-Host
    if (-not $Forzar) {
        throw 'Higiene fallida: cierra manualmente Edge/WebView2 ajenos o repite conscientemente con -Forzar.'
    }
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
$rows = [Collections.Generic.List[object]]::new()
$shutdownClean = $false
$previousCpu = @{}
$previousAt = Get-Date
$logicalProcessors = [Environment]::ProcessorCount
$exeName = [IO.Path]::GetFileName($exePath)
$gameExeName = "$gameProcessName.exe"

if (-not ('HuellaNativeWindow' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class HuellaNativeWindow {
    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
'@
}

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
    } catch {
        Write-Warning "Contadores GPU no disponibles en esta muestra: $($_.Exception.Message)"
    }
    return $totals
}

function Format-Invariant([double]$Value) {
    $Value.ToString('R', [Globalization.CultureInfo]::InvariantCulture)
}

try {
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

    $beforeAction = Get-OwnCimProcesses
    $hubRendererIds = @($beforeAction | Where-Object { $_.CommandLine -match '--type=renderer(?:\s|$)' } | ForEach-Object { [int]$_.ProcessId })
    $action = if ($Condicion -eq 'A0') { 'overlay-stop' } else { 'overlay-start' }
    & node $cdpHelper --cdp "http://127.0.0.1:$Puerto" --action $action --duration 10 --output $cdpJson | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "El helper CDP falló con código $LASTEXITCODE." }

    $app.Refresh()
    if ($Condicion -eq 'HubMin') {
        if (-not [HuellaNativeWindow]::ShowWindowAsync($app.MainWindowHandle, 6)) { throw 'ShowWindowAsync(SW_MINIMIZE) rechazó la ventana Hub.' }
    } elseif ($Condicion -eq 'HubVisible') {
        if (-not [HuellaNativeWindow]::ShowWindowAsync($app.MainWindowHandle, 9)) { throw 'ShowWindowAsync(SW_RESTORE) rechazó la ventana Hub.' }
    }

    Start-Sleep -Seconds 2
    $ownCim = Get-OwnCimProcesses
    $rendererRoles = @{}
    foreach ($processInfo in $ownCim | Where-Object { $_.CommandLine -match '--type=renderer(?:\s|$)' }) {
        $rendererRoles[[string]$processInfo.ProcessId] = if ([int]$processInfo.ProcessId -in $hubRendererIds) { 'renderer-hub' } else { 'renderer-overlay' }
    }
    $ownCim | Select-Object Name, ProcessId, ParentProcessId, CommandLine | ConvertTo-Json -Depth 4 -AsArray | Set-Content -LiteralPath $processJson -Encoding utf8
    $roleJson = $rendererRoles | ConvertTo-Json -Compress
    $classified = & node $processHelper --input $processJson --exe-name $exeName --host-pid $app.Id --renderer-roles $roleJson | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or -not $classified) { throw 'No se pudo clasificar el árbol de procesos propio.' }
    $roleByPid = @{}
    foreach ($entry in $classified) { $roleByPid[[int]$entry.pid] = [string]$entry.role }

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
        $gpu = Get-GpuTotals
        foreach ($processId in @($roleByPid.Keys)) {
            $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
            if (-not $process) { continue }
            $cpuSeconds = $process.TotalProcessorTime.TotalSeconds
            $cpuPct = if ($previousCpu.ContainsKey($processId) -and $elapsed -gt 0) { (($cpuSeconds - $previousCpu[$processId]) / $elapsed / $logicalProcessors) * 100 } else { 0 }
            $previousCpu[$processId] = $cpuSeconds
            $gpuValues = if ($gpu.ContainsKey($processId)) { $gpu[$processId] } else { @{ Engine = 0.0; Dedicated = 0.0 } }
            $rows.Add([pscustomobject][ordered]@{
                timestamp = $now.ToString('o'); condition = $Condicion; pid = $processId; role = $roleByPid[$processId]
                privateBytes = [int64]$process.PrivateMemorySize64; workingSetBytes = [int64]$process.WorkingSet64
                cpuPct = Format-Invariant ([Math]::Max(0, $cpuPct)); gpuPct = Format-Invariant ([double]$gpuValues.Engine); gpuDedicatedBytes = Format-Invariant ([double]$gpuValues.Dedicated)
                frameTimeMs = $null; dropped = $null
            })
        }
        $previousAt = $now
    }

    if ($presentMon -and -not $presentMon.HasExited) { $presentMon.WaitForExit(($Duracion + 30) * 1000) | Out-Null }
    if (Test-Path -LiteralPath $presentMonCsv) {
        foreach ($frame in Import-Csv -LiteralPath $presentMonCsv) {
            [double]$frameValue = 0
            $hasFrameValue = $false
            foreach ($column in @('FrameTime', 'msBetweenPresents', 'MsBetweenPresents', 'CPUFrameTime')) {
                if ($frame.PSObject.Properties.Name -contains $column -and [double]::TryParse([string]$frame.$column, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$frameValue)) { $hasFrameValue = $true; break }
            }
            if (-not $hasFrameValue) { continue }
            $rows.Add([pscustomobject][ordered]@{
                timestamp = if ($frame.PSObject.Properties.Name -contains 'CPUStartTime') { [string]$frame.CPUStartTime } else { [string](Get-Date).ToString('o') }
                condition = $Condicion; pid = $gameProcess.Id; role = 'game'; privateBytes = $null; workingSetBytes = $null
                cpuPct = $null; gpuPct = $null; gpuDedicatedBytes = $null; frameTimeMs = Format-Invariant ([double]$frameValue)
                dropped = if ($frame.PSObject.Properties.Name -contains 'Dropped') { [string]$frame.Dropped } elseif ([string]$frame.PresentMode -match 'discard|drop') { '1' } else { '0' }
            })
        }
    } else {
        Write-Warning 'PresentMon no produjo CSV; el resumen conservará las métricas de Vantare y marcará frametime ausente.'
    }

    $rows | Export-Csv -LiteralPath $rawCsv -NoTypeInformation -Encoding utf8
    & node $summaryHelper --condition $Condicion --output $summaryMd $rawCsv | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "El resumen falló con código $LASTEXITCODE." }
} finally {
    if ($presentMon -and -not $presentMon.HasExited) {
        if (-not $presentMon.WaitForExit(5000)) {
            Write-Warning 'La captura PresentMon propia no terminó tras su ventana --timed; se termina solo ese proceso.'
            Stop-Process -Id $presentMon.Id -Force
            $presentMon.WaitForExit(5000) | Out-Null
        }
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
