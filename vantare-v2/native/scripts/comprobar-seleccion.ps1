param([Parameter(Mandatory)][string]$Selection,[switch]$PaintStats)
$ErrorActionPreference = 'Stop'
if (-not $env:VANTARE_SLOT_TARGET) { throw 'Invocar mediante comprobar.ps1.' }
$packages = $Selection.Split(',')
if ($PaintStats) { & (Join-Path $PSScriptRoot 'check-paint-stats.ps1') }
foreach ($gate in @('clippy', 'test')) {
    & (Join-Path $PSScriptRoot '../gates.ps1') -Gate $gate -Packages $packages
}
