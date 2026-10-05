# Workshop en vivo: mismo renderer GPUI, solo valores visuales en JSON.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Push-Location (Split-Path $PSScriptRoot)
$previousStyles=$env:VANTARE_WORKSHOP_STYLES
try {
    cargo build --locked --offline -p vantare-ui --bin vantare-workshop --profile prueba -j 2
    if ($LASTEXITCODE) { throw 'No se pudo compilar Workshop en vivo.' }
    $target=if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { 'target' }
    $exe=Join-Path $target 'prueba/vantare-workshop.exe'
    $env:VANTARE_WORKSHOP_STYLES=Join-Path $PSScriptRoot 'styles'
    Write-Output "Workshop en vivo: edita $PSScriptRoot/styles/standings.json y guarda."
    & $exe --dev --widget standings
    if ($LASTEXITCODE) { throw 'Workshop en vivo terminó con un error.' }
} finally {
    $env:VANTARE_WORKSHOP_STYLES=$previousStyles
    Pop-Location
}
