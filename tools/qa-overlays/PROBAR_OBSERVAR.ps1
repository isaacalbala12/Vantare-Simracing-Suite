$ErrorActionPreference='Stop'
. "$PSScriptRoot/OBSERVAR.ps1"
$widgets=@('delta-trace','car-damage-visual','track-map','radar','relative','multiclass-relative','fuel-strategy','pedals','broadcast-tower','head-to-head','fastest-lap','pedals-telemetry','input-telemetry','track-weather','racing-flags','session-alerts','car-damage-numbers')
$order=@(Get-VantareObservationOrder $widgets)
if($order.Count -ne 68 -or $order[0].motor -ne 'gpui' -or $order[4].motor -ne 'rune' -or $order[2].state -ne 'waiting'){throw 'Orden incorrecto'}
# Guard real: no alcanza identidad ni sampler al importar/llamar en servidor.
$old=$env:VANTARE_SIN_GRAFICOS
try {
 $env:VANTARE_SIN_GRAFICOS='1'
 $blocked=$false
 try {Assert-VantareObservationPc} catch {$blocked=$_.Exception.Message -like 'Solo PC autorizado*'}
 if(-not $blocked){throw 'Guard abierto'}
} finally {$env:VANTARE_SIN_GRAFICOS=$old}
$tokens=$null;$parseErrors=$null
foreach($file in @("$PSScriptRoot/OBSERVAR.ps1","$PSScriptRoot/../../vantare-v2/native/pruebas-rune/muestreador/MUESTREAR.ps1")) {
 [Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$parseErrors)|Out-Null
 if($parseErrors.Count){throw ($parseErrors.Message -join '; ')}
}
& python -m unittest discover -s $PSScriptRoot -p test_medidas.py -v
if($LASTEXITCODE){throw 'Pruebas CSV fallidas'}
# Recorrido completo con identidad de proceso y sampler falsos. Ninguna API
# de procesos, ETW o gráficos se llama; solo se escriben CSV en un temporal.
$sandbox=Join-Path ([IO.Path]::GetTempPath()) ('vantare-observar-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory $sandbox
try {
 function Assert-VantareObservationPc {}
 function Get-VantareObservedIdentity {param($RootProcessId)
  @{process_id=42;created_utc='2026-11-16T00:00:00Z';image_name='overlay.exe';image_sha256=('a'*64)}
 }
 $fake=Join-Path $sandbox 'sampler-falso.ps1'
 @'
param($RootProcessId,$PresentMon,$OutputDirectory,$Seconds,[switch]$ProcessOnly)
if($RootProcessId -ne 42 -or $Seconds -ne 60 -or -not $ProcessOnly){throw 'Contrato sampler incorrecto'}
& python -c 'import sys,shutil; sys.path.insert(0,sys.argv[1]); from test_medidas import MeasurementTests; t=MeasurementTests(); t.setUp(); shutil.copytree(t.root,sys.argv[2]); t.doCleanups()' $env:VANTARE_OBSERVAR_TEST_SOURCE $OutputDirectory
if($LASTEXITCODE){throw 'No se generaron CSV falsos'}
'@|Set-Content $fake -Encoding utf8
 $env:VANTARE_OBSERVAR_TEST_SOURCE=$PSScriptRoot
 $out=Join-Path $sandbox 'ronda'
 Invoke-VantarePidObservation -RootProcessId 42 -Motor gpui -State replay -ReplayStartQpc 100000 -Widget relative -PresentMon nunca.exe -OutputDirectory $out -Sampler $fake
 $result=Get-Content (Join-Path $out 'resultado.json') -Raw|ConvertFrom-Json
 if($result.cpu_ms_s -ne 10 -or $result.presents -ne 1){throw 'Resultado sintético incorrecto'}
 $failed=$false
 $out=Join-Path $sandbox 'waiting-con-reloj'
 try {Invoke-VantarePidObservation -RootProcessId 42 -Motor rune -State waiting -ReplayStartQpc 100000 -Widget relative -PresentMon nunca.exe -OutputDirectory $out -Sampler $fake} catch {$failed=$_.Exception.Message -eq 'Waiting no admite ReplayStartQpc'}
 if(-not $failed -or (Test-Path $out)){throw 'Waiting aceptó reloj replay o creó salida'}
 # Orden distinto de las mismas claves no es cambio de identidad.
 $script:calls=0
 function Get-VantareObservedIdentity {param($RootProcessId)
  $script:calls++
  if($script:calls%2){return [ordered]@{process_id=42;created_utc='2026-11-16T00:00:00Z';image_name='overlay.exe';image_sha256=('a'*64)}}
  [ordered]@{image_sha256=('a'*64);image_name='overlay.exe';created_utc='2026-11-16T00:00:00Z';process_id=42}
 }
 Invoke-VantarePidObservation -RootProcessId 42 -Motor rune -State waiting -Widget relative -PresentMon nunca.exe -OutputDirectory (Join-Path $sandbox 'orden-claves') -Sampler $fake
 foreach($changed in @('process_id','created_utc','image_name','image_sha256')) {
  $script:calls=0
  $script:changed=$changed
  function Get-VantareObservedIdentity {param($RootProcessId)
   $script:calls++
   $value=@{process_id=42;created_utc='2026-11-16T00:00:00Z';image_name='overlay.exe';image_sha256=('a'*64)}
   if($script:calls -eq 2){$value[$script:changed]='distinto'}
   $value
  }
  $failed=$false
  $out=Join-Path $sandbox ('identidad-'+$changed)
  try {Invoke-VantarePidObservation -RootProcessId 42 -Motor rune -State waiting -Widget relative -PresentMon nunca.exe -OutputDirectory $out -Sampler $fake} catch {$failed=$_.Exception.Message -eq "Identidad cambió durante la ronda: $changed"}
  if(-not $failed -or -not(Test-Path (Join-Path $out 'INVALIDA.txt'))){throw "Cambio de $changed no invalidado"}
 }
} finally {
 Remove-Item Env:VANTARE_OBSERVAR_TEST_SOURCE -ErrorAction SilentlyContinue
 # Conservar el temporal como evidencia; no borrar árboles ni datos ajenos.
}
'PASS: orden 17 widgets, guard servidor, sintaxis y CSV sintéticos; sin sampler/ETW/GPU reales'
