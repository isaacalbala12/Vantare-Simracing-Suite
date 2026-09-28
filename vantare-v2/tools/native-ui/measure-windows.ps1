param(
    [Parameter(Mandatory)] [string] $Executable,
    [Parameter(Mandatory)] [string[]] $Arguments,
    [Parameter(Mandatory)] [string] $Label,
    [string] $QtBin,
    [int] $WarmupSeconds = 3,
    [int] $Samples = 8
)

$ErrorActionPreference = 'Stop'
if ($QtBin) { $env:PATH = "$QtBin;$env:PATH" }
$startInfo = [System.Diagnostics.ProcessStartInfo]::new((Resolve-Path -LiteralPath $Executable).Path)
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
foreach ($argument in $Arguments) { [void] $startInfo.ArgumentList.Add($argument) }
$process = [System.Diagnostics.Process]::Start($startInfo)
if ($null -eq $process) { throw "Could not launch $Executable" }

function Get-TrialProcesses([int] $RootId) {
    $inventory = @(Get-CimInstance Win32_Process)
    $ids = [System.Collections.Generic.HashSet[int]]::new()
    [void] $ids.Add($RootId)
    do {
        $previous = $ids.Count
        foreach ($candidate in $inventory) {
            if ($ids.Contains([int] $candidate.ParentProcessId)) {
                [void] $ids.Add([int] $candidate.ProcessId)
            }
        }
    } while ($ids.Count -ne $previous)
    $live = @()
    foreach ($id in $ids) {
        $item = Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($item) { $live += $item }
    }
    return $live
}

try {
    Start-Sleep -Seconds $WarmupSeconds
    if ($process.HasExited) { throw "Trial exited during warmup with code $($process.ExitCode)" }
    $measurements = @()
    for ($index = 0; $index -lt $Samples; $index++) {
        $live = @(Get-TrialProcesses $process.Id)
        if (-not $live) { throw 'Trial exited during measurement' }
        $measurements += [pscustomobject]@{
            Time = [System.Diagnostics.Stopwatch]::GetTimestamp()
            WorkingSetMiB = [math]::Round((($live | Measure-Object WorkingSet64 -Sum).Sum / 1MB), 1)
            PrivateMiB = [math]::Round((($live | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB), 1)
            CpuSeconds = ($live | Measure-Object CPU -Sum).Sum
            Processes = $live.Count
            ProcessNames = (($live | ForEach-Object ProcessName | Sort-Object -Unique) -join ',')
        }
        Start-Sleep -Seconds 1
    }
    $ordered = @($measurements.WorkingSetMiB | Sort-Object)
    $privateOrdered = @($measurements.PrivateMiB | Sort-Object)
    $first = $measurements[0]
    $last = $measurements[-1]
    $duration = ($last.Time - $first.Time) / [System.Diagnostics.Stopwatch]::Frequency
    $oneCore = (($last.CpuSeconds - $first.CpuSeconds) / $duration) * 100
    [pscustomobject]@{
        Executable = (Split-Path -Leaf $Executable)
        Mode = $Label
        MedianWorkingSetMiB = $ordered[[int] [math]::Floor($ordered.Count / 2)]
        MedianPrivateMiB = $privateOrdered[[int] [math]::Floor($privateOrdered.Count / 2)]
        PeakWorkingSetMiB = ($ordered | Measure-Object -Maximum).Maximum
        MeanCpuOneCorePercent = [math]::Round($oneCore, 2)
        MeanCpuMachinePercent = [math]::Round($oneCore / [Environment]::ProcessorCount, 3)
        ProcessCount = $last.Processes
        ProcessNames = $last.ProcessNames
        Samples = $Samples
    } | ConvertTo-Json -Compress
} finally {
    if (-not $process.HasExited) {
        $process.Kill($true)
        $process.WaitForExit()
    }
    $process.Dispose()
}
