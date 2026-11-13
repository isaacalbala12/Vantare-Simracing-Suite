# Worker gate: Clippy for the changed crate and its direct reverse dependencies;
# tests only for the changed crate unless -Full is passed.
[CmdletBinding()]
param(
    [Parameter(Mandatory, Position=0)][string]$Crate,
    [switch]$Full,
    [switch]$ListOnly
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$native = Split-Path $PSScriptRoot
Push-Location $native
try {
    if ($Crate -notlike 'vantare-*') { $Crate = "vantare-$Crate" }
    $sensitive = @('vantare-runtime', 'vantare-domain', 'vantare-ipc', 'vantare-ui', 'vantare-storage')
    if (-not $Full -and $Crate -in $sensitive) {
        Write-Warning 'gate rápido: faltan tests de dependientes y telemetría (#1498); usa -Full y la telemetría antes de publicar'
    }
    $selection = & python (Join-Path $PSScriptRoot 'affected-crates.py') --crate $Crate
    if ($LASTEXITCODE -or -not $selection) { throw 'No se pudo seleccionar el camino rápido.' }
    $packages = $selection.Split(',')
    $testSelection = if ($Full) { $packages -join ',' } else { $Crate }
    $line = "Comprobar: $($packages -join ', ') (tests: $testSelection)"
    if ($ListOnly) { Write-Output $line; return }
    Write-Host $line
    # One queue acquisition for all commands; all use exactly the same slot target.
    & (Join-Path $PSScriptRoot 'compilar.ps1') pwsh -NoProfile -File (
        Join-Path $PSScriptRoot 'comprobar-seleccion.ps1') -Selection ($packages -join ',') -TestSelection $testSelection
    if ($LASTEXITCODE) { throw 'Falló la comprobación del worker.' }
} finally { Pop-Location }
