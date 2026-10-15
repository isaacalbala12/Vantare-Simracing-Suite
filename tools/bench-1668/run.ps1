param([int]$Seconds=180,
 [string]$Evidence='C:/VantareServer/evidence/bench-1668',
 [string]$Bench='C:/VantareServer/bench',
 [string]$Binaries='C:/VantareServer/targets/isa-1668/release')
$ErrorActionPreference='Stop'
$mail='C:/tmp/buzon/bench-1668.md'
$stop=Join-Path $Evidence 'STOP'
$ready=Join-Path $Evidence 'READY.json'
function State([string]$message){
 Add-Content -LiteralPath $mail -Value ((Get-Date -Format o)+' '+$message)
 Set-Content (Join-Path $Evidence 'state.txt') $message
}
function Cancelled { if(Test-Path $stop){throw 'STOP solicitado; no se inicia otra pasada'} }
function Wait-Quiet {
 $quiet=0
 while($quiet -lt 30){
  Cancelled
  if(Get-Process cargo,rustc,cargo-nextest,link,cl -ErrorAction SilentlyContinue){$quiet=0}else{$quiet+=5}
  Start-Sleep -Seconds 5
 }
}
function Wait-Session {
 while($true){
  Cancelled
  $game=Get-Process -Name 'Le Mans Ultimate' -ErrorAction SilentlyContinue
  if($game){
   try{
    $session=Invoke-RestMethod http://127.0.0.1:6397/rest/watch/sessionInfo -TimeoutSec 2
    if($null -ne $session){return $game[0]}
   }catch{}
  }
  Start-Sleep -Seconds 5
 }
}
$instanceLock=[Threading.Mutex]::new($false,'Local\VantareBench1668')
if(-not $instanceLock.WaitOne(0)){throw 'Ya existe un banco 1668 activo'}
$owned=$null; $capture=$null
try{
 State 'AVANCE: banco esperando READY.json y sesión REST LMU; no lanza juego ni toca PID 16280.'
 $null=Wait-Session
 while(-not (Test-Path $ready)){Cancelled; Start-Sleep -Seconds 5}
 $conditions=Get-Content $ready -Raw | ConvertFrom-Json
 if($conditions.condition -ne 'boxes-cockpit-idle' -or $conditions.resolution -ne '1920x1080' -or -not $conditions.widgets_verified){throw 'READY debe certificar condición, resolución y widgets reales verificados'}
 foreach($exe in @('vantare.exe','vantare-core.exe','vantare-overlays.exe')){
  while(-not(Test-Path (Join-Path $Binaries $exe))){Cancelled; Start-Sleep -Seconds 5}
 }
 $campaign=Join-Path $Evidence (Get-Date -Format 'yyyyMMdd-HHmmss')
 New-Item -ItemType Directory $campaign | Out-Null
 $conditions | ConvertTo-Json | Set-Content (Join-Path $campaign 'conditions.json')
 $artifacts=@("$Bench/vantare-layout.json","$Bench/tinypedal-profile/TinyPedal/config.json","$Bench/TinyPedal-2.51.0/TinyPedal/settings/default.json","$Bench/TinyPedal-2.51.0/TinyPedal/tinypedal.exe","$Bench/PresentMon-2.6.0-x64.exe")
 $artifacts+=@('vantare.exe','vantare-core.exe','vantare-overlays.exe') | ForEach-Object {Join-Path $Binaries $_}
 $artifacts | ForEach-Object {Get-FileHash -LiteralPath $_ -Algorithm SHA256} | Select-Object Path,Hash | ConvertTo-Json | Set-Content "$campaign/artifact-hashes.json"
 Copy-Item "$Bench/vantare-layout.json" "$campaign/vantare-layout.json"
 Copy-Item "$Bench/TinyPedal-2.51.0/TinyPedal/settings/default.json" "$campaign/tinypedal-settings.json"
 # RaceLab remains unavailable: official onboarding requires an account, explicitly excluded.
 # Preserve its scheduled position as skipped rather than measuring an idle login screen.
 $order=@('Base','Vantare','RaceLab','TinyPedal','TinyPedal','RaceLab','Vantare','Base','RaceLab','Base','TinyPedal','Vantare')
 for($i=0;$i -lt $order.Count;$i++){
  Cancelled
  $scenario=$order[$i]
  if($scenario -eq 'RaceLab'){State "AVANCE: posición $($i+1) RaceLab omitida: requiere cuenta, no autorizada."; continue}
  Wait-Quiet
  $game=Wait-Session
  if(Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.ProcessName -match '^(vantare|tinypedal|racelab)'}){throw 'Hay overlays previos activos; no se cierran procesos ajenos'}
  $folder=Join-Path $campaign ('{0:00}-{1}' -f ($i+1),$scenario)
  New-Item -ItemType Directory $folder | Out-Null
  State "AVANCE: $scenario, posición $($i+1)/12; calentamiento 30 s y captura $Seconds s. Mantener boxes/cabina/ralentí."
  try{
   if($scenario -eq 'Vantare'){
    $owned=Start-Process (Join-Path $Binaries 'vantare.exe') -ArgumentList @('--instancia','bench1668','--','--live','--','--layout',"$Bench/vantare-layout.json") -WindowStyle Hidden -PassThru -RedirectStandardOutput "$folder/overlay-out.log" -RedirectStandardError "$folder/overlay-error.log"
   }elseif($scenario -eq 'TinyPedal'){
    $oldAppData=$env:APPDATA
    try{
     $env:APPDATA="$Bench/tinypedal-profile"
     $owned=Start-Process "$Bench/TinyPedal-2.51.0/TinyPedal/tinypedal.exe" -WorkingDirectory "$Bench/TinyPedal-2.51.0/TinyPedal" -WindowStyle Hidden -PassThru
    }finally{$env:APPDATA=$oldAppData}
   }
   Start-Sleep -Seconds 30
   Cancelled
   if($owned -and $owned.HasExited){throw "Overlay terminó antes de medir: $scenario"}
   $meta=@{scenario=$scenario;position=$i+1;seconds=$Seconds;game_pid=$game.Id;utc=[DateTime]::UtcNow.ToString('o');condition=$conditions.condition}
   $meta | ConvertTo-Json | Set-Content "$folder/run.json"
   $capture=Start-Process "$Bench/PresentMon-2.6.0-x64.exe" -ArgumentList @('--process_id',$game.Id,'--output_file',"$folder/frames.csv",'--v1_metrics','--timed',$Seconds,'--terminate_after_timed','--no_console_stats','--session_name','VantareBench1668') -WindowStyle Hidden -PassThru -RedirectStandardError "$folder/presentmon-error.log" -RedirectStandardOutput "$folder/presentmon.log"
   & "$PSScriptRoot/sample.ps1" -GameId $game.Id -Output "$folder/resources.csv" -Seconds $Seconds
   if(-not $capture.WaitForExit(15000)){throw 'PresentMon no terminó a tiempo'}
   if($capture.ExitCode -ne 0){throw "PresentMon falló: $($capture.ExitCode)"}
   if($owned -and $owned.HasExited){throw 'Overlay terminó durante la captura; pasada no aceptada'}
   python "$PSScriptRoot/summarize.py" $folder > "$folder/summary.log"
   if($LASTEXITCODE -ne 0){throw 'No se pudo resumir la pasada'}
   $summary=Get-Content "$folder/summary.json" -Raw | ConvertFrom-Json
   if(-not $summary.valid){throw 'Pasada inválida: revisar builds, foco, duración y presencia del juego/overlay en summary.json'}
   python "$PSScriptRoot/report.py" $Evidence
  }finally{
   if($capture -and -not $capture.HasExited){Stop-Process -Id $capture.Id}; $capture=$null
   if($owned){
    if($scenario -eq 'Vantare'){
     Start-Process (Join-Path $Binaries 'vantare.exe') -ArgumentList @('--instancia','bench1668','--parar') -WindowStyle Hidden -Wait
    }else{ $null=$owned.CloseMainWindow() }
    if(-not $owned.WaitForExit(5000)){Stop-Process -Id $owned.Id}
    $owned=$null
   }
  }
 }
 State "AVANCE: campaña parcial capturada en $campaign; faltan RaceLab y revisión de validez, todavía no es resultado final."
}catch{
 State ('BLOQUEO: '+$_.Exception.Message)
 throw
}finally{
 python "$PSScriptRoot/report.py" $Evidence
 $instanceLock.ReleaseMutex(); $instanceLock.Dispose()
}
