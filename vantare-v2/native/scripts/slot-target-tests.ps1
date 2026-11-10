param([Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($EvidenceDirectory -notmatch '^[dD]:[\\/]') { throw 'Evidencia en D: requerida.' }
. (Join-Path $PSScriptRoot 'target-slot.ps1')
$root = Join-Path ([IO.Path]::GetFullPath($EvidenceDirectory)) ('slot-clean-' + [guid]::NewGuid().ToString('N'))
$target = Initialize-VantareSlotTarget -Slot 0 -Root $root
$tag = Join-Path $target 'CACHEDIR.TAG'
$marker = Join-Path $target 'disposable.txt'
$stamp = Join-Path $target '.vantare-last-build'
$lockPath = Join-Path $target '.cargo-lock'
[IO.File]::WriteAllText($tag, 'Signature: 8a477f597d28d172789f06886806bc55')
[IO.File]::WriteAllText($marker, 'regenerable')
[IO.File]::WriteAllText($lockPath, '')
[IO.File]::SetLastWriteTimeUtc($stamp, [DateTime]::UtcNow.AddDays(-15))
$lock = [IO.File]::Open($lockPath, 'Open', 'ReadWrite', 'None')
try {
    $rejected = $false
    try { $null = Initialize-VantareSlotTarget -Slot 0 -Root $root } catch { $rejected = $true }
    if (-not $rejected -or -not (Test-Path -LiteralPath $marker)) { throw 'Se limpió un target ocupado.' }
} finally { $lock.Dispose() }
$null = Initialize-VantareSlotTarget -Slot 0 -Root $root
if (Test-Path -LiteralPath $marker) { throw 'No se limpió el target caducado.' }
if (-not (Test-Path -LiteralPath $stamp)) { throw 'No se renovó el slot.' }
$outside = Join-Path $root 'outside'
[IO.Directory]::CreateDirectory($outside) | Out-Null
$sentinel = Join-Path $outside 'keep.txt'
[IO.File]::WriteAllText($sentinel, 'conservar')
[IO.File]::WriteAllText($tag, 'Signature: 8a477f597d28d172789f06886806bc55')
$junction = Join-Path $target 'junction'
New-Item -ItemType Junction -Path $junction -Target $outside | Out-Null
try {
    $rejected = $false
    try { $null = Initialize-VantareSlotTarget -Slot 0 -Root $root } catch { $rejected = $true }
    if (-not $rejected -or -not (Test-Path -LiteralPath $sentinel)) { throw 'No se protegió el enlace.' }
} finally { Remove-Item -LiteralPath $junction -Force }
'PASS: limpieza por antigüedad, target ocupado y enlaces protegidos.'
