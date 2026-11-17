# Comprueba el QPC real del replay y su traza; solo CPU, sin credenciales ni GPU.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Bin,[Parameter(Mandatory)][string]$Corpus,[Parameter(Mandatory)][string]$Output)
$ErrorActionPreference='Stop'
. "$PSScriptRoot/TANDA.ps1" -SoloFunciones
if(Test-Path -LiteralPath $Output){throw 'Salida debe ser nueva'}
foreach($dir in @('native','local','roaming')){$null=New-Item -ItemType Directory -Path (Join-Path $Output $dir) -Force}
$env:VANTARE_NATIVE_DATA_ROOT=Join-Path $Output 'native'
$env:LOCALAPPDATA=Join-Path $Output 'local';$env:APPDATA=Join-Path $Output 'roaming'
$env:VANTARE_SIN_GRAFICOS='1'
$core=$null
try {
 $began=[Diagnostics.Stopwatch]::GetTimestamp()
 $core=Start-TandaOwned (Join-Path $Bin 'vantare-core.exe') @('--replay',$Corpus,'--velocidad','1','--pipe',('vantare-replay-proof-'+[guid]::NewGuid().ToString('N'))) (Join-Path $Output 'core') @{VANTARE_PROFILE_PHASES='1';VANTARE_MEASUREMENT_TRACE='1'}
 $observed=Get-TandaLiveClock $core

 # Solo acumula cinco segundos de traza para comprobar el origen, no es una medida.
 Start-Sleep -Seconds 5
 Close-TandaOwned $core;$core=$null
 $origin=Get-TandaReplayOrigin (Join-Path $Output 'core.stderr.txt')
 if($origin -lt $began -or $origin -gt [Diagnostics.Stopwatch]::GetTimestamp()){throw 'Origen fuera de la ejecución real'}
 Write-TandaJson @{pass=$true;first_core_observe_qpc=$origin;live_log_observed_qpc=$observed;frequency=[Diagnostics.Stopwatch]::Frequency;gpu=$false;performance_measurement=$false} (Join-Path $Output 'replay-qpc.json')
} finally {Close-TandaOwned $core}
'PASS: origen QPC real del replay, sin inferirlo del transporte/log, solo CPU'
