[CmdletBinding()]
param(
    [ValidateRange(15, 300)]
    [int]$DurationSeconds = 60,

    [string]$OutputDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $repoRoot "docs\telemetry-core\evidence\isa-944\sensor-cost-$stamp"
}
$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)
if (Test-Path -LiteralPath $OutputDir) {
    throw "El directorio de salida ya existe: $OutputDir"
}

function Assert-MachineTurn {
    $processes = @(Get-CimInstance Win32_Process)
    $blockers = @($processes | Where-Object { $_.Name -like 'vantare-*.exe' })
    if ($blockers.Count -gt 0) {
        throw "Ya existe otro Vantare: $($blockers.ProcessId -join ', ')"
    }
    $lmu = @($processes | Where-Object { $_.Name -eq 'Le Mans Ultimate.exe' })
    if ($lmu.Count -eq 0) {
        throw 'El A/A exige LMU abierto en la misma escena estable.'
    }
    $sessions = (& logman query -ets 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo inventariar ETW: $sessions"
    }
    if ($sessions -match 'VantareSensor-' -or $sessions -match 'VantareHuella-') {
        throw 'Hay otro medidor Vantare o una sesión huérfana; este guion no toca sesiones ajenas.'
    }
}

function Get-OwnedProcessIds([int]$RootProcessId) {
    $inventory = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
    $owned = [System.Collections.Generic.HashSet[int]]::new()
    [void]$owned.Add($RootProcessId)
    $changed = $true
    while ($changed) {
        $changed = $false
        foreach ($entry in $inventory) {
            $processId = [int]$entry.ProcessId
            if (-not $owned.Contains($processId) -and $owned.Contains([int]$entry.ParentProcessId)) {
                [void]$owned.Add($processId)
                $changed = $true
            }
        }
    }
    return @($owned)
}

function Get-Percentile95([double[]]$Values) {
    if ($Values.Count -eq 0) { return 0.0 }
    $sorted = @($Values | Sort-Object)
    $index = [Math]::Ceiling(0.95 * $sorted.Count) - 1
    return [double]$sorted[[Math]::Max(0, $index)]
}

Assert-MachineTurn
New-Item -ItemType Directory -Path $OutputDir | Out-Null
$runtimeRoot = Join-Path $env:TEMP "vantare-isa944-sensor-cost-$stamp"
New-Item -ItemType Directory -Path $runtimeRoot | Out-Null
$exePath = Join-Path $runtimeRoot 'vantare-isa944-sensor-cost.exe'
Push-Location $repoRoot
try {
    & go build -o $exePath ./cmd/vantare
    if ($LASTEXITCODE -ne 0) { throw 'go build del A/A falló' }
} finally {
    Pop-Location
}

$allSamples = [System.Collections.Generic.List[object]]::new()
$summaries = [System.Collections.Generic.List[object]]::new()
$logicalProcessors = [Environment]::ProcessorCount

foreach ($condition in @('off', 'on')) {
    Assert-MachineTurn
    $conditionRoot = Join-Path $runtimeRoot $condition
    New-Item -ItemType Directory -Path $conditionRoot | Out-Null
    Copy-Item -Recurse -LiteralPath (Join-Path $repoRoot 'configs') -Destination (Join-Path $conditionRoot 'configs')
    Copy-Item -LiteralPath (Join-Path $repoRoot 'docs\telemetry-core\evidence\isa-944\app-settings-auto.json') -Destination (Join-Path $conditionRoot 'configs\app-settings.json') -Force

    $stdoutPath = Join-Path $conditionRoot 'stdout.log'
    $stderrPath = Join-Path $conditionRoot 'stderr.log'
    $previousPort = $env:VANTARE_WEBVIEW_DEBUG_PORT
    $previousProfile = $env:VANTARE_WEBVIEW_USER_DATA_FOLDER
    $previousLevel = $env:VANTARE_PERF_LEVEL
    $previousSensor = $env:VANTARE_PERFORMANCE_SENSOR
    $previousTrace = $env:VANTARE_PERFORMANCE_SENSOR_TRACE
    $appProcess = $null
    try {
        $env:VANTARE_WEBVIEW_DEBUG_PORT = '9246'
        $env:VANTARE_WEBVIEW_USER_DATA_FOLDER = Join-Path $conditionRoot 'webview-profile'
        $env:VANTARE_PERF_LEVEL = '5'
        $env:VANTARE_PERFORMANCE_SENSOR = $condition
        $env:VANTARE_PERFORMANCE_SENSOR_TRACE = if ($condition -eq 'on') { '1' } else { '0' }
        $appProcess = Start-Process -FilePath $exePath -WorkingDirectory $conditionRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
    } finally {
        $env:VANTARE_WEBVIEW_DEBUG_PORT = $previousPort
        $env:VANTARE_WEBVIEW_USER_DATA_FOLDER = $previousProfile
        $env:VANTARE_PERF_LEVEL = $previousLevel
        $env:VANTARE_PERFORMANCE_SENSOR = $previousSensor
        $env:VANTARE_PERFORMANCE_SENSOR_TRACE = $previousTrace
    }

    $sessionName = "VantareSensor-$($appProcess.Id)"
    try {
        $deadline = (Get-Date).AddSeconds(30)
        do {
            try {
                Invoke-RestMethod -Uri 'http://127.0.0.1:9246/json' -TimeoutSec 1 | Out-Null
                $ready = $true
            } catch {
                $ready = $false
                Start-Sleep -Milliseconds 250
            }
        } while (-not $ready -and (Get-Date) -lt $deadline)
        if (-not $ready) { throw "CDP no estuvo disponible para $condition" }
        Start-Sleep -Seconds 10

        for ($sampleIndex = 0; $sampleIndex -lt $DurationSeconds; $sampleIndex++) {
            $beforeAt = Get-Date
            $beforeIds = @(Get-OwnedProcessIds -RootProcessId $appProcess.Id)
            $beforeCPU = @{}
            foreach ($processId in $beforeIds) {
                $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                if ($process) { $beforeCPU[$processId] = $process.TotalProcessorTime.TotalSeconds }
            }
            Start-Sleep -Seconds 1
            $elapsed = ((Get-Date) - $beforeAt).TotalSeconds
            $afterIds = @(Get-OwnedProcessIds -RootProcessId $appProcess.Id)
            $cpuSeconds = 0.0
            $privateBytes = [int64]0
            foreach ($processId in $afterIds) {
                $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                if (-not $process) { continue }
                $privateBytes += [int64]$process.PrivateMemorySize64
                if ($beforeCPU.ContainsKey($processId)) {
                    $cpuSeconds += [Math]::Max(0.0, $process.TotalProcessorTime.TotalSeconds - [double]$beforeCPU[$processId])
                }
            }
            $allSamples.Add([pscustomobject]@{
                condition = $condition
                second = $sampleIndex + 1
                cpuPct = 100.0 * $cpuSeconds / $elapsed / $logicalProcessors
                privateMB = $privateBytes / 1MB
                processCount = $afterIds.Count
            })
        }

        $conditionSamples = @($allSamples | Where-Object condition -eq $condition)
        $cpuValues = [double[]]@($conditionSamples.cpuPct)
        $summaries.Add([pscustomobject]@{
            condition = $condition
            durationSeconds = $DurationSeconds
            cpuPctMean = ($cpuValues | Measure-Object -Average).Average
            cpuPctP95 = Get-Percentile95 -Values $cpuValues
            privateMBMean = (@($conditionSamples.privateMB) | Measure-Object -Average).Average
        })

        & node (Join-Path $repoRoot 'scripts\bench\huella-cdp.mjs') --cdp http://127.0.0.1:9246 --action app-quit --duration 1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Application.Quit falló para $condition" }
        Wait-Process -Id $appProcess.Id -Timeout 15 -ErrorAction SilentlyContinue
    } finally {
        if ($appProcess -and (Get-Process -Id $appProcess.Id -ErrorAction SilentlyContinue)) {
            Stop-Process -Id $appProcess.Id -Force -ErrorAction SilentlyContinue
        }
        if ($condition -eq 'on') {
            & logman stop $sessionName -ets 2>&1 | Out-Null
            & logman stop $sessionName -ets 2>&1 | Out-Null
        }
        if (Test-Path -LiteralPath $stderrPath) {
            Copy-Item -LiteralPath $stderrPath -Destination (Join-Path $OutputDir "$condition-sensor.log") -Force
        }
    }
    if (Get-Process -Id $appProcess.Id -ErrorAction SilentlyContinue) {
        throw "Vantare $condition PID $($appProcess.Id) no terminó"
    }
    $remaining = (& logman query -ets 2>&1 | Out-String)
    if ($remaining -match [regex]::Escape($sessionName)) {
        throw "La sesión propia quedó activa: $sessionName"
    }
    if ($condition -eq 'on') {
        $levelDrift = Select-String -LiteralPath (Join-Path $OutputDir 'on-sensor.log') -Pattern ' level=(1|2|3|4) '
        if ($levelDrift) { throw 'El A/A dejó de estar fijado en nivel 5; la captura no es comparable.' }
    }
}

$allSamples | Export-Csv -LiteralPath (Join-Path $OutputDir 'samples.csv') -NoTypeInformation -Encoding utf8
$summaries | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputDir 'summary.json') -Encoding utf8
$off = $summaries | Where-Object condition -eq 'off'
$on = $summaries | Where-Object condition -eq 'on'
$markdown = @"
# ISA-944 · coste marginal del sensor

- SHA: $(git -C $repoRoot rev-parse HEAD)
- Escena: LMU abierto; misma sesión durante OFF y ON.
- Nivel fijo: 5 mediante `VANTARE_PERF_LEVEL`; el log ON se valida sin niveles 1/2/3/4.
- Muestras: $DurationSeconds ventanas de CPU de 1 s por condición, tras 10 s de calentamiento; el tiempo de pared incluye el inventario del árbol entre ventanas.

| Condición | CPU media (%) | CPU p95 (%) | Private MB media |
| --- | ---: | ---: | ---: |
| Sensor OFF | $([Math]::Round($off.cpuPctMean, 4)) | $([Math]::Round($off.cpuPctP95, 4)) | $([Math]::Round($off.privateMBMean, 2)) |
| Sensor ON | $([Math]::Round($on.cpuPctMean, 4)) | $([Math]::Round($on.cpuPctP95, 4)) | $([Math]::Round($on.privateMBMean, 2)) |

CPU incluye el árbol completo de la app; ON incluye su PresentMon propio. Datos crudos: `samples.csv`.

Delta ON − OFF: $([Math]::Round($on.cpuPctMean - $off.cpuPctMean, 4)) puntos de CPU media, $([Math]::Round($on.cpuPctP95 - $off.cpuPctP95, 4)) puntos de CPU p95 y $([Math]::Round($on.privateMBMean - $off.privateMBMean, 2)) MiB privados.
"@
$markdown | Set-Content -LiteralPath (Join-Path $OutputDir 'README.md') -Encoding utf8
Write-Output "PASS output=$OutputDir"
