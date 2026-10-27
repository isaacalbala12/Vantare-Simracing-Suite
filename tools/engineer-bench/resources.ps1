param(
    [Parameter(Mandatory=$true)][int]$EnginePid,
    [Parameter(Mandatory=$true)][string]$Output,
    [Parameter(Mandatory=$true)][string]$StopFile
)
$ErrorActionPreference = 'Stop'
# CIM class names are locale independent. Missing AMD/WDDM counters are errors,
# never zero VRAM/utilisation. This sampler is optional and has its own overhead.
$previousCpu = $null
$previousTime = $null
$writer = [System.IO.StreamWriter]::new($Output, $false, [System.Text.UTF8Encoding]::new($false))
try {
    while (-not (Test-Path -LiteralPath $StopFile)) {
        $sample = [ordered]@{ utc = [DateTime]::UtcNow.ToString('o'); engine_pid = $EnginePid }
        try {
            $process = Get-Process -Id $EnginePid
            $now = [Diagnostics.Stopwatch]::GetTimestamp() / [double][Diagnostics.Stopwatch]::Frequency
            $cpu = $process.TotalProcessorTime.TotalSeconds
            $sample.process_working_set_bytes = $process.WorkingSet64
            $sample.process_peak_working_set_bytes = $process.PeakWorkingSet64
            $sample.process_private_bytes = $process.PrivateMemorySize64
            $sample.process_cpu_percent_one_core = if ($null -ne $previousTime) {
                100 * ($cpu - $previousCpu) / ($now - $previousTime)
            } else { $null }
            $sample.process_cpu_percent_machine = if ($null -ne $previousTime) {
                $sample.process_cpu_percent_one_core / [Environment]::ProcessorCount
            } else { $null }
            $previousTime = $now
            $previousCpu = $cpu
            $sample.system_cpu_percent = (Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime
        } catch { $sample.process_error = $_.Exception.GetType().Name }
        try {
            $memory = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory |
                Where-Object { $_.Name -match "^pid_${EnginePid}_" })
            $adapters = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory)
            $engines = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine)
            $sample.gpu_process_memory = @($memory | Select-Object Name, DedicatedUsage, SharedUsage)
            $sample.gpu_adapter_memory = @($adapters | Select-Object Name, DedicatedUsage, SharedUsage)
            $sample.gpu_engines = @($engines | Select-Object Name, UtilizationPercentage)
            $sample.gpu_process_counters_available = $memory.Count -gt 0
            $sample.gpu_adapter_counters_available = $adapters.Count -gt 0
            # Engine percentages overlap. Preserve each instance instead of inventing a total.
        } catch { $sample.gpu_error = $_.Exception.GetType().Name }
        $writer.WriteLine(($sample | ConvertTo-Json -Depth 6 -Compress))
        $writer.Flush()
        Start-Sleep -Milliseconds 1000
    }
} finally { $writer.Dispose() }
