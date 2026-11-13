# Construcción del zip en servidor; no ejecuta binarios del kit.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Manifest,
    [Parameter(Mandatory)][string]$Staging,
    [Parameter(Mandatory)][string]$Output,
    [string]$Dumpbin = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\dumpbin.exe'
)
$ErrorActionPreference = 'Stop'
$python = @(Get-Command python -CommandType Application -ErrorAction Stop)[0].Source
& $python (Join-Path $PSScriptRoot 'package.py') $Manifest --staging $Staging --output $Output --dumpbin $Dumpbin
if ($LASTEXITCODE) { throw "Paquete incompleto: $LASTEXITCODE. Conservar el staging para revisar el fallo." }
