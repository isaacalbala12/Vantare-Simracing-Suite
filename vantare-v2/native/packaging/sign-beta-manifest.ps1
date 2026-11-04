# Firma local; solo escribe el sobre público, nunca la clave privada.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Manifest,
    [Parameter(Mandatory)][string]$Output,
    [Parameter(Mandatory)][string]$ServicesExecutable,
    [string]$SigningKeyFile = $env:VANTARE_UPDATE_SIGNING_KEY_FILE
)
$ErrorActionPreference = 'Stop'
if (-not $SigningKeyFile) { throw 'Indica la ruta privada mediante -SigningKeyFile o VANTARE_UPDATE_SIGNING_KEY_FILE.' }
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
if ((Get-Item -LiteralPath $Manifest).Length -gt 32768) { throw 'Manifiesto demasiado grande.' }
$inputJson=[IO.File]::ReadAllText($Manifest)
Assert-BetaManifest ($inputJson|ConvertFrom-Json)
$json = Invoke-BuildProcess $ServicesExecutable @('--sign-update',(Assert-BuildPath $SigningKeyFile)) $inputJson
$verified=Invoke-BuildProcess $ServicesExecutable @('--verify-update') $json | ConvertFrom-Json
if($verified.schema -ne 1 -or $verified.channel -cne 'beta' -or $verified.product -cne 'vantare-native'){throw 'Manifiesto firmado incompatible'}
[IO.File]::WriteAllText([IO.Path]::GetFullPath($Output), $json, [Text.UTF8Encoding]::new($false))
