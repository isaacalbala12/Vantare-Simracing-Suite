param([Parameter(Mandatory=$true)][string]$Run,[Parameter(Mandatory=$true)][string]$GameExe,[Parameter(Mandatory=$true)][ValidatePattern('^VantareLMUAB-[a-f0-9]{8}$')][string]$TaskName,[ValidateSet('ABAB','BABA')][string]$Order='ABAB',[int]$BlockSeconds=180,[int]$ControlSeconds=60,[int]$GameProcessId)
$ErrorActionPreference='Stop'
$kit=$PSScriptRoot
$state=[ordered]@{schema='vantare.lmu-ab-run.v1';state='waiting_for_driving';game_pid=$GameProcessId;order=$Order;washout_s=10;blocks=@();presentmon=@{state='not_started'};errors=@()}
$pm=$null; $recorder=$null; $mutex=$null; $held=$false; $active=$null
function Save-State { [IO.File]::WriteAllText((Join-Path $Run 'run.json'),($state|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false)) }
function Has-Stop { return Test-Path -LiteralPath (Join-Path $Run 'STOP') }
function Test-GameAlive { return $null -ne (Get-Process -Id $GameProcessId -ErrorAction SilentlyContinue) }
function Test-Driving {
    $map=$null; $view=$null
    try {
        $map=[IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting('LMU_Data',[IO.MemoryMappedFiles.MemoryMappedFileRights]::Read)
        $view=$map.CreateViewAccessor(0,0,[IO.MemoryMappedFiles.MemoryMappedFileAccess]::Read)
        $count=$view.ReadInt32(1736); $index=[int]$view.ReadByte(128465)
        if ($view.ReadInt32(1696) -lt 1 -or $view.ReadInt32(1696) -gt 4) { return $null }
        if ($count -lt 1 -or $count -gt 104 -or $view.ReadByte(128466) -ne 1 -or $index -ge [int]$view.ReadByte(128464)) { return $null }
        $base=128468+$index*1888; $clock=$view.ReadDouble($base+12)
        $speed=[Math]::Sqrt([Math]::Pow($view.ReadDouble($base+184),2)+[Math]::Pow($view.ReadDouble($base+192),2)+[Math]::Pow($view.ReadDouble($base+200),2))
        if ($clock -gt 0 -and $speed -gt 1 -and $speed -lt 150 -and $view.ReadDouble($base+12) -eq $clock) { return $clock }
        return $null
    } catch { return $null }
    finally { if ($view) {$view.Dispose()}; if ($map) {$map.Dispose()} }
}
try {
    . (Join-Path $kit 'Process-AB.ps1')
    $mutex=[Threading.Mutex]::new($false,'Local\VantareLMUAB')
    try { $held=$mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $held=$true }
    if (-not $held) { throw 'Ya existe una prueba A/B en esta sesión.' }
    $game=Get-Process -Id $GameProcessId -ErrorAction Stop
    if ($game.ProcessName -ne 'Le Mans Ultimate' -or $game.SessionId -ne [Diagnostics.Process]::GetCurrentProcess().SessionId) { throw 'La tarea debe ejecutarse en la misma sesión interactiva que LMU.' }
    $conflicts=@(Get-Process -Name 'vantare-core','vantare-grabar-lmu','vantare-grabar-lmu-completo','vantare-verificar-lmu' -ErrorAction SilentlyContinue)
    if ($conflicts.Count) { throw 'Cierra la otra adquisición/grabación Vantare antes del A/B; no se detiene automáticamente.' }
    $build=[Diagnostics.FileVersionInfo]::GetVersionInfo($GameExe).FileVersionRaw.ToString()
    $state.build=$build; $state.started_utc=[DateTime]::UtcNow.ToString('o'); Save-State
    $limit=[DateTime]::UtcNow.AddMinutes(3); $previous=$null; $ready=0
    while ($ready -lt 3) {
        if (Has-Stop) { throw 'Cancelado antes de comenzar.' }
        if ([DateTime]::UtcNow -gt $limit -or -not (Test-GameAlive)) { throw 'Sin jugador rodando y SHM usable en tres minutos.' }
        $clock=Test-Driving
        if ($null -ne $clock -and $clock -ne $previous) { $ready++ } else { $ready=0 }
        $previous=$clock; Start-Sleep -Milliseconds 500
    }
    $state.state='recording'; $state.measurement_started_utc=[DateTime]::UtcNow.ToString('o')
    $session="VantareLMUAB-$([Guid]::NewGuid().ToString('N'))"
    $state.presentmon=@{state='starting';session=$session;clock='CPUStartQPC';gpu_tracking=$false;input_tracking=$false}
    $pmArgs=@('--process_id',[string]$GameProcessId,'--output_file',('"{0}"' -f (Join-Path $Run 'presentmon.csv')),'--qpc_time','--v2_metrics','--timed',[string]($ControlSeconds+4*$BlockSeconds+30),'--terminate_after_timed','--terminate_on_proc_exit','--session_name',$session,'--no_console_stats','--no_track_gpu','--no_track_input')
    try {
        $pm=Start-ABChild -File (Join-Path $kit 'PresentMon.exe') -Arguments $pmArgs -Stdout (Join-Path $Run 'presentmon.log') -Stderr (Join-Path $Run 'presentmon-error.log')
        $state.presentmon.state='started'; $state.presentmon.process_id=$pm.Id
    } catch { $state.presentmon.state='unavailable'; $state.presentmon.error=$_.Exception.Message }
    $blocks=@(); if ($ControlSeconds -gt 0) { $blocks+=@{name='C0';mode='C';duration=$ControlSeconds} }
    for ($i=0;$i -lt 4;$i++) { $blocks+=@{name=([string]$Order[$i]+[string]($i+1));mode=[string]$Order[$i];duration=$BlockSeconds} }
    foreach ($block in $blocks) {
        if (Has-Stop) { throw 'Cancelado entre bloques.' }
        if (-not (Test-GameAlive)) { throw 'LMU terminó; no se continúa con otro proceso.' }
        $active=Join-Path $Run $block.name
        $capture=@(); if ($block.mode -ne 'C') { $capture=@('/rest/watch/standings','/rest/watch/sessionInfo') }; if ($block.mode -eq 'B') { $capture+='/rest/race/car' }
        $catalog=[ordered]@{experiment='vantare.lmu-ab.v1';mode=$block.mode;block=$block.name;duration_s=$block.duration;capture=$capture}
        $config=Join-Path $Run ($block.name+'.json'); [IO.File]::WriteAllText($config,($catalog|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
        $entry=[ordered]@{name=$block.name;mode=$block.mode;duration_s=$block.duration;state='running';started_utc=[DateTime]::UtcNow.ToString('o')}
        $state.blocks+=,$entry; Save-State
        $recArgs=@(('"{0}"' -f $active),$build,('"{0}"' -f $config))
        $recorder=Start-ABChild -File (Join-Path $kit 'vantare-grabar-lmu-completo.exe') -Arguments $recArgs -Stdout (Join-Path $Run ($block.name+'.log')) -Stderr (Join-Path $Run ($block.name+'-error.log'))
        $deadline=[DateTime]::UtcNow.AddSeconds($block.duration+20)
        while (-not $recorder.HasExited) {
            if ((Has-Stop) -or -not (Test-GameAlive)) { if (Test-Path -LiteralPath $active) { New-Item -ItemType File -Path (Join-Path $active 'STOP') -Force | Out-Null } }
            if ([DateTime]::UtcNow -gt $deadline) { throw 'La grabadora propia no cerró dentro del plazo.' }
            Start-Sleep -Milliseconds 250; $recorder.Refresh()
        }
        $recorder.WaitForExit(); $entry.exit_code=$recorder.ExitCode; $entry.state='closed'; $entry.ended_utc=[DateTime]::UtcNow.ToString('o'); Save-State
        if ($recorder.ExitCode -ne 0) { throw "Falló $($block.name); conserva sus logs." }
        if (Has-Stop) { throw 'Cancelado durante un bloque.' }
        if (-not (Test-GameAlive)) { throw 'LMU terminó durante la grabación.' }
        $recorder=$null
    }
    $state.state='complete'
} catch { $state.state=if (Has-Stop) {'cancelled'} else {'failed'}; $state.errors+=,$_.Exception.Message }
finally {
    if ($recorder -and -not $recorder.HasExited) {
        if ($active -and (Test-Path -LiteralPath $active)) { New-Item -ItemType File -Path (Join-Path $active 'STOP') -Force | Out-Null }
        if (-not $recorder.WaitForExit(5000)) { $recorder.Kill(); $state.errors+=,'Grabadora propia terminada tras no responder a STOP; archivo posiblemente incompleto.' }
    }
    if ($pm) {
        if (-not $pm.HasExited) { & (Join-Path $kit 'PresentMon.exe') --session_name $state.presentmon.session --terminate_existing_session *> (Join-Path $Run 'presentmon-close.log'); [void]$pm.WaitForExit(5000) }
        if (-not $pm.HasExited) { $pm.Kill(); $state.errors+=,'PresentMon propio no cerró tras terminar su sesión ETW.' }
        $state.presentmon.exit_code=if ($pm.HasExited) {$pm.ExitCode} else {$null}
        $state.presentmon.state=if ((Test-Path -LiteralPath (Join-Path $Run 'presentmon.csv')) -and (Get-Item -LiteralPath (Join-Path $Run 'presentmon.csv')).Length -gt 0) {'csv_pending_validation'} else {'unavailable'}
    }
    try { $state.finished_utc=[DateTime]::UtcNow.ToString('o'); Save-State }
    finally {
        if ($held) { $mutex.ReleaseMutex() }; if ($mutex) { $mutex.Dispose() }
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    }
}
if ($state.state -ne 'complete') { exit 1 }
