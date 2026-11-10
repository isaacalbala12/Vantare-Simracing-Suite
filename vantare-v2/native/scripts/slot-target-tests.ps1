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
# Cargo 1.95 caches have no CACHEDIR.TAG but still need bounded disk use.
[IO.Directory]::CreateDirectory((Join-Path $target 'debug')) | Out-Null
[IO.File]::WriteAllText((Join-Path $target 'debug/.cargo-lock'), '')
[IO.File]::WriteAllText((Join-Path $target '.rustc_info.json'), '{"rustc_fingerprint":123}')
[IO.File]::WriteAllText($marker, 'old Cargo artifact')
[IO.File]::SetLastWriteTimeUtc($stamp, [DateTime]::UtcNow.AddDays(-15))
$null = Initialize-VantareSlotTarget -Slot 0 -Root $root
if (Test-Path -LiteralPath $marker) { throw 'No se limpió el target Cargo 1.95 caducado.' }
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
$runnerBefore = $env:RUNNER_ENVIRONMENT
$temporaryBefore = $env:RUNNER_TEMP
try {
    $env:RUNNER_ENVIRONMENT = 'github-hosted'
    $env:RUNNER_TEMP = Join-Path $root 'runner-temp'
    $hosted = Initialize-VantareSlotTarget -Slot 1 -Root (Join-Path $env:RUNNER_TEMP 'vantare-targets') -Ci
    if ($hosted -ine (Join-Path $env:RUNNER_TEMP 'vantare-targets/ci')) { throw 'CI no usa RUNNER_TEMP.' }
    foreach ($invalid in @('C:/outside-runner', $root, (Join-Path $env:RUNNER_TEMP '../escape'))) {
        if (Test-VantareTargetPath $invalid) { throw 'Se aceptó una ruta fuera del temporal del runner.' }
    }
    'PASS: GitHub usa RUNNER_TEMP y rechaza rutas externas o con escape.'
} finally {
    if ($null -eq $runnerBefore) { Remove-Item Env:RUNNER_ENVIRONMENT -ErrorAction SilentlyContinue }
    else { $env:RUNNER_ENVIRONMENT = $runnerBefore }
    if ($null -eq $temporaryBefore) { Remove-Item Env:RUNNER_TEMP -ErrorAction SilentlyContinue }
    else { $env:RUNNER_TEMP = $temporaryBefore }
}

$targetRootBefore = $env:VANTARE_TARGET_ROOT
try {
    $env:VANTARE_TARGET_ROOT = 'C:/portable-worker/targets'
    if ((Get-VantareTargetRoot) -ine [IO.Path]::GetFullPath($env:VANTARE_TARGET_ROOT)) { throw 'No se respeta VANTARE_TARGET_ROOT.' }
    if (-not (Test-VantareTargetPath 'C:/portable-worker/targets/slot-0') -or (Test-VantareTargetPath 'D:/outside-configured-volume')) { throw 'La validación no sigue el volumen configurado.' }
    'PASS: raíz configurable de otro PC, sin crear targets en C: en este servidor.'
} finally {
    if ($null -eq $targetRootBefore) { Remove-Item Env:VANTARE_TARGET_ROOT -ErrorAction SilentlyContinue }
    else { $env:VANTARE_TARGET_ROOT = $targetRootBefore }
}
