[CmdletBinding(DefaultParameterSetName='Normalized')]
param(
 [Parameter(Mandatory,ParameterSetName='Normalized')][string]$Resumen,
 [Parameter(Mandatory,ParameterSetName='Raw')][string]$Carpeta,
 [string]$Salida
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$sourcePath=if($PSCmdlet.ParameterSetName -eq 'Raw'){(Resolve-Path -LiteralPath $Carpeta).Path}else{(Resolve-Path -LiteralPath $Resumen).Path}
$baseDirectory=if($PSCmdlet.ParameterSetName -eq 'Raw'){$sourcePath}else{Split-Path $sourcePath}
if(-not $Salida){$Salida=Join-Path $baseDirectory ('veredicto-'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'.json')}
$outputFile=[IO.Path]::GetFullPath($Salida)
if(Test-Path -LiteralPath $outputFile){throw 'Conservar el veredicto anterior: indicar otro archivo.'}
if(-not(Test-Path -LiteralPath (Split-Path $outputFile) -PathType Container)){throw 'Debe existir la carpeta de salida.'}
$python=@(Get-Command python -CommandType Application -ErrorAction Stop)[0].Source
$analysisRoot=if(Test-Path (Join-Path $PSScriptRoot 'analisis/analizar.py')){Join-Path $PSScriptRoot 'analisis'}else{$PSScriptRoot}
try {
 if($PSCmdlet.ParameterSetName -eq 'Raw'){
  . (Join-Path $PSScriptRoot 'VALIDAR_TERMICAS.ps1')
  Test-VantareRawThermals -Root $sourcePath
  $normalized=$outputFile+'.normalizado.json'
  if(Test-Path $normalized){throw 'No sobrescribir evidencia normalizada.'}
  & $python (Join-Path $analysisRoot 'normalizar.py') $sourcePath --output $normalized
  if($LASTEXITCODE){throw 'No se pudo cruzar la evidencia cruda; revisar el error de normalización.'}
  $inputFile=$normalized
 }else{$inputFile=$sourcePath}
 & $python (Join-Path $analysisRoot 'analizar.py') $inputFile --output $outputFile
 $code=$LASTEXITCODE
 if(-not(Test-Path $outputFile)){throw 'El analizador no generó veredicto.'}
 Write-Output "Veredicto guardado: $outputFile"
 exit $code
}catch{
 $result=[ordered]@{adopted=$false;verdict='evidencia_invalida';reason=$_.Exception.Message}
 $stream=[IO.File]::Open($outputFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
 $writer=[IO.StreamWriter]::new($stream,[Text.UTF8Encoding]::new($false))
 try{$writer.Write(($result|ConvertTo-Json -Depth 4))}finally{$writer.Dispose()}
 Write-Output "Evidencia inválida; conservada en $outputFile"
 exit 2
}
