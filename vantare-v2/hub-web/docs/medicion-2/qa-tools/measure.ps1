param([ValidateSet('hardware-off','hardware-off-no-gpu','renderer-limit','media-router-off','media-keys-off','trace')][string]$Experiment='hardware-off',[ValidateSet(1,5)][int]$Runs=5)
$ErrorActionPreference='Stop'
# Same global ownership wrapper as hub-web/scripts/measure.ps1. The driver and
# experiment data are confined to QA; no product script is modified.
. 'D:/VantareServer/worktrees/isa-1995-medicion-2/vantare-v2/hub-web/scripts/capture-lock.ps1'
$env:VANTARE_MEASURE_EXPERIMENT=$Experiment
$env:VANTARE_MEASURE_RUNS=[string]$Runs
$env:TEMP='D:/VantareServer/qa/isa-1995-measure-2/tmp'
$env:TMP=$env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
$lease=Enter-HubCaptureTurn "medicion-2-$Experiment"
try {
    & node --experimental-strip-types (Join-Path $PSScriptRoot 'measure.mjs')
    $result=$LASTEXITCODE
} finally { Exit-HubCaptureTurn $lease }
exit $result
