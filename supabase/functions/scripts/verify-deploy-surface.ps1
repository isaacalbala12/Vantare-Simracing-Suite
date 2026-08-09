$ErrorActionPreference = "Stop"

$functionsRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$production = @("billing-checkout", "billing-portal", "billing-webhook", "license-credential")
$testingPilot = @("testing-center-feedback", "testing-center-linear-webhook", "testing-center-linear-worker")
$allowed = $production + $testingPilot
$infrastructure = @("_deprecated", "_shared", "scripts")
$known = $allowed + $infrastructure
$unexpected = Get-ChildItem -LiteralPath $functionsRoot -Directory |
  Where-Object { $_.Name -notin $known } |
  Select-Object -ExpandProperty Name |
  Sort-Object

if ($unexpected.Count -gt 0) {
  throw "Blocked unexpected deployable Supabase Functions: $($unexpected -join ', ')"
}

foreach ($functionName in $allowed) {
  $entrypoint = Join-Path $functionsRoot "$functionName\index.ts"
  if (-not (Test-Path -LiteralPath $entrypoint -PathType Leaf)) {
    throw "Missing approved Supabase Function entrypoint: $functionName/index.ts"
  }
}

Write-Output "Deploy surface verified: $($allowed -join ', ')"
