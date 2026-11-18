# Ejecutar desde cualquier directorio. El mismo target sirve para el Core, el
# helper y el test del host, sin arrancar Hub ni overlays.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (Test-Path -LiteralPath 'D:/VantareServer/qa/captura.lock') {
    throw 'Hay una captura en curso. Espera a que se libere captura.lock.'
}

$previousGraphics = $env:VANTARE_SIN_GRAFICOS
$previousQueue = $env:VANTARE_QUEUE_CLASS
try {
    $env:VANTARE_SIN_GRAFICOS = '1'
    $env:VANTARE_QUEUE_CLASS = 'heavy'
    & (Join-Path $PSScriptRoot 'compilar.ps1') pwsh -NoProfile -File (
        Join-Path $PSScriptRoot '../gates.ps1'
    ) -Gate test -Packages vantare-hub-host -TestName e2e_analisis
    if ($LASTEXITCODE) { throw "E2E de Análisis falló (código $LASTEXITCODE)." }
} finally {
    $env:VANTARE_SIN_GRAFICOS = $previousGraphics
    $env:VANTARE_QUEUE_CLASS = $previousQueue
}
