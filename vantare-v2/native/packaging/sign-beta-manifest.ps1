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
. (Join-Path $PSScriptRoot 'beta.ps1')
if ((Get-Item -LiteralPath $Manifest).Length -gt 32768) { throw 'Manifiesto demasiado grande.' }
$json = Invoke-BetaManifestTool $ServicesExecutable ([IO.File]::ReadAllText($Manifest)) $SigningKeyFile
$null = Read-BetaManifest $json $false $ServicesExecutable
[IO.File]::WriteAllText([IO.Path]::GetFullPath($Output), $json, [Text.UTF8Encoding]::new($false))
