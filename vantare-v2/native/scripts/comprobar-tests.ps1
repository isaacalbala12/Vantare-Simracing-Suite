$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$script = Join-Path $PSScriptRoot 'comprobar.ps1'
$fast = & $script ipc -ListOnly
if ($LASTEXITCODE) { throw 'comprobar -ListOnly falló' }
if ($fast -notmatch '\(tests: vantare-ipc\)$') { throw "Selección rápida inesperada: $fast" }
$full = & $script ipc -Full -ListOnly
if ($LASTEXITCODE) { throw 'comprobar -Full -ListOnly falló' }
if ($full -notmatch 'vantare-runtime') { throw "La selección completa no incluye runtime: $full" }
if ($full -match '\(tests: vantare-ipc\)$') { throw 'Full no amplió los tests' }
Write-Host 'comprobar ok'
