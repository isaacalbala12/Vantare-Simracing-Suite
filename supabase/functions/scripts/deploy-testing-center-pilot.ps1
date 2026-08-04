param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9]{20}$')]
  [string]$ProjectRef,

  [Parameter(Mandatory = $true)]
  [ValidateSet('DEPLOY-ISA-243-TESTING-PILOT')]
  [string]$Confirmation
)

$ErrorActionPreference = "Stop"
$supabaseRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$guard = Join-Path $PSScriptRoot "verify-deploy-surface.ps1"
$projectGuard = Join-Path $PSScriptRoot "assert-testing-center-pilot-project.ps1"
$approved = @(
  "testing-center-feedback",
  "testing-center-linear-webhook",
  "testing-center-linear-worker"
)

if ($Confirmation -ne "DEPLOY-ISA-243-TESTING-PILOT") {
  throw "Explicit ISA-243 testing pilot confirmation is required"
}
& $projectGuard -ProjectRef $ProjectRef

& $guard
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw "Supabase CLI is required"
}

Push-Location $supabaseRoot
try {
  foreach ($functionName in $approved) {
    supabase functions deploy $functionName --project-ref $ProjectRef
    if ($LASTEXITCODE -ne 0) {
      throw "Supabase testing pilot deploy failed for $functionName"
    }
  }
} finally {
  Pop-Location
}
