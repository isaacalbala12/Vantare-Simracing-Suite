# Solo PC de juego; este guion nunca se ejecuta en el servidor.
#requires -Version 7.0
[CmdletBinding(DefaultParameterSetName='Direct')]
param(
    [Parameter(Mandatory,ParameterSetName='Direct')][ValidateRange(1,2147483647)][int]$RootProcessId,
    [Parameter(Mandatory,ParameterSetName='Deferred')][string]$RootInfoFile,
    [Parameter(Mandatory)][string]$PresentMon,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$NoiseExclusionsFile,
    [ValidateRange(10,20000)][int]$Seconds = 90,
    [switch]$Aguante
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows -or [IntPtr]::Size -ne 8) { throw 'Usar PowerShell 7 x64 en Windows.' }
if ([Environment]::MachineName -ieq 'SAPPHIREOS') { throw 'Parada grafica del servidor: ejecutar solo en el PC de juego.' }
. (Join-Path $PSScriptRoot 'FAMILIA.ps1')
$out = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $out) { throw 'El directorio de muestra debe ser nuevo.' }
$null = New-Item -ItemType Directory -Path $out
$expected = 'b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af'
if ((Get-FileHash -LiteralPath $PresentMon -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'PresentMon no coincide con 2.6.0 oficial.' }
if (-not $Aguante -and @(Get-Process PresentMon* -ErrorAction SilentlyContinue).Count) { throw 'Cerrar el otro PresentMon antes de empezar.' }
foreach ($file in @('Contadores','Captura','Temperatura')) {
    if (-not (('Vantare141.' + @{Contadores='Counters';Captura='CaptureSession';Temperatura='GpuThermals'}[$file]) -as [type])) {
        Add-Type -Path (Join-Path $PSScriptRoot ($file+'.cs')) -CompilerOptions @('/optimize+','/debug-')
    }
}
$environment = [ordered]@{
    schema='vantare141.environment.v2';presentmon_version='2.6.0';presentmon_sha256=$expected
    qpc_frequency=[Diagnostics.Stopwatch]::Frequency
    windows=Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber
    gpu=@(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate)
    cpu=@(Get-CimInstance Win32_Processor | Select-Object Name,NumberOfLogicalProcessors,MaxClockSpeed)
    logical_processors=[Environment]::ProcessorCount
    power_scheme=(& powercfg /getactivescheme | Out-String).Trim()
    started_utc=[DateTime]::UtcNow.ToString('o');cpu_temperature='no_disponible: decisión de Isaac, sin sensor/controlador añadido'
    cpu_thermal_policy='TERMICA.ps1: flags no cero, límite <100% o rendimiento nominal <100% en CPU activa invalidan la ronda'
    gpu_metric='raw PDH; family utilization uses busiest physical engine, not sum of parallel engines'
    health_only=[bool]$Aguante
}
$sessionName = 'vantare141-' + [Guid]::NewGuid().ToString('N')
$info = [Diagnostics.ProcessStartInfo]::new([IO.Path]::GetFullPath($PresentMon))
$info.UseShellExecute=$false; $info.CreateNoWindow=$true
$info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
foreach ($argument in @('--output_file',(Join-Path $out 'presentmon.csv'),'--qpc_time','--timed',[string]$Seconds,'--terminate_after_timed','--no_console_stats','--write_display_metadata','--session_name',$sessionName)) { $info.ArgumentList.Add($argument) }
$pm=[Diagnostics.Process]::new(); $pm.StartInfo=$info
$pmStarted=$false; $counter=$null; $thermals=$null; $subscription=$null
$stdout=$null; $stderr=$null; $failed=$false
$rows=[Collections.Generic.List[object]]::new(); $rawCounters=[Collections.Generic.List[object]]::new()
$thermalRows=[Collections.Generic.List[object]]::new(); $processStarts=[Collections.Generic.List[object]]::new()
$family=@{}; $approximateFamily=@{}; $seenStarts=@{}; $sampler=[Diagnostics.Process]::GetCurrentProcess()
$sourceId='vantare141-start-'+[Guid]::NewGuid().ToString('N')
try {
    # Subscribe before the UI exists; short-lived Electron children still belong to
    # the family used to identify its first Present. Never record command lines.
    $subscription=Register-CimIndicationEvent -Query 'SELECT * FROM Win32_ProcessStartTrace' -SourceIdentifier $sourceId
    $counter=[Vantare141.Counters]::new(); $counter.Collect()
    $thermals=[Vantare141.GpuThermals]::new()
    $environment.gpu_thermal_initialization_status=$thermals.InitializationStatus
    if (-not $Aguante) {
        if (-not $pm.Start()) { throw 'No se pudo iniciar PresentMon.' }
        $pmStarted=$true
        $stdout=$pm.StandardOutput.ReadToEndAsync(); $stderr=$pm.StandardError.ReadToEndAsync()
        $readyDeadline=[DateTime]::UtcNow.AddSeconds(12)
        do {
            if ($pm.HasExited) { throw 'PresentMon termino antes de activar la captura.' }
            $state=[Vantare141.CaptureSession]::Query($sessionName)
            if ($state.Active) { break }
            if ([DateTime]::UtcNow -ge $readyDeadline) { throw 'ETW no esta listo; no arrancar la interfaz.' }
            Start-Sleep -Milliseconds 100
        } while ($true)
    }
    $captureQpc=[Diagnostics.Stopwatch]::GetTimestamp(); $captureUtc=[DateTime]::UtcNow
    $readyFile=Join-Path $out 'CAPTURA-LISTA.json'
    $readyTemporary=$readyFile+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
    [ordered]@{ready=$true;sampler_id=$PID;presentmon_id=if($pmStarted){$pm.Id}else{0};session=$sessionName;qpc=$captureQpc;frequency=[Diagnostics.Stopwatch]::Frequency;health_only=[bool]$Aguante} |
        ConvertTo-Json | Out-File -Width 2147483647 -LiteralPath $readyTemporary -NoClobber -Encoding utf8
    [IO.File]::Move($readyTemporary,$readyFile)
    if ($PSCmdlet.ParameterSetName -eq 'Deferred') {
        $deadline=[DateTime]::UtcNow.AddSeconds(15)
        while (-not (Test-Path -LiteralPath $RootInfoFile)) {
            if ([DateTime]::UtcNow -ge $deadline) { throw 'No llego la identidad del proceso medido.' }
            if ($pmStarted -and $pm.HasExited) { throw 'PresentMon termino antes de recibir la identidad.' }
            Start-Sleep -Milliseconds 100
        }
        $rootInfo=Get-Content -LiteralPath $RootInfoFile -Raw | ConvertFrom-Json
        $RootProcessId=[int]$rootInfo.process_id
        if ($RootProcessId -le 0) { throw 'Identidad raiz invalida.' }
        $root=[Diagnostics.Process]::GetProcessById($RootProcessId)
        try {
            if ([math]::Abs(($root.StartTime.ToUniversalTime()-[DateTime]::Parse($rootInfo.created_utc).ToUniversalTime()).TotalMilliseconds) -gt 1) { throw 'PID raiz cambiado antes de muestrear.' }
            $rootImagePath=$root.MainModule.FileName
            if ([IO.Path]::GetFileName($rootImagePath) -ine $rootInfo.image_name) { throw 'Nombre de imagen raiz distinto del declarado.' }
            # Hash after sampling: reading a 200 MB Electron image during its
            # startup would contaminate the cold-start measurement and caches.
            $rootImageHash=[string]$rootInfo.image_sha256
            $environment.root_start_qpc=[long]$rootInfo.start_qpc
            $environment.capture_precedes_root=($captureQpc -le [long]$rootInfo.start_qpc)
        } finally { $root.Dispose() }
    } else { $environment.capture_precedes_root=$false }
    $environment.root_process_id=$RootProcessId
    $environment | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'entorno.json') -Encoding utf8
    $watch=[Diagnostics.Stopwatch]::StartNew(); $interval=if($Aguante){10.0}else{1.0}; $next=$interval
    # PM's timed interval includes the wait for root. The controller leaves the UI
    # alive until this sampler ends; only the declared 60-second slice is analysed.
    $captureElapsed=([Diagnostics.Stopwatch]::GetTimestamp()-$captureQpc)/[double][Diagnostics.Stopwatch]::Frequency
    $remaining=$Seconds-$captureElapsed
    if ($remaining -lt 10) { throw 'No queda margen de captura.' }
    while ($watch.Elapsed.TotalSeconds -lt $remaining) {
        $delay=[math]::Max(0,[int](1000*($next-$watch.Elapsed.TotalSeconds)))
        if ($delay) { Start-Sleep -Milliseconds $delay }; $next+=$interval
        $clock=[Diagnostics.Stopwatch]::GetTimestamp()
        foreach ($processEvent in @(Get-Event -SourceIdentifier $sourceId -ErrorAction SilentlyContinue)) {
            $data=$processEvent.SourceEventArgs.NewEvent
            $startedId=[int]$data.ProcessID
            $birth=[DateTime]::FromFileTimeUtc([long]$data.TIME_CREATED).ToString('o')
            if ($seenStarts.ContainsKey($startedId) -and $seenStarts[$startedId] -ne $birth) { throw 'PID reutilizado durante la captura de procesos.' }
            $seenStarts[$startedId]=$birth
            $processStarts.Add([pscustomobject]@{process_id=$startedId;parent_id=[int]$data.ParentProcessID;created_utc=$birth;name=[string]$data.ProcessName;source='event'})
            Remove-Event -EventIdentifier $processEvent.EventIdentifier
        }
        $processes=@(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate,Name | Where-Object {$_.CreationDate})
        $byId=@{}; $candidates=[Collections.Generic.List[object]]::new()
        foreach ($process in $processes) {
            $id=[int]$process.ProcessId; $byId[$id]=$process
            $candidates.Add([pscustomobject]@{process_id=$id;parent_id=[int]$process.ParentProcessId;created_utc=$process.CreationDate.ToUniversalTime().ToString('o');name=$process.Name;source='cim'})
        }
        foreach ($started in $processStarts) { $candidates.Add($started) }
        if (-not $byId.ContainsKey($RootProcessId)) { throw 'El proceso medido termino antes del fin de la muestra.' }
        $rootDate=$byId[$RootProcessId].CreationDate.ToUniversalTime()
        if ($family.ContainsKey($RootProcessId) -and [math]::Abs(($rootDate-[DateTime]::Parse($family[$RootProcessId]).ToUniversalTime()).TotalMilliseconds) -gt 1) { throw 'PID raiz reutilizado.' }
        $family[$RootProcessId]=$rootDate.ToString('o')
        Update-VantareFamily -Family $family -Approximate $approximateFamily -Candidates $candidates.ToArray() -RootCreated $rootDate
        foreach ($process in $processes) {
            $id=[int]$process.ProcessId
            if (-not $family.ContainsKey($id)) { continue }
            $measured=$null
            try {
                $measured=[Diagnostics.Process]::GetProcessById($id)
                $identity=$measured.StartTime.ToUniversalTime().ToString('o')
                if ([math]::Abs(($measured.StartTime.ToUniversalTime()-$process.CreationDate.ToUniversalTime()).TotalMilliseconds) -gt 1) { throw 'PID reutilizado entre lecturas.' }
                $measured.Refresh(); [ulong]$cycles=0
                if (-not [Vantare141.Counters]::QueryProcessCycleTime($measured.Handle,[ref]$cycles)) { throw 'No se pueden leer ciclos de CPU.' }
                $rows.Add([pscustomobject]@{qpc=$clock;process_id=$id;created_utc=$identity;name=$process.Name;cpu_cycles=$cycles;cpu_time_100ns=$measured.TotalProcessorTime.Ticks;private_bytes=$measured.PrivateMemorySize64;working_set_bytes=$measured.WorkingSet64})
            } finally { if($measured){$measured.Dispose()} }
        }
        $counter.Collect()
        $names=if($Aguante){@('gpu_engine','system_cpu','cpu_frequency','cpu_active_time','cpu_performance','cpu_limit','cpu_limit_flags')}else{@('gpu_engine','gpu_memory','system_cpu','cpu_frequency','cpu_active_time','cpu_performance','cpu_limit','cpu_limit_flags','process_cpu','process_id')}
        foreach ($name in $names) {
            foreach ($value in $counter.Read($name)) {
                $rawCounters.Add([pscustomobject]@{qpc=$clock;counter=$name;instance=$value.Name;value=$value.Value.ToString('R',[Globalization.CultureInfo]::InvariantCulture);status=$value.Status})
            }
        }
        foreach ($thermal in $thermals.Read()) {
            $thermalRows.Add([pscustomobject]@{qpc=$clock;adapter=$thermal.AdapterLuid;status=$thermal.Status;caps_status=$thermal.CapsStatus;temperature_c=if($null -eq $thermal.TemperatureC){$null}else{$thermal.TemperatureC.ToString('R',[Globalization.CultureInfo]::InvariantCulture)};warning_c=if($null -eq $thermal.WarningC){$null}else{$thermal.WarningC.ToString('R',[Globalization.CultureInfo]::InvariantCulture)};fan_rpm=$thermal.FanRpm;power_tenths_percent=$thermal.PowerTenthsPercent;memory_frequency_hz=$thermal.MemoryFrequencyHz})
        }
        if ($pmStarted) {
            $state=[Vantare141.CaptureSession]::Query($sessionName)
            if (-not $state.Active -and -not $pm.HasExited -and ([Diagnostics.Stopwatch]::GetTimestamp()-$captureQpc)/[double][Diagnostics.Stopwatch]::Frequency -lt ($Seconds-1)) { throw 'La sesion ETW desaparecio antes del cierre.' }
            if ($state.Active -and ($state.EventsLost -or $state.LogBuffersLost -or $state.RealTimeBuffersLost)) { throw 'ETW perdio eventos; ronda invalida.' }
        }
        $sampler.Refresh()
        $rawCounters.Add([pscustomobject]@{qpc=$clock;counter='sampler_cpu_time_100ns';instance='sampler';value=$sampler.TotalProcessorTime.Ticks;status=0})
    }
    if ($pmStarted) {
        if (-not $pm.WaitForExit(10000)) { throw 'PresentMon no termino dentro del plazo.' }
        [IO.File]::WriteAllText((Join-Path $out 'presentmon.stdout.txt'),$stdout.GetAwaiter().GetResult())
        [IO.File]::WriteAllText((Join-Path $out 'presentmon.stderr.txt'),$stderr.GetAwaiter().GetResult())
        if ($pm.ExitCode -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $out 'presentmon.csv'))) { throw 'PresentMon fallo o no produjo CSV.' }
    }
    if ($PSCmdlet.ParameterSetName -eq 'Deferred' -and (Get-FileHash -LiteralPath $rootImagePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $rootImageHash) { throw 'Imagen raiz distinta al verificar despues de la muestra.' }
    if ($NoiseExclusionsFile) {
        $exclusions=@(Get-Content -LiteralPath $NoiseExclusionsFile -Raw | ConvertFrom-Json)
        if ($exclusions.Count -gt 16) { throw 'Demasiadas exclusiones de ruido.' }
        $safeExclusions=@(foreach ($entry in $exclusions) {
            if ([int]$entry.process_id -le 0) { throw 'Exclusion de ruido sin PID.' }
            [ordered]@{process_id=[int]$entry.process_id;created_utc=[DateTime]::Parse($entry.created_utc).ToUniversalTime().ToString('o')}
        })
        ConvertTo-Json -InputObject $safeExclusions | Set-Content -LiteralPath (Join-Path $out 'ruido-exclusiones.json') -Encoding utf8
    }
    $rows | Export-Csv -LiteralPath (Join-Path $out 'procesos.csv') -NoTypeInformation -Encoding utf8
    $rawCounters | Export-Csv -LiteralPath (Join-Path $out 'contadores.csv') -NoTypeInformation -Encoding utf8
    $thermalRows | Export-Csv -LiteralPath (Join-Path $out 'temperaturas.csv') -NoTypeInformation -Encoding utf8
    $processStarts | Export-Csv -LiteralPath (Join-Path $out 'procesos-iniciados.csv') -NoTypeInformation -Encoding utf8
    [ordered]@{complete=$true;qpc_frequency=[Diagnostics.Stopwatch]::Frequency;process_rows=$rows.Count;counter_rows=$rawCounters.Count;family=$family;family_approximate_ids=@($approximateFamily.Keys);seconds=$watch.Elapsed.TotalSeconds;sampler_id=$PID;presentmon_id=if($pmStarted){$pm.Id}else{0};health_only=[bool]$Aguante;cpu_temperature_verified=$false} |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $out 'completo.json') -Encoding utf8
} catch {
    $failed=$true
    $_.Exception.Message | Set-Content -LiteralPath (Join-Path $out 'INVALIDA.txt') -Encoding utf8
    $rows | Export-Csv -LiteralPath (Join-Path $out 'procesos-incompletos.csv') -NoTypeInformation -Encoding utf8
    $rawCounters | Export-Csv -LiteralPath (Join-Path $out 'contadores-incompletos.csv') -NoTypeInformation -Encoding utf8
    $thermalRows | Export-Csv -LiteralPath (Join-Path $out 'temperaturas-incompletas.csv') -NoTypeInformation -Encoding utf8
    $processStarts | Export-Csv -LiteralPath (Join-Path $out 'procesos-iniciados-incompletos.csv') -NoTypeInformation -Encoding utf8
    throw
} finally {
    if ($subscription) { Unregister-Event -SourceIdentifier $sourceId }
    foreach ($processEvent in @(Get-Event -SourceIdentifier $sourceId -ErrorAction SilentlyContinue)) { Remove-Event -EventIdentifier $processEvent.EventIdentifier }
    if ($thermals) { $thermals.Dispose() }
    if ($counter) { $counter.Dispose() }
    $cleanupErrors=[Collections.Generic.List[string]]::new()
    if ($pmStarted) {
        try {
            if (-not $pm.HasExited) { $pm.Kill() }
            if (-not $pm.WaitForExit(5000)) { throw 'PresentMon propio no terminó al cancelar.' }
            if ($stdout) { [IO.File]::WriteAllText((Join-Path $out 'presentmon.stdout.txt'),$stdout.GetAwaiter().GetResult()) }
            if ($stderr) { [IO.File]::WriteAllText((Join-Path $out 'presentmon.stderr.txt'),$stderr.GetAwaiter().GetResult()) }
        } catch { $cleanupErrors.Add($_.Exception.Message) }
        try {
            # Nombre GUID creado arriba por este proceso; nunca parar capturas ajenas.
            $status=[Vantare141.CaptureSession]::StopOwned($sessionName)
            if ($status -ne 0 -and $status -ne 4201) { throw "No se pudo cerrar la sesión ETW propia: $status" }
        } catch { $cleanupErrors.Add($_.Exception.Message) }
    }
    $pm.Dispose(); $sampler.Dispose()
    if ($cleanupErrors.Count) {
        $cleanupErrors | Set-Content -LiteralPath (Join-Path $out 'limpieza-incompleta.txt') -Encoding utf8
        'Limpieza incompleta; consultar limpieza-incompleta.txt.' | Add-Content -LiteralPath (Join-Path $out 'INVALIDA.txt') -Encoding utf8
        if (-not $failed) { throw 'La muestra no es válida: limpieza incompleta.' }
    }
}
