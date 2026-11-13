#requires -Version 7.0
# Pieza 10. Solo PC de juego; importa los auxiliares del kit, nunca telemetría real.
[CmdletBinding()]
param(
 [Parameter(Mandatory)][ValidateSet('gpui','gpui_fast','rune')][string]$Variant,
 [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'PROCESOS.ps1')
. (Join-Path $PSScriptRoot 'PREPARAR.ps1')
Assert-VantareGamePc
$kit=Read-VantareKit $PSScriptRoot
$crashControl=Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\CrashControl'
if ($crashControl.CrashDumpEnabled -ne 3) { throw 'Activar antes Volcado de memoria pequeño en Windows. No se cambia la configuración desde el kit.' }
if (-not @(Get-CimInstance Win32_PageFileUsage).Count) { throw 'Se necesita archivo de paginación para el volcado pequeño.' }
$out=[IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $out) { throw 'Usar una carpeta nueva; no sobrescribir aguantes anteriores.' }
$null=New-Item -ItemType Directory -Path $out
$lock=[IO.File]::Open((Join-Path $out 'EN-CURSO.lock'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
$binary=$kit.Binaries['relative_'+$Variant]
$coreBinary=$kit.Binaries.core
$corpus=$kit.Paths['datos/lmu47-high-rate-60s.tar.gz']
$presentmon=$kit.Paths['bin/PresentMon-2.6.0-x64.exe']
$pwsh=(Get-Process -Id $PID).Path
$pipe='vantare141-aguante-'+[guid]::NewGuid().ToString('N')
$core=$null; $ui=$null; $sampler=$null; $hidden=$false
$startUtc=[DateTime]::UtcNow
$initialDisplay=@(Get-CimInstance Win32_VideoController | Select-Object Name,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate)
$initialDisplay | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $out 'pantallas-iniciales.json') -NoClobber
$run=[ordered]@{schema=1;variant=$Variant;binary_sha256=$binary.sha256;manifest_sha256=$kit.ManifestSha256
 duration_s=0;crashes=0;bugchecks=0;finished=$false;monitor_sleep_resume=$false;hide_show=$false
 resolution_change=$false;minidump_enabled=$true;frequency=[Diagnostics.Stopwatch]::Frequency
 start_qpc=0;end_qpc=0;root_process_id=0;replay_cycles=0;cpu_temperature='no_disponible'}
$events=[Collections.Generic.List[object]]::new()
try {
 Add-Type -Path (Join-Path $PSScriptRoot 'VENTANAS.cs') -CompilerOptions @('/optimize+','/debug-')
 $core=Start-VantareChild -Binary $coreBinary.path -Arguments @('--replay',$corpus,'--pipe',$pipe) -LogPrefix (Join-Path $out 'nucleo-000') -Variables @{
  VANTARE_REPLAY_WAIT_SUBSCRIBER='1';VANTARE_NATIVE_DATA_ROOT=(Join-Path $out 'datos-nucleo')}
 $coreStart=[Diagnostics.Stopwatch]::GetTimestamp()
 $ui=Start-VantareChild -Binary $binary.path -Arguments @('--medicion-relative','10','--fuente',('pipe:'+$pipe),'--control-stdin') -LogPrefix (Join-Path $out 'interfaz') -Variables @{
  VANTARE_NATIVE_DATA_ROOT=(Join-Path $out 'datos-interfaz')}
 $run.root_process_id=$ui.Process.Id
 Write-VantareRootIdentity -Child $ui -Sha256 $binary.sha256 -Path (Join-Path $out 'raiz.json')
 $deadline=[DateTime]::UtcNow.AddSeconds(15)
 do {
  if ($ui.Process.HasExited) { $run.crashes++; throw 'La interfaz terminó durante el arranque.' }
  $windows=@([Vantare141.Windows]::Visible($ui.Process.Id))
  if ($windows.Count -eq 1) { break }
  if ([DateTime]::UtcNow -ge $deadline) { throw 'No se observó exactamente una ventana.' }
  Start-Sleep -Milliseconds 100
 } while ($true)
 $window=$windows[0]
 $window | ConvertTo-Json | Set-Content (Join-Path $out 'ventana.json') -NoClobber
 $sampler=Start-VantareChild -Binary $pwsh -Arguments @('-NoProfile','-File',(Join-Path $PSScriptRoot 'muestreador/MUESTREAR.ps1'),'-RootProcessId',[string]$ui.Process.Id,'-PresentMon',$presentmon,'-OutputDirectory',(Join-Path $out 'muestreo'),'-Seconds','14400','-Aguante') -LogPrefix (Join-Path $out 'muestreador')
 $deadline=[DateTime]::UtcNow.AddSeconds(30)
 $capture=Join-Path $out 'muestreo/CAPTURA-LISTA.json'
 while (-not (Test-Path -LiteralPath $capture)) {
  if ($sampler.Process.HasExited -or [DateTime]::UtcNow -ge $deadline) { throw 'No arrancó el muestreo de salud.' }
  Start-Sleep -Milliseconds 100
 }
 $run.start_qpc=(Get-Content $capture -Raw | ConvertFrom-Json).qpc
 Write-Host 'Aguante de 4 h. H: ocultar/mostrar la capa (dos veces).'
 Write-Host 'Tras apagar físicamente el monitor y volver: M. Tras cambiar resolución y restaurarla: R.'
 Write-Host 'M y R son confirmaciones de lo que has observado. Q cancela conservando los datos.'
 while (([Diagnostics.Stopwatch]::GetTimestamp()-$run.start_qpc)/$run.frequency -lt 14400) {
  if ($ui.Process.HasExited) { $run.crashes++; throw 'Caída de la interfaz durante el aguante.' }
  if ($sampler.Process.HasExited) { throw 'El muestreador terminó antes de cuatro horas.' }
  if ($core.Process.HasExited) { throw 'El núcleo terminó inesperadamente.' }
  if (([Diagnostics.Stopwatch]::GetTimestamp()-$coreStart)/$run.frequency -ge 65) {
   $closed=Close-VantareChild $core; $core=$null
   if ($closed.forced -or $closed.exit_code -ne 0) { throw 'El núcleo no cerró ordenadamente.' }
   $run.replay_cycles++
   $core=Start-VantareChild -Binary $coreBinary.path -Arguments @('--replay',$corpus,'--pipe',$pipe) -LogPrefix (Join-Path $out ('nucleo-{0:D3}' -f $run.replay_cycles)) -Variables @{
    VANTARE_REPLAY_WAIT_SUBSCRIBER='1';VANTARE_NATIVE_DATA_ROOT=(Join-Path $out 'datos-nucleo')}
   $coreStart=[Diagnostics.Stopwatch]::GetTimestamp()
  }
  if ([Console]::KeyAvailable) {
   $key=[Console]::ReadKey($true).Key
   switch ($key) {
    H { $hidden=-not $hidden; [Vantare141.Windows]::HideShow($ui.Process.Id,$window.Handle,$hidden); if (-not $hidden) { $run.hide_show=$true } }
    M { $run.monitor_sleep_resume=$true }
    R {
     $current=@(Get-CimInstance Win32_VideoController | Select-Object Name,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate)
     if (($current | ConvertTo-Json -Compress) -ne ($initialDisplay | ConvertTo-Json -Compress)) { throw 'Restaurar primero la resolución y frecuencia iniciales.' }
     $run.resolution_change=$true
    }
    Q { throw 'Cancelado por Isaac.' }
   }
   $events.Add([pscustomobject]@{qpc=[Diagnostics.Stopwatch]::GetTimestamp();key=[string]$key;hidden=$hidden})
  }
  Start-Sleep -Milliseconds 100
 }
 $run.end_qpc=[Diagnostics.Stopwatch]::GetTimestamp()
 if (-not $sampler.Process.WaitForExit(30000)) { throw 'El muestreador no completó su cierre.' }
 $closed=Close-VantareChild $sampler; $sampler=$null
 if ($closed.forced -or $closed.exit_code -ne 0) { throw 'Muestreo de salud inválido.' }
 $run.finished=$true
} catch {
 $run.error=$_.Exception.Message
} finally {
 $run.end_qpc=[Diagnostics.Stopwatch]::GetTimestamp()
 if ($run.start_qpc -gt 0) { $run.duration_s=($run.end_qpc-$run.start_qpc)/$run.frequency }
 foreach ($child in @($core,$ui,$sampler)) {
  if ($null -eq $child -or $child.Closed) { continue }
  try {
   $closed=Close-VantareChild $child
   $closed | ConvertTo-Json | Add-Content (Join-Path $out 'cierres.jsonl')
   if ($child -eq $ui -and ($closed.forced -or $closed.exit_code -ne 0)) { $run.crashes++ }
  } catch { $run.finished=$false; $run.cleanup_error=$_.Exception.Message }
 }
 try {
  $systemEvents=@(Get-WinEvent -FilterHashtable @{LogName='System';StartTime=$startUtc;Id=@(41,1001)} -ErrorAction Stop | Select-Object Id,ProviderName,TimeCreated,RecordId)
  $systemEvents | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $out 'incidentes-sistema.json') -NoClobber
  $run.bugchecks=@($systemEvents | Where-Object { $_.Id -eq 41 -or $_.ProviderName -match 'WER-SystemErrorReporting|BugCheck' }).Count
 } catch {
  if ($_.FullyQualifiedErrorId -notlike 'NoMatchingEventsFound*') { $run.finished=$false; $run.eventlog_error=$_.Exception.Message }
 }
 $events.ToArray() | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $out 'acciones.json') -NoClobber
 Get-ChildItem -LiteralPath (Join-Path $env:SystemRoot 'Minidump') -File -ErrorAction SilentlyContinue | Where-Object LastWriteTimeUtc -ge $startUtc | Select-Object Name,Length,LastWriteTimeUtc | ConvertTo-Json | Set-Content (Join-Path $out 'volcados-metadatos.json') -NoClobber
 if (Test-Path -LiteralPath (Join-Path $out 'muestreo/completo.json')) {
  try {
   . (Join-Path $PSScriptRoot 'muestreador/TERMICA.ps1')
   $complete=Get-Content (Join-Path $out 'muestreo/completo.json') -Raw | ConvertFrom-Json -AsHashtable
   $thermal=Measure-VantareThermals -Counters @(Import-Csv (Join-Path $out 'muestreo/contadores.csv')) -Temperatures @(Import-Csv (Join-Path $out 'muestreo/temperaturas.csv')) -ProcessIds @($complete.family.Keys | ForEach-Object {[int]$_}) -Frequency $run.frequency -StartQpc $run.start_qpc -EndQpc ($run.start_qpc+14400*$run.frequency) -IntervalSeconds 10
   $thermal | Add-Member -NotePropertyName source_sha256 -NotePropertyValue @{
    'contadores.csv'=(Get-FileHash (Join-Path $out 'muestreo/contadores.csv')).Hash.ToLowerInvariant()
    'temperaturas.csv'=(Get-FileHash (Join-Path $out 'muestreo/temperaturas.csv')).Hash.ToLowerInvariant()}
   $thermal | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $out 'termica.json') -NoClobber
   if (-not $thermal.valid) { $run.finished=$false; $run.thermal_error='Limitación CPU o temperatura GPU' }
  } catch { $run.finished=$false; $run.thermal_error=$_.Exception.Message }
 }
 $run | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $out 'ejecucion.json') -NoClobber -Encoding utf8
 $lock.Dispose(); Remove-Item -LiteralPath (Join-Path $out 'EN-CURSO.lock')
}
if (-not $run.finished) { throw 'Aguante incompleto: consultar ejecucion.json; no cuenta como aprobado.' }
Write-Host 'Terminó la ejecución. Conserva esta carpeta completa para el análisis en servidor.'
