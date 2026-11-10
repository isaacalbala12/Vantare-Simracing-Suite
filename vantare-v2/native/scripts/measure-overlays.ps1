# VANTA-139. Run the same recording through the production overlay host.
param(
    [Parameter(Mandatory)][string]$UI,
    [Parameter(Mandatory)][string]$Recording,
    [Parameter(Mandatory)][string]$Out,
    [string]$Core,
    [ValidateRange(10,3600)][int]$Seconds = 60,
    [ValidateSet(1,4,22)][int]$Widgets = 4,
    [switch]$Phases,
    [ValidateRange(1,10)][double]$ReplaySpeed = 1,
    [ValidateRange(1,7200)][int]$QueueTimeoutSeconds = 1800,
    [ValidateRange(1,100)][double]$MaxSystemLoadPercent = 35
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/measurement-processes.ps1"
if (Test-Path -LiteralPath $Out) { throw 'Use a new evidence directory for every run' }
foreach ($file in @($UI,$Recording)) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing $file" }
}
if ($Core -and !(Test-Path -LiteralPath $Core -PathType Leaf)) { throw "Missing $Core" }
if (!$Core) { throw 'Baseline v2 requires the raw production IPC replay' }
$build = (& $UI --measurement-info | ConvertFrom-Json)
if ($LASTEXITCODE -or $build.profile -ne 'release' -or $build.opt_level -ne '3' -or $build.dirty -ne $false) { throw 'A clean Release executable with embedded provenance is required' }
$coreBuild = (& $Core --measurement-info | ConvertFrom-Json)
if ($LASTEXITCODE -or $coreBuild.profile -ne 'release' -or $coreBuild.opt_level -ne '3' -or $coreBuild.dirty -ne $false) { throw 'A clean Release replay core with embedded provenance is required' }
$manifestText = & python "$PSScriptRoot/recording-metadata.py" $Recording
if ($LASTEXITCODE) { throw 'Cannot read recording manifest' }
$recordingManifest = $manifestText | ConvertFrom-Json
if ($recordingManifest.schema -ne 'vantare.lmu-temporal-high-rate.v1') { throw 'Baseline v2 requires the supported LMU temporal archive schema' }
$recordingDuration = ([datetimeoffset]$recordingManifest.completedAtUtc - [datetimeoffset]$recordingManifest.startedAtUtc).TotalSeconds
$firstEventSeconds = ([datetimeoffset]$recordingManifest.events[0].atUtc - [datetimeoffset]$recordingManifest.startedAtUtc).TotalSeconds
if ([Math]::Abs($Seconds - $recordingDuration) -gt 0.1) { throw '-Seconds must match the recording duration (within 100 ms rounding)' }
New-Item -ItemType Directory -Path $Out | Out-Null
$Out = (Resolve-Path -LiteralPath $Out).Path
$info = [Diagnostics.ProcessStartInfo]::new((Resolve-Path -LiteralPath $UI).Path)
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$pipeName = "Vantare1996.$PID.$([guid]::NewGuid().ToString('N'))"
$inputArgument = if ($Core) { "pipe:$pipeName" } else { (Resolve-Path -LiteralPath $Recording).Path }
$info.ArgumentList.Add($inputArgument)
$info.ArgumentList.Add([string]$Widgets)
if ($Core) { $info.ArgumentList.Add([string][Math]::Max(10,[Math]::Ceiling($Seconds/$ReplaySpeed))) }
$info.Environment['VANTARE_PROFILE_PHASES'] = $(if ($Phases) { '1' } else { '0' })
$info.Environment['VANTARE_MEASUREMENT_TRACE'] = '1'
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
$dwmRows = [Collections.Generic.List[object]]::new()
$gpuRows = [Collections.Generic.List[object]]::new()
$gpuCounterRows = [Collections.Generic.List[object]]::new()
$invalidCounterRows = [Collections.Generic.List[object]]::new()
$systemRows = [Collections.Generic.List[object]]::new()
$samplerRows = [Collections.Generic.List[object]]::new()
$frequencyRows = [Collections.Generic.List[object]]::new()
$samplerProcess = [Diagnostics.Process]::GetCurrentProcess()
$readOnlyRows = [Collections.Generic.List[object]]::new()
$dwm = @(Get-Process dwm -ErrorAction Stop)
if ($dwm.Count -ne 1) { throw 'Exactly one DWM process is required for an unambiguous baseline' }
$dwm = $dwm[0]
$powerPlan = (& powercfg /getactivescheme | Out-String).Trim()
$cpuFrequency = @(Get-CimInstance Win32_Processor | Select-Object Name,CurrentClockSpeed,MaxClockSpeed)
$queueDeadline = [datetime]::UtcNow.AddSeconds($QueueTimeoutSeconds)
$mutex = [Threading.Mutex]::new($false,'Global\VantareParityCapture')
$held = $false
$started = $false
$completed = $false
$coreProcess = $null
$coreStarted = $false
$buildLocks = [Collections.Generic.List[Threading.Mutex]]::new()
function Assert-MeasurementQueueIdle {
    $compilers = @()
    foreach ($candidate in @(Get-MeasurementProcesses)) {
        if (Test-MeasurementCompilerProcess -Name $candidate.Name -CommandLine $candidate.CommandLine) {
            # Record only recognized operation names, never arbitrary arguments.
            $operations = @([regex]::Matches([string]$candidate.CommandLine, '(?i)(?:^|\s)(metadata|tree|fmt|build|check|clippy|test|nextest|run|rustc|bench|doc|install|package|clean|--version|-vV)(?=\s|$)') | ForEach-Object { $_.Groups[1].Value })
            $compilers += [pscustomobject]@{pid=$candidate.ProcessId;parent_pid=$candidate.ParentProcessId;name=$candidate.Name;operations=($operations -join ',');command_line_available=[bool]$candidate.CommandLine}
        } else {
            $kind = if ($candidate.CommandLine -match '(?i)(?:^|\s)fmt(?:\s|$)') { 'cargo fmt --check' } else { 'cargo metadata' }
            $readOnlyRows.Add([pscustomobject]@{qpc=[Diagnostics.Stopwatch]::GetTimestamp();pid=$candidate.ProcessId;kind=$kind})
        }
    }
    if ($compilers.Count) {
        $compilers | ConvertTo-Json | Set-Content "$Out/competing-processes.json"
        throw 'Compiler contention: discard run; process IDs recorded in competing-processes.json'
    }
}
try {
    # Reserve the existing build queue without changing its scripts/settings.
    # Take build locks before the visual mutex: capture scripts may compile
    # while owning the latter. Never wait for that visual mutex while reserved.
    $configuredSlots = [Environment]::GetEnvironmentVariable('VANTARE_CARGO_SLOTS','Machine') ?? $env:VANTARE_CARGO_SLOTS ?? '4'
    $slots = [Math]::Max(4,[int]$configuredSlots)
    Write-Host 'Waiting for the build queue to finish before measurement'
    for ($slot=0; $slot -lt $slots; $slot++) {
        $buildLock = [Threading.Mutex]::new($false,"Global\VantareCargoSlot$slot")
        $remaining = [Math]::Max(0,($queueDeadline - [datetime]::UtcNow).TotalMilliseconds)
        try { if (!$buildLock.WaitOne([int]$remaining)) { $buildLock.Dispose(); throw 'Build queue timeout: measurement did not start' } }
        catch [Threading.AbandonedMutexException] { } # ownership was acquired
        $buildLocks.Add($buildLock)
    }
    Assert-MeasurementQueueIdle
    $held = $mutex.WaitOne(0)
    if (!$held) { throw 'Visual capture/measurement already in progress' }
    $powerPlan = (& powercfg /getactivescheme | Out-String).Trim()
    if ($Core) {
        $coreInfo = [Diagnostics.ProcessStartInfo]::new((Resolve-Path -LiteralPath $Core).Path)
        $coreInfo.UseShellExecute = $false
        $coreInfo.CreateNoWindow = $true
        $coreInfo.RedirectStandardInput = $true
        $coreInfo.RedirectStandardOutput = $true
        $coreInfo.RedirectStandardError = $true
        foreach ($argument in @('--replay',(Resolve-Path -LiteralPath $Recording).Path,'--pipe',$pipeName,'--velocidad',$ReplaySpeed.ToString('R',[Globalization.CultureInfo]::InvariantCulture))) {
            $coreInfo.ArgumentList.Add($argument)
        }
        foreach ($name in @('LOCALAPPDATA','APPDATA','VANTARE_NATIVE_DATA_ROOT')) {
            $coreInfo.Environment[$name] = "$Out/qa"
        }
        $coreInfo.Environment['VANTARE_PROFILE_PHASES'] = '0'
        $coreInfo.Environment['VANTARE_MEASUREMENT_TRACE'] = '1'
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
    $process.PriorityClass = [Diagnostics.ProcessPriorityClass]::Normal
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    # Let the window create its GPU context. Afterwards Get-Counter's one-second
    # sampling interval paces the loop without an extra unsampled second.
    $null = $process.WaitForExit(1000)
    while (!$process.WaitForExit(0)) {
        $samplerStart = [Diagnostics.Stopwatch]::GetTimestamp()
        [ulong]$samplerCyclesBefore = 0
        if (![Vantare.MeasurementCycles]::QueryProcessCycleTime($samplerProcess.Handle,[ref]$samplerCyclesBefore)) { throw 'Cannot query sampler cycles' }
        $process.Refresh()
        if ($coreStarted -and $coreProcess.HasExited) { throw 'Core exited before the measurement ended' }
        [ulong]$cycles = 0
        if (![Vantare.MeasurementCycles]::QueryProcessCycleTime($process.Handle,[ref]$cycles)) {
            throw 'QueryProcessCycleTime failed'
        }
        $sampleQpc = [Diagnostics.Stopwatch]::GetTimestamp()
        $rows.Add([pscustomobject]@{
            seconds=$watch.Elapsed.TotalSeconds.ToString('R',[Globalization.CultureInfo]::InvariantCulture)
            qpc=$sampleQpc
            cpu_cycles=$cycles
            private_bytes=$process.PrivateMemorySize64
            working_set_bytes=$process.WorkingSet64
        })
        $dwm.Refresh()
        [ulong]$dwmCycles = 0
        if (![Vantare.MeasurementCycles]::QueryProcessCycleTime($dwm.Handle,[ref]$dwmCycles)) { throw 'Cannot query DWM cycles' }
        $dwmRows.Add([pscustomobject]@{qpc=$sampleQpc;cpu_cycles=$dwmCycles;private_bytes=$dwm.PrivateMemorySize64;working_set_bytes=$dwm.WorkingSet64})
        # Other processes may destroy an engine between PDH's two reads. Keep
        # their invalid samples, but require valid data for our UI, DWM and CPU.
        $counterErrors = @()
        $counters = Get-Counter -Counter '\GPU Engine(*)\Utilization Percentage','\GPU Process Memory(*)\Dedicated Usage','\Processor(_Total)\% Processor Time','\Processor Information(_Total)\% Processor Performance','\Processor Information(_Total)\% Performance Limit','\Processor Information(_Total)\Processor Frequency' -ErrorAction SilentlyContinue -ErrorVariable counterErrors
        $tick = [Diagnostics.Stopwatch]::GetTimestamp()
        if (!$counters) { throw 'GPU/system counter collection returned no data' }
        foreach ($sample in @($counters.CounterSamples | Where-Object Path -Like '*\processor information(*)\*')) {
            $frequencyRows.Add([pscustomobject]@{qpc=$tick;path=$sample.Path;value=$sample.CookedValue;status=$sample.Status})
        }
        foreach ($sample in @($counters.CounterSamples | Where-Object { $_.Status -notin @(0,1) })) {
            $invalidCounterRows.Add([pscustomobject]@{qpc=$tick;path=$sample.Path;status=$sample.Status})
        }
        # An orderly UI exit can remove its GPU instances during PDH's sampling
        # interval. This is the drain after recording, not a stable GPU sample.
        if ($process.HasExited) { break }
        foreach ($entry in @(@{name='ui';id=$process.Id},@{name='dwm';id=$dwm.Id})) {
            $samples = @($counters.CounterSamples | Where-Object { $_.InstanceName -match "^pid_$($entry.id)_" })
            if (@($samples | Where-Object { $_.Status -notin @(0,1) }).Count) { throw "Invalid GPU counter for $($entry.name): discard run" }
            foreach ($sample in $samples) {
                $gpuCounterRows.Add([pscustomobject]@{qpc=$tick;process=$entry.name;path=$sample.Path;value=$sample.CookedValue;status=$sample.Status})
            }
            $engines = @($samples | Where-Object Path -Like '*utilization percentage')
            $memory = @($samples | Where-Object Path -Like '*dedicated usage')
            if (!$engines.Count -or !$memory.Count) { throw "Missing GPU counters for $($entry.name)" }
            $gpuRows.Add([pscustomobject]@{qpc=$tick;process=$entry.name;busiest_engine_percent=($engines.CookedValue | Measure-Object -Maximum).Maximum;engine_sum_percent=($engines.CookedValue | Measure-Object -Sum).Sum;dedicated_bytes=($memory.CookedValue | Measure-Object -Sum).Sum})
        }
        $cpuSample = @($counters.CounterSamples | Where-Object Path -Like '*\processor(_total)\% processor time')
        if ($cpuSample.Count -ne 1 -or $cpuSample[0].Status -notin @(0,1)) { throw 'Invalid total system CPU counter: discard run' }
        $load = $cpuSample[0].CookedValue
        $systemRows.Add([pscustomobject]@{qpc=$tick;load_percent=$load})
        Assert-MeasurementQueueIdle
        [ulong]$samplerCyclesAfter = 0
        if (![Vantare.MeasurementCycles]::QueryProcessCycleTime($samplerProcess.Handle,[ref]$samplerCyclesAfter)) { throw 'Cannot query sampler cycles' }
        $samplerRows.Add([pscustomobject]@{qpc=$tick;cpu_cycles=($samplerCyclesAfter-$samplerCyclesBefore);elapsed_qpc=([Diagnostics.Stopwatch]::GetTimestamp()-$samplerStart)})
        if ($watch.Elapsed.TotalSeconds -gt 5 -and $load -gt $MaxSystemLoadPercent) { throw 'High total system load: discard run' }
        if ($watch.Elapsed.TotalSeconds -gt $Seconds + 120) { throw 'Replay exceeded its duration and shutdown margin' }
    }
    if ($process.ExitCode) { throw "Replay failed: $($process.ExitCode)" }
    if ($coreStarted) {
        $coreProcess.StandardInput.Close()
        if (!$coreProcess.WaitForExit(5000)) { throw 'Core did not stop on EOF' }
        if ($coreProcess.ExitCode) { throw "Core failed: $($coreProcess.ExitCode)" }
    }
    [pscustomobject]@{
        sha=$build.sha; profile=$build.profile; features=$build.features; compiled_build=$build; core_build=$coreBuild
        collector_sha=(& git -C $PSScriptRoot rev-parse HEAD)
        collector_script_sha256=(Get-FileHash -LiteralPath $PSCommandPath).Hash
        process_guard_sha256=(Get-FileHash -LiteralPath "$PSScriptRoot/measurement-processes.ps1").Hash
        readonly_cargo_observations=$readOnlyRows.Count
        measurement_version=2; date=(Get-Date -Format o); widgets=$Widgets
        recording_duration_seconds=$recordingDuration; requested_seconds=$Seconds; replay_speed=$ReplaySpeed
        recording_event_count=$recordingManifest.events.Count; recording_first_event_seconds=$firstEventSeconds
        replay_schedule_origin_seconds=1 # adapter/lmu/open.rs Clock::at: first event is scheduled at 1 s
        stable_start_seconds=5; stable_end_seconds=($recordingDuration - 5)
        power_plan=$powerPlan; priority='Normal'; dwm_pid=$dwm.Id; cpu_frequency_mhz=$cpuFrequency
        dwm_priority=[string]$dwm.PriorityClass
        received_photo_scope='Photos delivered by production Subscriber to the UI feed; coalescing before the UI is preserved'
        memory_scope='Reference is working set. Private bytes include about 137 MiB reserved for the bounded measurement trace; controls reserve equal capacity'
        qpc_frequency=[Diagnostics.Stopwatch]::Frequency; maximum_total_system_load_percent=$MaxSystemLoadPercent
        presentation=@{model='DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL / DirectComposition';sync_interval=0;tearing_flag=$false;vrr_active=$null;vrr_reason='Not observable from system GPU counters; physical game-PC check required'}
        gpu_source='Windows GPU Engine / GPU Process Memory performance counters; PresentMon not installed in PATH'
        retained_invalid_counter_samples=$invalidCounterRows.Count
        phases=[bool]$Phases; recording_sha256=(Get-FileHash -LiteralPath $Recording).Hash
        executable_sha256=(Get-FileHash -LiteralPath $UI).Hash
        core_sha256=$(if ($Core) { (Get-FileHash -LiteralPath $Core).Hash } else { $null })
        logical_processors=[Environment]::ProcessorCount
        os=[Environment]::OSVersion.VersionString
        reserved_build_slots=$slots
        video=@(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate)
        cpu_unit='QueryProcessCycleTime cycles per stable wall second and per received photo; no conversion to CPU seconds'
        scope='Raw recorded cadence through core and production IPC; UI and DWM measured separately, fixed core producer excluded; no account or game'
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
        $dwmRows | Export-Csv -NoTypeInformation "$Out/dwm.csv"
        $gpuRows | Export-Csv -NoTypeInformation "$Out/gpu.csv"
        $gpuCounterRows | Export-Csv -NoTypeInformation "$Out/gpu-counters.csv"
        $invalidCounterRows | Export-Csv -NoTypeInformation "$Out/invalid-counters.csv"
        $systemRows | Export-Csv -NoTypeInformation "$Out/system.csv"
        $samplerRows | Export-Csv -NoTypeInformation "$Out/sampler.csv"
        $frequencyRows | Export-Csv -NoTypeInformation "$Out/frequency.csv"
        $readOnlyRows | Export-Csv -NoTypeInformation "$Out/readonly-cargo.csv"
        if ($completed) { 'complete' | Set-Content "$Out/complete.txt" }
    }
    $process.Dispose()
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
    foreach ($buildLock in $buildLocks) { $buildLock.ReleaseMutex(); $buildLock.Dispose() }
}
