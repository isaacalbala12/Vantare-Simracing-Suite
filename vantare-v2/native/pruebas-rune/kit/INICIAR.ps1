#requires -Version 7.0
[CmdletBinding()]
param(
 [ValidateSet('Principal','Completa')][string]$Campana='Principal',
 [ValidateRange(8,24)][int]$Rondas=8,
 [string]$Resultados,
 [switch]$SoloPreparar,
 [switch]$Reanudar
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
foreach ($file in @('PROCESOS','PREPARAR','RONDAS','RUIDO','IPC','CONTROL_AA','OBSERVAR','CALIBRAR')) { . (Join-Path $PSScriptRoot ($file+'.ps1')) }
Assert-VantareGamePc
$campaignLease=Enter-VantareCampaignLease
try {
. (Join-Path $PSScriptRoot 'muestreador/TERMICA.ps1')
$kit=Read-VantareKit $PSScriptRoot
# CRT común incluido; Electron conserva su carpeta y recursos originales.
$env:PATH=(Join-Path $kit.Root 'bin')+[IO.Path]::PathSeparator+$env:PATH
if (-not $Resultados) { $Resultados=Join-Path $kit.Root ('resultados/'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff')) }
$out=[IO.Path]::GetFullPath($Resultados)
if ((Test-Path $out) -and -not $Reanudar) { throw 'Carpeta existente: indicar -Reanudar o elegir una nueva.' }
if ($Reanudar -and -not (Test-Path (Join-Path $out 'campana.json'))) { throw 'No hay campaña que reanudar.' }
$null=New-Item -ItemType Directory -Path $out -Force
$lockPath=Join-Path $out 'EN-CURSO.lock'
if (Test-Path $lockPath) { throw 'Campaña activa o cierre interrumpido: conservar datos y comprobar procesos antes de retirar su lock.' }
$lock=[IO.File]::Open($lockPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try {
 $descriptor=Join-Path $out 'campana.json'
 if ($Reanudar) {
  $previous=Get-Content $descriptor -Raw | ConvertFrom-Json
  if ($previous.manifest_sha256 -ne $kit.ManifestSha256 -or $previous.campaign -ne $Campana -or $previous.rounds -ne $Rondas) { throw 'No mezclar kits ni planes en una campaña.' }
 } else {
  $binaries=@{}
  foreach ($variant in @('gpui','gpui_fast','rune')) { $binaries[$variant]=$kit.Binaries['relative_'+$variant].sha256 }
  [ordered]@{schema=1;campaign=$Campana;rounds=$Rondas;manifest_sha256=$kit.ManifestSha256;binaries=$binaries
   started_utc=[DateTime]::UtcNow.ToString('o');compilation_plan='Pendiente autorizado: ventana nocturna servidor sin otros workers, Rune Release -j1 y GPUI mismo perfil, limpia e incremental en la misma máquina.'} |
   ConvertTo-Json -Depth 6 | Out-File -Width 2147483647 $descriptor -NoClobber -Encoding utf8
 }
 if ($SoloPreparar) { Write-Host "Campaña preparada: $out"; return }
 Write-Host 'Cierra Vantare, juego, navegador, Discord, OBS, grabación NVIDIA y otras aplicaciones con carga.'
 Write-Host 'Usa alimentación de red y plan Alto rendimiento. Mantén resolución, DPI, VRR/G-Sync y driver durante toda la campaña.'
 Write-Host 'La principal ocupa aproximadamente 9–12 horas, más 12 horas de aguante aparte. La completa, varios días. Se puede reanudar.'
 $confirmation=Read-Host 'Escribe LISTO cuando hayas preparado el PC'
 if ($confirmation -cne 'LISTO') { throw 'Preparación no confirmada.' }
 $power=(& powercfg /getactivescheme | Out-String)
 if ($power -notmatch '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c') { throw 'Seleccionar manualmente el plan Alto rendimiento estándar antes de seguir.' }
 if (@(Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.ProcessName -match '^vantare|^LMU$|^Le Mans Ultimate$'}).Count) { throw 'Cerrar la aplicación Vantare y el simulador; solo se usa la grabación incluida.' }
 Add-Type -Path (Join-Path $kit.Root 'VENTANAS.cs') -CompilerOptions @('/optimize+','/debug-')
 Write-Host 'Dos minutos de reposo antes de medir.'
 Start-Sleep -Seconds 120
 $ledger=Join-Path $out 'intentos.jsonl'
 $copies=if($Campana -eq 'Completa'){@(1,4,10)}else{@(10)}
 $rates=if($Campana -eq 'Completa'){@(60,144)}else{@(60)}
 foreach ($hz in $rates) {
  Write-Host "Selecciona $hz Hz en el monitor principal y conserva su resolución."
  if ((Read-Host 'Escribe LISTO para continuar') -cne 'LISTO') { throw 'Frecuencia no confirmada.' }
  $screens=@(Get-CimInstance Win32_VideoController | Where-Object CurrentRefreshRate -eq $hz)
  if (-not $screens.Count) { throw 'Windows no declara la frecuencia requerida.' }
  $calibration=Join-Path $out ('calibracion-'+$hz)
  if (Test-Path (Join-Path $calibration 'calibracion.json')) {
   $frozen=[int](Get-Content (Join-Path $calibration 'calibracion.json') -Raw | ConvertFrom-Json).iterations
  } else { $frozen=Initialize-VantareLoad -Kit $kit -Hz $hz -Directory $calibration }
  foreach ($n in $copies) {
   foreach ($comparison in @('rune','gpui_fast')) {
    foreach ($loaded in @($false,$true)) {
     $family=('{0}-n{1}-hz{2}-carga{3}' -f $comparison,$n,$hz,[int]$loaded)
     $records=if(Test-Path $ledger){@(Get-Content $ledger | Where-Object {$_} | ForEach-Object {$_ | ConvertFrom-Json})}else{@()}
     if (@($records | Where-Object {$_.event -eq 'end' -and $_.family -eq $family -and $_.status -eq 'complete'}).Count) { continue }
     # Un inicio huérfano consume intento y queda explícitamente cancelado.
     foreach ($started in @($records | Where-Object {$_.event -eq 'start' -and $_.family -eq $family})) {
      if (-not @($records | Where-Object {$_.event -eq 'end' -and $_.family -eq $family -and $_.attempt -eq $started.attempt}).Count) {
       Complete-VantareAttempt -Ledger $ledger -Family $family -Attempt $started.attempt -Status cancelled -Reason 'Cierre interrumpido antes de reanudar'
      }
     }
     $done=$false
     while (-not $done) {
      $attempt=Register-VantareAttempt -Ledger $ledger -Family $family -ManifestSha256 $kit.ManifestSha256
      $folder=Join-Path $out ($family+'/intento-'+$attempt.attempt)
      $null=New-Item -ItemType Directory -Path $folder
      try {
       $plan=@(New-VantareOverlayPlan -Copies $n -Hz $hz -Load $loaded -Comparison $comparison -Rounds $Rondas)
       $plan | ConvertTo-Json -Depth 4 | Out-File -Width 2147483647 (Join-Path $folder 'plan.json') -NoClobber
       $controls=[Collections.Generic.List[object]]::new()
       foreach ($item in $plan) {
        $item | Add-Member -NotePropertyName family -NotePropertyValue $family
        $item | Add-Member -NotePropertyName attempt -NotePropertyValue $attempt.attempt
        Write-Host "$family intento $($attempt.attempt): $($item.id) $($item.variant)"
        $result=Invoke-VantareOverlayObservation -Kit $kit -Observation $item -OutputDirectory (Join-Path $folder $item.id) -LoadIterations $frozen
        if ($result.status -ne 'complete') { throw $result.error }
        if($item.block -eq 'aa'){
         $controls.Add($result)
         if($controls.Count -eq 4){
          $ratio=Get-VantareControlRatio -Rows $controls.ToArray()
          if([math]::Abs([math]::Log($ratio)) -gt [math]::Log(1.025)){Write-Warning 'A/A CPU ruidoso: se conserva y el análisis solicitará repetir solo estos bloques.'}
          if($loaded){$loadRatio=Get-VantareControlRatio -Rows $controls.ToArray() -Metric 'load_control_p99_ms';if([math]::Abs([math]::Log($loadRatio)) -gt [math]::Log(1.025)){Write-Warning 'A/A carga ruidoso: se conserva para repetición selectiva.'}}
          $controls.Clear()
         }
        }
       }
       Complete-VantareAttempt -Ledger $ledger -Family $family -Attempt $attempt.attempt -Status complete -Reason "$($plan.Count) observaciones capturadas; IPC, ruido medio y térmica comprobados; A/A de todas las métricas y cruce pendientes del servidor"
       $done=$true
      } catch {
       Complete-VantareAttempt -Ledger $ledger -Family $family -Attempt $attempt.attempt -Status invalid -Reason $_.Exception.Message
       Write-Warning 'Familia inválida conservada. Se repite completa; nunca se escoge la mejor muestra.'
      }
     }
    }
   }
  }
 }
 Write-Host 'TERMINÓ la campaña B. Faltan las pruebas A, corrección física y aguante indicadas en LEEME.'
} finally { $lock.Dispose(); Remove-Item -LiteralPath $lockPath }

} finally { Exit-VantareCampaignLease $campaignLease }
