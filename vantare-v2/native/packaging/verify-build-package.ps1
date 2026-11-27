# Keep the freshly built verifier and its invocation under the same target lease.
#requires -Version 7
param([Parameter(Mandatory)][string]$Archive,[Parameter(Mandatory)][string]$Version,[Parameter(Mandatory)][string]$Channel)
$ErrorActionPreference='Stop'
if(-not $env:VANTARE_CARGO_QUEUE_OWNER -or -not $env:CARGO_TARGET_DIR){throw 'Invocar por compilar.ps1'}
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
Push-Location (Join-Path $PSScriptRoot '..')
try{
    & pwsh -NoProfile -File scripts/compilar.ps1 cargo build -p vantare-installer --example verify-package --no-default-features --features write-engine --target x86_64-pc-windows-msvc --locked --offline
    if($LASTEXITCODE){throw 'Falló la compilación del verificador Rust'}
    $verifier=Join-Path $env:CARGO_TARGET_DIR 'x86_64-pc-windows-msvc/debug/examples/verify-package.exe'
    # Por encima de un tope, el error ya lleva las medidas (#2863).
    $null=Assert-PackageCapacity $verifier $Archive
    Test-BuildPackage $Archive $Version $Channel $verifier
}finally{Pop-Location}
