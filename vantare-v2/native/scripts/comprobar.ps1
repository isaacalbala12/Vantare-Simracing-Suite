# Worker gate: changed crate and its direct reverse workspace dependencies.
[CmdletBinding()]
param([Parameter(Mandatory, Position=0)][string]$Crate)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$native = Split-Path $PSScriptRoot
Push-Location $native
try {
    if ($Crate -notlike 'vantare-*') { $Crate = "vantare-$Crate" }
    $selection = & python (Join-Path $PSScriptRoot 'affected-crates.py') --crate $Crate
    if ($LASTEXITCODE -or -not $selection) { throw 'No se pudo seleccionar el camino rápido.' }
    $packages = $selection.Split(',')
    Write-Host "Comprobar: $($packages -join ', ')"
    # One queue acquisition for all commands; all use exactly the same slot target.
    & (Join-Path $PSScriptRoot 'compilar.ps1') pwsh -NoProfile -File (
        Join-Path $PSScriptRoot 'comprobar-seleccion.ps1') -Selection ($packages -join ',')
    if ($LASTEXITCODE) { throw 'Falló la comprobación del worker.' }
} finally { Pop-Location }
