param(
    [Parameter(Mandatory)][string]$Selection,
    [string]$TestSelection = ''
)
$ErrorActionPreference = 'Stop'
if (-not $env:VANTARE_SLOT_TARGET) { throw 'Invocar mediante comprobar.ps1.' }
$packages = $Selection.Split(',')
$testPackages = if ($TestSelection) { $TestSelection.Split(',') } else { $packages }
& (Join-Path $PSScriptRoot '../gates.ps1') -Gate clippy -Packages $packages
& (Join-Path $PSScriptRoot '../gates.ps1') -Gate test -Packages $testPackages
