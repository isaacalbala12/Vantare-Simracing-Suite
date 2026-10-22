param([int]$Seconds=180,[switch]$CheckOnly)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
if($CheckOnly){
 foreach($file in @('sample.ps1','PresentMon.exe','Vantare/vantare.exe','Vantare/vantare-core.exe','Vantare/vantare-overlays.exe','config/vantare-layout.json','config/tinypedal-settings.json')){
  if(-not(Test-Path (Join-Path $root $file))){throw "Falta $file"}
 }
 if(Test-Path "$root/package-manifest.json"){
  foreach($record in (Get-Content "$root/package-manifest.json" -Raw | ConvertFrom-Json)){
   if((Get-FileHash -LiteralPath (Join-Path $root $record.file)).Hash -ne $record.sha256){throw "Archivo del kit alterado/incompleto: $($record.file)"}
  }
 }
 Write-Output 'Kit completo: archivos esenciales presentes. No se ha abierto ninguna app.'
 return
}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=New-Object Security.Principal.WindowsPrincipal($identity)
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
 Start-Process powershell -Verb RunAs -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'))
 exit
}
$mutex=New-Object Threading.Mutex($false,'Local\VantareBench1668Kit')
if(-not $mutex.WaitOne(0)){throw 'Ya hay otra prueba del kit en marcha'}
$owned=@();$launchRoot=0;$capture=$null;$campaign=$null;$oldAppData=$env:APPDATA
function Ask([string]$Question,[string]$Default=''){
 $answer=Read-Host "$Question [$Default]"
 if([string]::IsNullOrWhiteSpace($answer)){return $Default};return $answer
}
function Download([string]$Url,[string]$Destination,[string]$Hash){
 if(-not(Test-Path $Destination)){
  [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  $ProgressPreference='SilentlyContinue'
  Invoke-WebRequest -UseBasicParsing $Url -OutFile $Destination
 }
 if((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -ne $Hash){throw "Hash incorrecto: $Destination. No se ejecuta; puede haber cambiado la descarga oficial."}
}
function OverlayProcesses {
 @(Get-Process | Where-Object {$_.ProcessName -match '^(vantare|tinypedal|racelab)'})
}
function RememberOwned([datetime]$After){
 if(-not $script:launchRoot){$script:owned=@();return}
 $tree=@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId)
 $ids=New-Object 'Collections.Generic.HashSet[int]'
 $null=$ids.Add($script:launchRoot)
 foreach($known in $script:owned){$null=$ids.Add($known.Id)}
 do{
  $changed=$false
  foreach($row in $tree){if($ids.Contains([int]$row.ParentProcessId) -and $ids.Add([int]$row.ProcessId)){$changed=$true}}
 }while($changed)
 $script:owned=@(Get-Process | Where-Object {try{$ids.Contains($_.Id) -and $_.StartTime -ge $After}catch{$false}} | ForEach-Object {
  [pscustomobject]@{Id=$_.Id;Started=$_.StartTime}
 })
}
function CloseOwned {
 foreach($item in $script:owned){
  try{
   $p=Get-Process -Id $item.Id -ErrorAction SilentlyContinue
   if($p -and $p.StartTime -eq $item.Started){$null=$p.CloseMainWindow()}
  }catch{Write-Warning "No se pudo pedir cierre al proceso propio $($item.Id): $($_.Exception.Message)"}
 }
 Start-Sleep -Seconds 3
 foreach($item in $script:owned){
  try{
   $p=Get-Process -Id $item.Id -ErrorAction SilentlyContinue
   if($p -and $p.StartTime -eq $item.Started){Stop-Process -Id $p.Id}
  }catch{Write-Warning "No se pudo cerrar el proceso propio $($item.Id): $($_.Exception.Message)"}
 }
 $script:owned=@()
 $script:launchRoot=0
}
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class BenchForeground {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window,out uint processId);
}
'@
function WaitGameFocus([int]$GameId){
 Write-Host 'Vuelve a LMU. La prueba empieza cuando LMU lleve 5 segundos en primer plano.' -ForegroundColor Cyan
 $stable=0
 while($stable -lt 5){
  if(Test-Path "$root/STOP"){throw 'STOP solicitado'}
  if(-not(Get-Process -Id $GameId -ErrorAction SilentlyContinue)){throw 'LMU se ha cerrado; conservar resultados parciales'}
  [uint32]$foreground=0
  $null=[BenchForeground]::GetWindowThreadProcessId([BenchForeground]::GetForegroundWindow(),[ref]$foreground)
  if($foreground -eq $GameId){$stable++}else{$stable=0}
  Start-Sleep -Seconds 1
 }
}
try{
 if(Test-Path "$root/STOP"){throw 'Existe STOP de una ejecución anterior; bórralo si quieres comenzar otra campaña'}
 Write-Host 'VANTA-89: prueba en TU PC DE JUEGO. No se inicia LMU ni se crean cuentas o pagos.' -ForegroundColor Cyan
 Write-Host 'Primero configura los overlays; durante las pasadas se mostrará un solo producto. No se hacen capturas de pantalla.'
 $null=& $PSCommandPath -CheckOnly
 $tinyArchive="$root/TinyPedal-2.51.0-windows.zip"
 Download 'https://github.com/TinyPedal/TinyPedal/releases/download/v2.51.0/TinyPedal-2.51.0-windows.zip' $tinyArchive 'D3BDA2D87888ED0B7633C7E183C6E21277C76850EA2AB47FD80461107817147B'
 if(-not(Test-Path "$root/TinyPedal/TinyPedal/tinypedal.exe")){Expand-Archive -LiteralPath $tinyArchive -DestinationPath "$root/TinyPedal"}
 $tinyDir="$root/TinyPedal/TinyPedal"
 Write-Host 'RaceLab: descarga oficial https://racelab.app/ (botón Get RaceLab Free). No se redistribuye su instalador.'
 Write-Host 'Con LMU CERRADO: Settings -> Game Setup -> Configure LMU. Guía: https://garage.racelab.app/docs/first-steps/lmu/'
 Write-Host 'No crees cuentas ni elijas planes de pago. Si exige cuenta o no puedes usar overlays gratuitos, responde N; sus pasadas quedarán omitidas.'
 $raceAvailable=(Ask '¿RaceLab está instalado y puedes usarlo gratis sin crear cuenta, con plugin LMU configurado?' 'N') -eq 'S'
 $raceExe=''
 if($raceAvailable){
  $candidate=Join-Path $env:LOCALAPPDATA 'RacelabApps/RacelabApps.exe'
  $raceExe=Ask 'Ruta completa de RacelabApps.exe' $candidate
  if(-not(Test-Path -LiteralPath $raceExe)){throw 'No existe el ejecutable RaceLab indicado'}
 }
 Add-Type -AssemblyName System.Windows.Forms
 $screen=[Windows.Forms.Screen]::PrimaryScreen.Bounds
 $width=[int](Ask 'Ancho de resolución del juego, igual durante toda la prueba' ([string]$screen.Width))
 $height=[int](Ask 'Alto de resolución del juego' ([string]$screen.Height))
 if($width -lt 800 -or $height -lt 600){throw 'Resolución inválida'}
 $four=(Ask '¿Los TRES productos ofrecen gratis Standings, Relative, Delta y Pedals con datos? S=4 widgets, N=solo Standings y Relative' 'N') -eq 'S'
 $kinds=@('standings','relative');$tinyNames=@('standings','relative')
 if($four){$kinds+=@('delta','pedals');$tinyNames+=@('deltabest','pedal')}
 $layout=Get-Content "$root/config/vantare-layout.json" -Raw | ConvertFrom-Json
 $layout.instances=@($layout.instances | Where-Object {$kinds -contains $_.settings.kind})
 foreach($instance in $layout.instances){$instance.x=$instance.x*$width/1920;$instance.y=$instance.y*$height/1080}
 $layout.canvasResolution.width=$width;$layout.canvasResolution.height=$height
 $data="$root/data";New-Item -ItemType Directory -Force "$data/TinyPedal","$tinyDir/settings" | Out-Null
 $layout | ConvertTo-Json -Depth 20 | Set-Content "$data/vantare-layout.json" -Encoding UTF8
 $tiny=Get-Content "$root/config/tinypedal-settings.json" -Raw | ConvertFrom-Json
 foreach($prop in $tiny.PSObject.Properties){
  if($prop.Value.PSObject.Properties.Name -contains 'enable'){$prop.Value.enable=($tinyNames -contains $prop.Name)}
  if($prop.Value.PSObject.Properties.Name -contains 'position_x'){$prop.Value.position_x=[int]($prop.Value.position_x*$width/1920);$prop.Value.position_y=[int]($prop.Value.position_y*$height/1080)}
 }
 $tiny | ConvertTo-Json -Depth 20 | Set-Content "$tinyDir/settings/default.json" -Encoding UTF8
 @{application=@{show_at_startup=$false;check_for_updates_on_startup=$false};user_path=@{settings_path=($tinyDir.Replace('\','/')+'/settings/')}} | ConvertTo-Json -Depth 5 | Set-Content "$data/TinyPedal/config.json" -Encoding UTF8
 # Rust/Qt expect UTF-8 without BOM; Windows PowerShell 5 writes a BOM by default.
 foreach($file in @("$data/vantare-layout.json","$tinyDir/settings/default.json","$data/TinyPedal/config.json")){
  $content=[IO.File]::ReadAllText($file);[IO.File]::WriteAllText($file,$content,(New-Object Text.UTF8Encoding($false)))
 }
 $mode=Ask 'Modo: PISTA (conducción constante) o BOXES (cabina, parado, ralentí)' 'PISTA'
 if($mode -notin @('PISTA','BOXES')){throw 'El modo debe ser PISTA o BOXES'}
 $track=Ask 'Pista que usarás durante TODAS las pasadas' ''
 if(-not $track){throw 'Debes indicar la pista'}
 $notes=Ask 'Anota Hypercar, IA, clima, gráficos, VSync y límite FPS para repetirlos' ''
 Write-Host "Configura RaceLab con SOLO $($kinds -join ', ') y coloca los widgets como Vantare/TinyPedal: standings arriba izquierda, relative arriba derecha, delta arriba centro, pedals abajo derecha. Cierra todos los overlays al acabar."
 Write-Host 'Abre tú LMU: práctica Hypercar, misma pista, hora, clima, IA, cámara y gráficos; modo sin bordes. Enable Plugins ON. No cambies ajustes durante las pasadas.'
 Write-Host 'Haz una vuelta de preparación para que Delta tenga referencia. Después vuelve aquí. Si no puedes igualar los widgets, cancela: no certifiques equivalencia.'
 if((Ask '¿Estás listo para comprobar los widgets con datos al inicio de cada toma y mantener la condición elegida?' 'N') -ne 'S'){throw 'Preparación/validación pendiente; no se inicia la campaña'}
 $campaign=Join-Path $root ('resultados-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
 New-Item -ItemType Directory $campaign | Out-Null
 $manifest=@{schema=1;source='VANTA-89 / #1668';utc=[DateTime]::UtcNow.ToString('o');seconds=$Seconds;mode=$mode;track=$track;notes=$notes;resolution=@{width=$width;height=$height};widgets=$kinds;race_available=$raceAvailable;vantare_source='ed66924c29299d78cb78a0125ecb5e2ab83ef049';order=@('Base','Vantare','RaceLab','TinyPedal','TinyPedal','RaceLab','Vantare','Base','RaceLab','Base','TinyPedal','Vantare')}
 $manifest.hardware=@{cpu=@(Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors);os=(Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,TotalVisibleMemorySize);gpu=@(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion)}
 $manifest | ConvertTo-Json -Depth 12 | Set-Content "$campaign/campaign.json" -Encoding UTF8
 Copy-Item "$data/vantare-layout.json" "$campaign/vantare-layout.json"
 Copy-Item "$tinyDir/settings/default.json" "$campaign/tinypedal-settings.json"
 $hashes=@();foreach($file in @('PresentMon.exe','Vantare/vantare.exe','Vantare/vantare-core.exe','Vantare/vantare-overlays.exe','TinyPedal/TinyPedal/tinypedal.exe')){$hashes+=@{name=$file;sha256=(Get-FileHash -LiteralPath (Join-Path $root $file)).Hash}}
 if($raceAvailable){$hashes+=@{name='RaceLab';sha256=(Get-FileHash -LiteralPath $raceExe).Hash;version=(Get-Item -LiteralPath $raceExe).VersionInfo.FileVersion}}
 $hashes | ConvertTo-Json | Set-Content "$campaign/hashes.json" -Encoding UTF8
 $order=$manifest.order
 for($i=0;$i -lt $order.Count;$i++){
  if(Test-Path "$root/STOP"){throw 'STOP solicitado'}
  $scenario=$order[$i];$folder=Join-Path $campaign ('{0:00}-{1}' -f ($i+1),$scenario);New-Item -ItemType Directory $folder | Out-Null
  $metadata=@{scenario=$scenario;position=$i+1;seconds=$Seconds;mode=$mode;status='pending'}
  if($scenario -eq 'RaceLab' -and -not $raceAvailable){$metadata.status='skipped';$metadata.reason='No disponible sin cuenta/plugin/configuración gratuita';$metadata | ConvertTo-Json | Set-Content "$folder/run.json" -Encoding UTF8;continue}
  Write-Host "`nPASADA $($i+1)/12: LMU + $scenario en $track. Se medirá $Seconds segundos tras 30 de calentamiento." -ForegroundColor Yellow
  if($mode -eq 'PISTA'){Write-Host "Ahora rueda a ritmo constante en ${track}: 30 s de calentamiento y $([math]::Round($Seconds/60,2)) minutos de captura. Evita trompos, boxes, menús y cambios de cámara. Sigue hasta el pitido y vuelve aquí."}
  else{Write-Host 'Permanece parado en TU BOX, cabina, motor al ralentí, sin pausa ni menús. Al pitido vuelve aquí.'}
  while(OverlayProcesses){$null=Read-Host 'Hay overlays abiertos. Ciérralos tú (incluido Hub) y pulsa Intro. Nunca se cierran procesos ajenos automáticamente'}
  while(Get-Process cargo,rustc,cargo-nextest,link,cl -ErrorAction SilentlyContinue){$null=Read-Host 'Hay compilaciones/tests activos. Espera a que terminen y pulsa Intro'}
  $game=@(Get-Process -Name 'Le Mans Ultimate' -ErrorAction SilentlyContinue)
  if($game.Count -ne 1){throw 'Se requiere exactamente un proceso LMU ya abierto por Isaac'}
  $gameId=$game[0].Id;$started=Get-Date;$launchRoot=0
  $metadata.game_pid=$gameId;$metadata.utc=[DateTime]::UtcNow.ToString('o')
  try{
   if($scenario -eq 'Vantare'){
    $launched=Start-Process "$root/Vantare/vantare.exe" -ArgumentList @('--instancia','bench1668kit','--','--live','--','--layout',('"'+"$data/vantare-layout.json"+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput "$folder/overlay-out.log" -RedirectStandardError "$folder/overlay-error.log"
    $launchRoot=$launched.Id
   }elseif($scenario -eq 'TinyPedal'){
    $env:APPDATA=$data
    try{$launched=Start-Process "$tinyDir/tinypedal.exe" -WorkingDirectory $tinyDir -WindowStyle Hidden -PassThru;$launchRoot=$launched.Id}finally{$env:APPDATA=$oldAppData}
   }elseif($scenario -eq 'RaceLab'){
    $launched=Start-Process -FilePath $raceExe -WindowStyle Minimized -PassThru;$launchRoot=$launched.Id
   }
   Start-Sleep -Seconds 2;RememberOwned $started
   $null=Read-Host 'Comprueba widgets visibles/con datos (en Base ninguno). Pulsa Intro y vuelve a LMU para comenzar. Si no funcionan, Ctrl+C y no certifiques esta pasada'
   WaitGameFocus $gameId
   Start-Sleep -Seconds 30
   RememberOwned $started
   if($scenario -ne 'Base' -and $owned.Count -eq 0){throw 'Overlay ausente antes de capturar'}
   $images=@(foreach($item in $owned){
    $p=Get-Process -Id $item.Id -ErrorAction SilentlyContinue
    if($p -and $p.Path){@{name=$p.ProcessName;file=[IO.Path]::GetFileName($p.Path);version=(Get-Item -LiteralPath $p.Path).VersionInfo.FileVersion;sha256=(Get-FileHash -LiteralPath $p.Path).Hash}}
   })
   ConvertTo-Json -InputObject $images | Set-Content "$folder/process-images.json" -Encoding UTF8
   $capture=Start-Process "$root/PresentMon.exe" -ArgumentList @('--process_id',$gameId,'--output_file',('"'+"$folder/frames.csv"+'"'),'--v1_metrics','--timed',$Seconds,'--terminate_after_timed','--no_console_stats','--session_name','VantareBench1668Kit') -WindowStyle Hidden -PassThru -RedirectStandardOutput "$folder/presentmon.log" -RedirectStandardError "$folder/presentmon-error.log"
   & "$root/sample.ps1" -GameId $gameId -Output "$folder/resources.csv" -Seconds $Seconds
   if(-not $capture.WaitForExit(15000)){throw 'PresentMon no terminó'}
   if($capture.ExitCode -ne 0){throw "PresentMon falló ($($capture.ExitCode))"}
   $metadata.status='complete'
  }catch{$metadata.status='failed';$metadata.reason=$_.Exception.Message;throw}
  finally{
   $metadata | ConvertTo-Json | Set-Content "$folder/run.json" -Encoding UTF8
   if($capture -and -not $capture.HasExited){Stop-Process -Id $capture.Id};$capture=$null
   RememberOwned $started;CloseOwned
  }
  try{[Console]::Beep(1000,500)}catch{}
  $incident=Ask '¿Hubo trompo, menú, cambio de ajustes, datos congelados u otro incidente? S/N' 'N'
  if($incident -eq 'S'){$metadata.status='invalid-human';$metadata.reason=Ask 'Describe el incidente' 'Incidente comunicado por Isaac';$metadata | ConvertTo-Json | Set-Content "$folder/run.json" -Encoding UTF8}
 }
 Write-Host 'Pasadas terminadas. Las omisiones/errores se conservarán como tales; no se inventan resultados.' -ForegroundColor Green
}catch{
 Write-Host ('Prueba detenida: '+$_.Exception.Message) -ForegroundColor Red
 if($campaign){$_.Exception.Message | Set-Content "$campaign/error.txt"}
}finally{
 $env:APPDATA=$oldAppData
 CloseOwned
 if($campaign){
  $zip="$campaign.zip"
  Compress-Archive -Path "$campaign/*" -DestinationPath $zip -Force
  Write-Host "RESULTADOS PARA TRAER AL SERVIDOR: $zip" -ForegroundColor Cyan
  (Get-FileHash -LiteralPath $zip).Hash | Set-Content "$zip.sha256.txt"
 }
 $mutex.ReleaseMutex();$mutex.Dispose()
 if(-not $CheckOnly){$null=Read-Host 'Pulsa Intro para cerrar'}
}
