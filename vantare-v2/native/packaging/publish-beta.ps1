#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Version,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$Notes = '',
    [string]$NsisCompiler = "${env:ProgramFiles(x86)}\NSIS\makensis.exe",
    [ValidateSet('Debug', 'Release')][string]$BuildProfile = 'Release',
    [switch]$AllowDirty
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$publishVersion = $Version
$publishProfile = $BuildProfile
$publishAllowDirty = $AllowDirty
$publishOutput = $OutputDirectory
. (Join-Path $PSScriptRoot 'beta.ps1')
$Version = $publishVersion
$BuildProfile = $publishProfile
$AllowDirty = $publishAllowDirty
$OutputDirectory = $publishOutput
$null = Read-BetaVersion $Version
$output = Assert-NativePath $OutputDirectory
$compiler = Get-Command $NsisCompiler -ErrorAction Stop
$artifacts = Build-NativeCandidate $output $Version 'beta' $BuildProfile ([bool]$AllowDirty)
$manifest = [ordered]@{
    schema = 1; product = 'vantare-native'; channel = 'beta'; version = $Version
    url = "https://github.com/$script:BetaRepository/releases/download/native-beta-v$Version/vantare-native-amd64-package.zip"
    sha256 = $artifacts.sha256; notes = $Notes
}
$json = ConvertTo-Json $manifest
$null = Read-BetaManifest $json
Write-NativeJson (Join-Path $output 'vantare-native-beta.json') $manifest
& $compiler.Source "/DOUTPUT=$output" "/DBOOTSTRAP=$PSScriptRoot" "/DVERSION=$Version" "/DPACKAGE_SHA=$($artifacts.sha256)" (Join-Path $PSScriptRoot 'beta-installer.nsi')
if ($LASTEXITCODE) { throw 'Falló NSIS; no hay instalador listo.' }
$setup = Join-Path $output 'VantareSetup.exe'
[IO.File]::WriteAllText("$setup.sha256", "$(Get-NativeHash $setup)  VantareSetup.exe`n")
# Solo imprime el comando; la publicación pertenece al orquestador.
Write-Output "Listo: $output"
Write-Output "gh release create native-beta-v$Version --repo $script:BetaRepository --prerelease --title 'Vantare Native Beta $Version' --notes-file '<notas-revisadas>' '$output/VantareSetup.exe' '$output/VantareSetup.exe.sha256' '$output/vantare-native-amd64-package.zip' '$output/vantare-native-beta.json'"
