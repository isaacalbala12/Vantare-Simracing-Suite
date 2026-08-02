param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9]{20}$')]
  [string]$ProjectRef,

  [Parameter(Mandatory = $true)]
  [ValidateSet("staging", "production")]
  [string]$Target
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_ACCESS_TOKEN)) {
  throw "SUPABASE_ACCESS_TOKEN is required"
}
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw "Supabase CLI is required"
}

function Invoke-JsonRequest {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][hashtable]$Headers,
    [object]$Body = $null
  )

  $parameters = @{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
    SkipHttpErrorCheck = $true
    TimeoutSec = 60
  }
  if ($null -ne $Body) {
    $parameters.ContentType = "application/json"
    $parameters.Body = $Body | ConvertTo-Json -Compress -Depth 8
  }
  Invoke-WebRequest @parameters
}

function Get-ResponseErrorCode {
  param([Parameter(Mandatory = $true)]$Response)

  try {
    $body = $Response.Content | ConvertFrom-Json
    if ($body.error -is [string]) {
      return [string]$body.error
    }
    if ($body.error.code) {
      return [string]$body.error.code
    }
  } catch {
    return ""
  }
  return ""
}

$baseUrl = "https://$ProjectRef.supabase.co"
$userId = $null
$serviceKey = $null

try {
  $keysJson = (& supabase projects api-keys --project-ref $ProjectRef --output json 2>$null) -join "`n"
  if ($LASTEXITCODE -ne 0) {
    throw "Could not obtain project API keys"
  }
  $keys = $keysJson | ConvertFrom-Json
  $anonKey = [string](
    ($keys | Where-Object { $_.name -eq "anon" -and $_.type -eq "legacy" } |
      Select-Object -First 1).api_key
  )
  $serviceKey = [string](
    ($keys | Where-Object {
      $_.name -eq "service_role" -and $_.type -eq "legacy"
    } | Select-Object -First 1).api_key
  )
  if (-not $anonKey -or -not $serviceKey) {
    throw "Required project API keys are unavailable"
  }

  $suffix = [guid]::NewGuid().ToString("N")
  $email = "billing-smoke-$suffix@example.invalid"
  $password = [Convert]::ToBase64String(
    [Security.Cryptography.RandomNumberGenerator]::GetBytes(36)
  )
  $adminHeaders = @{
    apikey = $serviceKey
    Authorization = "Bearer $serviceKey"
  }
  $created = Invoke-JsonRequest POST "$baseUrl/auth/v1/admin/users" `
    $adminHeaders @{ email = $email; password = $password; email_confirm = $true }
  if ([int]$created.StatusCode -ne 200) {
    throw "Synthetic user creation failed with HTTP $([int]$created.StatusCode)"
  }
  $userId = [string](($created.Content | ConvertFrom-Json).id)
  if (-not $userId) {
    throw "Synthetic user id is missing"
  }
  Write-Output "synthetic_user_create=PASS"

  $login = Invoke-JsonRequest POST `
    "$baseUrl/auth/v1/token?grant_type=password" `
    @{ apikey = $anonKey } `
    @{ email = $email; password = $password }
  if ([int]$login.StatusCode -ne 200) {
    throw "Synthetic login failed with HTTP $([int]$login.StatusCode)"
  }
  $accessToken = [string](($login.Content | ConvertFrom-Json).access_token)
  if (-not $accessToken) {
    throw "Synthetic access token is missing"
  }
  $userHeaders = @{
    apikey = $anonKey
    Authorization = "Bearer $accessToken"
  }
  Write-Output "synthetic_user_login=PASS"

  if ($Target -eq "staging") {
    $checkout = Invoke-JsonRequest POST `
      "$baseUrl/functions/v1/billing-checkout" `
      $userHeaders `
      @{ productKey = "pro_monthly"; attemptId = [guid]::NewGuid().ToString() }
    $checkoutCode = Get-ResponseErrorCode $checkout
    Write-Output "checkout_fail_closed_http=$([int]$checkout.StatusCode) code=$checkoutCode"
    if (
      [int]$checkout.StatusCode -ne 503 -or
      $checkoutCode -notmatch '^mapping_'
    ) {
      throw "Staging checkout did not fail closed"
    }
  } else {
    # Never exercise an authenticated production checkout in this smoke. A
    # valid request could create a real provider checkout even without payment.
    $checkout = Invoke-JsonRequest POST `
      "$baseUrl/functions/v1/billing-checkout" `
      @{ apikey = $anonKey; Authorization = "Bearer $anonKey" } `
      @{ productKey = "pro_monthly"; attemptId = [guid]::NewGuid().ToString() }
    Write-Output "checkout_unauthorized_http=$([int]$checkout.StatusCode)"
    if ([int]$checkout.StatusCode -ne 401) {
      throw "Production checkout auth guard failed"
    }
  }

  $portal = Invoke-JsonRequest POST `
    "$baseUrl/functions/v1/billing-portal" $userHeaders @{}
  $portalCode = Get-ResponseErrorCode $portal
  Write-Output "portal_without_customer_http=$([int]$portal.StatusCode) code=$portalCode"
  if ([int]$portal.StatusCode -ne 404) {
    throw "Portal without a billing customer did not return 404"
  }

  $credential = Invoke-JsonRequest POST `
    "$baseUrl/functions/v1/license-credential" `
    $userHeaders `
    @{ deviceFingerprint = ("a" * 64) }
  $credentialBody = $credential.Content | ConvertFrom-Json
  $emptyGrants = @($credentialBody.credential.claims.capabilities).Count -eq 0
  $credentialIsValid = [int]$credential.StatusCode -eq 200 -and
    $credentialBody.credential.version -eq 1 -and
    $credentialBody.credential.algorithm -eq "Ed25519" -and
    $emptyGrants
  Write-Output "license_credential_http=$([int]$credential.StatusCode) empty_grants=$emptyGrants"
  if (-not $credentialIsValid) {
    throw "Non-commercial license credential smoke failed"
  }

  $missingHeaders = Invoke-JsonRequest POST `
    "$baseUrl/functions/v1/billing-webhook" @{} `
    @{ type = "order.paid"; data = @{} }
  $missingCode = Get-ResponseErrorCode $missingHeaders
  Write-Output "webhook_missing_headers_http=$([int]$missingHeaders.StatusCode) code=$missingCode"
  if (
    [int]$missingHeaders.StatusCode -ne 400 -or
    $missingCode -ne "missing_webhook_headers"
  ) {
    throw "Webhook missing-header guard failed"
  }

  $invalidSignature = Invoke-JsonRequest POST `
    "$baseUrl/functions/v1/billing-webhook" `
    @{
      "webhook-id" = "billing-smoke-invalid-signature"
      "webhook-timestamp" = [string][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
      "webhook-signature" = "v1,invalid"
    } `
    @{ type = "order.paid"; data = @{} }
  $invalidCode = Get-ResponseErrorCode $invalidSignature
  Write-Output "webhook_invalid_signature_http=$([int]$invalidSignature.StatusCode) code=$invalidCode"
  if (
    [int]$invalidSignature.StatusCode -ne 403 -or
    $invalidCode -ne "invalid_webhook_signature"
  ) {
    throw "Webhook signature guard failed"
  }

  $snapshot = Invoke-JsonRequest POST `
    "$baseUrl/rest/v1/rpc/billing_observability_snapshot" `
    $adminHeaders `
    @{ p_environment = $(if ($Target -eq "staging") { "sandbox" } else { "production" }) }
  if ([int]$snapshot.StatusCode -ne 200) {
    throw "Observability RPC failed with HTTP $([int]$snapshot.StatusCode)"
  }
  $snapshotBody = $snapshot.Content | ConvertFrom-Json
  $sections = @($snapshotBody.PSObject.Properties.Name | Sort-Object)
  $requiredSections = @(
    "environment",
    "inbox",
    "observedAt",
    "projection",
    "reconciliation",
    "schemaVersion"
  )
  if ($requiredSections | Where-Object { $_ -notin $sections }) {
    throw "Observability snapshot shape is incomplete"
  }
  Write-Output "observability_http=200 sections=$($sections -join ',')"
  Write-Output "$($Target)_nonmonetary_smoke=PASS"
} finally {
  if ($userId -and $serviceKey) {
    $cleanup = Invoke-WebRequest -Method DELETE `
      -Uri "$baseUrl/auth/v1/admin/users/$userId" `
      -Headers @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" } `
      -SkipHttpErrorCheck `
      -TimeoutSec 60
    Write-Output "synthetic_user_cleanup_http=$([int]$cleanup.StatusCode)"
    if ([int]$cleanup.StatusCode -notin @(200, 204)) {
      throw "Synthetic user cleanup failed"
    }
  }
}
