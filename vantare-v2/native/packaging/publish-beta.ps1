# Builds reviewable artifacts and prints a release command; never publishes.
#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Version,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$Notes='',
    [string]$ConfigFile,
    [Parameter(Mandatory)][string]$SigningKeyFile,
    [ValidateSet('Debug','Release')][string]$BuildProfile='Release',
    [switch]$AllowDirty
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
if($Version -cnotmatch '^(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\z'){throw 'Versión beta inválida'}
if(@($Version.Split('.')|Where-Object {[int]$_ -gt 65535}).Count){throw 'Versión beta fuera de rango'}
if([Text.Encoding]::UTF8.GetByteCount($Notes) -gt 8192){throw 'Notas demasiado grandes'}
$output=Assert-BuildPath $OutputDirectory
$artifacts=& (Join-Path $PSScriptRoot 'build-candidate.ps1') -Version $Version -Channel beta -OutputDirectory $output -BuildProfile $BuildProfile -ConfigFile $ConfigFile -AllowDirty:$AllowDirty
$repository='isaacalbala12/Vantare-Downloads'
$manifest=[ordered]@{
    schema=1;product='vantare-native';channel='beta';version=$Version
    url="https://github.com/$repository/releases/download/native-beta-v$Version/vantare-native-amd64-package.zip"
    sha256=$artifacts.sha256;notes=$Notes
}
Assert-BetaManifest ([pscustomobject]$manifest)
$verifier=Join-Path $output 'payload/bin/vantare-services.exe'
$json=Invoke-BuildProcess $verifier @('--sign-update',(Assert-BuildPath $SigningKeyFile)) ($manifest|ConvertTo-Json -Compress)
$verified=Invoke-BuildProcess $verifier @('--verify-update') $json|ConvertFrom-Json
if($verified.version -cne $Version -or $verified.channel -cne 'beta' -or $verified.sha256 -cne $artifacts.sha256){throw 'Manifiesto firmado incompatible'}
[IO.File]::WriteAllText((Join-Path $output 'vantare-native-beta.json'),$json,[Text.UTF8Encoding]::new($false))
& (Join-Path $PSScriptRoot 'build-installer.ps1') -Version $Version -OutputDirectory $output -BuildProfile $BuildProfile
if(-not $?){throw 'Falló el instalador propio'}
Assert-PublishArtifacts $output
"Listo: $output"
"gh release create native-beta-v$Version --repo $repository --prerelease --title 'Vantare $Version' --notes-file '<notas-revisadas>' '$output/VantareSetup.exe' '$output/VantareSetup.exe.sha256' '$output/vantare-native-amd64-package.zip' '$output/vantare-native-amd64-package.zip.sha256' '$output/vantare-native-beta.json'"
