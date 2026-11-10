# One queue acquisition, one persistent target, no duplicate workspace check.
param([string]$DiffBase, [switch]$Telemetry)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $env:VANTARE_SLOT_TARGET) { throw 'Invocar por compilar.ps1.' }
Push-Location (Split-Path $PSScriptRoot)
try {
    $packages = @()
    if ($DiffBase) {
        $selection = & python (Join-Path $PSScriptRoot 'affected-crates.py') --base $DiffBase --fast
        if ($LASTEXITCODE) { throw 'No se pudo calcular el diff; no se omiten gates.' }
        if ($selection) { $packages = $selection.Split(',') }
        else { Write-Host 'Sin crates nativos afectados.'; return }
    }
    Write-Host "Scope: $(if ($packages.Count) { $packages -join ', ' } else { 'workspace completo' })"
    & cargo fmt --all -- --check
    if ($LASTEXITCODE) { throw 'Formato nativo.' }
    & (Join-Path $PSScriptRoot '../gates.ps1') -Gate clippy -Packages $packages
    if (-not $packages.Count -or 'vantare-ui' -cin $packages -or 'vantare-installer' -cin $packages) {
        & (Join-Path $PSScriptRoot '../gates.ps1') -Gate captura
    }
    $suite = if ($Telemetry) { 'completa' } else { 'test' }
    & (Join-Path $PSScriptRoot '../gates.ps1') -Gate $suite -Packages $packages
    if (-not $packages.Count -or 'vantare-runtime' -cin $packages) {
        & (Join-Path $PSScriptRoot '../gates.ps1') -Gate lifecycle
    }
} finally { Pop-Location }
