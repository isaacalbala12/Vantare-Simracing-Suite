# Tests de un grupo de crates para CI (#1993): compila y ejecuta en el mismo job.
# Uso: compilar.ps1 pwsh -File scripts/ci-group-tests.ps1 -Group core|surface
# -ListOnly imprime la selección sin compilar (pruebas del propio script).
param(
    [Parameter(Mandatory)][ValidateSet('core', 'surface')][string]$Group,
    [switch]$ListOnly
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Push-Location (Split-Path $PSScriptRoot)
try {
    $isPullRequest = $env:GITHUB_EVENT_NAME -eq 'pull_request' -and $env:GITHUB_BASE_REF -eq 'nightly'
    $selection = ''
    if ($isPullRequest) {
        $base = & git rev-parse 'HEAD^1'
        if ($LASTEXITCODE) { throw 'Falta la base del diff; no se omiten tests.' }
        $selection = & python (Join-Path $PSScriptRoot 'affected-crates.py') --base $base --fast
        if ($LASTEXITCODE) { throw 'No se pudo calcular el diff; no se omiten tests.' }
        if (-not $selection) {
            Write-Host 'Sin crates nativos afectados; nada que hacer.'
            return
        }
    }
    $groupSelection = if ($isPullRequest) {
        & python (Join-Path $PSScriptRoot 'ci-groups.py') --group $Group --packages $selection
    } else {
        & python (Join-Path $PSScriptRoot 'ci-groups.py') --group $Group --members
    }
    if ($LASTEXITCODE) { throw 'No se pudo seleccionar el grupo.' }
    if (-not $groupSelection) {
        Write-Host "Grupo $Group sin crates; nada que hacer."
        return
    }
    if ($ListOnly) {
        Write-Host $groupSelection
        return
    }
    if (-not $env:VANTARE_SLOT_TARGET) { throw 'Invocar por compilar.ps1.' }
    $packages = $groupSelection.Split(',')
    Write-Host "Grupo ${Group}: $($packages -join ', ')"
    & (Join-Path $PSScriptRoot '../gates.ps1') -Gate test -Packages $packages
    if ($LASTEXITCODE) { throw "Tests del grupo $Group fallaron." }
} finally { Pop-Location }
