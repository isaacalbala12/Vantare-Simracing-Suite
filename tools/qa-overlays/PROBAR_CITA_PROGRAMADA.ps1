#requires -Version 7
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Salida,[switch]$EjecutarCasos)
$ErrorActionPreference='Stop'
$pwsh=Join-Path $PSHOME 'pwsh.exe'
$taskName='VantareCitaEnsayo'

if($EjecutarCasos){
 $env:VANTARE_SIN_GRAFICOS='1'
 $cases=@('timeout','python310','sin-python','fuera-ventana','cancelado','cancelado-entre-pasos','zip-distinto','python313')
 $original='D:/VantareServer/evidence/overlays-rune/PREFLIGHT-VISUAL-20261119-v2.ps1'
 $source=[IO.File]::ReadAllText($original)
 $fakeSsh=@"
function ssh {
 [IO.File]::WriteAllText((Join-Path '$Salida' ('ssh-'+`$env:VANTARE_CITA_TEST)),[string]`$PID)
 switch(`$env:VANTARE_CITA_TEST){
  'timeout'{`$global:LASTEXITCODE=255;Write-Error 'Connection timed out' -ErrorAction Continue}
  'python310'{`$global:LASTEXITCODE=0;'{"python_exe":"C:/Python310/python.exe","python_version":"3.10.14"}'}
  'sin-python'{`$global:LASTEXITCODE=1;Write-Error 'Python >=3.11 con Pillow y numpy no encontrado' -ErrorAction Continue}
  default{
   if(`$env:VANTARE_CITA_TEST -eq 'cancelado-entre-pasos'){
    New-Item -ItemType File -Path (Join-Path '$Salida' 'cancelado-entre-pasos/CITA-CANCELAR')|Out-Null
   }
   `$global:LASTEXITCODE=0
   '{"python_exe":"C:/Program Files/Python313/python.exe","python_version":"3.13.16","session_id":2}'
  }
 }
}
"@
 $kit=Join-Path $Salida 'staging'
 $zip='D:/VantareServer/evidence/overlays-rune/kit-visual-20261118-be17532a-44216020723.zip'
 [IO.Compression.ZipFile]::ExtractToDirectory($zip,$kit)
 $sha='be17532a5817371bc44ed181512172003b0c57ce'
 $zipSha='2c326a8d64ad506789acb363a637999e3982293aca0ab842b434403542bfaae1'
 $log=Join-Path $Salida 'ensayo.log'
 Add-Content -LiteralPath $log "Inicio real de la tarea UTC $([DateTimeOffset]::UtcNow.ToString('o')) PID $PID; VANTARE_SIN_GRAFICOS=1; SSH falso."
 try{
  foreach($case in $cases){
   $root=New-Item -ItemType Directory -Path (Join-Path $Salida $case)
   $now=[DateTimeOffset]::UtcNow
   $from=$now.AddMinutes(-1)
   $start=$now.AddSeconds(30)
   if($case -eq 'fuera-ventana'){$from=$now.AddMinutes(-10);$start=$now.AddMinutes(-5)}
   $format="yyyy-MM-ddTHH:mm:ss'Z'"
   $fromUtc=$from.ToString($format);$startUtc=$start.ToString($format)
   $preflight=Join-Path $root 'PREFLIGHT-VISUAL-ENSAYO-v2.ps1'
   $preflightSource=$source.Replace('$kit=Join-Path $PSScriptRoot ''staging-visual-cita-20261119''',('$kit=''{0}''' -f $kit))
   $preflightSource=$preflightSource.Replace('2026-11-19T00:55:00Z',$fromUtc).Replace('2026-11-19T01:00:00Z',$startUtc)
   $preflightSource=$preflightSource.Replace('$PSScriptRoot',"'D:/VantareServer/evidence/overlays-rune'").Replace('$remote=@''',$fakeSsh+[Environment]::NewLine+'$remote=@''')
   if(-not $preflightSource.Contains($fakeSsh)){throw 'No se instaló el SSH falso; no ejecutar preflight'}
   [IO.File]::WriteAllText($preflight,$preflightSource)
   $config=Join-Path $root 'cita.json'
   [ordered]@{
    preflight_utc=$fromUtc; visual_utc=$startUtc; source_sha=$sha
    zip_sha256=if($case -eq 'zip-distinto'){'0'*64}else{$zipSha}
    preflight_sha256=(Get-FileHash -LiteralPath $preflight).Hash.ToLowerInvariant()
    output=$root.FullName; preflight=$preflight; zip=$zip; kit=$kit
   }|ConvertTo-Json | Set-Content -LiteralPath $config
   if($case -eq 'cancelado'){New-Item -ItemType File -Path (Join-Path $root 'CITA-CANCELAR')|Out-Null}
   $env:VANTARE_CITA_TEST=$case
   $out=@(& $pwsh -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'LANZAR-CITA.ps1') -Cita $config -CitaSha256 (Get-FileHash -LiteralPath $config).Hash 2>&1)
   $exit=$LASTEXITCODE
   $result=Get-ChildItem -LiteralPath $root -Filter 'RESULTADO-CITA-*.json' | Get-Content -Raw | ConvertFrom-Json
   $summary=Get-ChildItem -LiteralPath $root -Filter 'RESULTADO-CITA-*.txt' | Get-Content -Raw
   $contact=Test-Path -LiteralPath (Join-Path $Salida "ssh-$case")
   $expectContact=$case -notin @('fuera-ventana','cancelado','zip-distinto')
   if($contact -ne $expectContact){throw "Contacto SSH falso inesperado en $case : $($result.reason) / $($out -join ' ')"}
   if($contact){
    $sshPid=[int](Get-Content -LiteralPath (Join-Path $Salida "ssh-$case"))
    if(Get-Process -Id $sshPid -ErrorAction SilentlyContinue){throw "Preflight propio sigue vivo: PID $sshPid"}
   }
   $expectedPreflight=if($case -in @('timeout','python310','sin-python')){1}elseif($expectContact){0}else{$null}
   if($result.preflight_exit -ne $expectedPreflight -or $result.source_sha -ne $sha -or $result.zip_expected -ne (Get-Content -LiteralPath $config -Raw|ConvertFrom-Json).zip_sha256 -or -not $summary -or -not(Test-Path -LiteralPath $result.log)){
    throw "Recibo incompleto para $case : $($out -join ' ')"
   }
   if($case -eq 'python313'){
    if($exit -ne 0 -or $result.status -ne 'ENSAYADO' -or $result.tanda_exit -ne 0 -or $result.python_version -ne '3.13.16'){throw "Ensayo positivo falló: $($out -join ' ') / $($result.reason)"}
    $dry=Get-Content -LiteralPath (Join-Path $root 'ensayo/ensayo.json') -Raw|ConvertFrom-Json
    if($dry.guard_code -ne 6 -or $dry.gpu_executed -or $dry.shutdown_executed -or $dry.measurements -ne 0){throw 'No se cumplió el guard durante el ensayo'}
   }elseif($exit -eq 0 -or $result.status -ne 'ABORTADO' -or $null -ne $result.tanda_exit){
    throw "No se abortó limpiamente en $case"
   }
   $expectedReason=switch($case){
    'timeout'{'Preflight rechazado'}
    'python310'{'Preflight rechazado'}
    'sin-python'{'Preflight rechazado'}
    'fuera-ventana'{'Fuera de la ventana de preflight'}
    'cancelado'{'CITA-CANCELAR activo'}
    'cancelado-entre-pasos'{'CITA-CANCELAR activo'}
    'zip-distinto'{'SHA-256 del ZIP distinto'}
   }
   if($result.reason -cne $expectedReason){throw "Motivo inesperado de $case : $($result.reason)"}
   if($result.preflight_exit -eq 1 -and -not (Select-String -LiteralPath $result.log -SimpleMatch 'Preflight SSH rechazado: no copiar, lanzar ni apagar' -Quiet)){
    throw "Faltó el mensaje fijo para $case"
   }
   Add-Content -LiteralPath $log ("PASS {0} exit={1} preflight={2} tanda={3} ssh={4} motivo={5}" -f $case,$exit,$result.preflight_exit,$result.tanda_exit,$contact,$result.reason)
  }
  Add-Content -LiteralPath $log 'PASS todos los casos; no quedan hijos de preflight; guard 6 confirmado en TANDA Ensayo.'
  Set-Content -LiteralPath (Join-Path $Salida 'fin.txt') 'PASS'
 }catch{
  Add-Content -LiteralPath $log ("FAIL: "+($_|Out-String))
  Set-Content -LiteralPath (Join-Path $Salida 'fin.txt') 'FAIL'
  exit 1
 }
 return
}

. (Join-Path $PSScriptRoot 'TAREA-CITA.ps1')
if(Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue){throw 'Existe ya VantareCitaEnsayo'}
if(Test-Path -LiteralPath $Salida){throw 'La salida del ensayo debe ser nueva'}
$Salida=(New-Item -ItemType Directory -Path $Salida).FullName
$at=[DateTime]::Now.AddMinutes(3)
$action=New-ScheduledTaskAction -Execute $pwsh -Argument ('-NoProfile -NonInteractive -File "{0}" -Salida "{1}" -EjecutarCasos' -f $PSCommandPath,$Salida)
$definition=New-CitaTaskDefinition $action $at ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -SinRed
$registered=$false
try{
 Register-ScheduledTask -TaskName $taskName -InputObject $definition -ErrorAction Stop|Out-Null
 $registered=$true
 $until=$at.AddMinutes(5)
 do{
  Start-Sleep -Seconds 2
  $finished=Test-Path -LiteralPath (Join-Path $Salida 'fin.txt')
  $running=(Get-ScheduledTask -TaskName $taskName).State -eq 'Running'
 } until(($finished -and -not $running) -or [DateTime]::Now -ge $until)
 $stats=Get-ScheduledTaskInfo -TaskName $taskName
 if(-not $finished -or $running -or $stats.LastTaskResult -ne 0 -or (Get-Content -LiteralPath (Join-Path $Salida 'fin.txt')) -cne 'PASS'){
  throw "Ensayo no aprobado: Programador de tareas devolvió $($stats.LastTaskResult)"
 }
 Add-Content -LiteralPath (Join-Path $Salida 'ensayo.log') "PASS Programador de tareas real: LastRunTime=$($stats.LastRunTime.ToString('o')) LastTaskResult=$($stats.LastTaskResult)"
}finally{
 if($registered){
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
  if(Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue){throw 'No se retiró la tarea de ensayo'}
  Add-Content -LiteralPath (Join-Path $Salida 'ensayo.log') 'PASS tarea de ensayo retirada'
 }
}
