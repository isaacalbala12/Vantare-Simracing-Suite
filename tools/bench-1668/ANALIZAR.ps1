param([Parameter(Mandatory=$true)][string]$Zip,
 [string]$Output='C:/VantareServer/evidence/bench-1668')
$ErrorActionPreference='Stop'
python "$PSScriptRoot/analyze_zip.py" $Zip --output $Output
if($LASTEXITCODE -ne 0){throw 'No se pudo analizar el ZIP; no se declara resultado válido'}
