# Solo captura el HWND QA ya creado fuera de pantalla; no activa ni mueve.
# Para varias vistas, usar --capture-batch en lugar de interacción de escritorio.
param(
    [Parameter(Mandatory)][int]$HubProcessId,
    [Parameter(Mandatory)][string]$OutputPath,
    [string]$ExpectedExecutable,
    [int]$Width = 1440,
    [int]$Height = 900,
    [int]$X = -1,
    [int]$Y = -1,
    [ValidateRange(-2400,2400)][int]$WheelDelta = 0,
    [string]$Keys = ''
)
$ErrorActionPreference = 'Stop'
if ($X -ne -1 -or $Y -ne -1 -or $WheelDelta -ne 0 -or $Keys) {
    throw 'Declara el estado en --capture-batch; no se permite activar ni manejar el escritorio.'
}
$nativeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
if (-not $ExpectedExecutable) { $ExpectedExecutable = Join-Path $nativeRoot 'target/debug/vantare-hub.exe' }
& (Join-Path $nativeRoot 'hub/reference/tools/capture-window.ps1') -ProcessId $HubProcessId `
    -ExpectedExecutable $ExpectedExecutable -OutputPath $OutputPath -Width $Width -Height $Height
