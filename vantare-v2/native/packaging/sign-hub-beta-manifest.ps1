# Same Ed25519 envelope/authority as legacy; distinct closed Hub payload.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Manifest,[Parameter(Mandatory)][string]$Output,[Parameter(Mandatory)][string]$ServicesExecutable,[Parameter(Mandatory)][string]$SigningKeyFile,[string]$QaVerifier)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
$path=Assert-BuildPath $Manifest
if((Get-Item -LiteralPath $path).Length -gt 32768){throw 'Manifiesto Hub demasiado grande'}
$inputJson=[IO.File]::ReadAllText($path)
Assert-HubBetaManifest ($inputJson|ConvertFrom-Json)
$verifier=$ServicesExecutable
if($QaVerifier){
    $verifier=Assert-BuildPath $QaVerifier
    $qa=if($env:RUNNER_TEMP){[IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')+'\'}else{'D:\VantareServer\qa\'}
    if(-not $verifier.StartsWith($qa,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($verifier) -cne 'matrix-verifier.exe'){throw 'Verificador QA fuera de la raíz de pruebas'}
}
$json=Invoke-BuildProcess $ServicesExecutable @('--sign-update',(Assert-BuildPath $SigningKeyFile)) $inputJson
$roundTrip=Invoke-BuildProcess $verifier @('--verify-update') $json
if($roundTrip -cne $inputJson){throw 'Firma Hub alteró el contenido'}
Assert-HubBetaManifest ($roundTrip|ConvertFrom-Json)
[IO.File]::WriteAllText((Assert-BuildPath $Output),$json,[Text.UTF8Encoding]::new($false))
