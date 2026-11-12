[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Resumen,
    [string]$Salida
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$inputFile = (Resolve-Path -LiteralPath $Resumen).Path
if (-not $Salida) {
    $Salida = Join-Path (Split-Path $inputFile) ('veredicto-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.json')
}
$outputFile = [IO.Path]::GetFullPath($Salida)
if (Test-Path -LiteralPath $outputFile) { throw 'Conservar el veredicto anterior: indicar un archivo nuevo.' }
if (-not (Test-Path -LiteralPath (Split-Path $outputFile) -PathType Container)) {
    throw 'La carpeta de salida debe existir.'
}
$python = @(Get-Command python -CommandType Application -ErrorAction Stop)[0].Source
& $python (Join-Path $PSScriptRoot 'analizar.py') $inputFile --output $outputFile
$code = $LASTEXITCODE
if (-not (Test-Path -LiteralPath $outputFile)) { throw "No se genero veredicto: Python termino con $code." }
Write-Output "Veredicto guardado: $outputFile"
exit $code
