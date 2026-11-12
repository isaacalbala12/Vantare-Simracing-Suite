$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'RONDAS.ps1')
function Assert($condition, $message) { if (-not $condition) { throw $message } }
function MustThrow([scriptblock]$Action) {
    $caught = $false
    try { & $Action | Out-Null } catch { $caught = $true }
    Assert $caught 'Se acepto una operacion invalida'
}
$plan = @(New-VantareOverlayPlan)
Assert ($plan.Count -eq 64) 'Plan incompleto'
foreach ($round in 1..8) {
    foreach ($block in @('aa','ab')) {
        $rows = @($plan | Where-Object { $_.round -eq $round -and $_.block -eq $block })
        $expected = if ($round % 2) { 'ABBA' } else { 'BAAB' }
        Assert (($rows.role -join '') -eq $expected) 'Contrabalanceo incorrecto'
        if ($block -eq 'aa') { Assert (@($rows | Where-Object variant -ne 'gpui').Count -eq 0) 'A/A usa otro binario' }
    }
}
Assert (@($plan.id | Select-Object -Unique).Count -eq 64) 'Identidades repetidas'
Assert ((@(New-VantareOverlayPlan -Rounds 24 -Comparison gpui_fast -Copies 4 -Hz 144 -Load $true)).Count -eq 192) 'Plan largo incorrecto'
$root = Join-Path ([IO.Path]::GetTempPath()) ('vanta141-plan-' + [guid]::NewGuid().ToString('N'))
$ledger = Join-Path $root 'intentos.jsonl'
$hash = 'a' * 64
MustThrow { Complete-VantareAttempt -Ledger $ledger -Family principal -Attempt 1 -Status invalid -Reason prueba }
$first = Register-VantareAttempt -Ledger $ledger -Family principal -ManifestSha256 $hash
Assert ($first.attempt -eq 1) 'Primer intento incorrecto'
Complete-VantareAttempt -Ledger $ledger -Family principal -Attempt 1 -Status invalid -Reason prueba
MustThrow { Complete-VantareAttempt -Ledger $ledger -Family principal -Attempt 1 -Status complete -Reason duplicado }
MustThrow { Complete-VantareAttempt -Ledger $ledger -Family principal -Attempt 2 -Status complete -Reason sin_inicio }
$null = Register-VantareAttempt -Ledger $ledger -Family principal -ManifestSha256 $hash
$null = Register-VantareAttempt -Ledger $ledger -Family principal -ManifestSha256 $hash
MustThrow { Register-VantareAttempt -Ledger $ledger -Family principal -ManifestSha256 $hash }
$records = @(Get-Content -LiteralPath $ledger | ConvertFrom-Json)
Assert ($records.Count -eq 4) 'Se perdieron los intentos fallidos'
Write-Output "PASS: ABBA/BAAB, A/A, limites e intentos conservados. Evidencia: $root"
