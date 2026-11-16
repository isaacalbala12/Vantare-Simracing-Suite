# Importación inerte: el operador prepara hosts/layouts por el camino real.
# No crea ventanas, modifica derechos ni lanza el juego.
Set-StrictMode -Version Latest
function Assert-VantareObservationPc {
 if($env:VANTARE_SIN_GRAFICOS -eq '1' -or $env:COMPUTERNAME -ieq 'SAPPHIREOS' -or
    (Test-Path 'C:/VantareServer/orquestador/noche/cabecera-mac.md')){throw 'Solo PC autorizado; en servidor usar pruebas falsas'}
}
function Get-VantareObservationOrder {
 param([Parameter(Mandatory)][string[]]$Widgets)
 for($i=0;$i -lt $Widgets.Count;$i++) {
  $motors=if($i%2){@('rune','gpui')}else{@('gpui','rune')}
  foreach($state in @('replay','waiting')) {
   foreach($motor in $motors){[pscustomobject]@{widget=$Widgets[$i];motor=$motor;state=$state}}
  }
 }
}
function Get-VantareObservedIdentity {
 param([Parameter(Mandatory)][int]$RootProcessId)
 $p=Get-Process -Id $RootProcessId -ErrorAction Stop
 try {
  [ordered]@{process_id=$p.Id;created_utc=$p.StartTime.ToUniversalTime().ToString('o');
   image_name=[IO.Path]::GetFileName($p.Path);image_sha256=(Get-FileHash $p.Path -Algorithm SHA256).Hash.ToLowerInvariant()}
 } finally {$p.Dispose()}
}
function Invoke-VantarePidObservation {
 [CmdletBinding()]
 param([Parameter(Mandatory)][int]$RootProcessId,
  [Parameter(Mandatory)][ValidateSet('gpui','rune')][string]$Motor,
  [Parameter(Mandatory)][ValidateSet('replay','waiting')][string]$State,
  [Parameter(Mandatory)][string]$Widget,
  [Parameter(Mandatory)][string]$PresentMon,
  [Parameter(Mandatory)][string]$OutputDirectory,
  [long]$ReplayStartQpc=0,
  [string]$Sampler=(Join-Path $PSScriptRoot '../../vantare-v2/native/pruebas-rune/muestreador/MUESTREAR.ps1'))
 $ErrorActionPreference='Stop'
 # Nunca dar paso al sampler real del servidor. Las pruebas sustituyen funciones.
 Assert-VantareObservationPc
 if($State -eq 'replay' -and $ReplayStartQpc -le 0){throw 'Falta QPC de arranque del replay real'}
 if($State -eq 'waiting' -and $ReplayStartQpc -ne 0){throw 'Waiting no admite ReplayStartQpc'}
 if(Test-Path -LiteralPath $OutputDirectory){throw 'Salida debe ser nueva'}
 $null=New-Item -ItemType Directory -Path $OutputDirectory
 $identityPath=Join-Path $OutputDirectory 'identidad.json'
 try {
  $before=Get-VantareObservedIdentity $RootProcessId
  $before|ConvertTo-Json|Set-Content $identityPath -Encoding utf8
  # Layout/datos acreditados por operador; replay real a velocidad 1.
  & $Sampler -RootProcessId $RootProcessId -PresentMon $PresentMon -OutputDirectory (Join-Path $OutputDirectory 'muestreo') -Seconds 60 -ProcessOnly
  $after=Get-VantareObservedIdentity $RootProcessId
  foreach($field in @('process_id','created_utc','image_name','image_sha256')) {
   if($before[$field] -cne $after[$field]){throw "Identidad cambió durante la ronda: $field"}
  }
  $result=Join-Path $OutputDirectory 'resultado.json'
  & python (Join-Path $PSScriptRoot 'medidas.py') (Join-Path $OutputDirectory 'muestreo') $identityPath $result ([string]$ReplayStartQpc) 1> (Join-Path $OutputDirectory 'analisis.stdout.txt') 2> (Join-Path $OutputDirectory 'analisis.stderr.txt')
  if($LASTEXITCODE -ne 0){throw 'CSV inválidos'}
  @{widget=$Widget;motor=$Motor;state_declared_by_operator=$State;replay_start_qpc=$ReplayStartQpc;status='complete'}|ConvertTo-Json|Set-Content (Join-Path $OutputDirectory 'observacion.json') -Encoding utf8
 } catch {
  $_.Exception.Message|Set-Content (Join-Path $OutputDirectory 'INVALIDA.txt') -Encoding utf8
  throw
 }
}
