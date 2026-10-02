# Funciones compartidas por huella.ps1 y huella-medir.ps1 (se cargan con dot-source).

function Format-Invariant([double]$Value) {
    $Value.ToString('R', [Globalization.CultureInfo]::InvariantCulture)
}

function Get-GpuTotals {
    $totals = @{}
    try {
        $samples = (Get-Counter -Counter @('\GPU Engine(*)\Utilization Percentage', '\GPU Process Memory(*)\Dedicated Usage') -ErrorAction Stop).CounterSamples
        foreach ($sample in $samples) {
            if ($sample.InstanceName -notmatch 'pid_(\d+)') { continue }
            $processId = [int]$Matches[1]
            if (-not $totals.ContainsKey($processId)) { $totals[$processId] = @{ Engine = 0.0; Dedicated = 0.0; Engines = [Collections.Generic.List[object]]::new(); Memory = [Collections.Generic.List[object]]::new() } }
            if ($sample.Path -like '*Utilization Percentage') {
                $totals[$processId].Engine += [double]$sample.CookedValue
                $totals[$processId].Engines.Add([pscustomobject]@{ instance = $sample.InstanceName; percent = [double]$sample.CookedValue })
            } elseif ($sample.Path -like '*Dedicated Usage') {
                $totals[$processId].Dedicated += [double]$sample.CookedValue
                $totals[$processId].Memory.Add([pscustomobject]@{ instance = $sample.InstanceName; dedicatedBytes = [double]$sample.CookedValue })
            }
        }
        return [pscustomobject]@{ Valid = $true; Totals = $totals; Error = $null }
    } catch {
        Write-Warning "Contadores GPU no disponibles en esta muestra: $($_.Exception.Message)"
        return [pscustomobject]@{ Valid = $false; Totals = @{}; Error = $_.Exception.Message }
    }
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

# Frames de un CSV PresentMon v2: Timestamp, FrameTimeMs y Dropped (DisplayedTime NA = no llegó a pantalla).
function Read-PresentMonFrames([string]$Path) {
    $frames = [Collections.Generic.List[object]]::new()
    $source = @(Import-Csv -LiteralPath $Path)
    if ($source.Count -gt 0) {
        $columns = @($source[0].PSObject.Properties.Name)
        if ('FrameTime' -notin $columns -or 'DisplayedTime' -notin $columns) {
            throw 'CSV de PresentMon incompatible: se requieren FrameTime y DisplayedTime del contrato v2.'
        }
    }
    $dropped = 0
    foreach ($frame in $source) {
        [double]$frameValue = 0
        if (-not [double]::TryParse([string]$frame.FrameTime, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$frameValue)) { continue }
        $displayedTime = [string]$frame.DisplayedTime
        [double]$displayedValue = 0
        $isDropped = if ($displayedTime -eq 'NA') {
            1
        } elseif ([double]::TryParse($displayedTime, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$displayedValue) -and $displayedValue -gt 0) {
            0
        } else {
            throw "DisplayedTime inesperado en CSV PresentMon v2: '$displayedTime'."
        }
        $dropped += $isDropped
        $frames.Add([pscustomobject]@{ Timestamp = [string]$frame.CPUStartTime; FrameTimeMs = $frameValue; Dropped = $isDropped })
    }
    [pscustomobject]@{ Frames = $frames; Dropped = $dropped }
}
