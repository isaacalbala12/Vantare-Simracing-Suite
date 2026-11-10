# VANTA-139. Run the same recording through the production overlay host.
param(
    [Parameter(Mandatory)][string]$UI,
    [Parameter(Mandatory)][string]$Recording,
    [Parameter(Mandatory)][string]$Out,
    [ValidateSet(1,4,22)][int]$Widgets = 4,
    [switch]$Phases
)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $Out) { throw 'Use a new evidence directory for every run' }
foreach ($file in @($UI,$Recording)) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing $file" }
}
New-Item -ItemType Directory -Path $Out | Out-Null
$Out = (Resolve-Path -LiteralPath $Out).Path
$info = [Diagnostics.ProcessStartInfo]::new((Resolve-Path -LiteralPath $UI).Path)
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.ArgumentList.Add((Resolve-Path -LiteralPath $Recording).Path)
$info.ArgumentList.Add([string]$Widgets)
$info.Environment['VANTARE_PROFILE_PHASES'] = $(if ($Phases) { '1' } else { '0' })
# All diagnostics and persisted presentation data stay in this run's QA root.
foreach ($name in @('LOCALAPPDATA','APPDATA','VANTARE_NATIVE_DATA_ROOT')) {
    $info.Environment[$name] = "$Out/qa"
}
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
$process = [Diagnostics.Process]::new()
$process.StartInfo = $info
$rows = [Collections.Generic.List[object]]::new()
$mutex = [Threading.Mutex]::new($false,'Global\VantareParityCapture')
$held = $false
$started = $false
$completed = $false
$buildLocks = [Collections.Generic.List[Threading.Mutex]]::new()
try {
    # Reserve the existing build queue without changing its scripts/settings.
    # Take build locks before the visual mutex: capture scripts may compile
    # while owning the latter. Never wait for that visual mutex while reserved.
    $configuredSlots = [Environment]::GetEnvironmentVariable('VANTARE_CARGO_SLOTS','Machine') ?? $env:VANTARE_CARGO_SLOTS ?? '4'
    $slots = [Math]::Max(4,[int]$configuredSlots)
    Write-Host 'Waiting for the build queue to finish before measurement'
    for ($slot=0; $slot -lt $slots; $slot++) {
        $buildLock = [Threading.Mutex]::new($false,"Global\VantareCargoSlot$slot")
        try { $null = $buildLock.WaitOne() }
        catch [Threading.AbandonedMutexException] { } # ownership was acquired
        $buildLocks.Add($buildLock)
    }
    if (Get-Process cargo,rustc -ErrorAction SilentlyContinue) { throw 'An uncoordinated compiler is running: discard measurement' }
    $held = $mutex.WaitOne(0)
    if (!$held) { throw 'Visual capture/measurement already in progress' }
    $watch = [Diagnostics.Stopwatch]::StartNew()
    if (!$process.Start()) { throw 'Cannot start measurement preview' }
    $started = $true
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    while (!$process.WaitForExit(1000)) {
        $process.Refresh()
        $rows.Add([pscustomobject]@{
            seconds=$watch.Elapsed.TotalSeconds.ToString('R',[Globalization.CultureInfo]::InvariantCulture)
            qpc=[Diagnostics.Stopwatch]::GetTimestamp()
            cpu_seconds=$process.TotalProcessorTime.TotalSeconds.ToString('R',[Globalization.CultureInfo]::InvariantCulture)
            private_bytes=$process.PrivateMemorySize64
            working_set_bytes=$process.WorkingSet64
        })
        if ($watch.Elapsed.TotalSeconds -gt 180) { throw 'Replay exceeded 180 seconds' }
        if (Get-Process cargo,rustc -ErrorAction SilentlyContinue) { throw 'Compiler contention: discard run' }
    }
    if ($process.ExitCode) { throw "Replay failed: $($process.ExitCode)" }
    [pscustomobject]@{
        sha=(& git rev-parse HEAD); date=(Get-Date -Format o); widgets=$Widgets
        phases=[bool]$Phases; recording_sha256=(Get-FileHash -LiteralPath $Recording).Hash
        executable_sha256=(Get-FileHash -LiteralPath $UI).Hash
        logical_processors=[Environment]::ProcessorCount
        os=[Environment]::OSVersion.VersionString
        reserved_build_slots=$slots
        video=@(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate)
        cpu_unit='seconds across all process threads; 1 CPU second / wall second = one logical core'
        scope='Saved real telemetry snapshots; production host/renderers; no runtime/IPC/license cost'
    } | ConvertTo-Json -Depth 4 | Set-Content "$Out/metadata.json"
    $completed = $true
} catch {
    $_ | Out-String | Set-Content "$Out/INCOMPLETE.txt"
    throw
} finally {
    if ($started -and !$process.HasExited) { $process.Kill(); $process.WaitForExit() }
    if ($started) {
        $stdout.GetAwaiter().GetResult() | Set-Content "$Out/stdout.log"
        $stderr.GetAwaiter().GetResult() | Set-Content "$Out/stderr.log"
        $rows | Export-Csv -NoTypeInformation "$Out/process.csv"
        if ($completed) { 'complete' | Set-Content "$Out/complete.txt" }
    }
    $process.Dispose()
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
    foreach ($buildLock in $buildLocks) { $buildLock.ReleaseMutex(); $buildLock.Dispose() }
}
