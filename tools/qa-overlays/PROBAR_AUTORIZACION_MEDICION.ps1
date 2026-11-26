#requires -Version 7
$ErrorActionPreference='Stop'
. "$PSScriptRoot/TANDA.ps1" -SoloFunciones
$now=[DateTimeOffset]'2026-11-27T01:45:00Z'
foreach($until in '', '2026-11-27T01:45:00Z', '2026-11-27T01:44:59Z', '2026-11-27T13:45:01Z', '2026-11-27T04:00:00+00:00'){
 $blocked=$false
 try{$null=Assert-TandaMeasurementDeadline $until $now}catch{$blocked=$_.Exception.Message -like 'BLOCKED_MEASUREMENT_AUTHORIZATION*'}
 if(-not $blocked){throw "Autorización inválida aceptada: $until"}
}
$approved=Assert-TandaMeasurementDeadline '2026-11-27T04:00:00Z' $now
if($approved -ne [DateTimeOffset]'2026-11-27T04:00:00Z'){throw 'Vencimiento correcto rechazado'}
foreach($mode in 'Servidor','Trabajador','Apagar'){
 $out=@(& (Join-Path $PSHOME 'pwsh.exe') -NoProfile -NonInteractive -File "$PSScriptRoot/TANDA.ps1" -Modo $mode 2>&1)
 if($LASTEXITCODE -eq 0 -or ($out -join ' ') -notlike '*BLOCKED_MEASUREMENT_AUTHORIZATION*'){throw "Modo $mode sin autorización no rechazado"}
}
if((Get-Content -LiteralPath "$PSScriptRoot/LANZAR-CITA.ps1" -Raw).Contains('MedicionAutorizadaHasta')){
 throw 'El lanzador automático intenta autorizar la medición'
}
$scratch=Join-Path ([IO.Path]::GetTempPath()) ('vantare-autorizacion-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory $scratch
$script:trace=[Collections.Generic.List[string]]::new()
$script:behavior='valid'
$script:pcSimulado=Join-Path $scratch 'pc-simulado'
$script:CorpusQA=Join-Path $scratch 'corpus.tar.gz'
Set-Content -LiteralPath $CorpusQA 'Replay de prueba'
$cli=Join-Path $scratch 'bin/vantare-qa-license.exe'
$null=New-Item -ItemType Directory (Split-Path $cli -Parent)
Set-Content -LiteralPath $cli 'CLI FALSO'
$cliHash=(Get-FileHash -LiteralPath $cli).Hash.ToLowerInvariant()
$script:signed=Join-Path $scratch 'credential-signed.json'
$context=@{registry=('qa-d0143296:'+('A'*43));license=@{key_id='qa-d0143296';cli_sha256=$cliHash}
 authorization=@{valid_to_utc='vigente';checked_utc='comprobado';key_id='qa-d0143296';zip_sha256='c'*64}}
function Invoke-TandaSsh {param($Target,$Code)
 if($Code -like '* fingerprint*'){
  $script:trace.Add('huella')
  if($script:behavior -eq 'bad-fingerprint'){return 'incorrecta'}
  return 'a'*64
 }
 if($Code -match 'registry\.txt'){$script:trace.Add('registro');return ''}
 throw 'Transporte inesperado'
}
function New-TandaSignedCredential {param($Image,$Fingerprint,$ApprovedKeyId,$CliSha256)
 if($Fingerprint -cne ('a'*64) -or $CliSha256 -cne $cliHash -or $ApprovedKeyId -cne 'qa-d0143296'){
  throw 'Firma recibió datos inválidos'
 }
 $script:trace.Add('firma')
 if($script:behavior -eq 'bad-sign'){throw 'Fallo de firma simulado'}
 Set-Content -LiteralPath $script:signed '{"key_id":"qa-d0143296"}'
 $script:signed
}
function scp {
 if($args -contains '-r'){$script:trace.Add('kit')}
 elseif($args[-2] -eq $script:signed){
  $script:trace.Add('credencial')
  if(Test-Path -LiteralPath $script:pcSimulado){Copy-Item -LiteralPath $script:signed -Destination (Join-Path $script:pcSimulado 'credential.json')}
 }
 elseif($args[-2] -eq $script:CorpusQA){
  $script:trace.Add('corpus')
  if(Test-Path -LiteralPath $script:pcSimulado){Copy-Item -LiteralPath $script:CorpusQA -Destination (Join-Path $script:pcSimulado 'corpus.tar.gz')}
 }
 elseif($args[-2] -like '*evidence.tar'){$script:trace.Add('evidencia');Copy-Item -LiteralPath $script:fakeTar -Destination $args[-1]}
 else{throw 'Se intentó transferir un fichero fuera del contrato de medición'}
 $global:LASTEXITCODE=0
}
$remote='C:/VantareQA/tanda-20261127T014500Z'
foreach($case in 'bad-fingerprint','bad-sign','valid'){
 $script:behavior=$case;$script:trace.Clear()
 $failure=$null
 try{$licenseArgs=New-TandaRemoteMeasurement $scratch $remote $context}catch{$failure=$_.Exception.Message}
 if($case -eq 'valid'){
  if($failure -or $licenseArgs -cne "$remote/measurement-qa" -or
     ($script:trace -join ',') -cne 'huella,firma,registro,credencial,corpus'){throw "Flujo de licencia incompleto: $failure"}
 }elseif(-not $failure -or $script:trace.Contains('credencial') -or $script:trace.Contains('corpus')){
  throw 'Se transfirió material tras una huella o firma inválida'
 }
 if(Test-Path -LiteralPath $script:signed){throw 'Quedó la credencial temporal del servidor'}
}
$script:behavior='valid'
$manifest=@{source_sha='a'*40;measurements=@(1..48|ForEach-Object {@{id="round-$_"}});qa_license=$context.license;
 external_corpus=@{sha256=(Get-FileHash -LiteralPath $CorpusQA).Hash.ToLowerInvariant()}}
$context.license.registry_sha256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::ASCII.GetBytes($context.registry))).ToLowerInvariant()
function Assert-TandaInputs {param($Root) $manifest}
function Assert-TandaPython {param($Path,[switch]$SyntaxOnly)}
function Assert-TandaWindow {param($From,$Until)}
function Get-TandaSamplerDefinitions {param($Kit,$Output,$Task,$Cases) @()}
function Start-Sleep {param($Seconds)}
$script:MedicionAutorizadaHasta=[DateTimeOffset]::UtcNow.AddHours(1).ToString("yyyy-MM-ddTHH:mm:ss'Z'")
$script:NoAntesUtc='2026-11-27T01:45:00Z'
$script:LimiteUtc='2026-11-27T03:45:00Z'
$script:fakeTar=Join-Path $scratch 'result.tar'
function Invoke-TandaSsh {param($Target,$Code)
 if($Code -like '*Win32_ComputerSystem*'){return '{"user":"PC\\isaac","sessions":[1]}'}
 if($Code -like '* fingerprint*'){
  $script:trace.Add('huella')
  if($script:behavior -eq 'bad-fingerprint'){return 'incorrecta'}
  return 'a'*64
 }
 if($Code -like '*QA_PROFILE_CLEANUP*'){
  foreach($name in 'credential.json','registry.txt','corpus.tar.gz'){
   $path=Join-Path $script:pcSimulado $name
   if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path}
  }
  if(Test-Path -LiteralPath $script:pcSimulado){Remove-Item -LiteralPath $script:pcSimulado}
  $script:trace.Add('limpiar');return ''
 }
 if($Code -like '*registry.txt*'){
  $null=New-Item -ItemType Directory $script:pcSimulado
  [IO.File]::WriteAllText((Join-Path $script:pcSimulado 'registry.txt'),$context.registry)
  $script:trace.Add('registro');return ''
 }
 if($Code -like '*Unregister-ScheduledTask*'){$script:trace.Add('retirar');return ''}
 if($Code -like '*Register-ScheduledTask*'){
  if(-not $script:trace.Contains('credencial') -or -not $script:trace.Contains('corpus') -or
     $Code -notlike '*-MedicionAutorizadaHasta*' -or $Code -notlike '*-SesionMedicionQA*'){throw 'Trabajador sin autorización, credencial o corpus'}
  $license=Read-TandaMeasurementFiles $scratch $script:pcSimulado $manifest
  if($license.key_id -cne 'qa-d0143296' -or $license.credential -cne (Join-Path $script:pcSimulado 'credential.json')){
   throw 'El trabajador no recibió la credencial QA transferida'
  }
  $script:trace.Add('trabajador')
  $remoteEvidence=Join-Path $scratch ([guid]::NewGuid().ToString('N'))
  $null=New-Item -ItemType Directory $remoteEvidence
  $complete=$script:behavior -eq 'valid'
  $state=@{scope='measurement-qa';source_sha=$manifest.source_sha;completed_without_error=$complete;
   status=if($complete){'complete'}else{'aborted'};captures=@();measurements=if($complete){@($manifest.measurements|ForEach-Object {@{id=$_.id;status='complete'}})}else{@()}}
  Write-TandaJson $state (Join-Path $remoteEvidence 'estado.json')
  Write-TandaEvidenceHashes $remoteEvidence
  & tar -cf $script:fakeTar -C $remoteEvidence .
  if($LASTEXITCODE){throw 'Falló el tar del PC simulado'}
  return ''
 }
 if($Code -like 'Test-Path*evidence-hashes.json*'){return 'True'}
 if($Code -like '*tar -cf*'){return (Get-FileHash -LiteralPath $script:fakeTar).Hash}
 if($Code -like '*Set-Content*copia-servidor.json*'){
  if(-not $script:trace.Contains('limpiar')){throw 'ACK antes de retirar la credencial'}
  $script:trace.Add('ack');return ''
 }
 if($Code -like '*Set-ScheduledTask*'){$script:trace.Add('apagar');return ''}
 if($Code -like '*apagado.json*'){return '{"accepted":true}'}
 if($Code -like '*New-Item*VantareQA*'){return ''}
 throw 'Transporte inesperado en coordinador'
}
foreach($case in 'valid','bad-fingerprint','bad-sign','bad-install','missing-binding','changed-profile'){
 $script:behavior=$case;$script:trace.Clear()
 $script:DestinoServidor=Join-Path $scratch $case
 $null=New-Item -ItemType Directory $DestinoServidor
 $failure=$null
 try{Invoke-TandaServer $scratch $context}catch{$failure=$_.Exception.Message}
 if($case -eq 'valid'){
  $expected='kit,huella,firma,registro,credencial,corpus,trabajador,evidencia,limpiar,ack,apagar,retirar'
  if($failure -or ($script:trace -join ',') -cne $expected){throw "Coordinación incompleta: $($script:trace -join ',') / $failure"}
  $audit=Get-ChildItem -LiteralPath $DestinoServidor -Recurse -Filter 'autorizacion-medicion.json'|Get-Content -Raw|ConvertFrom-Json
  if($audit.zip_sha256 -cne $context.authorization.zip_sha256 -or $audit.key_id -cne 'qa-d0143296'){throw 'Falta auditoría de autorización'}
 }elseif(-not $failure -or -not $script:trace.Contains('limpiar') -or $script:trace.Contains('ack') -or $script:trace.Contains('apagar')){
  throw "Aborto sin limpieza o con apagado para $case : $($script:trace -join ',') / $failure"
 }
 if((Test-Path -LiteralPath $script:pcSimulado) -or (Test-Path -LiteralPath $script:signed)){throw 'Quedó material de sesión tras terminar'}
}
'PASS: autorización UTC, ruta automática bloqueada, coordinación con PC simulado y abortos sin ACK ni apagado.'
