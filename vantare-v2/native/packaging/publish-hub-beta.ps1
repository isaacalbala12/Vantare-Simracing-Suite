# Prepares reviewable artifacts and a command only. Never creates a release.
#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Version,[Parameter(Mandatory)][string]$OutputDirectory,[Parameter(Mandatory)][string]$SigningKeyFile,[Parameter(Mandatory)][string]$ConfigFile,[string]$Notes='',[ValidateSet('Debug','Release')][string]$BuildProfile='Release',[switch]$AllowDirty)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
if([Text.Encoding]::UTF8.GetByteCount($Notes) -gt 8192){throw 'Notas demasiado grandes'}
$null=& (Join-Path $PSScriptRoot 'build-candidate.ps1') -Version $Version -Channel beta -OutputDirectory $OutputDirectory -BuildProfile $BuildProfile -ConfigFile $ConfigFile -AllowDirty:$AllowDirty
$output=Assert-BuildPath $OutputDirectory
$archive=Join-Path $output 'vantare-native-amd64-package.zip'
$manifest=New-HubBetaManifest $archive $Version $Notes
$unsigned=Join-Path $output 'hub-beta-unsigned.json'
Write-BuildJson $unsigned $manifest
& (Join-Path $PSScriptRoot 'sign-hub-beta-manifest.ps1') -Manifest $unsigned -Output (Join-Path $output 'vantare-hub-beta.json') -ServicesExecutable (Join-Path $output 'payload/bin/vantare-services.exe') -SigningKeyFile $SigningKeyFile
& (Join-Path $PSScriptRoot 'build-installer.ps1') -Version $Version -OutputDirectory $output -BuildProfile $BuildProfile -Channel beta -ConfigFile $ConfigFile
Assert-PublishArtifacts $output
"Listo para revisión: $output"
"gh release create hub-beta-v$Version --repo isaacalbala12/Vantare-Downloads --prerelease --title 'Vantare Hub $Version' --notes-file '<notas-revisadas>' '$output/VantareSetup.exe' '$output/VantareSetup.exe.sha256' '$archive' '$archive.sha256' '$output/vantare-hub-beta.json'"
