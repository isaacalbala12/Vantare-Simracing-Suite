# IPC local REAL, solo CPU: un almacén QA vacío DEBE denegar, nunca habilitar.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Bin,[Parameter(Mandatory)][string]$Corpus,[Parameter(Mandatory)][string]$Output)
$ErrorActionPreference='Stop'
. "$PSScriptRoot/TANDA.ps1" -SoloFunciones
if(Test-Path -LiteralPath $Output){throw 'Salida del ensayo debe ser nueva'}
foreach($dir in @('native','local','roaming')){$null=New-Item -ItemType Directory -Path (Join-Path $Output $dir) -Force}
$env:VANTARE_NATIVE_DATA_ROOT=Join-Path $Output 'native'
$env:LOCALAPPDATA=Join-Path $Output 'local'
$env:APPDATA=Join-Path $Output 'roaming'
$env:VANTARE_SIN_GRAFICOS='1'
$pipe='vantare-tanda-denial-'+[guid]::NewGuid().ToString('N')
$core=$null
$denied=$false
try {
 $core=Start-TandaOwned (Join-Path $Bin 'vantare-core.exe') @('--replay',$Corpus,'--velocidad','1','--pipe',$pipe) (Join-Path $Output 'core')
 $core.stderr=$core.process.StandardError.ReadToEndAsync()
 # Root espera bin/ junto a un root de kit; no se abre cuenta ni se renueva.
 $root=Split-Path ([IO.Path]::GetFullPath($Bin))
 try {$null=Read-TandaPolicy $root $pipe (Join-Path $Output 'denied-policy.json')}
 catch {
  if($_.Exception.Message -eq 'Derechos reales no permiten los 19 widgets; no medir vacío'){$denied=$true}
  else {throw}
 }
 if(-not $denied){throw 'ERROR: QA vacío recibió acceso; no continuar con el kit'}
 Write-TandaJson @{test='real_core_services_read_only';qa_empty_denied=$true;credentials_generated=$false;account_or_renew_commands=$false;gpu=$false} (Join-Path $Output 'rechazo.json')
} finally {Close-TandaOwned $core}
'PASS: núcleo/Services reales rechazaron QA vacío; no se concede ni se acredita acceso de producción'
