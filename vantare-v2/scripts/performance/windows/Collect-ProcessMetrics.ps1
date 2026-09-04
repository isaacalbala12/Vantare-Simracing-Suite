[CmdletBinding()]
param([Parameter(Mandatory)][string]$RawDirectory, [Parameter(Mandatory)][string]$OutputFile)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# The canonical collector assigns renderer PIDs through CDP/activation windows.
# Preserve unassigned roles; never infer Hub from the largest process.
$columns = @('timestamp','condition','pid','role','buildSha256','distSha256','buildStable','gitHead',
 'privateBytes','workingSetBytes','cpuPct','gpuSampleValid','gpuPct','gpuDedicatedBytes',
 'frameTimeMs','dropped','gameFrametimeValid','frametimePublishable','publishable','measurementMode')
$rows = @(Get-ChildItem -LiteralPath $RawDirectory -Filter '*.csv' -File | Where-Object { $_.Name -notlike '*presentmon*' } | ForEach-Object {
 Import-Csv -LiteralPath $_.FullName | Select-Object -Property $columns
})
if (-not $rows.Count) { throw 'No canonical process samples; run is incomplete.' }
$rows | Export-Csv -LiteralPath $OutputFile -NoTypeInformation -Encoding utf8
