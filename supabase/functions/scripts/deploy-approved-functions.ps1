param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9]{20}$')]
  [string]$ProjectRef
)

$ErrorActionPreference = "Stop"
$supabaseRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$guard = Join-Path $PSScriptRoot "verify-deploy-surface.ps1"
$approved = @("billing-checkout", "billing-portal", "billing-webhook", "license-credential")

& $guard
if ($LASTEXITCODE -ne 0) {
  throw "Supabase deploy surface guard failed"
}

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw "Supabase CLI is required"
}

Push-Location $supabaseRoot
try {
  foreach ($functionName in $approved) {
    supabase functions deploy $functionName --project-ref $ProjectRef
    if ($LASTEXITCODE -ne 0) {
      throw "Supabase deploy failed for $functionName"
    }
  }
} finally {
  Pop-Location
}
