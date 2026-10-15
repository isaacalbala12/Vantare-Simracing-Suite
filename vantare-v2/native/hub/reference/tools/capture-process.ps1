param(
    [Parameter(Mandatory)][int]$ProcessId,
    [Parameter(Mandatory)][string]$ExpectedExecutable,
    [Parameter(Mandatory)][string]$OutputPath,
    [Parameter(Mandatory)][string]$Screen,
    [Parameter(Mandatory)][string]$CaptureScript,
    [Parameter(Mandatory)][string]$RepositoryRoot,
    [ValidateRange(0, 8192)][int]$Width = 0,
    [ValidateRange(0, 8192)][int]$Height = 0
)
$ErrorActionPreference = 'Stop'
throw 'Retirado: el Hub captura dentro de su proceso. Usa --capture-batch manifiesto.json (o --capture con --out). No se inicia un capturador por PNG.'
