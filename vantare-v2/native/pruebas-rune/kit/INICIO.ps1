#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Campana,[ValidateSet('electron','gpui_fast','rune')][string]$PrimerArranque)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'PROCESOS.ps1')
. (Join-Path $PSScriptRoot 'PREPARAR.ps1')
. (Join-Path $PSScriptRoot 'RUIDO.ps1')
Assert-VantareGamePc
$campaignLease=Enter-VantareCampaignLease
try {
. (Join-Path $PSScriptRoot 'muestreador/TERMICA.ps1')
$kit=Read-VantareKit $PSScriptRoot
$env:PATH=(Join-Path $kit.Root 'bin')+[IO.Path]::PathSeparator+$env:PATH
$root=[IO.Path]::GetFullPath($Campana)
$campaign=Get-Content (Join-Path $root 'campana.json') -Raw | ConvertFrom-Json
if ($campaign.manifest_sha256 -ne $kit.ManifestSha256) { throw 'Usar el mismo kit de la campaña B.' }
$lockPath=Join-Path $root 'EN-CURSO.lock'
$lock=[IO.File]::Open($lockPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
$out=Join-Path $root $(if($PrimerArranque){'inicio-boot-'+$PrimerArranque+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss')}else{'inicio'})
if (Test-Path $out) { $lock.Dispose();Remove-Item $lockPath;throw 'Inicio ya existe. Conservarlo y pedir revisión antes de repetir.' }
$null=New-Item -ItemType Directory $out
$pwsh=(Get-Process -Id $PID).Path
Add-Type -Path (Join-Path $kit.Root 'VENTANAS.cs') -CompilerOptions @('/optimize+','/debug-')
function Capture-Inicio($variant,$phase,$index,$qaProfile) {
 $folder=Join-Path $out ($phase+'-'+$index+'-'+$variant)
 $null=New-Item -ItemType Directory $folder
 $sampler=$null;$ui=$null
 $binary=$kit.Binaries['inicio_'+$variant]
 $seconds=if($phase -eq 'interaction'){180}else{30}
 $meta=[ordered]@{schema=1;variant=$variant;phase=$phase;index=$index;binary_sha256=$binary.sha256
  status='invalid';profile=$qaProfile;frequency=[Diagnostics.Stopwatch]::Frequency
  cold_definition='nuevo proceso y perfil QA nuevo; no se purgan cachés del sistema'
  warm_definition='nuevo proceso y reutilización del perfil QA de cold-1; cachés del sistema conservadas'
  first_after_reboot=($phase -eq 'boot');readiness='marca con datos/fuentes/imágenes y frame completo; QPC observado por padre, cota superior'}
 try {
  $sampler=Start-VantareChild -Binary $pwsh -Arguments @('-NoProfile','-File',(Join-Path $kit.Root 'muestreador/MUESTREAR.ps1'),'-RootInfoFile',(Join-Path $folder 'raiz.json'),'-PresentMon',$kit.Paths['bin/PresentMon-2.6.0-x64.exe'],'-OutputDirectory',(Join-Path $folder 'muestreo'),'-Seconds',[string]$seconds) -LogPrefix (Join-Path $folder 'muestreador')
  $deadline=[DateTime]::UtcNow.AddSeconds(30)
  while(-not(Test-Path(Join-Path $folder 'muestreo/CAPTURA-LISTA.json'))){
   if($sampler.Process.HasExited -or [DateTime]::UtcNow -ge $deadline){throw 'No arrancó la captura previa de Inicio.'}
   Start-Sleep -Milliseconds 100
  }
  $arguments=if($variant -eq 'gpui_fast'){@('--demo','--control-stdin','--data-dir',$qaProfile,'--pipe',('vantare141-inicio-'+[guid]::NewGuid().ToString('N')))}else{@('--medicion-inicio','--control-stdin')}
  $readyFile=Join-Path $folder 'lista.json'
  $visibleFile=Join-Path $folder 'visible.json'
  $ui=Start-VantareChild -Binary $binary.path -Arguments $arguments -LogPrefix (Join-Path $folder 'interfaz') -Variables @{
   VANTARE_MEASUREMENT_READY_FILE=$readyFile;VANTARE_MEASUREMENT_VISIBLE_FILE=$visibleFile;VANTARE_HUB_DATA_DIR=$qaProfile;VANTARE_NATIVE_DATA_ROOT=$qaProfile}
  Write-VantareRootIdentity -Child $ui -Sha256 $binary.sha256 -Path (Join-Path $folder 'raiz.json')
  $deadline=[DateTime]::UtcNow.AddSeconds(25)
  do {
   if($ui.Process.HasExited -or $sampler.Process.HasExited -or [DateTime]::UtcNow -ge $deadline){throw 'Inicio no marcó sus datos y recursos listos.'}
   if($variant -eq "rune" -and -not $meta.Contains("visible_observed_qpc") -and (Test-Path $visibleFile)){
    try{$visible=Get-Content $visibleFile -Raw|ConvertFrom-Json -ErrorAction Stop;if($visible.ready -and $visible.source -eq "post_draw_dwm_flush"){$meta.visible_observed_qpc=[Diagnostics.Stopwatch]::GetTimestamp()}}catch{}
   }
   $ready=$null
   if(Test-Path $readyFile){try{$ready=Get-Content $readyFile -Raw|ConvertFrom-Json -ErrorAction Stop}catch{}}
   if($null -ne $ready -and $ready.ready -and ($variant -ne "rune" -or $meta.Contains("visible_observed_qpc"))){break}
   Start-Sleep -Milliseconds 10
  }while($true)
  $meta.ready_observed_qpc=[Diagnostics.Stopwatch]::GetTimestamp()
  $windows=@([Vantare141.Windows]::Visible($ui.Process.Id))
  if($windows.Count -ne 1 -or $windows[0].Dpi -ne 96 -or $windows[0].Width -ne 1440 -or $windows[0].Height -ne 900){throw 'Inicio requiere una ventana de contenido 1440x900 a 100%.'}
  $windows | ConvertTo-Json -Depth 4 | Out-File -Width 2147483647 (Join-Path $folder 'ventanas.json') -NoClobber
  Start-Sleep -Seconds 1
  if($phase -eq 'interaction'){
   $stages=[Collections.Generic.List[object]]::new()
   foreach($stage in @(@('idle',20,'No tocar durante 20 s'),@('scroll',10,'Desplazar continuamente durante 10 s'))){
    Write-Host "$variant : $($stage[2])"
    $start=[Diagnostics.Stopwatch]::GetTimestamp();Start-Sleep -Seconds $stage[1]
    $stages.Add([pscustomobject]@{name=$stage[0];start_qpc=$start;end_qpc=[Diagnostics.Stopwatch]::GetTimestamp()})
   }
   $otherSection=if($variant -eq 'gpui_fast'){'Ajustes'}else{'Roadmap'}
   Write-Host "Haz 30 cambios: 15 idas y vueltas Inicio ↔ $otherSection. Sin abrir enlaces externos."
   $start=[Diagnostics.Stopwatch]::GetTimestamp()
   if((Read-Host 'Escribe 30 solo al terminar los 30 cambios observados') -cne '30'){throw 'No se confirmaron las 30 transiciones.'}
   $stages.Add([pscustomobject]@{name='navigation';start_qpc=$start;end_qpc=[Diagnostics.Stopwatch]::GetTimestamp();transitions=30;manual=$true})
   Write-Host 'Redimensiona continuamente durante los próximos 10 s.'
   $start=[Diagnostics.Stopwatch]::GetTimestamp();Start-Sleep -Seconds 10
   $stages.Add([pscustomobject]@{name='resize';start_qpc=$start;end_qpc=[Diagnostics.Stopwatch]::GetTimestamp()})
   if($ui.Process.HasExited -or $sampler.Process.HasExited){throw 'La interacción excedió la captura o terminó un proceso.'}
   $meta.stages=$stages.ToArray()
  }
  while(-not $sampler.Process.HasExited){if($ui.Process.HasExited){throw 'Inicio terminó durante la captura.'};Start-Sleep -Milliseconds 100}
  $closed=Close-VantareChild $sampler;$sampler=$null
  if($closed.forced -or $closed.exit_code -ne 0){throw 'Captura de Inicio inválida.'}
  $closed=Close-VantareChild $ui;$ui=$null
  if($closed.forced -or $closed.exit_code -ne 0){throw 'Inicio no cerró ordenadamente.'}
  $complete=Get-Content (Join-Path $folder 'muestreo/completo.json') -Raw | ConvertFrom-Json -AsHashtable
  $environment=Get-Content (Join-Path $folder 'muestreo/entorno.json') -Raw | ConvertFrom-Json
  $counters=@(Import-Csv (Join-Path $folder 'muestreo/contadores.csv'))
  $start=$meta.ready_observed_qpc+$meta.frequency
  $end=[long]($counters | Measure-Object -Property qpc -Maximum).Maximum
  $thermal=Measure-VantareThermals -Counters $counters -Temperatures @(Import-Csv (Join-Path $folder 'muestreo/temperaturas.csv')) -ProcessIds @($complete.family.Keys | ForEach-Object {[int]$_}) -Frequency $meta.frequency -StartQpc $start -EndQpc $end
  $thermal | Add-Member -NotePropertyName source_sha256 -NotePropertyValue @{
   'contadores.csv'=(Get-FileHash (Join-Path $folder 'muestreo/contadores.csv')).Hash.ToLowerInvariant()
   'temperaturas.csv'=(Get-FileHash (Join-Path $folder 'muestreo/temperaturas.csv')).Hash.ToLowerInvariant()}
  $thermal | ConvertTo-Json -Depth 8 | Out-File -Width 2147483647 (Join-Path $folder 'termica.json') -NoClobber
  if(-not $thermal.valid){throw 'Control térmico de Inicio inválido.'}
  $excluded=@($PID,[int]$complete.sampler_id,[int]$complete.presentmon_id)+@($complete.family.Keys | ForEach-Object {[int]$_})
  @([pscustomobject]@{process_id=$PID;reason='controlador'}) | ConvertTo-Json -AsArray | Out-File -Width 2147483647 (Join-Path $folder 'muestreo/ruido-exclusiones.json') -NoClobber
  $noise=Measure-VantareNoise -Counters $counters -ExcludedProcessIds $excluded -LogicalProcessors $environment.logical_processors -StartQpc $start -EndQpc $end -Frequency $meta.frequency
  $noise | ConvertTo-Json -Depth 6 | Out-File -Width 2147483647 (Join-Path $folder 'ruido.json') -NoClobber
  if(-not $noise.noise_ok){throw 'Otro proceso superó el 2% CPU durante Inicio.'}
  $meta.status='complete'
 }catch{$meta.error=$_.Exception.Message}finally{
  foreach($child in @($ui,$sampler)){if($null -ne $child -and -not $child.Closed){Close-VantareChild $child|Out-Null}}
  $meta | ConvertTo-Json -Depth 8 | Out-File -Width 2147483647 (Join-Path $folder 'observacion-inicio.json') -NoClobber -Encoding utf8
 }
 if($meta.status -ne 'complete'){throw 'Inicio incompleto: conservar la carpeta para revisar.'}
}
try {
 if($PrimerArranque){
  $boot=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime()
  if(([DateTime]::UtcNow-$boot).TotalMinutes -gt 15){throw 'Registrar el primer arranque en los primeros 15 minutos tras reiniciar Windows.'}
  if((Read-Host 'Escribe PRIMERO si no has abierto antes este Hub desde el reinicio') -cne 'PRIMERO'){throw 'Primer arranque no confirmado.'}
  [ordered]@{boot_utc=$boot.ToString('o');variant=$PrimerArranque;user_confirmed=$true} | ConvertTo-Json | Out-File -Width 2147483647 (Join-Path $out 'reinicio.json') -NoClobber
  Capture-Inicio $PrimerArranque 'boot' 1 (Join-Path $out 'perfil-aislado')
  Write-Host 'Primer arranque guardado aparte; no se mezcla con los diez arranques de la serie.'
  return
 }
 Write-Host 'Prueba A: 10 procesos con perfil nuevo, 10 con perfil reutilizado y 5 interacciones por motor (~90 min).'
 Write-Host 'No se limpian cachés globales. El primer arranque tras reiniciar se registra aparte; esta serie no lo suplanta.'
 Write-Host 'DPI 100%, ventana 1440x900, tema oscuro. Coloca la consola junto al Hub para seguir las fases.'
 if((Read-Host 'Escribe LISTO') -cne 'LISTO'){throw 'Preparación no confirmada.'}
 foreach($phase in @('cold','warm','interaction')){
  $count=if($phase -eq 'interaction'){5}else{10}
  for($i=1;$i -le $count;$i++){
   $order=@(@('electron','gpui_fast','rune'),@('rune','electron','gpui_fast'),@('gpui_fast','rune','electron'))[($i-1)%3]
   foreach($variant in $order){
    $qaProfile=Join-Path $out ('perfiles/'+$variant+'/'+$(if($phase -eq 'cold'){$i}else{1}))
    Capture-Inicio $variant $phase $i $qaProfile
   }
  }
 }
 Write-Host 'TERMINÓ Inicio. Los CSV completos se analizarán en servidor.'
}finally{$lock.Dispose();Remove-Item -LiteralPath $lockPath}

} finally { Exit-VantareCampaignLease $campaignLease }
