# Alternate configurations; do not silently retry discarded runs.
param(
 [Parameter(Mandatory)][string]$UI,
 [Parameter(Mandatory)][string]$Core,
 [Parameter(Mandatory)][string]$Recording,
 [Parameter(Mandatory)][string]$Out,
 [ValidateRange(5,100)][int]$Runs=5,
 [int]$Seconds=60,
 [double]$MaxSystemLoadPercent=35,
 [switch]$Resume,
 [string]$Registry,
 [string]$AttemptReason
)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'overlay-campaign.psm1') -Force
if ((Test-Path -LiteralPath $Out) -and !$Resume) { throw 'Use a fresh campaign directory, or explicitly -Resume' }
New-Item -ItemType Directory -Path $Out -Force | Out-Null
$identity=@{ui=(Get-FileHash -LiteralPath $UI).Hash;core=(Get-FileHash -LiteralPath $Core).Hash;recording=(Get-FileHash -LiteralPath $Recording).Hash}
$collector=(& git -C $PSScriptRoot rev-parse HEAD).Trim()
if (@(& git -C $PSScriptRoot status --porcelain).Count) { throw 'Commit collector sources before measuring' }
if (!$Registry) { $Registry=Join-Path (Split-Path ([IO.Path]::GetFullPath($Out))) 'overlay-campaign-attempts.jsonl' }
$ledgerConfig=@{registry=$Registry;family="baseline-v3|$($identity.ui)|$($identity.core)|$($identity.recording)";attempt_reason=$AttemptReason;out=$Out;runs=$Runs;compiled_ui=$identity.ui;compiled_core=$identity.core;collector=$collector}
$attempt=Start-OverlayAttempt $ledgerConfig
try {
$configs=@(@{widgets=1;phases=$true},@{widgets=1;phases=$false},@{widgets=4;phases=$true},@{widgets=4;phases=$false},@{widgets=22;phases=$true},@{widgets=22;phases=$false})
$order=[Collections.Generic.List[object]]::new()
if ($Resume -and (Test-Path -LiteralPath "$Out/order.json")) {
 foreach ($entry in @(Get-Content -Raw -LiteralPath "$Out/order.json" | ConvertFrom-Json)) { $order.Add($entry) }
}
for ($round=1; $round -le $Runs; $round++) {
 $indices=if ($round % 2) { 0..5 } else { 5..0 }
 foreach ($index in $indices) {
  $config=$configs[$index]
  $name="round-$round-w$($config.widgets)-phases-$($config.phases)"
  $existing=@(Get-ChildItem -LiteralPath $Out -Directory | Where-Object { $_.Name -eq $name -or $_.Name -like "$name-attempt-*" })
  $valid=$false
  foreach ($previous in $existing) {
   if ((Test-Path -LiteralPath "$($previous.FullName)/complete.txt") -and (Test-Path -LiteralPath "$($previous.FullName)/summary.json")) {
    $data=Get-Content -Raw -LiteralPath "$($previous.FullName)/summary.json" | ConvertFrom-Json
    $meta=$data.metadata
    if ($meta.executable_sha256 -ne $identity.ui -or $meta.core_sha256 -ne $identity.core -or $meta.recording_sha256 -ne $identity.recording -or $meta.profile -ne 'release' -or $meta.measurement_version -ne 3 -or $meta.collector_sha -ne $collector -or $meta.widgets -ne $config.widgets -or $meta.phases -ne $config.phases) { throw 'Resume cannot mix binaries, collectors, recording or configuration' }
    if ($valid) { throw "Duplicate valid runs for $name" }
    $valid=$true
   }
  }
  if ($valid) { Write-Host "Keeping validated $name"; continue }
  if ($existing.Count) { $name="$name-attempt-$($existing.Count+1)" }
  $order.Add([pscustomobject]@{round=$round;configuration=$name;started=(Get-Date -Format o)})
  $order | ConvertTo-Json | Set-Content "$Out/order.json"
  & "$PSScriptRoot/measure-overlays.ps1" -UI $UI -Core $Core -Recording $Recording -Out "$Out/$name" -Widgets $config.widgets -Seconds $Seconds -Phases:$config.phases -MaxSystemLoadPercent $MaxSystemLoadPercent
  & python "$PSScriptRoot/summarize-overlays.py" "$Out/$name" > "$Out/$name/summary.stdout.json"
  if ($LASTEXITCODE) { throw "Summary failed: $name" }
 }
}
& python "$PSScriptRoot/aggregate-overlay-campaign.py" $Out
if ($LASTEXITCODE) { throw 'Campaign aggregation failed' }
Add-OverlayAttemptEvent $Registry @{event='finish';id=$attempt.id;family=$ledgerConfig.family;status='complete';date=(Get-Date -Format o)}
} catch {
 Add-OverlayAttemptEvent $Registry @{event='finish';id=$attempt.id;family=$ledgerConfig.family;status='failed';date=(Get-Date -Format o);reason=$_.Exception.Message}
 throw
}
