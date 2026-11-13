#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Campana)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'PROCESOS.ps1')
. (Join-Path $PSScriptRoot 'PREPARAR.ps1')
Assert-VantareGamePc
$campaignLease=Enter-VantareCampaignLease
try {
$kit=Read-VantareKit $PSScriptRoot
$env:PATH=(Join-Path $kit.Root 'bin')+[IO.Path]::PathSeparator+$env:PATH
$root=[IO.Path]::GetFullPath($Campana)
$descriptor=Get-Content (Join-Path $root 'campana.json') -Raw | ConvertFrom-Json
if($descriptor.manifest_sha256 -ne $kit.ManifestSha256){throw 'No mezclar kits.'}
$lockPath=Join-Path $root 'EN-CURSO.lock'
$lock=[IO.File]::Open($lockPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
$out=Join-Path $root 'correccion'
if(Test-Path $out){$lock.Dispose();Remove-Item $lockPath;throw 'Corrección ya existe: conservar la evidencia.'}
$null=New-Item -ItemType Directory $out
$answers=@{};$pwsh=(Get-Process -Id $PID).Path
foreach($variant in @('gpui','gpui_fast','rune')){$answers[$variant]=[ordered]@{click_through=$null;no_focus=$null;topmost_borderless=$null;dpi_100=$null;dpi_150=$null;second_monitor=$null;obs_transparency=$null;exclude_from_capture=$null;evidence=@()}}
function Answer($message){
 switch((Read-Host ($message+' [S correcto / N falla / P pendiente]')).ToUpperInvariant()){
  S{return $true} N{return $false} default{return $null}
 }
}
try {
 Add-Type -Path (Join-Path $kit.Root 'VENTANAS.cs') -CompilerOptions @('/optimize+','/debug-')
 foreach($mode in @('normal','dpi150','segundo','excluir')){
  Write-Host "Comprobación $mode. Solo esta fase permite abrir OBS; ciérralo antes de medir consumo."
  $monitor=$null
  if($mode -eq 'segundo'){
   $monitors=@([Vantare141.Windows]::Monitors() | Where-Object {-not $_.Primary})
   if(-not $monitors.Count){Write-Warning 'Sin segundo monitor: queda pendiente.';continue}
   $monitor=$monitors[0]
   Write-Host "Se usará el segundo monitor: $($monitor.Device), origen $($monitor.X),$($monitor.Y)"
  }
  if($mode -eq 'dpi150'){Write-Host 'Selecciona 150% de escala en el monitor principal.'}
  else{Write-Host 'Selecciona 100% de escala; deja las otras aplicaciones cerradas salvo la comprobación OBS.'}
  if((Read-Host 'Escribe LISTO o P para dejar este bloque pendiente') -cne 'LISTO'){continue}
  foreach($variant in @('gpui','gpui_fast','rune')){
   $folder=Join-Path $out ($mode+'-'+$variant);$null=New-Item -ItemType Directory $folder
   $repeater=$null;$ui=$null;$binary=$kit.Binaries['relative_'+$variant]
   try {
    $pipe='vantare141-correccion-'+[guid]::NewGuid().ToString('N')
    $repeater=Start-VantareChild -Binary $pwsh -Arguments @('-NoProfile','-File',(Join-Path $kit.Root 'REPETIR.ps1'),'-Pipe',$pipe,'-OutputDirectory',(Join-Path $folder 'replay')) -LogPrefix (Join-Path $folder 'repetidor')
    $variables=@{VANTARE_NATIVE_DATA_ROOT=(Join-Path $folder 'datos-interfaz')}
    if($mode -eq 'excluir'){$variables.VANTARE_MEASUREMENT_EXCLUDE_CAPTURE='1'}
    if($null -ne $monitor){$variables.VANTARE_MEASUREMENT_MONITOR_ORIGIN="$($monitor.X),$($monitor.Y)";$variables.VANTARE_DESPLAZAMIENTO="$($monitor.X),$($monitor.Y)"}
    $ui=Start-VantareChild -Binary $binary.path -Arguments @('--medicion-relative','1','--fuente',('pipe:'+$pipe),'--control-stdin') -LogPrefix (Join-Path $folder 'interfaz') -Variables $variables
    $deadline=[DateTime]::UtcNow.AddSeconds(20)
    do{
     if($ui.Process.HasExited -or $repeater.Process.HasExited){throw 'Terminó la capa o la reproducción.'}
     $windows=@([Vantare141.Windows]::Visible($ui.Process.Id))
     if($windows.Count -eq 1){break}
     if([DateTime]::UtcNow -ge $deadline){throw 'No apareció una sola capa.'}
     Start-Sleep -Milliseconds 100
    }while($true)
    $windows | ConvertTo-Json -Depth 4 | Out-File -Width 2147483647 (Join-Path $folder 'ventanas.json') -NoClobber
    $dpi=if($mode -eq 'dpi150'){144}else{96}
    if($windows[0].Dpi -ne $dpi){throw 'La ventana no está en el DPI solicitado.'}
    Start-Sleep -Seconds 3
    if($mode -eq 'normal'){
     $answers[$variant].click_through=Answer '¿Puedes pulsar la aplicación de debajo fuera de la marca pulsable del Relative?'
     $answers[$variant].no_focus=Answer '¿La capa aparece y recibe telemetría sin robar el foco?'
     $answers[$variant].topmost_borderless=Answer '¿Queda encima y sin marco nativo?'
     $answers[$variant].dpi_100=Answer '¿Texto, columnas y tamaño correctos al 100% y comparables al Relative real?'
     $answers[$variant].obs_transparency=Answer '¿OBS muestra la capa con transparencia y fondo correcto?'
    }elseif($mode -eq 'dpi150'){$answers[$variant].dpi_150=Answer '¿Texto y composición correctos al 150%?'}
    elseif($mode -eq 'segundo'){$answers[$variant].second_monitor=Answer '¿La capa está completa y funciona en el segundo monitor indicado?'}
    else{$answers[$variant].exclude_from_capture=Answer '¿Se ve en el escritorio pero desaparece de OBS/captura sin rectángulo negro?'}
    $image=Read-Host 'Guarda una captura PNG y escribe su ruta, o P para dejar la evidencia pendiente'
    if($image -ceq 'P'){foreach($key in @($answers[$variant].Keys | Where-Object {$_ -ne 'evidence'})){if($answers[$variant][$key] -eq $true){$answers[$variant][$key]=$null}}}
    if($image -cne 'P'){
     $file=Get-Item -LiteralPath $image -ErrorAction Stop
     if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'No copiar capturas enlazadas.'}
     if($file.LastWriteTimeUtc -lt [DateTime]::Parse($ui.CreatedUtc).ToUniversalTime()){throw 'La captura es anterior a esta ejecución.'}
     $bytes=[IO.File]::ReadAllBytes($file.FullName)
     if($bytes.Length -lt 8 -or [BitConverter]::ToString($bytes,0,8) -ne '89-50-4E-47-0D-0A-1A-0A'){throw 'La captura no es PNG.'}
     $path=Join-Path $folder 'captura.png';[IO.File]::WriteAllBytes($path,$bytes)
     $answers[$variant].evidence+=@{mode=$mode;path=$path;sha256=(Get-FileHash $path).Hash.ToLowerInvariant();qpc=[Diagnostics.Stopwatch]::GetTimestamp()}
    }
    if($ui.Process.HasExited -or $repeater.Process.HasExited){throw 'Un proceso terminó durante la comprobación.'}
   }catch{
    $_.Exception.Message | Out-File -Width 2147483647 (Join-Path $folder 'INVALIDA.txt') -NoClobber
    foreach($key in $answers[$variant].Keys | Where-Object {$_ -ne 'evidence'}){if($answers[$variant][$key] -eq $true){$answers[$variant][$key]=$null}}
   }finally{
    foreach($child in @($ui,$repeater)){if($null -ne $child -and -not $child.Closed){$closed=Close-VantareChild $child;if($closed.forced -or $closed.exit_code -ne 0){$answers[$variant].runtime_error='Cierre anómalo; revisión necesaria';foreach($key in @($answers[$variant].Keys | Where-Object {$_ -in @('click_through','no_focus','topmost_borderless','dpi_100','dpi_150','second_monitor','obs_transparency','exclude_from_capture')})){if($answers[$variant][$key] -eq $true){$answers[$variant][$key]=$null}}}}}
   }
  }
 }
}finally{
 foreach($variant in $answers.Keys){$answers[$variant]|ConvertTo-Json -Depth 8|Out-File -Width 2147483647 (Join-Path $out ($variant+'.json')) -NoClobber -Encoding utf8}
 $lock.Dispose();Remove-Item -LiteralPath $lockPath
}
Write-Host 'TERMINÓ corrección. Lo marcado pendiente no cuenta como aprobado. Restaura DPI 100% antes de medir.'

} finally { Exit-VantareCampaignLease $campaignLease }
