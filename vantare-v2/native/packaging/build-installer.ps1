#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Version,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [ValidateSet('Debug','Release')][string]$BuildProfile = 'Release',
    [switch]$TestInstaller,
    [Parameter(ValueFromRemainingArguments)][string[]]$Defines = @()
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$installerVersion=$Version; $installerOutput=$OutputDirectory; $installerProfile=$BuildProfile
. (Join-Path $PSScriptRoot 'candidate.ps1')
$Version=$installerVersion; $OutputDirectory=$installerOutput; $BuildProfile=$installerProfile
foreach ($define in $Defines) { if ($define -ceq '/DTEST_INSTALLER') { $TestInstaller=$true } else { throw 'Define de instalador desconocido.' } }
if ($Version -cnotmatch '^(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})$' -or @($Version.Split('.') | Where-Object { [int]$_ -gt 65535 }).Count) { throw 'Versión inválida.' }
$output=Assert-NativePath $OutputDirectory
if ($TestInstaller -and -not $output.StartsWith([IO.Path]::GetFullPath('C:/tmp/ola2/1591-qa/'),[StringComparison]::OrdinalIgnoreCase)) { throw 'Build QA fuera de la raíz aislada.' }
$archive=Join-Path $output 'vantare-native-amd64-package.zip'
$null=Expand-NativePackage $archive (Get-NativeHash $archive) (Join-Path $output 'installer-checked-payload') 'beta'
if ($null -ne (Get-Item -LiteralPath (Join-Path $output 'VantareSetup.exe') -ErrorAction SilentlyContinue)) { throw 'No sobrescribir un Setup existente.' }
$native=Split-Path $PSScriptRoot
$saved=@{}
$names=@('VANTARE_VERSION','VANTARE_INSTALLER_ARCHIVE','VANTARE_INSTALLER_UNINSTALLER','VANTARE_INSTALLER_SHA256','CARGO_TARGET_DIR')
foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
Push-Location $native
try {
    if(-not $env:CARGO_TARGET_DIR){$env:CARGO_TARGET_DIR=Join-Path $output 'target-installer'}
    $env:VANTARE_VERSION=$Version
    $features=if($TestInstaller){'test-installer'}else{''}
    $base=@('build','-p','vantare-installer','--locked','--offline','-j','2')
    if($BuildProfile -ceq 'Release'){$base+='--release'}
    $uninstallArgs=$base+@('--bin','vantare-uninstall')
    if($features){$uninstallArgs+=@('--features',$features)}
    & cargo @uninstallArgs
    if($LASTEXITCODE){throw 'Falló build del desinstalador.'}
    $target=[IO.Path]::GetFullPath($env:CARGO_TARGET_DIR)
    $uninstaller=Join-Path $output 'Uninstall.exe'
    Copy-Item -LiteralPath (Join-Path $target ($BuildProfile.ToLowerInvariant()+'/vantare-uninstall.exe')) -Destination $uninstaller
    Assert-NativePe $uninstaller
    $env:VANTARE_INSTALLER_ARCHIVE=$archive
    $env:VANTARE_INSTALLER_UNINSTALLER=$uninstaller
    $env:VANTARE_INSTALLER_SHA256=Get-NativeHash $archive
    $setupFeatures='setup-payload'+$(if($features){','+$features}else{''})
    & cargo @base --bin vantare-setup --features $setupFeatures
    if($LASTEXITCODE){throw 'Falló build del Setup con payload.'}
    $setup=Join-Path $output 'VantareSetup.exe'
    Copy-Item -LiteralPath (Join-Path $target ($BuildProfile.ToLowerInvariant()+'/vantare-setup.exe')) -Destination $setup
    foreach($exe in @($setup,$uninstaller)){
        Assert-NativePe $exe
        $metadata=[Diagnostics.FileVersionInfo]::GetVersionInfo($exe)
        if($metadata.ProductName -cne 'Vantare' -or $metadata.ProductVersion -cne $Version){throw 'Metadatos PE del instalador incorrectos.'}
        [IO.File]::WriteAllText("$exe.sha256", "$(Get-NativeHash $exe)  $([IO.Path]::GetFileName($exe))`n",[Text.UTF8Encoding]::new($false))
    }
    Write-Output "Setup propio preparado: $setup"
} finally {
    Pop-Location
    foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
}
