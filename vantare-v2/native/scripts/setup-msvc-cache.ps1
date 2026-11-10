# Make the existing MSVC compiler available to cc-rs through sccache.
# cc 1.5.1's auto-detected MSVC branch does not apply RUSTC_WRAPPER.
$ErrorActionPreference = 'Stop'
$oldPath = @($env:PATH -split ';')
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ($LASTEXITCODE -or -not $installation) { throw 'No se encontró MSVC x64 instalado.' }
$env:PATH = "$(Split-Path $vswhere);$env:PATH"
& (Join-Path $installation 'Common7/Tools/Launch-VsDevShell.ps1') -Arch amd64 -HostArch amd64 -SkipAutomaticLocation
if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue) -or -not $env:INCLUDE -or -not $env:LIB) {
    throw 'El entorno MSVC no quedó preparado.'
}
if (-not $env:CC) { $env:CC = 'sccache cl.exe' }
if (-not $env:CXX) { $env:CXX = 'sccache cl.exe' }
if ($env:GITHUB_ENV) {
    # Export only compiler variables; never enumerate or print the environment.
    foreach ($name in @('CC','CXX','INCLUDE','LIB','LIBPATH','VSCMD_ARG_TGT_ARCH','VSCMD_ARG_HOST_ARCH')) {
        $value = [Environment]::GetEnvironmentVariable($name, 'Process')
        if ($value) { "$name=$value" >> $env:GITHUB_ENV }
    }
    foreach ($directory in @($env:PATH -split ';' | Where-Object { $_ -and $_ -notin $oldPath })) {
        $directory >> $env:GITHUB_PATH
    }
}
