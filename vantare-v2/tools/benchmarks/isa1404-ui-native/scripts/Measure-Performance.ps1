param(
    [int]$Runs = 3,
    [int]$WarmupSeconds = 30,
    [int]$MeasureSeconds = 60,
    [int]$HiddenSeconds = 20,
    [int]$GpuSeconds = 60,
    [ValidateSet("control", "overlay")]
    [string]$Mode = "overlay",
    [ValidateSet("wails", "qtquick", "slint")]
    [string[]]$CandidateNames = @("wails", "qtquick", "slint"),
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\evidence\performance")
)

$ErrorActionPreference = "Stop"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativePerformance {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_MEMORY_COUNTERS_EX2 {
        public uint cb, PageFaultCount;
        public UIntPtr PeakWorkingSetSize, WorkingSetSize, QuotaPeakPagedPoolUsage,
            QuotaPagedPoolUsage, QuotaPeakNonPagedPoolUsage, QuotaNonPagedPoolUsage,
            PagefileUsage, PeakPagefileUsage, PrivateUsage, PrivateWorkingSetSize,
            SharedCommitUsage;
    }
    [DllImport("psapi.dll", SetLastError=true)]
    private static extern bool GetProcessMemoryInfo(IntPtr process, out PROCESS_MEMORY_COUNTERS_EX2 counters, uint size);
    public static ulong GetPrivateWorkingSet(IntPtr process) {
        var counters = new PROCESS_MEMORY_COUNTERS_EX2();
        counters.cb = (uint)Marshal.SizeOf<PROCESS_MEMORY_COUNTERS_EX2>();
        if (!GetProcessMemoryInfo(process, out counters, counters.cb)) {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
        return counters.PrivateWorkingSetSize.ToUInt64();
    }
}
"@

$benchmarkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$outRoot = Join-Path $benchmarkRoot "out"
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$logicalProcessors = [Environment]::ProcessorCount

$candidates = @(
    [pscustomobject]@{ Name = "wails"; Directory = $outRoot; Executable = "vantare-wails-reference.exe"; Arguments = @("-mode", $Mode); PackageDirectory = $null },
    [pscustomobject]@{ Name = "qtquick"; Directory = (Join-Path $outRoot "qtquick"); Executable = "vantare-qtquick-bakeoff.exe"; Arguments = @("--mode", $Mode); PackageDirectory = (Join-Path $outRoot "qtquick") },
    [pscustomobject]@{ Name = "slint"; Directory = $outRoot; Executable = "vantare-slint-bakeoff.exe"; Arguments = @("--mode", $Mode); PackageDirectory = $null }
) | Where-Object { $_.Name -in $CandidateNames }

function Get-DescendantIds([int]$RootId) {
    $rows = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
    $ids = [Collections.Generic.HashSet[int]]::new()
    $null = $ids.Add($RootId)
    $changed = $true
    while ($changed) {
        $changed = $false
        foreach ($row in $rows) {
            if ($ids.Contains([int]$row.ParentProcessId) -and $ids.Add([int]$row.ProcessId)) { $changed = $true }
        }
    }
    return @($ids)
}

function Start-Candidate([object]$Candidate) {
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $process = Start-Process -FilePath (Join-Path $Candidate.Directory $Candidate.Executable) -ArgumentList $Candidate.Arguments -WorkingDirectory $Candidate.Directory -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
        Start-Sleep -Milliseconds 20
        $process.Refresh()
        if ($process.HasExited) { throw "$($Candidate.Name) exited during startup (code $($process.ExitCode))" }
    } until ($process.MainWindowHandle -ne [IntPtr]::Zero -or [DateTime]::UtcNow -gt $deadline)
    $watch.Stop()
    if ($process.MainWindowHandle -eq [IntPtr]::Zero) { Stop-Process -Id $process.Id -Force; throw "$($Candidate.Name) did not expose a window" }
    return [pscustomobject]@{ Process = $process; StartupMilliseconds = $watch.Elapsed.TotalMilliseconds; Handle = $process.MainWindowHandle }
}

function Stop-Tree([Diagnostics.Process]$RootProcess) {
    $ids = @(Get-DescendantIds $RootProcess.Id | Sort-Object -Descending)
    foreach ($id in $ids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
    try { $RootProcess.WaitForExit(5000) | Out-Null } catch {}
}

function Get-Percentile([double[]]$Values, [double]$Percentile) {
    if ($Values.Count -eq 0) { return 0.0 }
    $sorted = @($Values | Sort-Object)
    $index = [Math]::Ceiling(($Percentile / 100.0) * $sorted.Count) - 1
    return [double]$sorted[[Math]::Max(0, [Math]::Min($sorted.Count - 1, $index))]
}

function Measure-ProcessTree([int]$RootId, [int]$Seconds, [string]$State) {
    $samples = @()
    $previousCpu = $null
    $previousTime = $null
    $firstTimestamp = $null
    $lastTimestamp = $null
    $firstCpuByProcess = @{}
    $lastCpuByProcess = @{}
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $sampleStarted = [DateTime]::UtcNow
        $ids = @(Get-DescendantIds $RootId)
        $processes = @($ids | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
        if ($processes.Count -eq 0) { throw "process tree $RootId disappeared during $State measurement" }
        $cpu = [double](($processes | ForEach-Object { $_.TotalProcessorTime.TotalSeconds } | Measure-Object -Sum).Sum)
        $working = [double](($processes | Measure-Object -Property WorkingSet64 -Sum).Sum)
        $private = [double](($processes | Measure-Object -Property PrivateMemorySize64 -Sum).Sum)
        $privateWorkingSet = 0.0
        foreach ($item in $processes) { $privateWorkingSet += [NativePerformance]::GetPrivateWorkingSet($item.Handle) }
        $handles = [double](($processes | Measure-Object -Property HandleCount -Sum).Sum)
        $cpuPercent = $null
        if ($null -ne $previousCpu) {
            $elapsed = ($sampleStarted - $previousTime).TotalSeconds
            if ($elapsed -gt 0) { $cpuPercent = [Math]::Max(0, (($cpu - $previousCpu) / $elapsed) * 100.0 / $logicalProcessors) }
        }
        $samples += [pscustomobject]@{
            Timestamp = $sampleStarted.ToString("o")
            State = $State
            ProcessCount = $processes.Count
            WorkingSetBytes = $working
            PrivateWorkingSetBytes = $privateWorkingSet
            PrivateBytes = $private
            Handles = $handles
            CpuPercent = $cpuPercent
        }
        $previousCpu = $cpu
        $previousTime = $sampleStarted
        if ($null -eq $firstTimestamp) { $firstTimestamp = $sampleStarted }
        $lastTimestamp = $sampleStarted
        foreach ($item in $processes) {
            $processCpu = $item.TotalProcessorTime.TotalSeconds
            if (-not $firstCpuByProcess.ContainsKey($item.Id)) { $firstCpuByProcess[$item.Id] = $processCpu }
            $lastCpuByProcess[$item.Id] = $processCpu
        }
        $remaining = 1000 - ([DateTime]::UtcNow - $sampleStarted).TotalMilliseconds
        if ($remaining -gt 0) { Start-Sleep -Milliseconds ([int]$remaining) }
    }
    $cpuDelta = 0.0
    foreach ($entry in $lastCpuByProcess.GetEnumerator()) { $cpuDelta += [Math]::Max(0, $entry.Value - $firstCpuByProcess[$entry.Key]) }
    $wallSeconds = [Math]::Max(0.001, ($lastTimestamp - $firstTimestamp).TotalSeconds)
    return [pscustomobject]@{ Samples = @($samples); OverallCpuPercent = 100.0 * $cpuDelta / ($wallSeconds * $logicalProcessors) }
}

function Summarize-Samples([object]$Measurement) {
    $Samples = @($Measurement.Samples)
    $cpu = [double[]]@($Samples | Where-Object { $null -ne $_.CpuPercent } | ForEach-Object CpuPercent)
    $working = [double[]]@($Samples | ForEach-Object WorkingSetBytes)
    $privateWorkingSet = [double[]]@($Samples | ForEach-Object PrivateWorkingSetBytes)
    $private = [double[]]@($Samples | ForEach-Object PrivateBytes)
    $handles = [double[]]@($Samples | ForEach-Object Handles)
    $processCounts = [double[]]@($Samples | ForEach-Object ProcessCount)
    return [pscustomobject]@{
        SampleCount = $Samples.Count
        CpuMeanPercent = [double]$Measurement.OverallCpuPercent
        CpuP95Percent = Get-Percentile $cpu 95
        WorkingSetMeanBytes = [double](($working | Measure-Object -Average).Average)
        WorkingSetP95Bytes = Get-Percentile $working 95
        PrivateWorkingSetMeanBytes = [double](($privateWorkingSet | Measure-Object -Average).Average)
        PrivateWorkingSetP95Bytes = Get-Percentile $privateWorkingSet 95
        PrivateMeanBytes = [double](($private | Measure-Object -Average).Average)
        PrivateP95Bytes = Get-Percentile $private 95
        HandlesMean = [double](($handles | Measure-Object -Average).Average)
        ProcessCountMax = [double](($processCounts | Measure-Object -Maximum).Maximum)
    }
}

function Measure-Gpu([int[]]$ProcessIds, [int]$Seconds) {
    $counter = Get-Counter -Counter "\GPU Engine(*)\Utilization Percentage", "\GPU Process Memory(*)\Dedicated Usage" -SampleInterval 1 -MaxSamples $Seconds
    $groups = $counter.CounterSamples | Group-Object Timestamp
    $samples = foreach ($group in $groups) {
        $engine = 0.0
        $dedicated = 0.0
        foreach ($sample in $group.Group) {
            $matchedId = $null
            if ($sample.InstanceName -match "^pid_(\d+)_") { $matchedId = [int]$Matches[1] }
            if ($null -eq $matchedId -or $matchedId -notin $ProcessIds) { continue }
            if ($sample.Path -like "*GPU Engine*") { $engine += [Math]::Max(0, [double]$sample.CookedValue) }
            elseif ($sample.Path -like "*GPU Process Memory*") { $dedicated += [Math]::Max(0, [double]$sample.CookedValue) }
        }
        [pscustomobject]@{ Timestamp = $group.Name; EnginePercentSum = $engine; DedicatedBytes = $dedicated }
    }
    return @($samples)
}

$allRuns = @()
foreach ($candidate in $candidates) {
    for ($run = 1; $run -le $Runs; $run++) {
        Write-Host "$($candidate.Name) run $run/${Runs}: warmup ${WarmupSeconds}s"
        $launch = Start-Candidate $candidate
        try {
            Start-Sleep -Seconds $WarmupSeconds
            $visibleMeasurement = Measure-ProcessTree $launch.Process.Id $MeasureSeconds "visible"
            [NativePerformance]::ShowWindow($launch.Handle, 0) | Out-Null
            Start-Sleep -Seconds 2
            $hiddenMeasurement = Measure-ProcessTree $launch.Process.Id $HiddenSeconds "hidden"
            $visible = @($visibleMeasurement.Samples)
            $hidden = @($hiddenMeasurement.Samples)
            $runEvidence = [pscustomobject]@{
                Candidate = $candidate.Name
                Run = $run
                StartupMilliseconds = $launch.StartupMilliseconds
                Visible = Summarize-Samples $visibleMeasurement
                Hidden = Summarize-Samples $hiddenMeasurement
                RawVisible = $visible
                RawHidden = $hidden
            }
            $allRuns += $runEvidence
            $runEvidence | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 (Join-Path $OutputDirectory "$($candidate.Name)-run-$run.json")
        } finally { Stop-Tree $launch.Process }
    }
}

$gpuResults = @()
foreach ($candidate in $candidates) {
    Write-Host "$($candidate.Name) GPU: warmup ${WarmupSeconds}s, measure ${GpuSeconds}s"
    $launch = Start-Candidate $candidate
    try {
        Start-Sleep -Seconds $WarmupSeconds
        $ids = [int[]]@(Get-DescendantIds $launch.Process.Id)
        $samples = Measure-Gpu $ids $GpuSeconds
        $engine = [double[]]@($samples | ForEach-Object EnginePercentSum)
        $memory = [double[]]@($samples | ForEach-Object DedicatedBytes)
        $gpuResults += [pscustomobject]@{
            Candidate = $candidate.Name
            ProcessIds = $ids
            SampleCount = $samples.Count
            EngineMeanPercentSum = [double](($engine | Measure-Object -Average).Average)
            EngineP95PercentSum = Get-Percentile $engine 95
            DedicatedMeanBytes = [double](($memory | Measure-Object -Average).Average)
            DedicatedP95Bytes = Get-Percentile $memory 95
            Raw = $samples
        }
    } finally { Stop-Tree $launch.Process }
}

$packages = foreach ($candidate in $candidates) {
    $executablePath = Join-Path $candidate.Directory $candidate.Executable
    $deployedBytes = if ($null -ne $candidate.PackageDirectory) {
        [double]((Get-ChildItem $candidate.PackageDirectory -File -Recurse | Measure-Object Length -Sum).Sum)
    } else { [double](Get-Item $executablePath).Length }
    [pscustomobject]@{ Candidate = $candidate.Name; ExecutableBytes = [double](Get-Item $executablePath).Length; DeployedBytes = $deployedBytes }
}

$summary = foreach ($candidate in $candidates) {
    $runsForCandidate = @($allRuns | Where-Object Candidate -eq $candidate.Name)
    $gpu = $gpuResults | Where-Object Candidate -eq $candidate.Name
    $package = $packages | Where-Object Candidate -eq $candidate.Name
    [pscustomobject]@{
        Candidate = $candidate.Name
        StartupMeanMs = [double](($runsForCandidate.StartupMilliseconds | Measure-Object -Average).Average)
        VisibleCpuMeanPercent = [double](($runsForCandidate.Visible.CpuMeanPercent | Measure-Object -Average).Average)
        VisibleCpuP95Percent = [double](($runsForCandidate.Visible.CpuP95Percent | Measure-Object -Average).Average)
        VisiblePrivateMeanMiB = [double](($runsForCandidate.Visible.PrivateMeanBytes | Measure-Object -Average).Average) / 1MB
        VisibleWorkingSetMeanMiB = [double](($runsForCandidate.Visible.WorkingSetMeanBytes | Measure-Object -Average).Average) / 1MB
        VisiblePrivateWorkingSetMeanMiB = [double](($runsForCandidate.Visible.PrivateWorkingSetMeanBytes | Measure-Object -Average).Average) / 1MB
        HiddenCpuMeanPercent = [double](($runsForCandidate.Hidden.CpuMeanPercent | Measure-Object -Average).Average)
        HiddenPrivateMeanMiB = [double](($runsForCandidate.Hidden.PrivateMeanBytes | Measure-Object -Average).Average) / 1MB
        HiddenPrivateWorkingSetMeanMiB = [double](($runsForCandidate.Hidden.PrivateWorkingSetMeanBytes | Measure-Object -Average).Average) / 1MB
        GpuEngineMeanPercentSum = $gpu.EngineMeanPercentSum
        GpuDedicatedMeanMiB = $gpu.DedicatedMeanBytes / 1MB
        ProcessCountMax = [double](($runsForCandidate.Visible.ProcessCountMax | Measure-Object -Maximum).Maximum)
        HandlesMean = [double](($runsForCandidate.Visible.HandlesMean | Measure-Object -Average).Average)
        ExecutableMiB = $package.ExecutableBytes / 1MB
        DeployedMiB = $package.DeployedBytes / 1MB
    }
}

[pscustomobject]@{ Machine = [pscustomobject]@{ ComputerName = $env:COMPUTERNAME; LogicalProcessors = $logicalProcessors; Timestamp = [DateTime]::UtcNow.ToString("o") }; Parameters = [pscustomobject]@{ Mode = $Mode; Runs = $Runs; WarmupSeconds = $WarmupSeconds; MeasureSeconds = $MeasureSeconds; HiddenSeconds = $HiddenSeconds; GpuSeconds = $GpuSeconds }; Runs = $allRuns; Gpu = $gpuResults; Packages = $packages; Summary = $summary } |
    ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 (Join-Path $OutputDirectory "performance-results.json")
$summary | Export-Csv -NoTypeInformation -Encoding utf8 (Join-Path $OutputDirectory "performance-summary.csv")
$summary | Format-Table Candidate, StartupMeanMs, VisibleCpuMeanPercent, VisiblePrivateMeanMiB, HiddenCpuMeanPercent, GpuEngineMeanPercentSum, ProcessCountMax, DeployedMiB -AutoSize
