param([string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Falta python para el test de includes.' }
& python (Join-Path $PSScriptRoot 'include_inputs.py')
exit $LASTEXITCODE
