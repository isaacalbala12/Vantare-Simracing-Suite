# Worker gate: changed crate and its direct reverse workspace dependencies.
[CmdletBinding()]
param([Parameter(Mandatory, Position=0)][string]$Crate)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$native = Split-Path $PSScriptRoot
Push-Location $native
try {
    $json = & cargo metadata --no-deps --locked --offline --format-version 1
    if ($LASTEXITCODE) { throw 'No se pudo leer el workspace.' }
    $metadata = $json | ConvertFrom-Json
    $members = @($metadata.packages | Where-Object { $_.id -cin $metadata.workspace_members })
    if ($Crate -notlike 'vantare-*') { $Crate = "vantare-$Crate" }
    if ($Crate -cnotin $members.name) { throw "Crate desconocido: $Crate" }
    $packages = @($Crate) + @($members | Where-Object {
        $Crate -cin @($_.dependencies.name)
    } | ForEach-Object name) | Sort-Object -Unique
    Write-Host "Comprobar: $($packages -join ', ')"
    # One queue acquisition for all commands; all use exactly the same slot target.
    & (Join-Path $PSScriptRoot 'compilar.ps1') pwsh -NoProfile -File (
        Join-Path $PSScriptRoot 'comprobar-seleccion.ps1') -Selection ($packages -join ',')
    if ($LASTEXITCODE) { throw 'Falló la comprobación del worker.' }
} finally { Pop-Location }
