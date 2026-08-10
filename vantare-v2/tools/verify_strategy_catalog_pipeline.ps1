$ErrorActionPreference = "Stop"

$generatorPath = Join-Path $PSScriptRoot "generate_supabase_config.ps1"
$workflowPath = Join-Path $PSScriptRoot "..\..\.github\workflows\strategy-catalog.yml"
$releaseWorkflowPath = Join-Path $PSScriptRoot "..\..\.github\workflows\release.yml"
$temporaryOutput = Join-Path ([IO.Path]::GetTempPath()) ("vantare-strategy-catalog-{0}.go" -f [Guid]::NewGuid().ToString("N"))
$publicEnvironmentNames = @(
  "VANTARE_SUPABASE_URL",
  "VANTARE_SUPABASE_ANON_KEY",
  "VANTARE_LICENSE_PUBLIC_KEYS",
  "VANTARE_STRATEGY_CATALOG_URL",
  "VANTARE_STRATEGY_CATALOG_TRUSTED_KEYS"
)
$previousEnvironment = @{}
foreach ($name in $publicEnvironmentNames) {
  $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}

try {
  $generator = Get-Content -LiteralPath $generatorPath -Raw
  if ($generator.Contains("VANTARE_STRATEGY_CATALOG_SIGNING_KEY")) {
    throw "The build generator must never accept the private signing key"
  }
  foreach ($requiredName in @("VANTARE_STRATEGY_CATALOG_URL", "VANTARE_STRATEGY_CATALOG_TRUSTED_KEYS")) {
    if (-not $generator.Contains($requiredName)) {
      throw "The build generator is missing public catalog input $requiredName"
    }
  }

  $env:VANTARE_SUPABASE_URL = ""
  $env:VANTARE_SUPABASE_ANON_KEY = ""
  $env:VANTARE_LICENSE_PUBLIC_KEYS = ""
  $env:VANTARE_STRATEGY_CATALOG_URL = "https://catalog.guard.invalid/catalog.json"
  $env:VANTARE_STRATEGY_CATALOG_TRUSTED_KEYS = '{"trustVersion":"strategy.official-catalog.trust.v1","version":1,"keys":[]}'
  & $generatorPath -OutFile $temporaryOutput

  $generated = Get-Content -LiteralPath $temporaryOutput -Raw
  foreach ($assignment in @(
    "strategyCatalogURL = string(decoded)",
    "strategyCatalogTrustedKeys = string(decoded)",
    "strategyCatalogDevelopmentOverrideAllowed = false"
  )) {
    if (-not $generated.Contains($assignment)) {
      throw "Generated source is missing $assignment"
    }
  }
  if ($generated.Contains($env:VANTARE_STRATEGY_CATALOG_URL) -or $generated.Contains($env:VANTARE_STRATEGY_CATALOG_TRUSTED_KEYS)) {
    throw "Generated source must encode public configuration rather than interpolate plaintext"
  }
  if ($generated.Contains("VANTARE_STRATEGY_CATALOG_SIGNING_KEY")) {
    throw "Generated source contains the private signing key name"
  }

  $releaseWorkflow = Get-Content -LiteralPath $releaseWorkflowPath -Raw
  foreach ($publicVariable in @("VANTARE_STRATEGY_CATALOG_URL", "VANTARE_STRATEGY_CATALOG_TRUSTED_KEYS")) {
    if (-not $releaseWorkflow.Contains("${publicVariable}: `${{ vars.${publicVariable} }}")) {
      throw "Release workflow does not transport optional public variable $publicVariable"
    }
  }
  if ($releaseWorkflow.Contains("VANTARE_STRATEGY_CATALOG_SIGNING_KEY")) {
    throw "Release workflow must never receive the private catalog signing key"
  }

  $workflow = Get-Content -LiteralPath $workflowPath -Raw
  foreach ($requiredFragment in @(
    "workflow_dispatch:",
    "trusted_keys:",
    "environment: strategy-catalog-signing",
    "if: github.ref == 'refs/heads/master'",
    'ref: ${{ github.sha }}',
    'secrets.VANTARE_STRATEGY_CATALOG_SIGNING_KEY',
    "go test -count=1 ./internal/strategy/catalog/... ./cmd/strategy-catalog",
    "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
    "actions/setup-go@40f1582b2485089dde7abd97c1529aa768e1baff",
    "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    '-trusted-keys "$GITHUB_WORKSPACE/$TRUSTED_KEYS_PATH"',
    '${{ steps.sign.outputs.artifact_dir }}/strategy-catalog.json',
    "strategy-catalog.json.sha256",
    '".." in lexical.parts',
    'candidate.relative_to(allowed)',
    'resolved_paths["trusted_keys_path"].relative_to(resolved_paths["manifest_path"].parent)'
  )) {
    if (-not $workflow.Contains($requiredFragment)) {
      throw "Strategy catalog workflow is missing required guard: $requiredFragment"
    }
  }
  if ($workflow -match '(?m)^\s{2}(push|pull_request|release|schedule|workflow_run|repository_dispatch):' -or $workflow -match '(?i)\b(git push|gh release|create-release)\b') {
    throw "Strategy catalog workflow must remain manual and artifact-only"
  }
  if ($workflow -match 'actions/(checkout|setup-go|upload-artifact)@v\d') {
    throw "Strategy catalog workflow actions must use audited immutable SHAs"
  }
  $triggerBlock = [regex]::Match($workflow, '(?ms)^on:\s*\r?\n(?<body>.*?)(?=^[^\s])')
  if (-not $triggerBlock.Success) {
    throw "Strategy catalog workflow must declare an explicit trigger block"
  }
  $triggers = @([regex]::Matches($triggerBlock.Groups['body'].Value, '(?m)^\s{2}([A-Za-z0-9_-]+):') | ForEach-Object { $_.Groups[1].Value })
  if ($triggers.Count -ne 1 -or $triggers[0] -ne 'workflow_dispatch') {
    throw "Strategy catalog workflow must expose only workflow_dispatch"
  }

  Write-Host "strategy catalog pipeline guard: PASS"
}
finally {
  foreach ($name in $publicEnvironmentNames) {
    [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], "Process")
  }
  if (Test-Path -LiteralPath $temporaryOutput) {
    Remove-Item -LiteralPath $temporaryOutput -Force
  }
}
