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
$checked=Join-Path $output ('.installer-check-'+[guid]::NewGuid().ToString('N'))
try {
    $package=Expand-NativePackage $archive (Get-NativeHash $archive) $checked 'beta'
    if($package.version -cne $Version){throw 'La versión del ZIP no coincide con el Setup.'}
    if((Get-NativeHash (Join-Path $checked 'candidate.ps1')) -cne (Get-NativeHash (Join-Path $PSScriptRoot 'candidate.ps1'))){throw 'El bootstrap del ZIP y el del Setup deben ser idénticos.'}
} finally {
    $checked=[IO.Path]::GetFullPath($checked)
    if(-not $checked.StartsWith($output+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($checked) -cnotmatch '^\.installer-check-[a-f0-9]{32}$'){throw 'Temporal del builder fuera de su raíz.'}
    if(Test-Path -LiteralPath $checked){Assert-NativeTree $checked;Remove-Item -LiteralPath $checked -Recurse -Force}
}
if ($null -ne (Get-Item -LiteralPath (Join-Path $output 'VantareSetup.exe') -ErrorAction SilentlyContinue)) { throw 'No sobrescribir un Setup existente.' }
$native=Split-Path $PSScriptRoot
$saved=@{}
$names=@('VANTARE_VERSION','VANTARE_INSTALLER_ARCHIVE','VANTARE_INSTALLER_UNINSTALLER','VANTARE_INSTALLER_SHA256','VANTARE_INSTALLER_QA_OWNER_SID','CARGO_ENCODED_RUSTFLAGS','CARGO_TARGET_DIR')
foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
Push-Location $native
try {
    if(-not $env:CARGO_TARGET_DIR){$env:CARGO_TARGET_DIR=Join-Path $output 'target-installer'}
    $env:VANTARE_VERSION=$Version
    # Setup debe abrirse antes de instalar el payload, también sin VC Redist.
    # CRT estático del toolchain ya existente; no redistribuye otra dependencia.
    $staticFlags='-C'+[char]31+'target-feature=+crt-static'
    if($env:CARGO_ENCODED_RUSTFLAGS){$env:CARGO_ENCODED_RUSTFLAGS+=[char]31+$staticFlags}
    else{$env:CARGO_ENCODED_RUSTFLAGS=$staticFlags}
    if($TestInstaller){$env:VANTARE_INSTALLER_QA_OWNER_SID=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value}
    else{Remove-Item Env:VANTARE_INSTALLER_QA_OWNER_SID -ErrorAction SilentlyContinue}
    $features=if($TestInstaller){'test-installer'}else{''}
    $base=@('build','-p','vantare-installer','--target','x86_64-pc-windows-msvc','--locked','--offline','-j','2')
    if($BuildProfile -ceq 'Release'){$base+='--release'}
    $uninstallArgs=$base+@('--bin','vantare-uninstall')
    if($features){$uninstallArgs+=@('--features',$features)}
    & cargo @uninstallArgs
    if($LASTEXITCODE){throw 'Falló build del desinstalador.'}
    $target=Join-Path ([IO.Path]::GetFullPath($env:CARGO_TARGET_DIR)) 'x86_64-pc-windows-msvc'
    $dumpbin=Get-NativeDumpbin
    $uninstaller=Join-Path $output 'Uninstall.exe'
    Copy-Item -LiteralPath (Join-Path $target ($BuildProfile.ToLowerInvariant()+'/vantare-uninstall.exe')) -Destination $uninstaller
    Assert-NativeStaticCrt $uninstaller $dumpbin
    $env:VANTARE_INSTALLER_ARCHIVE=$archive
    $env:VANTARE_INSTALLER_UNINSTALLER=$uninstaller
    $env:VANTARE_INSTALLER_SHA256=Get-NativeHash $archive
    $setupFeatures='setup-payload'+$(if($features){','+$features}else{''})
    & cargo @base --bin vantare-setup --features $setupFeatures
    if($LASTEXITCODE){throw 'Falló build del Setup con payload.'}
    $setup=Join-Path $output 'VantareSetup.exe'
    Copy-Item -LiteralPath (Join-Path $target ($BuildProfile.ToLowerInvariant()+'/vantare-setup.exe')) -Destination $setup
    foreach($exe in @($setup,$uninstaller)){
        Assert-NativeStaticCrt $exe $dumpbin
        $metadata=[Diagnostics.FileVersionInfo]::GetVersionInfo($exe)
        if($metadata.ProductName -cne 'Vantare' -or $metadata.ProductVersion -cne $Version){throw 'Metadatos PE del instalador incorrectos.'}
        [IO.File]::WriteAllText("$exe.sha256", "$(Get-NativeHash $exe)  $([IO.Path]::GetFileName($exe))`n",[Text.UTF8Encoding]::new($false))
    }
    Write-Output "Setup propio preparado: $setup"
} finally {
    Pop-Location
    foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
}
