param([Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'slot-workspace.ps1')
$target = Join-Path ([IO.Path]::GetFullPath($EvidenceDirectory)) ('fresh-slot-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory((Join-Path $target 'tmp')) | Out-Null
[IO.File]::WriteAllText((Join-Path $target '.vantare-last-build'), 'queue stamp')
function cargo { throw 'Un target nuevo no debe invocar cargo clean.' }
Set-VantareSlotWorkspace -Target (Join-Path $target 'new-explicit-target') -NativeRoot $PSScriptRoot
Remove-Item -LiteralPath (Join-Path $target 'new-explicit-target/.vantare-workspace')
[IO.Directory]::Delete((Join-Path $target 'new-explicit-target'))
Set-VantareSlotWorkspace -Target $target -NativeRoot $PSScriptRoot
if ([IO.File]::ReadAllText((Join-Path $target '.vantare-workspace')) -cne $PSScriptRoot) {
    throw 'No se ha registrado el primer checkout.'
}
if (Test-Path -LiteralPath (Join-Path $target 'CACHEDIR.TAG')) { throw 'No inventar el tag de Cargo.' }
[IO.File]::WriteAllText((Join-Path $target 'foreign.txt'), 'preserve')
$rejected = $false
try { Set-VantareSlotWorkspace -Target $target -NativeRoot (Split-Path $PSScriptRoot) }
catch { $rejected = $_.Exception.Message -like '*contenido desconocido*' }
if (-not $rejected -or -not (Test-Path -LiteralPath (Join-Path $target 'foreign.txt'))) {
    throw 'El target desconocido debe rechazarse sin borrar contenido.'
}
'PASS: primer slot sin clean; contenido desconocido conservado y rechazado.'
