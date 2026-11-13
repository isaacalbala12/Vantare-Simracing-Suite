$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ci-scope.ps1')
function Assert($value, $message) { if (-not $value) { throw "ci-scope: $message" } }
$empty = New-VantareCiScope -Revision r -Workspace w -Target t -Telemetry $true -Packages @() -LifecycleCount 0 -ArchiveEmpty $true
Assert (-not $empty.overlays) 'archive vacío no debe pedir overlays'
Assert (-not $empty.lifecycle) 'archive vacío no debe pedir lifecycle'
$core = New-VantareCiScope -Revision r -Workspace w -Target t -Telemetry $true -Packages @('vantare-runtime', 'vantare-ipc') -LifecycleCount 2
Assert ($core.overlays) 'runtime en el archivo debe pedir overlays'
Assert ($core.lifecycle) 'lifecycle con harnesses debe ser true'
$noRuntime = New-VantareCiScope -Revision r -Workspace w -Target t -Telemetry $false -Packages @('vantare-ipc') -LifecycleCount 0
Assert (-not $noRuntime.overlays) 'sin runtime no hay overlays'
Assert (-not $noRuntime.lifecycle) 'sin harnesses no hay lifecycle'
$workspace = New-VantareCiScope -Revision r -Workspace w -Target t -Telemetry $true -Packages @() -LifecycleCount 1
Assert ($workspace.overlays) 'workspace completo pide overlays'
Assert ($workspace.lifecycle) 'workspace completo con harnesses pide lifecycle'
Write-Host 'ci-scope ok'
