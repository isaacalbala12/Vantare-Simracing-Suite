# Importación inerte. Solo INICIAR llama a esta función en el PC de juego.
function Invoke-VantareOverlayObservation {
 param([Parameter(Mandatory)]$Kit,[Parameter(Mandatory)]$Observation,
       [Parameter(Mandatory)][string]$OutputDirectory,[int]$LoadIterations=0)
 Assert-VantareGamePc
 $calibration=Read-VantareThermalCalibration -Directory $OutputDirectory -Hz $Observation.hz
 $referenceFile=Join-Path (Split-Path $calibration.Path) ('gpu-ref-n'+$Observation.copies+'-carga'+[int]$Observation.load+'.json')
 $reference=if(Test-Path $referenceFile){(Get-Content $referenceFile -Raw|ConvertFrom-Json -AsHashtable).gpu_start_c}else{@{}}
 $out=[IO.Path]::GetFullPath($OutputDirectory)
 if (Test-Path -LiteralPath $out) { throw 'La observación necesita una carpeta nueva.' }
 $null=New-Item -ItemType Directory -Path $out
 $core=$null;$ui=$null;$sampler=$null;$load=$null
 $exclusions=[Collections.Generic.List[object]]::new()
 $exclusions.Add([pscustomobject]@{process_id=$PID;reason="controlador"})
 $binary=$Kit.Binaries['relative_'+$Observation.variant]
 $coreBinary=$Kit.Binaries.core
 $corpus=$Kit.Paths['datos/lmu47-high-rate-60s.tar.gz']
 $pipe='vantare141-'+[guid]::NewGuid().ToString('N')
 $meta=[ordered]@{}
 foreach ($property in $Observation.PSObject.Properties) { $meta[$property.Name]=$property.Value }
 $meta.schema=1;$meta.status='invalid';$meta.binary_sha256=$binary.sha256
 $meta.environment_ok=$false;$meta.observed_windows=0
 try {
  if ($Observation.load) {
   if ($LoadIterations -lt 1) { throw 'Falta la carga fija calibrada antes de comparar motores.' }
   $meta.load_iterations=$LoadIterations
   $load=Start-VantareChild -Binary $Kit.Binaries.load.path -Arguments @('--hz',[string]$Observation.hz,'--seconds','180','--iterations',[string]$LoadIterations,'--output',(Join-Path $out 'carga.csv'),'--ready',(Join-Path $out 'carga-lista.json'),'--control-stdin') -LogPrefix (Join-Path $out 'carga')
   $exclusions.Add([pscustomobject]@{process_id=$load.Process.Id;reason="carga"})
   Write-VantareRootIdentity -Child $load -Sha256 $Kit.Binaries.load.sha256 -Path (Join-Path $out 'carga-raiz.json')
   $deadline=[DateTime]::UtcNow.AddSeconds(25)
   while (-not (Test-Path (Join-Path $out 'carga-lista.json'))) {
    if ($load.Process.HasExited -or [DateTime]::UtcNow -ge $deadline) { throw 'La carga no quedó lista.' }
    Start-Sleep -Milliseconds 100
   }
   if (-not (Get-Content (Join-Path $out 'carga-lista.json') -Raw | ConvertFrom-Json).ready) { throw 'Carga fuera del intervalo de calibración.' }
  }
  $pwsh=(Get-Process -Id $PID).Path
  $sampler=Start-VantareChild -Binary $pwsh -Arguments @('-NoProfile','-File',(Join-Path $Kit.Root 'muestreador/MUESTREAR.ps1'),'-RootInfoFile',(Join-Path $out 'raiz.json'),'-PresentMon',$Kit.Paths['bin/PresentMon-2.6.0-x64.exe'],'-OutputDirectory',(Join-Path $out 'muestreo'),'-Seconds','120') -LogPrefix (Join-Path $out 'muestreador')
  $deadline=[DateTime]::UtcNow.AddSeconds(30)
  while (-not (Test-Path (Join-Path $out 'muestreo/CAPTURA-LISTA.json'))) {
   if ($sampler.Process.HasExited -or [DateTime]::UtcNow -ge $deadline) { throw 'No se activó ETW antes de abrir la interfaz.' }
   Start-Sleep -Milliseconds 100
  }
  $core=Start-VantareChild -Binary $coreBinary.path -Arguments @('--replay',$corpus,'--pipe',$pipe) -LogPrefix (Join-Path $out 'nucleo-calentamiento') -Variables @{
   VANTARE_REPLAY_WAIT_SUBSCRIBER='1';VANTARE_LATENCY_FILE=(Join-Path $out 'calentamiento.csv');VANTARE_NATIVE_DATA_ROOT=(Join-Path $out 'datos-nucleo')}
  $exclusions.Add([pscustomobject]@{process_id=$core.Process.Id;reason="núcleo calentamiento"})
  $ui=Start-VantareChild -Binary $binary.path -Arguments @('--medicion-relative',[string]$Observation.copies,'--fuente',('pipe:'+$pipe),'--control-stdin') -LogPrefix (Join-Path $out 'interfaz') -Variables @{
   VANTARE_LATENCY_FILE=(Join-Path $out 'interfaz.csv');VANTARE_NATIVE_DATA_ROOT=(Join-Path $out 'datos-interfaz')}
  Write-VantareRootIdentity -Child $ui -Sha256 $binary.sha256 -Path (Join-Path $out 'raiz.json')
  $warm=[Diagnostics.Stopwatch]::StartNew()
  while ($warm.Elapsed.TotalSeconds -lt 15) {
   if ($ui.Process.HasExited -or $core.Process.HasExited -or $sampler.Process.HasExited) { throw 'Proceso terminado durante el calentamiento.' }
   Start-Sleep -Milliseconds 100
  }
  $windows=@([Vantare141.Windows]::Visible($ui.Process.Id))
  $meta.observed_windows=$windows.Count
  $windows | ConvertTo-Json -Depth 4 | Out-File -Width 2147483647 (Join-Path $out 'ventanas.json') -NoClobber
  if ($windows.Count -ne 1) { throw 'No hay exactamente una ventana por monitor.' }
  $closed=Close-VantareChild $core; $core=$null
  if ($closed.forced -or $closed.exit_code -ne 0) { throw 'El núcleo de calentamiento no cerró ordenadamente.' }
  $warmLines=Get-Content (Join-Path $out 'calentamiento.csv')
  if ($warmLines[0] -notmatch 'frequency=(\d+)') { throw 'Calentamiento sin reloj.' }
  $warmFrequency=[long]$Matches[1]
  $warmOrigins=@($warmLines[1..($warmLines.Count-2)] | ConvertFrom-Csv | Where-Object phase -eq 'origin')
  $range=$warmOrigins | Measure-Object -Property qpc -Minimum -Maximum
  $meta.warmup_s=([double]$range.Maximum-[double]$range.Minimum)/$warmFrequency
  if ($meta.warmup_s -lt 10) { throw 'Menos de diez segundos de calentamiento con datos reales.' }
  $core=Start-VantareChild -Binary $coreBinary.path -Arguments @('--replay',$corpus,'--pipe',$pipe) -LogPrefix (Join-Path $out 'nucleo') -Variables @{
   VANTARE_REPLAY_WAIT_SUBSCRIBER='1';VANTARE_LATENCY_FILE=(Join-Path $out 'nucleo.csv');VANTARE_NATIVE_DATA_ROOT=(Join-Path $out 'datos-nucleo')}
  $exclusions.Add([pscustomobject]@{process_id=$core.Process.Id;reason="núcleo replay"})
  $watch=[Diagnostics.Stopwatch]::StartNew()
  while ($watch.Elapsed.TotalSeconds -lt 65) {
   if ($ui.Process.HasExited -or $core.Process.HasExited -or $sampler.Process.HasExited -or ($null -ne $load -and $load.Process.HasExited)) { throw 'Un proceso terminó durante la reproducción principal.' }
   Start-Sleep -Milliseconds 100
  }
  $closed=Close-VantareChild $core; $core=$null
  if ($closed.forced -or $closed.exit_code -ne 0) { throw 'La reproducción principal no cerró ordenadamente.' }
  while (-not $sampler.Process.HasExited) {
   if ($ui.Process.HasExited -or ($null -ne $load -and $load.Process.HasExited)) { throw 'La interfaz o carga terminó antes del muestreador.' }
   Start-Sleep -Milliseconds 100
  }
  $closed=Close-VantareChild $sampler;$sampler=$null
  if ($closed.forced -or $closed.exit_code -ne 0) { throw 'El muestreador invalidó la observación.' }
  $closed=Close-VantareChild $ui;$ui=$null
  if ($closed.forced -or $closed.exit_code -ne 0) { throw 'La interfaz no cerró ordenadamente.' }
  if ($null -ne $load) {
   $closed=Close-VantareChild $load;$load=$null
   if ($closed.forced -or $closed.exit_code -ne 0) { throw 'La carga no cerró ordenadamente.' }
  }
  Test-VantareReplayDelivery -Origin (Join-Path $out "nucleo.csv") -Interface (Join-Path $out "interfaz.csv") | ConvertTo-Json | Out-File -Width 2147483647 (Join-Path $out "entrega-ipc.json") -NoClobber
  $lines=Get-Content -LiteralPath (Join-Path $out 'nucleo.csv')
  if ($lines[0] -notmatch 'frequency=(\d+)') { throw 'Falta reloj de la reproducción.' }
  $frequency=[long]$Matches[1]
  $origin=@($lines[1..($lines.Count-2)] | ConvertFrom-Csv | Where-Object phase -eq 'origin')
  if ($origin.Count -ne 3840) { throw 'La grabación no produjo las 3840 publicaciones.' }
  $start=[long]($origin | Measure-Object -Property qpc -Minimum).Minimum
  $complete=Get-Content (Join-Path $out 'muestreo/completo.json') -Raw | ConvertFrom-Json -AsHashtable
  $thermal=Measure-VantareThermals -Counters @(Import-Csv (Join-Path $out 'muestreo/contadores.csv')) -Temperatures @(Import-Csv (Join-Path $out 'muestreo/temperaturas.csv')) -ProcessIds @($complete.family.Keys | ForEach-Object {[int]$_}) -Frequency $frequency -StartQpc $start -EndQpc ($start+60*$frequency) -Policy $calibration.Policy -ReferenceGpu $reference
  $thermal | Add-Member -NotePropertyName source_sha256 -NotePropertyValue @{
   'contadores.csv'=(Get-FileHash (Join-Path $out 'muestreo/contadores.csv')).Hash.ToLowerInvariant()
   'temperaturas.csv'=(Get-FileHash (Join-Path $out 'muestreo/temperaturas.csv')).Hash.ToLowerInvariant()}
  $thermal | ConvertTo-Json -Depth 8 | Out-File -Width 2147483647 (Join-Path $out 'termica.json') -NoClobber
  if (-not $thermal.valid) { throw 'Limitación CPU o temperatura GPU: observación inválida.' }
  if(-not(Test-Path $referenceFile)){@{gpu_start_c=$thermal.gpu_start_c;source_folder=$out}|ConvertTo-Json -Depth 5|Out-File -LiteralPath $referenceFile -NoClobber -Encoding utf8}
  $exclusions.ToArray() | ConvertTo-Json -AsArray | Out-File -Width 2147483647 (Join-Path $out 'muestreo/ruido-exclusiones.json') -NoClobber
  $environment=Get-Content (Join-Path $out 'muestreo/entorno.json') -Raw | ConvertFrom-Json
  $excluded=@($exclusions | ForEach-Object {[int]$_.process_id})+@($complete.family.Keys | ForEach-Object {[int]$_})+@([int]$complete.sampler_id,[int]$complete.presentmon_id)
  $noise=Measure-VantareNoise -Counters @(Import-Csv (Join-Path $out 'muestreo/contadores.csv')) -ExcludedProcessIds $excluded -LogicalProcessors $environment.logical_processors -StartQpc $start -EndQpc ($start+60*$frequency) -Frequency $frequency
  $noise | ConvertTo-Json -Depth 6 | Out-File -Width 2147483647 (Join-Path $out 'ruido.json') -NoClobber
  if (-not $noise.noise_ok) { throw 'Otro proceso superó el 2% medio de CPU de toda la ronda: familia inválida.' }
  $rootIdentity=Get-Content (Join-Path $out 'raiz.json') -Raw|ConvertFrom-Json
  $meta.cpu_control_cycles_s=Get-VantareCpuControl -Rows @(Import-Csv (Join-Path $out 'muestreo/procesos.csv')) -RootProcessId $rootIdentity.process_id -Frequency $frequency -StartQpc $start -EndQpc ($start+60*$frequency)
  $meta.midpoint_qpc=$start+30*$frequency
  if($Observation.load){
   $loadIdentity=Get-Content (Join-Path $out 'carga-raiz.json') -Raw|ConvertFrom-Json
   $meta.load_control_p99_ms=Get-VantareLoadControl -Csv (Join-Path $out 'muestreo/presentmon.csv') -ProcessId $loadIdentity.process_id -Frequency $frequency -StartQpc $start -EndQpc ($start+60*$frequency)
  }
  $meta.environment_ok=$true
  $meta.status='complete'
 } catch { $meta.error=$_.Exception.Message } finally {
  foreach ($child in @($core,$ui,$load,$sampler)) {
   if ($null -eq $child -or $child.Closed) { continue }
   try { Close-VantareChild $child | ConvertTo-Json -Compress | Add-Content (Join-Path $out 'cierres.jsonl') }
   catch { $meta.cleanup_error=$_.Exception.Message;$meta.status='invalid' }
  }
  $meta | ConvertTo-Json -Depth 8 | Out-File -Width 2147483647 (Join-Path $out 'observacion.json') -NoClobber -Encoding utf8
 }
 [pscustomobject]$meta
}
