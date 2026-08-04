$ErrorActionPreference = "Stop"
$guard = Join-Path $PSScriptRoot "assert-testing-center-pilot-project.ps1"
$testingRef = "lbaxvpzexoferfvfkplz"
$productionRef = "ombjshwzqgeisazijduq"
$unrelatedRef = "aaaaaaaaaaaaaaaaaaaa"
$uppercaseTestingRef = $testingRef.ToUpperInvariant()
$linkedRefPath = Join-Path $env:TEMP (
  "vantare-isa289-linked-project-ref-" + [Guid]::NewGuid().ToString("N")
)

function Assert-Throws([scriptblock]$Action, [string]$Name) {
  try {
    & $Action
  } catch {
    return
  }
  throw "$Name did not fail closed"
}

& $guard -ProjectRef $testingRef | Out-Null
Assert-Throws { & $guard -ProjectRef $productionRef } "production ref"
Assert-Throws { & $guard -ProjectRef $unrelatedRef } "unrelated ref"
Assert-Throws { & $guard -ProjectRef $uppercaseTestingRef } "uppercase ref"
Assert-Throws {
  & $guard -ProjectRef $testingRef -LinkedProjectRefPath $linkedRefPath
} "missing linked ref"

try {
  Set-Content -LiteralPath $linkedRefPath -Value $productionRef -NoNewline
  Assert-Throws {
    & $guard -ProjectRef $testingRef -LinkedProjectRefPath $linkedRefPath
  } "mismatched linked ref"
  Set-Content -LiteralPath $linkedRefPath -Value $uppercaseTestingRef -NoNewline
  Assert-Throws {
    & $guard -ProjectRef $testingRef -LinkedProjectRefPath $linkedRefPath
  } "uppercase linked ref"
  Set-Content -LiteralPath $linkedRefPath -Value $testingRef -NoNewline
  & $guard -ProjectRef $testingRef -LinkedProjectRefPath $linkedRefPath | Out-Null
} finally {
  if (Test-Path -LiteralPath $linkedRefPath) {
    Remove-Item -LiteralPath $linkedRefPath -Force
  }
}

Write-Output "Testing Center pilot project guard tests passed"
