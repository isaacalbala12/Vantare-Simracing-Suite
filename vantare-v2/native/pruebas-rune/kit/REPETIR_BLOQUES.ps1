# Repite únicamente parejas A/A+A/B solicitadas por el análisis del servidor.
# No selecciona resultados A/B ni elimina muestras anteriores.
#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Campana,[Parameter(Mandatory)][string]$Informe)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
foreach($name in @('PROCESOS','PREPARAR','RONDAS','IPC','RUIDO','CONTROL_AA','OBSERVAR')){. (Join-Path $PSScriptRoot ($name+'.ps1'))}
Assert-VantareGamePc
$lease=Enter-VantareCampaignLease
try{
 . (Join-Path $PSScriptRoot 'muestreador/TERMICA.ps1')
 $kit=Read-VantareKit $PSScriptRoot
 $env:PATH=(Join-Path $kit.Root 'bin')+[IO.Path]::PathSeparator+$env:PATH
 $root=(Resolve-Path -LiteralPath $Campana).Path
 $request=(Get-Content $Informe -Raw|ConvertFrom-Json -AsHashtable).retry_request
 if($request.schema -ne 1 -or $request.manifest_sha256 -ne $kit.ManifestSha256){throw 'Informe ajeno a este kit o sin solicitud de repetición.'}
 $campaign=Get-Content (Join-Path $root 'campana.json') -Raw|ConvertFrom-Json -AsHashtable
 if($campaign.manifest_sha256 -ne $kit.ManifestSha256){throw 'Campaña de otro kit.'}
 Add-Type -Path (Join-Path $kit.Root 'VENTANAS.cs') -CompilerOptions @('/optimize+','/debug-')
 $lockFile=Join-Path $root 'EN-CURSO.lock'
 $lock=[IO.File]::Open($lockFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{
  $ledger=Join-Path $root 'repeticiones.jsonl'
  $blocks=@($request.blocks|Group-Object comparison,round|ForEach-Object {$_.Group[0]})
  foreach($block in $blocks){
   if(($block.round -isnot [int] -and $block.round -isnot [long]) -or $block.comparison -notin @('rune','gpui_fast') -or $block.round -lt 1 -or $block.round -gt 24 -or -not $block.metrics.Count){throw 'Solicitud de bloques no válida.'}
   foreach($loaded in @($false,$true)){
    $family='{0}-n10-hz60-carga{1}' -f $block.comparison,[int]$loaded
    $original=@(Get-Content (Join-Path $root 'intentos.jsonl')|ForEach-Object {$_|ConvertFrom-Json}|Where-Object {$_.event -eq 'end' -and $_.family -eq $family -and $_.status -eq 'complete'}|Select-Object -First 1)
    if($original.Count -ne 1){throw 'Falta familia original completa.'}
    $records=if(Test-Path $ledger){@(Get-Content $ledger|Where-Object {$_}|ForEach-Object {$_|ConvertFrom-Json})}else{@()}
    $attempt=1+@($records|Where-Object {$_.event -eq 'start' -and $_.family -eq $family -and $_.round -eq $block.round}).Count
    if($attempt -gt 2){throw 'Tres intentos totales consumidos (original y dos repeticiones); conservar todo y revisar el entorno.'}
    $relative='repeticiones/'+$family+'/r'+$block.round+'-intento-'+$attempt
    $folder=Join-Path $root $relative
    $null=New-Item -ItemType Directory -Path $folder
    $record=@{event='start';family=$family;round=$block.round;repair_attempt=$attempt;folder=$relative}
    $record|ConvertTo-Json -Compress|Add-Content -LiteralPath $ledger
    try{
     $frozen=[int](Get-Content (Join-Path $root 'calibracion-60/calibracion.json') -Raw|ConvertFrom-Json).iterations
     $plan=@(New-VantareOverlayPlan -Copies 10 -Hz 60 -Load $loaded -Comparison $block.comparison -Rounds ([math]::Max(8,$block.round))|Where-Object round -eq $block.round)
     foreach($item in $plan){
      $item.id='repair-'+$attempt+'-'+$item.id
      $item|Add-Member -NotePropertyName family -NotePropertyValue $family
      $item|Add-Member -NotePropertyName attempt -NotePropertyValue $original[0].attempt
      $item|Add-Member -NotePropertyName repair_attempt -NotePropertyValue $attempt
      $result=Invoke-VantareOverlayObservation -Kit $kit -Observation $item -OutputDirectory (Join-Path $folder $item.id) -LoadIterations $frozen
      if($result.status -ne 'complete'){throw $result.error}
     }
     $record.status='complete'
    }catch{$record.status='invalid';$record.reason=$_.Exception.Message;throw}finally{$record.event='end';$record|ConvertTo-Json -Compress|Add-Content -LiteralPath $ledger}
   }
  }
  Write-Host 'TERMINÓ la repetición solicitada. Recoger todos los datos y volver a ANALIZAR en el servidor.'
 }finally{$lock.Dispose();Remove-Item -LiteralPath $lockFile}
}finally{Exit-VantareCampaignLease $lease}
