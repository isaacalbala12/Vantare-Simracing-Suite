param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9]{20}$')]
  [string]$ProjectRef,
  [ValidateSet("billing-checkout", "billing-portal", "billing-webhook", "license-credential", "native-license")]
  [string[]]$Functions = @("billing-checkout", "billing-portal", "billing-webhook", "license-credential")
)

$ErrorActionPreference = "Stop"
$supabaseRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$guard = Join-Path $PSScriptRoot "verify-deploy-surface.ps1"

& $guard

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw "Supabase CLI is required"
}

Push-Location $supabaseRoot
try {
  foreach ($functionName in $Functions) {
    supabase functions deploy $functionName --project-ref $ProjectRef
    if ($LASTEXITCODE -ne 0) {
      throw "Supabase deploy failed for $functionName"
    }
  }
} finally {
  Pop-Location
}
