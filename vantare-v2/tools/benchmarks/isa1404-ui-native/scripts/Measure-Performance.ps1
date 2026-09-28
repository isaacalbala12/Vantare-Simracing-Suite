param(
    [int]$Runs = 3,
    [int]$WarmupSeconds = 30,
    [int]$MeasureSeconds = 60,
    [int]$HiddenSeconds = 20,
    [int]$GpuSeconds = 60,
    [ValidateSet("control", "overlay", "combined")]
    [string]$Mode = "overlay",
    [switch]$CaptureWithObs,
    [int]$ObsPort = 4468,
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
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
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
if ($CaptureWithObs -and $Mode -ne "combined") { throw "OBS capture requires -Mode combined" }
if ($CaptureWithObs) { Get-Command ffmpeg, ffprobe -ErrorAction Stop | Out-Null }

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

function Get-InstanceIds([int[]]$RootIds) {
    $ids = [Collections.Generic.HashSet[int]]::new()
    foreach ($rootId in $RootIds) {
        foreach ($id in @(Get-DescendantIds $rootId)) { $null = $ids.Add([int]$id) }
    }
    return @($ids)
}

function Get-ProcessFootprint([int[]]$RootIds) {
    $ids = @(Get-InstanceIds $RootIds)
    $processes = @($ids | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
    if ($processes.Count -eq 0) { throw "process set $($RootIds -join ',') disappeared" }
    $cpuSeconds = 0.0
    $privateWorkingSet = 0.0
    $privateWorkingSetAvailable = $true
    foreach ($item in $processes) {
        $processorTime = $item.TotalProcessorTime
        if ($null -ne $processorTime) {
            $cpuSeconds += $processorTime.TotalSeconds
        } else {
            $row = Get-CimInstance Win32_Process -Filter "ProcessId = $($item.Id)"
            if ($null -eq $row) { throw "CPU time unavailable for process $($item.Id)" }
            $cpuSeconds += ([double]$row.KernelModeTime + [double]$row.UserModeTime) / 10000000.0
        }
        if ($null -ne $item.Handle) {
            $privateWorkingSet += [NativePerformance]::GetPrivateWorkingSet($item.Handle)
        } else { $privateWorkingSetAvailable = $false }
    }
    return [pscustomobject]@{
        Timestamp = [DateTime]::UtcNow
        CpuSeconds = $cpuSeconds
        PrivateBytes = [double](($processes | Measure-Object -Property PrivateMemorySize64 -Sum).Sum)
        PrivateWorkingSetBytes = if ($privateWorkingSetAvailable) { $privateWorkingSet } else { $null }
        ProcessCount = $processes.Count
    }
}

function Get-FootprintDelta([object]$Before, [object]$After) {
    $seconds = [Math]::Max(0.001, ($After.Timestamp - $Before.Timestamp).TotalSeconds)
    $cpuSeconds = [Math]::Max(0.0, $After.CpuSeconds - $Before.CpuSeconds)
    return [pscustomobject]@{
        CpuPercent = 100.0 * $cpuSeconds / ($seconds * $logicalProcessors)
        CpuSeconds = $cpuSeconds
        WallSeconds = $seconds
        PrivateMeanMiB = ($Before.PrivateBytes + $After.PrivateBytes) / 2MB
        PrivateWorkingSetMeanMiB = if ($null -ne $Before.PrivateWorkingSetBytes -and $null -ne $After.PrivateWorkingSetBytes) { ($Before.PrivateWorkingSetBytes + $After.PrivateWorkingSetBytes) / 2MB } else { $null }
        ProcessCountMax = [Math]::Max($Before.ProcessCount, $After.ProcessCount)
    }
}

function Start-PortableObs {
    $portableRoot = Join-Path $benchmarkRoot "evidence\obs\sandbox\portable-obs"
    $executable = Join-Path $portableRoot "bin\64bit\obs64.exe"
    if (-not (Test-Path $executable)) { throw "Portable OBS missing; run Test-OBS.ps1 first" }
    $config = Join-Path $portableRoot "config\obs-studio\plugin_config\obs-websocket"
    New-Item -ItemType Directory -Force $config | Out-Null
    @{ server_enabled = $true; server_port = $ObsPort; auth_required = $false; first_load = $false } |
        ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $config "config.json")
    $process = Start-Process -FilePath $executable -ArgumentList "--portable", "--multi", "--disable-shutdown-check", "--disable-updater", "--minimize-to-tray" -WorkingDirectory (Split-Path $executable) -WindowStyle Hidden -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    $ready = $false
    do {
        Start-Sleep -Milliseconds 250
        try {
            $client = [Net.Sockets.TcpClient]::new()
            $client.Connect("127.0.0.1", $ObsPort)
            $client.Dispose()
            $ready = $true
        } catch { if ($null -ne $client) { $client.Dispose() } }
        $process.Refresh()
    } until ($ready -or $process.HasExited -or [DateTime]::UtcNow -gt $deadline)
    if (-not $ready) { Stop-Tree $process; throw "portable OBS websocket did not start" }
    return $process
}

function Set-ObsCapture([object]$Candidate, [string]$ScreenshotPath) {
    $titles = @{ wails = "Wails Overlay"; qtquick = "Qt Quick Overlay"; slint = "Slint Overlay" }
    & python (Join-Path $PSScriptRoot "obs_capture.py") --port $ObsPort --title $titles[$Candidate.Name] --output $ScreenshotPath --scene "ISA-1404-P03" --input "Vantare P03 overlay"
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $ScreenshotPath)) { throw "OBS capture failed for $($Candidate.Name)" }
}

function Invoke-ObsRecord([string]$Action) {
    $arguments = @((Join-Path $PSScriptRoot "obs_record.py"), "--port", "$ObsPort", "--action", $Action)
    if ($Action -eq "start") { $arguments += @("--directory", (Resolve-Path $OutputDirectory).Path) }
    $json = & python @arguments
    if ($LASTEXITCODE -ne 0) { throw "OBS $Action recording request failed" }
    return ($json | ConvertFrom-Json)
}

function Save-VideoOnlyRecording([object]$Stopped) {
    $directory = (Resolve-Path $OutputDirectory).Path
    $source = (Resolve-Path -LiteralPath $Stopped.recordingOutput.outputPath).Path
    if (-not $source.StartsWith($directory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "OBS recording escaped benchmark output directory"
    }
    $target = Join-Path $directory "video-only.mp4"
    if (Test-Path -LiteralPath $target) { throw "video-only.mp4 already exists" }
    & ffmpeg -nostdin -v error -i $source -map 0:v:0 -c copy -an $target
    if ($LASTEXITCODE -ne 0) { throw "video-only remux failed" }
    $streams = @(& ffprobe -v error -show_entries stream=codec_type -of csv=p=0 $target)
    if ($LASTEXITCODE -ne 0 -or ($streams -join ",") -ne "video") { throw "video-only verification failed" }
    $duration = & ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $target
    if ($LASTEXITCODE -ne 0 -or [double]::Parse($duration, [Globalization.CultureInfo]::InvariantCulture) -le 0) { throw "recording duration unavailable" }
    Remove-Item -LiteralPath $source
    [pscustomobject]@{ VideoOnly = "video-only.mp4"; DurationSeconds = [double]::Parse($duration, [Globalization.CultureInfo]::InvariantCulture); AudioRemoved = $true } |
        ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $directory "video-only-check.json")
}

function Measure-ProcessTree([int[]]$RootIds, [int]$Seconds, [string]$State) {
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
        $ids = @(Get-InstanceIds $RootIds)
        $processes = @($ids | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
        if ($processes.Count -eq 0) { throw "process set $($RootIds -join ',') disappeared during $State measurement" }
        $cpu = [double](($processes | ForEach-Object { $_.TotalProcessorTime.TotalSeconds } | Measure-Object -Sum).Sum)
        $working = [double](($processes | Measure-Object -Property WorkingSet64 -Sum).Sum)
        $private = [double](($processes | Measure-Object -Property PrivateMemorySize64 -Sum).Sum)
        $privateWorkingSet = 0.0
        foreach ($item in $processes) { $privateWorkingSet += [NativePerformance]::GetPrivateWorkingSet($item.Handle) }
        $handles = [double](($processes | Measure-Object -Property HandleCount -Sum).Sum)
        $cpuPercent = $null
        if ($null -ne $previousCpu) {
            $elapsed = ($sampleStarted - $previousTime).TotalSeconds
            if ($elapsed -gt 0) { $cpuPercent = [Math]::Max(0.0, (($cpu - $previousCpu) / $elapsed) * 100.0 / $logicalProcessors) }
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

function Measure-Gpu([int[]]$ProcessIds, [int]$Seconds, [int[]]$ObsProcessIds = @(), [int[]]$DwmProcessIds = @()) {
    $counter = Get-Counter -Counter "\GPU Engine(*)\Utilization Percentage", "\GPU Process Memory(*)\Dedicated Usage" -SampleInterval 1 -MaxSamples $Seconds
    $groups = $counter.CounterSamples | Group-Object Timestamp
    $samples = foreach ($group in $groups) {
        $engine = 0.0
        $dedicated = 0.0
        $obsDedicated = 0.0
        $dwmDedicated = 0.0
        foreach ($sample in $group.Group) {
            $matchedId = $null
            if ($sample.InstanceName -match "^pid_(\d+)_") { $matchedId = [int]$Matches[1] }
            if ($null -eq $matchedId) { continue }
            if ($matchedId -in $ProcessIds) {
                if ($sample.Path -like "*GPU Engine*") { $engine += [Math]::Max(0.0, [double]$sample.CookedValue) }
                elseif ($sample.Path -like "*GPU Process Memory*") { $dedicated += [Math]::Max(0.0, [double]$sample.CookedValue) }
            } elseif ($sample.Path -like "*GPU Process Memory*") {
                if ($matchedId -in $ObsProcessIds) { $obsDedicated += [Math]::Max(0.0, [double]$sample.CookedValue) }
                elseif ($matchedId -in $DwmProcessIds) { $dwmDedicated += [Math]::Max(0.0, [double]$sample.CookedValue) }
            }
        }
        [pscustomobject]@{ Timestamp = $group.Name; EnginePercentSum = $engine; DedicatedBytes = $dedicated; ObsDedicatedBytes = $obsDedicated; DwmDedicatedBytes = $dwmDedicated }
    }
    return @($samples)
}

$obsProcess = if ($CaptureWithObs) { Start-PortableObs } else { $null }
$recordingStarted = $false
try {
$allRuns = @()
for ($run = 1; $run -le $Runs; $run++) {
    $runCandidates = if ($CaptureWithObs) {
        for ($index = 0; $index -lt $candidates.Count; $index++) { $candidates[($index + $run - 1) % $candidates.Count] }
    } else { $candidates }
    foreach ($candidate in $runCandidates) {
        Write-Host "$($candidate.Name) run $run/${Runs}: warmup ${WarmupSeconds}s"
        $launches = @()
        try {
            if ($Mode -eq "combined") {
                $candidate.Arguments = if ($candidate.Name -eq "wails") { @("-mode", "control") } else { @("--mode", "control") }
                $control = Start-Candidate $candidate
                $launches += $control
                [NativePerformance]::ShowWindow($control.Handle, 6) | Out-Null
                if (-not [NativePerformance]::IsIconic($control.Handle)) { throw "$($candidate.Name) control did not minimize" }
                $candidate.Arguments = if ($candidate.Name -eq "wails") { @("-mode", "overlay") } else { @("--mode", "overlay") }
            }
            $launch = Start-Candidate $candidate
            $launches += $launch
            if ($Mode -eq "combined" -and -not [NativePerformance]::IsWindowVisible($launch.Handle)) { throw "$($candidate.Name) overlay is not visible" }
            $rootIds = [int[]]@($launches | ForEach-Object { $_.Process.Id })
            if ($CaptureWithObs) {
                Set-ObsCapture $candidate (Join-Path $OutputDirectory "$($candidate.Name)-obs-run-$run.png")
                if (-not $recordingStarted) {
                    $recordingMetadata = Invoke-ObsRecord "start"
                    $recordingStarted = $true
                } elseif (-not (Invoke-ObsRecord "status").recordStatus.outputActive) { throw "OBS recording stopped before $($candidate.Name) run $run" }
                $dwmIds = [int[]]@(Get-Process -Name dwm -ErrorAction Stop | Where-Object SessionId -eq ([Diagnostics.Process]::GetCurrentProcess().SessionId) | ForEach-Object Id)
                if ($dwmIds.Count -eq 0) { throw "DWM process for this session not found" }
            }
            Start-Sleep -Seconds $WarmupSeconds
            if ($CaptureWithObs) {
                $obsBefore = Get-ProcessFootprint ([int[]]@($obsProcess.Id))
                $dwmBefore = Get-ProcessFootprint $dwmIds
            }
            $visibleMeasurement = Measure-ProcessTree $rootIds $MeasureSeconds "visible"
            if ($CaptureWithObs) {
                $obsAfter = Get-ProcessFootprint ([int[]]@($obsProcess.Id))
                $dwmAfter = Get-ProcessFootprint $dwmIds
            }
            foreach ($instance in $launches) { [NativePerformance]::ShowWindow($instance.Handle, 0) | Out-Null }
            Start-Sleep -Seconds 2
            $hiddenMeasurement = Measure-ProcessTree $rootIds $HiddenSeconds "hidden"
            $visible = @($visibleMeasurement.Samples)
            $hidden = @($hiddenMeasurement.Samples)
            $runEvidence = [pscustomobject]@{
                Candidate = $candidate.Name
                Run = $run
                Mode = $Mode
                ProcessIds = $rootIds
                StartupMilliseconds = $launch.StartupMilliseconds
                Visible = Summarize-Samples $visibleMeasurement
                Hidden = Summarize-Samples $hiddenMeasurement
                ObsVisible = if ($CaptureWithObs) { Get-FootprintDelta $obsBefore $obsAfter } else { $null }
                DwmVisible = if ($CaptureWithObs) { Get-FootprintDelta $dwmBefore $dwmAfter } else { $null }
                RawVisible = $visible
                RawHidden = $hidden
            }
            $allRuns += $runEvidence
            $runEvidence | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 (Join-Path $OutputDirectory "$($candidate.Name)-run-$run.json")
        } finally { foreach ($instance in $launches) { Stop-Tree $instance.Process } }
    }
}

$gpuResults = @()
foreach ($candidate in $candidates) {
    Write-Host "$($candidate.Name) GPU: warmup ${WarmupSeconds}s, measure ${GpuSeconds}s"
    $launches = @()
    $dwmIds = [int[]]@()
    try {
        if ($Mode -eq "combined") {
            $candidate.Arguments = if ($candidate.Name -eq "wails") { @("-mode", "control") } else { @("--mode", "control") }
            $control = Start-Candidate $candidate
            $launches += $control
            [NativePerformance]::ShowWindow($control.Handle, 6) | Out-Null
            if (-not [NativePerformance]::IsIconic($control.Handle)) { throw "$($candidate.Name) control did not minimize" }
            $candidate.Arguments = if ($candidate.Name -eq "wails") { @("-mode", "overlay") } else { @("--mode", "overlay") }
        }
        $launch = Start-Candidate $candidate
        $launches += $launch
        if ($Mode -eq "combined" -and -not [NativePerformance]::IsWindowVisible($launch.Handle)) { throw "$($candidate.Name) overlay is not visible" }
        if ($CaptureWithObs) {
            Set-ObsCapture $candidate (Join-Path $OutputDirectory "$($candidate.Name)-obs-gpu.png")
            if (-not (Invoke-ObsRecord "status").recordStatus.outputActive) { throw "OBS recording stopped before $($candidate.Name) GPU measurement" }
            $dwmIds = [int[]]@(Get-Process -Name dwm -ErrorAction Stop | Where-Object SessionId -eq ([Diagnostics.Process]::GetCurrentProcess().SessionId) | ForEach-Object Id)
        }
        Start-Sleep -Seconds $WarmupSeconds
        $ids = [int[]]@(Get-InstanceIds ([int[]]@($launches | ForEach-Object { $_.Process.Id })))
        $obsIds = if ($CaptureWithObs) { [int[]]@(Get-InstanceIds ([int[]]@($obsProcess.Id))) } else { [int[]]@() }
        $samples = Measure-Gpu $ids $GpuSeconds $obsIds $dwmIds
        $engine = [double[]]@($samples | ForEach-Object EnginePercentSum)
        $memory = [double[]]@($samples | ForEach-Object DedicatedBytes)
        $obsMemory = [double[]]@($samples | ForEach-Object ObsDedicatedBytes)
        $dwmMemory = [double[]]@($samples | ForEach-Object DwmDedicatedBytes)
        $gpuResults += [pscustomobject]@{
            Candidate = $candidate.Name
            ProcessIds = $ids
            SampleCount = $samples.Count
            EngineMeanPercentSum = [double](($engine | Measure-Object -Average).Average)
            EngineP95PercentSum = Get-Percentile $engine 95
            DedicatedMeanBytes = [double](($memory | Measure-Object -Average).Average)
            DedicatedP95Bytes = Get-Percentile $memory 95
            ObsDedicatedMeanBytes = [double](($obsMemory | Measure-Object -Average).Average)
            DwmDedicatedMeanBytes = [double](($dwmMemory | Measure-Object -Average).Average)
            Raw = $samples
        }
    } finally { foreach ($instance in $launches) { Stop-Tree $instance.Process } }
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
        ObsCpuMeanPercent = if ($CaptureWithObs) { [double](($runsForCandidate.ObsVisible.CpuPercent | Measure-Object -Average).Average) } else { $null }
        ObsPrivateMeanMiB = if ($CaptureWithObs) { [double](($runsForCandidate.ObsVisible.PrivateMeanMiB | Measure-Object -Average).Average) } else { $null }
        ObsPrivateWorkingSetMeanMiB = if ($CaptureWithObs) { [double](($runsForCandidate.ObsVisible.PrivateWorkingSetMeanMiB | Measure-Object -Average).Average) } else { $null }
        ObsGpuDedicatedMeanMiB = if ($CaptureWithObs) { $gpu.ObsDedicatedMeanBytes / 1MB } else { $null }
        DwmCpuMeanPercent = if ($CaptureWithObs) { [double](($runsForCandidate.DwmVisible.CpuPercent | Measure-Object -Average).Average) } else { $null }
        DwmPrivateMeanMiB = if ($CaptureWithObs) { [double](($runsForCandidate.DwmVisible.PrivateMeanMiB | Measure-Object -Average).Average) } else { $null }
        DwmGpuDedicatedMeanMiB = if ($CaptureWithObs) { $gpu.DwmDedicatedMeanBytes / 1MB } else { $null }
        ProcessCountMax = [double](($runsForCandidate.Visible.ProcessCountMax | Measure-Object -Maximum).Maximum)
        HandlesMean = [double](($runsForCandidate.Visible.HandlesMean | Measure-Object -Average).Average)
        ExecutableMiB = $package.ExecutableBytes / 1MB
        DeployedMiB = $package.DeployedBytes / 1MB
    }
}

[pscustomobject]@{ Machine = [pscustomobject]@{ ComputerName = $env:COMPUTERNAME; LogicalProcessors = $logicalProcessors; Timestamp = [DateTime]::UtcNow.ToString("o") }; Parameters = [pscustomobject]@{ Mode = $Mode; CaptureWithObs = [bool]$CaptureWithObs; Runs = $Runs; WarmupSeconds = $WarmupSeconds; MeasureSeconds = $MeasureSeconds; HiddenSeconds = $HiddenSeconds; GpuSeconds = $GpuSeconds }; ObsRecording = $recordingMetadata; Runs = $allRuns; Gpu = $gpuResults; Packages = $packages; Summary = $summary } |
    ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 (Join-Path $OutputDirectory "performance-results.json")
$summary | Export-Csv -NoTypeInformation -Encoding utf8 (Join-Path $OutputDirectory "performance-summary.csv")
$summary | Format-Table Candidate, StartupMeanMs, VisibleCpuMeanPercent, VisiblePrivateMeanMiB, HiddenCpuMeanPercent, GpuEngineMeanPercentSum, ProcessCountMax, DeployedMiB -AutoSize
} finally {
    if ($null -ne $obsProcess) {
        try {
            if ($CaptureWithObs) {
                $stopped = Invoke-ObsRecord "stop"
                $stopped | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 (Join-Path $OutputDirectory "obs-recording-stop.json")
                if ($null -ne $stopped.recordingOutput.outputPath) { Save-VideoOnlyRecording $stopped }
            }
        } finally { Stop-Tree $obsProcess }
    }
}
