param([Parameter(Mandatory)][string]$EvidenceDirectory, [Parameter(Mandatory)][string]$ArchivePath)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Join-Path $EvidenceDirectory ('setup-duckdb-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
$bad = Join-Path $root 'invalid.zip'
[IO.File]::WriteAllText($bad, 'public-corrupted-archive-fixture')
$rejected = $false
try { & (Join-Path $PSScriptRoot 'setup-duckdb.ps1') -Destination (Join-Path $root 'rejected') -ArchivePath $bad }
catch [IO.InvalidDataException] { $rejected = $true }
if (-not $rejected -or (Test-Path (Join-Path $root 'rejected'))) { throw 'El hash incorrecto no se rechazó antes de crear salida.' }
$valid = Join-Path $root 'verified'
& (Join-Path $PSScriptRoot 'setup-duckdb.ps1') -Destination $valid -ArchivePath $ArchivePath
foreach ($name in @('duckdb.lib', 'duckdb.dll')) {
    if (-not (Test-Path (Join-Path $valid $name))) { throw "Falta $name después de verificar el archivo oficial." }
}
'Hash inválido rechazado sin salida; archivo oficial instalado PASS.'
