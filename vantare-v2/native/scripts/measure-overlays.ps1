# VANTA-139. Run the same recording through the production overlay host.
param(
    [Parameter(Mandatory)][string]$UI,
    [Parameter(Mandatory)][string]$Recording,
    [Parameter(Mandatory)][string]$Out,
    [string]$Core,
    [ValidateRange(10,3600)][int]$Seconds = 60,
    [ValidateSet(1,4,22)][int]$Widgets = 4,
    [switch]$Phases
)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $Out) { throw 'Use a new evidence directory for every run' }
foreach ($file in @($UI,$Recording)) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing $file" }
}
if ($Core -and !(Test-Path -LiteralPath $Core -PathType Leaf)) { throw "Missing $Core" }
New-Item -ItemType Directory -Path $Out | Out-Null
$Out = (Resolve-Path -LiteralPath $Out).Path
$info = [Diagnostics.ProcessStartInfo]::new((Resolve-Path -LiteralPath $UI).Path)
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$pipeName = "Vantare1996.$PID.$([guid]::NewGuid().ToString('N'))"
$inputArgument = if ($Core) { "pipe:$pipeName" } else { (Resolve-Path -LiteralPath $Recording).Path }
$info.ArgumentList.Add($inputArgument)
$info.ArgumentList.Add([string]$Widgets)
if ($Core) { $info.ArgumentList.Add([string]$Seconds) }
$info.Environment['VANTARE_PROFILE_PHASES'] = $(if ($Phases) { '1' } else { '0' })
# All diagnostics and persisted presentation data stay in this run's QA root.
foreach ($name in @('LOCALAPPDATA','APPDATA','VANTARE_NATIVE_DATA_ROOT')) {
    $info.Environment[$name] = "$Out/qa"
}
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
$process = [Diagnostics.Process]::new()
$process.StartInfo = $info
if (!("Vantare.MeasurementCycles" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
namespace Vantare {
 public static class MeasurementCycles {
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool QueryProcessCycleTime(IntPtr process, out ulong cycles);
 }
}
"@
}
$rows = [Collections.Generic.List[object]]::new()
$mutex = [Threading.Mutex]::new($false,'Global\VantareParityCapture')
$held = $false
$started = $false
$completed = $false
$coreProcess = $null
$coreStarted = $false
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
    if ($Core) {
        $coreInfo = [Diagnostics.ProcessStartInfo]::new((Resolve-Path -LiteralPath $Core).Path)
        $coreInfo.UseShellExecute = $false
        $coreInfo.CreateNoWindow = $true
        $coreInfo.RedirectStandardInput = $true
        $coreInfo.RedirectStandardOutput = $true
        $coreInfo.RedirectStandardError = $true
        foreach ($argument in @('--replay',(Resolve-Path -LiteralPath $Recording).Path,'--pipe',$pipeName)) {
            $coreInfo.ArgumentList.Add($argument)
        }
        foreach ($name in @('LOCALAPPDATA','APPDATA','VANTARE_NATIVE_DATA_ROOT')) {
            $coreInfo.Environment[$name] = "$Out/qa"
        }
        $coreInfo.Environment['VANTARE_PROFILE_PHASES'] = '0'
        $coreProcess = [Diagnostics.Process]::new()
        $coreProcess.StartInfo = $coreInfo
        if (!$coreProcess.Start()) { throw 'Cannot start raw replay core' }
        $coreStarted = $true
        $coreOut = $coreProcess.StandardOutput.ReadToEndAsync()
        $coreErr = $coreProcess.StandardError.ReadToEndAsync()
    }
    $watch = [Diagnostics.Stopwatch]::StartNew()
    if (!$process.Start()) { throw 'Cannot start measurement preview' }
    $started = $true
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    while (!$process.WaitForExit(1000)) {
        $process.Refresh()
        if ($coreStarted -and $coreProcess.HasExited) { throw 'Core exited before the measurement ended' }
        [ulong]$cycles = 0
        if (![Vantare.MeasurementCycles]::QueryProcessCycleTime($process.Handle,[ref]$cycles)) {
            throw 'QueryProcessCycleTime failed'
        }
        $rows.Add([pscustomobject]@{
            seconds=$watch.Elapsed.TotalSeconds.ToString('R',[Globalization.CultureInfo]::InvariantCulture)
            qpc=[Diagnostics.Stopwatch]::GetTimestamp()
            cpu_seconds=$process.TotalProcessorTime.TotalSeconds.ToString('R',[Globalization.CultureInfo]::InvariantCulture)
            cpu_cycles=$cycles
            private_bytes=$process.PrivateMemorySize64
            working_set_bytes=$process.WorkingSet64
        })
        if ($watch.Elapsed.TotalSeconds -gt $Seconds + 120) { throw 'Replay exceeded its duration and shutdown margin' }
        if (Get-Process cargo,rustc -ErrorAction SilentlyContinue) { throw 'Compiler contention: discard run' }
    }
    if ($process.ExitCode) { throw "Replay failed: $($process.ExitCode)" }
    if ($coreStarted) {
        $coreProcess.StandardInput.Close()
        if (!$coreProcess.WaitForExit(5000)) { throw 'Core did not stop on EOF' }
        if ($coreProcess.ExitCode) { throw "Core failed: $($coreProcess.ExitCode)" }
    }
    [pscustomobject]@{
        sha=(& git rev-parse HEAD); date=(Get-Date -Format o); widgets=$Widgets
        phases=[bool]$Phases; recording_sha256=(Get-FileHash -LiteralPath $Recording).Hash
        executable_sha256=(Get-FileHash -LiteralPath $UI).Hash
        core_sha256=$(if ($Core) { (Get-FileHash -LiteralPath $Core).Hash } else { $null })
        logical_processors=[Environment]::ProcessorCount
        os=[Environment]::OSVersion.VersionString
        reserved_build_slots=$slots
        video=@(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate)
        cpu_unit='seconds across all process threads; 1 CPU second / wall second = one logical core'
        scope=$(if ($Core) { 'Raw recorded cadence through core and production IPC; core CPU excluded; no account' } else { 'Saved golden snapshots at coarse source-clock timestamps; characterization only, not production cadence' })
    } | ConvertTo-Json -Depth 4 | Set-Content "$Out/metadata.json"
    $completed = $true
} catch {
    $_ | Out-String | Set-Content "$Out/INCOMPLETE.txt"
    throw
} finally {
    if ($started -and !$process.HasExited) { $process.Kill(); $process.WaitForExit() }
    if ($coreStarted) {
        if (!$coreProcess.HasExited) {
            $coreProcess.StandardInput.Close()
            if (!$coreProcess.WaitForExit(5000)) { $coreProcess.Kill(); $coreProcess.WaitForExit() }
        }
        $coreOut.GetAwaiter().GetResult() | Set-Content "$Out/core.stdout.log"
        $coreErr.GetAwaiter().GetResult() | Set-Content "$Out/core.stderr.log"
        $coreProcess.Dispose()
    }
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
