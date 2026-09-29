<#
Paridad visual de Standings frente a la referencia de Wails (ISA-1410).

Compila con la feature `parity-capture`, captura la escena fija `standings-44`
(474 x 364, con alfa, a 100 % de DPI) y la compara con `reference/standings-44.png`
mediante `diff.py`. Falla si falta la referencia o si el porcentaje de píxeles
distintos supera -MaxPercent (el prototipo daba 3,68 %).

  .\parity.ps1 -Parity C:\ruta\a\tools\native-ui\parity
#>
param(
    [Parameter(Mandatory)][string]$Parity,
    [string]$Out = "$env:TEMP\vantare-parity",
    [double]$MaxPercent = 4.0
)
$ErrorActionPreference = 'Stop'
$reference = Join-Path $Parity 'reference\standings-44.png'
$diff = Join-Path $Parity 'diff.py'
foreach ($file in $reference, $diff) {
    if (-not (Test-Path $file)) { throw "falta $file" }
}
New-Item -ItemType Directory -Force $Out | Out-Null
$candidate = Join-Path $Out 'standings-44.png'
Push-Location $PSScriptRoot
try {
    cargo run -q -p vantare-ui --features parity-capture --bin vantare-overlays -j 4 -- --parity-capture $candidate
    if ($LASTEXITCODE -ne 0) { throw 'la captura falló' }
} finally { Pop-Location }
python $diff $candidate $reference --threshold 8 --max-percent $MaxPercent --out (Join-Path $Out 'standings-44.diff.png')
exit $LASTEXITCODE
