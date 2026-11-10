# One queue acquisition, one persistent target, no duplicate workspace check.
param([string]$DiffBase, [switch]$Telemetry)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $env:VANTARE_SLOT_TARGET) { throw 'Invocar por compilar.ps1.' }
Push-Location (Split-Path $PSScriptRoot)
try {
    $packages = @()
    $legacyChecks = @()
    if ($DiffBase) {
        $selection = & python (Join-Path $PSScriptRoot 'affected-crates.py') --base $DiffBase --fast
        if ($LASTEXITCODE) { throw 'No se pudo calcular el diff; no se omiten gates.' }
        if ($selection) { $packages = $selection.Split(',') }
        else { Write-Host 'Sin crates nativos afectados.'; return }
        $legacy = & python (Join-Path $PSScriptRoot 'affected-crates.py') --base $DiffBase --legacy-check
        if ($LASTEXITCODE) { throw 'No se pudieron seleccionar consumidores legacy.' }
        if ($legacy) { $legacyChecks = $legacy.Split(',') }
    }
    Write-Host "Scope: $(if ($packages.Count) { $packages -join ', ' } else { 'workspace completo' })"
    & cargo fmt --all -- --check
    if ($LASTEXITCODE) { throw 'Formato nativo.' }
    & (Join-Path $PSScriptRoot '../gates.ps1') -Gate clippy -Packages $packages
    if ($legacyChecks.Count) {
        Write-Host "Compatibilidad legacy (sin tests): $($legacyChecks -join ', ')"
        & (Join-Path $PSScriptRoot '../gates.ps1') -Gate check -Packages $legacyChecks -PublicTargetsOnly
    }
    if (-not $packages.Count -or 'vantare-ui' -cin $packages -or 'vantare-installer' -cin $packages) {
        & (Join-Path $PSScriptRoot '../gates.ps1') -Gate captura
    }
    & (Join-Path $PSScriptRoot '../gates.ps1') -Gate archive -Packages $packages
    $revision = & git rev-parse HEAD
    if ($LASTEXITCODE) { throw 'No se pudo identificar el build archivado.' }
    $lifecycle = @(Get-Content (Join-Path $env:VANTARE_SLOT_TARGET 'debug/ci-lifecycle/manifest.json') -Raw | ConvertFrom-Json)
    [ordered]@{
        revision = $revision
        workspace = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot))
        target = $env:VANTARE_SLOT_TARGET
        telemetry = [bool]$Telemetry
        overlays = (-not $packages.Count -or 'vantare-runtime' -cin $packages)
        lifecycle = ($lifecycle.Count -gt 0)
        packages = $packages
    } | ConvertTo-Json | Set-Content (Join-Path $env:VANTARE_SLOT_TARGET 'ci-scope.json') -Encoding utf8
} finally { Pop-Location }
