# Integration regression: cached build output must not bypass a changed expected SHA.
param([Parameter(Mandatory)][string]$Out)
$ErrorActionPreference='Stop'
if (!$env:CARGO_TARGET_DIR) { throw 'Set an isolated CARGO_TARGET_DIR on D: first' }
if (Test-Path -LiteralPath $Out) { throw 'Use fresh evidence' }
$sha=(& git -C $PSScriptRoot rev-parse HEAD).Trim()
if (@(& git -C $PSScriptRoot status --porcelain).Count) { throw 'Commit source changes before testing provenance' }
New-Item -ItemType Directory -Path $Out | Out-Null
$Out=(Resolve-Path -LiteralPath $Out).Path
$previous=[Environment]::GetEnvironmentVariable('VANTARE_MEASUREMENT_SOURCE_SHA','Process')
Push-Location (Split-Path (Split-Path $PSScriptRoot))
try {
 foreach ($step in @('valid-first','wrong-sha','valid-after')) {
  $env:VANTARE_MEASUREMENT_SOURCE_SHA=if ($step -eq 'wrong-sha') { '0000000000000000000000000000000000000000' } else { $sha }
  & pwsh -NoProfile -File native/scripts/compilar.ps1 cargo build --manifest-path native/Cargo.toml --locked --release -p vantare-ui --example overlay-replay --features paint-stats -j 4 *> "$Out/$step.log"
  $code=$LASTEXITCODE
  if ($step -eq 'wrong-sha') {
   if (!$code -or (Get-Content -Raw -LiteralPath "$Out/$step.log") -notmatch 'measurement source SHA does not match') { throw 'Wrong SHA did not fail for the expected reason' }
  } else {
   if ($code) { throw "Build failed: $step" }
   $build=(& "$env:CARGO_TARGET_DIR/release/examples/overlay-replay.exe" --measurement-info | ConvertFrom-Json)
   if ($LASTEXITCODE -or $build.sha -ne $sha -or $build.dirty -ne $false -or $build.profile -ne 'release') { throw "Stale or invalid provenance: $step" }
   $build | ConvertTo-Json -Depth 5 | Set-Content "$Out/$step.json"
  }
 }
 Write-Host 'PASS: correct SHA, cached build with wrong SHA rejected, correct SHA restored'
} finally {
 Pop-Location
 [Environment]::SetEnvironmentVariable('VANTARE_MEASUREMENT_SOURCE_SHA',$previous,'Process')
}
