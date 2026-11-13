[CmdletBinding()]
param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if(Test-Path -LiteralPath 'D:\VantareServer\qa\captura.lock'){throw 'Captura activa: no compilar tipos.'}
if(-not $env:VANTARE_CARGO_QUEUE_OWNER -or -not $env:CARGO_TARGET_DIR){throw 'Usar la cola del servidor.'}
if(@(& git -C $PSScriptRoot status --porcelain).Count){throw 'Commit antes de validar.'}
if(Test-Path $OutputDirectory){throw 'Usar evidencia nueva.'}
$env:TEMP=Join-Path $env:CARGO_TARGET_DIR 'vanta141-ventanas-tipos';$env:TMP=$env:TEMP
$null=New-Item -ItemType Directory $env:TEMP -Force
# Solo compilación y tamaños de estructuras. NO llamar Visible/Monitors/HideShow.
Add-Type -Path (Join-Path $PSScriptRoot 'VENTANAS.cs') -CompilerOptions @('/optimize+','/debug-')
if(-not [Vantare141.Windows]::LayoutsMatchSdk()){throw 'ABI de ventana/monitor distinta del SDK.'}
$null=New-Item -ItemType Directory $OutputDirectory
[ordered]@{source=(& git -C $PSScriptRoot rev-parse HEAD).Trim();result='PASS';native_calls=$false
 graphics_executed=$false;compiler='Roslyn /optimize+ /debug-';abi='RECT=16, MONITORINFOEXW=104'
 source_sha256=(Get-FileHash (Join-Path $PSScriptRoot 'VENTANAS.cs')).Hash.ToLowerInvariant()}|
 ConvertTo-Json|Out-File -Width 2147483647 (Join-Path $OutputDirectory 'tipos.json') -NoClobber
'PASS: auxiliar de ventanas compilado y ABI comprobada sin invocar APIs nativas.'
