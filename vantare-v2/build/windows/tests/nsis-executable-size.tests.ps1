[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
$nsi = Get-Content -LiteralPath (Join-Path $repoRoot "build\windows\nsis\project.nsi")

function Assert-Size {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Get-IntCmpBranch {
    param([string[]]$Tokens, [int]$Value)
    # NSIS order: equal, val1 less, val1 greater.
    $equal = $Tokens[3]
    $less = if ($Tokens.Count -gt 4) { $Tokens[4] } else { "0" }
    $greater = if ($Tokens.Count -gt 5) { $Tokens[5] } else { "0" }
    if ($Value -lt 1024) { return $less }
    if ($Value -eq 1024) { return $equal }
    return $greater
}

$comparisons = @($nsi | ForEach-Object {
    $tokens = @($_.Trim() -split '\s+')
    if ($tokens.Count -ge 4 -and $tokens[0] -eq "IntCmp" -and $tokens[1] -eq '$1' -and $tokens[2] -eq "1024") {
        ,$tokens
    }
})
Assert-Size ($comparisons.Count -eq 2) "expected two executable size comparisons, got $($comparisons.Count)"
foreach ($tokens in $comparisons) {
    foreach ($case in @(
        @{ size = 0; expected = "transaction_failed" },
        @{ size = 1023; expected = "transaction_failed" },
        @{ size = 1024; expected = "transaction_failed" },
        @{ size = 1025; expected = "0" }
    )) {
        $actual = Get-IntCmpBranch -Tokens $tokens -Value $case.size
        Assert-Size ($actual -eq $case.expected) "IntCmp accepts/rejects size $($case.size) incorrectly: branch=$actual"
    }
}

Write-Host "PASS both NSIS executable checks reject sizes <=1024 and accept >1024."
