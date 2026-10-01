<# Captura un renderer productivo con una foto fija y compara RGBA premultiplicado.
   Desde native/: .\ui\compare.ps1 -Widget pedals
   Referencias ausentes y errores de captura fallan; no se crean referencias. #>
param(
    [Parameter(Mandatory)][ValidatePattern('^[a-z][a-z0-9_-]*$')][string]$Widget,
    [string]$Scene = (Join-Path $PSScriptRoot "fixtures\$Widget.snapshot.json"),
    [string]$Reference = (Join-Path $PSScriptRoot "reference\$Widget.png"),
    [string]$Diff = (Join-Path $PSScriptRoot 'diff.py'),
    [string]$Out = (Join-Path $env:TEMP "vantare-parity\$Widget"),
    [ValidateRange(0, 255)][int]$Threshold = 8,
    [ValidateRange(0, 100)][double]$MaxPercent = 4.0
)
$ErrorActionPreference = 'Stop'
# Los widgets con traza usan una secuencia de fotos: tiene prioridad si existe.
$sequence = Join-Path $PSScriptRoot "fixtures\$Widget.sequence.json"
if (-not $PSBoundParameters.ContainsKey('Scene') -and (Test-Path -LiteralPath $sequence)) { $Scene = $sequence }
foreach ($file in $Scene, $Reference, $Diff) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "falta $file" }
}
# Resolver antes de cambiar el directorio de Cargo, también los argumentos relativos.
$Scene = (Resolve-Path -LiteralPath $Scene).Path
$Reference = (Resolve-Path -LiteralPath $Reference).Path
$Diff = (Resolve-Path -LiteralPath $Diff).Path
New-Item -ItemType Directory -Force $Out | Out-Null
$Out = (Resolve-Path -LiteralPath $Out).Path
$candidate = Join-Path $Out "$Widget.png"
Push-Location (Split-Path $PSScriptRoot)
try {
    cargo build -q -p vantare-ui --features parity-capture --bin vantare-workshop -j 2
    if ($LASTEXITCODE -ne 0) { throw 'la compilación falló' }
    $targetDir = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path (Get-Location) 'target' }
    $exe = Join-Path $targetDir 'debug/vantare-workshop.exe'
    # Captura del escritorio real: varios workers en paralelo solaparían sus
    # ventanas, así que solo captura uno a la vez en toda la máquina.
    $mutex = [System.Threading.Mutex]::new($false, 'Global\VantareParityCapture')
    [void]$mutex.WaitOne()
    try {
        & $exe --widget $Widget --escena $Scene --captura $candidate
        if ($LASTEXITCODE -ne 0) { throw 'la captura falló' }
    } finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
} finally { Pop-Location }
python $Diff $candidate $Reference --threshold $Threshold --max-percent $MaxPercent --out (Join-Path $Out "$Widget.diff.png")
exit $LASTEXITCODE
