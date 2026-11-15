param([Parameter(Mandatory)][string]$EvidenceDirectory)
[IO.Directory]::CreateDirectory($EvidenceDirectory) | Out-Null
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$fake = Join-Path $EvidenceDirectory 'sccache-retry-fake.ps1'
$marker = Join-Path $EvidenceDirectory 'sccache-retry-marker.txt'
Remove-Item -LiteralPath $marker -ErrorAction SilentlyContinue
$template = @'
if ($env:VANTARE_SCCACHE -eq '0') {
    Add-Content -LiteralPath '__MARKER__' -Value 'retry'
    exit 0
}
Add-Content -LiteralPath '__MARKER__' -Value 'first'
exit -1073741819
'@
$template.Replace('__MARKER__', $marker.Replace("'", "''")) | Set-Content -LiteralPath $fake -Encoding utf8

$previousSccache = $env:VANTARE_SCCACHE
$target = Join-Path $EvidenceDirectory 'sccache-retry-target'
if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
try {
    Remove-Item Env:VANTARE_SCCACHE -ErrorAction SilentlyContinue
    $output = & (Join-Path $PSScriptRoot 'compilar.ps1') pwsh -NoProfile -File $fake -TargetDirectory $target *>&1
    $rc = $LASTEXITCODE
} finally {
    if ($null -ne $previousSccache) { $env:VANTARE_SCCACHE = $previousSccache }
    else { Remove-Item Env:VANTARE_SCCACHE -ErrorAction SilentlyContinue }
}
if ($rc) { throw "El compilar debía reintentar y terminar en 0; rc=$rc." }
$lines = @(Get-Content -LiteralPath $marker -ErrorAction SilentlyContinue)
if ($lines -notcontains 'first') { throw 'No se ejecutó el primer intento.' }
if ($lines -notcontains 'retry') { throw 'No se ejecutó el reintento sin sccache.' }
if (($output -join "`n") -notmatch 'reintento una vez sin sccache') { throw 'Falta el aviso del reintento.' }
'PASS: 0xC0000005 reintenta una vez con VANTARE_SCCACHE=0 y conserva ambos intentos.'
