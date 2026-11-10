param([Parameter(Mandatory)][string]$Selection)
$ErrorActionPreference = 'Stop'
if (-not $env:VANTARE_SLOT_TARGET) { throw 'Invocar mediante comprobar.ps1.' }
$packages = $Selection.Split(',')
foreach ($gate in @('clippy', 'test')) {
    & (Join-Path $PSScriptRoot '../gates.ps1') -Gate $gate -Packages $packages
}
