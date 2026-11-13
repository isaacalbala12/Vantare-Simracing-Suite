# Cálculo puro en servidor: vuelve a evaluar CSV, nunca abre sensores.
function Test-VantareRawThermals {
 param([Parameter(Mandatory)][string]$Root)
 . (Join-Path $PSScriptRoot 'muestreador/TERMICA.ps1')
 . (Join-Path $PSScriptRoot 'IPC.ps1')
 $descriptors=@(Get-ChildItem -LiteralPath $Root -Recurse -File | Where-Object {$_.Name -in @('observacion.json','observacion-inicio.json','ejecucion.json')})
 foreach($file in $descriptors){
  $meta=Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json -AsHashtable
  $endurance=$file.Name -eq 'ejecucion.json'
  if(($endurance -and -not $meta.finished) -or (-not $endurance -and $meta.status -ne 'complete')){continue}
  $folder=$file.DirectoryName
  $thermal=Get-Content -LiteralPath (Join-Path $folder 'termica.json') -Raw | ConvertFrom-Json
  $sample=Join-Path $folder 'muestreo'
  $complete=Get-Content -LiteralPath (Join-Path $sample 'completo.json') -Raw | ConvertFrom-Json -AsHashtable
  if($complete.complete -ne $true){throw 'Muestreo térmico incompleto.'}
  if($file.Name -eq 'observacion.json'){
   $trace=Read-VantareTrace (Join-Path $folder 'nucleo.csv')
   $frequency=$trace.Frequency
   $start=[long]($trace.Rows | Where-Object phase -eq 'origin' | Measure-Object -Property qpc -Minimum).Minimum
   $end=$start+60*$frequency
  }elseif($endurance){$frequency=[long]$meta.frequency;$start=[long]$meta.start_qpc;$end=$start+14400*$frequency}
  else{$frequency=[long]$meta.frequency;$start=[long]$meta.ready_observed_qpc+$frequency;$end=[long]$thermal.end_qpc}
  if($thermal.frequency -ne $frequency -or $thermal.start_qpc -ne $start -or $thermal.end_qpc -ne $end){throw 'Control térmico fuera de su ventana.'}
  foreach($name in @('contadores.csv','temperaturas.csv')){
   if((Get-FileHash -LiteralPath (Join-Path $sample $name)).Hash.ToLowerInvariant() -ne $thermal.source_sha256.$name){throw 'Cambió la evidencia térmica.'}
  }
  $interval=if($endurance){10.0}else{1.0}
  $recomputed=Measure-VantareThermals -Counters @(Import-Csv (Join-Path $sample 'contadores.csv')) -Temperatures @(Import-Csv (Join-Path $sample 'temperaturas.csv')) -ProcessIds @($complete.family.Keys|ForEach-Object {[int]$_}) -Frequency $frequency -StartQpc $start -EndQpc $end -IntervalSeconds $interval
  if(-not $recomputed.valid -or -not $thermal.valid){throw 'Limitación CPU o temperatura GPU: evidencia inválida.'}
 }
}
