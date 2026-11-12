# Gaming PC only. PresentMon is the pinned official external executable.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateRange(1,2147483647)][int]$RootProcessId,
    [Parameter(Mandatory)][string]$PresentMon,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [ValidateRange(10,180)][int]$Seconds = 70
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw 'El muestreador requiere Windows.' }
if ([Environment]::MachineName -ieq 'SAPPHIREOS') { throw 'Parada grafica del servidor: ejecutar solo en el PC de juego.' }
$out = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $out) { throw 'El directorio de muestra debe ser nuevo.' }
$null = New-Item -ItemType Directory -Path $out
$expected = 'b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af'
if ((Get-FileHash -LiteralPath $PresentMon -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'PresentMon no coincide con 2.6.0 oficial.' }
if (@(Get-Process PresentMon* -ErrorAction SilentlyContinue).Count) { throw 'Cerrar el otro PresentMon antes de empezar.' }
if (-not ('Vantare141.Counters' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'Contadores.cs') }
$environment = [ordered]@{
    schema = 'vantare141.environment.v1'
    presentmon_version = '2.6.0'
    presentmon_sha256 = $expected
    qpc_frequency = [Diagnostics.Stopwatch]::Frequency
    windows = Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber
    gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate)
    cpu = @(Get-CimInstance Win32_Processor | Select-Object Name,NumberOfLogicalProcessors,MaxClockSpeed)
    power_scheme = (& powercfg /getactivescheme | Out-String).Trim()
    root_process_id = $RootProcessId
    started_utc = [DateTime]::UtcNow.ToString('o')
    cpu_temperature = 'unknown: no third-party driver installed'
    gpu_metric = 'raw PDH per-engine utilization, not a summed GPU percentage'
}
$environment | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'entorno.json') -Encoding utf8
$info = [Diagnostics.ProcessStartInfo]::new([IO.Path]::GetFullPath($PresentMon))
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
foreach ($argument in @('--output_file',(Join-Path $out 'presentmon.csv'),'--qpc_time','--timed',[string]$Seconds,'--terminate_after_timed','--no_console_stats','--write_display_metadata')) { $info.ArgumentList.Add($argument) }
$pm = [Diagnostics.Process]::new()
$pm.StartInfo = $info
$pmStarted = $false
$counter = $null
$rows = [Collections.Generic.List[object]]::new()
$rawCounters = [Collections.Generic.List[object]]::new()
$family = @{}
$sampler = [Diagnostics.Process]::GetCurrentProcess()
try {
    $counter = [Vantare141.Counters]::new()
    $counter.Collect()
    if (-not $pm.Start()) { throw 'No se pudo iniciar PresentMon.' }
    $pmStarted = $true
    $stdout = $pm.StandardOutput.ReadToEndAsync()
    $stderr = $pm.StandardError.ReadToEndAsync()
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $next = 1.0
    while ($watch.Elapsed.TotalSeconds -lt $Seconds) {
        $delay = [math]::Max(0,[int](1000 * ($next - $watch.Elapsed.TotalSeconds)))
        if ($delay) { Start-Sleep -Milliseconds $delay }
        $next += 1.0
        $clock = [Diagnostics.Stopwatch]::GetTimestamp()
        $processes = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate,Name | Where-Object { $_.CreationDate })
        $byId = @{}
        foreach ($process in $processes) { $byId[[int]$process.ProcessId] = $process }
        if (-not $byId.ContainsKey($RootProcessId)) { throw 'El proceso medido termino antes del fin de la muestra.' }
        $key = $byId[$RootProcessId].CreationDate.ToUniversalTime().ToString('o')
        if ($family.ContainsKey($RootProcessId) -and $family[$RootProcessId] -ne $key) { throw 'PID raiz reutilizado.' }
        $family[$RootProcessId] = $key
        do {
            $added = $false
            foreach ($process in $processes) {
                $parentId = [int]$process.ParentProcessId
                if ($family.ContainsKey($parentId) -and $byId.ContainsKey($parentId) -and
                    $family[$parentId] -eq $byId[$parentId].CreationDate.ToUniversalTime().ToString('o') -and
                    -not $family.ContainsKey([int]$process.ProcessId)) {
                    $family[[int]$process.ProcessId] = $process.CreationDate.ToUniversalTime().ToString('o')
                    $added = $true
                }
            }
        } while ($added)
        foreach ($process in $processes) {
            $id = [int]$process.ProcessId
            $identity = $process.CreationDate.ToUniversalTime().ToString('o')
            if (-not $family.ContainsKey($id) -or $family[$id] -ne $identity) { continue }
            $measured = $null
            try {
                $measured = [Diagnostics.Process]::GetProcessById($id)
                if ([math]::Abs(($measured.StartTime.ToUniversalTime()-$process.CreationDate.ToUniversalTime()).TotalMilliseconds) -gt 1) { throw 'PID reutilizado entre lecturas.' }
                $measured.Refresh()
                [ulong]$cycles = 0
                if (-not [Vantare141.Counters]::QueryProcessCycleTime($measured.Handle,[ref]$cycles)) { throw 'No se pueden leer ciclos de CPU.' }
                $rows.Add([pscustomobject]@{qpc=$clock;process_id=$id;created_utc=$identity;name=$process.Name;cpu_cycles=$cycles;cpu_time_100ns=$measured.TotalProcessorTime.Ticks;private_bytes=$measured.PrivateMemorySize64;working_set_bytes=$measured.WorkingSet64})
            } finally { if ($measured) { $measured.Dispose() } }
        }
        $counter.Collect()
        foreach ($name in @('gpu_engine','gpu_memory','system_cpu','cpu_frequency','cpu_performance','cpu_limit')) {
            foreach ($value in $counter.Read($name)) {
                $rawCounters.Add([pscustomobject]@{qpc=$clock;counter=$name;instance=$value.Name;value=$value.Value.ToString('R',[Globalization.CultureInfo]::InvariantCulture);status=$value.Status})
            }
        }
        $sampler.Refresh()
        $rawCounters.Add([pscustomobject]@{qpc=$clock;counter='sampler_cpu_time_100ns';instance='sampler';value=$sampler.TotalProcessorTime.Ticks;status=0})
    }
    if (-not $pm.WaitForExit(10000)) { throw 'PresentMon no termino dentro del plazo.' }
    [IO.File]::WriteAllText((Join-Path $out 'presentmon.stdout.txt'),$stdout.GetAwaiter().GetResult())
    [IO.File]::WriteAllText((Join-Path $out 'presentmon.stderr.txt'),$stderr.GetAwaiter().GetResult())
    if ($pm.ExitCode -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $out 'presentmon.csv'))) { throw 'PresentMon fallo o no produjo CSV.' }
    $rows | Export-Csv -LiteralPath (Join-Path $out 'procesos.csv') -NoTypeInformation -Encoding utf8
    $rawCounters | Export-Csv -LiteralPath (Join-Path $out 'contadores.csv') -NoTypeInformation -Encoding utf8
    [ordered]@{complete=$true;qpc_frequency=[Diagnostics.Stopwatch]::Frequency;process_rows=$rows.Count;counter_rows=$rawCounters.Count;family=$family;seconds=$watch.Elapsed.TotalSeconds} |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $out 'completo.json') -Encoding utf8
} catch {
    $_.Exception.Message | Set-Content -LiteralPath (Join-Path $out 'INVALIDA.txt') -Encoding utf8
    $rows | Export-Csv -LiteralPath (Join-Path $out 'procesos-incompletos.csv') -NoTypeInformation -Encoding utf8
    $rawCounters | Export-Csv -LiteralPath (Join-Path $out 'contadores-incompletos.csv') -NoTypeInformation -Encoding utf8
    throw
} finally {
    if ($counter) { $counter.Dispose() }
    if ($pmStarted -and -not $pm.HasExited) { $pm.Kill(); $pm.WaitForExit() }
    $pm.Dispose()
    $sampler.Dispose()
}
