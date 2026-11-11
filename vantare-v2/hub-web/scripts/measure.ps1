param()
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'capture-lock.ps1')
$lease=Enter-HubCaptureTurn 'medicion-1'
try {
    & node --experimental-strip-types (Join-Path $PSScriptRoot 'measure.ts')
    $result=$LASTEXITCODE
} finally { Exit-HubCaptureTurn $lease }
exit $result
