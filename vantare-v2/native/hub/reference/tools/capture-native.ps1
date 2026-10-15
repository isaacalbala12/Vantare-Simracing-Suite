# Una aplicación/ventana para todas las escenas, sin entrada física al escritorio.
param(
    [Parameter(Mandatory)][string]$Executable,
    [Parameter(Mandatory)][string]$EvidenceDirectory,
    [string[]]$Scene = @('inicio-base','workshop-base','studio-base','launcher-base','calendario-base','engineer-base','testing-center-informe','ajustes-apariencia'),
    [string]$Appearance = 'vantare-dark',
    [int[]]$Size = @(1440,900)
)
$ErrorActionPreference = 'Stop'
[void][IO.Directory]::CreateDirectory([IO.Path]::GetFullPath($EvidenceDirectory))
$manifest = Join-Path $EvidenceDirectory 'capture-batch.json'
$entries = @($Scene | ForEach-Object { @{scene=$_; appearance=$Appearance; size=$Size; output=[IO.Path]::GetFullPath((Join-Path $EvidenceDirectory "$_.png"))} })
ConvertTo-Json -InputObject $entries -Depth 20 | Set-Content -LiteralPath $manifest -Encoding utf8
& $Executable --capture-batch $manifest
if ($LASTEXITCODE) { throw "Captura en lote falló: $LASTEXITCODE" }
