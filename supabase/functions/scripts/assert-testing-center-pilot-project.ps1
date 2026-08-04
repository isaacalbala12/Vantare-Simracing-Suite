param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9]{20}$')]
  [string]$ProjectRef,

  [string]$LinkedProjectRefPath
)

$ErrorActionPreference = "Stop"
$testingProjectRef = "lbaxvpzexoferfvfkplz"

if ($ProjectRef -cne $testingProjectRef) {
  throw "Testing Center pilot is restricted to the reviewed Supabase testing project"
}

if ($LinkedProjectRefPath) {
  if (-not (Test-Path -LiteralPath $LinkedProjectRefPath -PathType Leaf)) {
    throw "Linked Supabase project ref is unavailable"
  }
  $linkedProjectRef = (Get-Content -LiteralPath $LinkedProjectRefPath -Raw).Trim()
  if ($linkedProjectRef -cne $testingProjectRef) {
    throw "Linked Supabase project is not the reviewed Testing Center project"
  }
}

Write-Output "Testing Center pilot project verified"
