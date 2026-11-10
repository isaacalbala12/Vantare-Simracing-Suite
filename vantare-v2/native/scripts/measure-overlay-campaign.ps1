# Alternate configurations; do not silently retry discarded runs.
param(
 [Parameter(Mandatory)][string]$UI,
 [Parameter(Mandatory)][string]$Core,
 [Parameter(Mandatory)][string]$Recording,
 [Parameter(Mandatory)][string]$Out,
 [ValidateRange(5,100)][int]$Runs=5,
 [int]$Seconds=60,
 [double]$MaxSystemLoadPercent=35
)
$ErrorActionPreference='Stop'
if (Test-Path -LiteralPath $Out) { throw 'Use a fresh campaign directory' }
New-Item -ItemType Directory -Path $Out | Out-Null
$configs=@(@{widgets=1;phases=$true},@{widgets=1;phases=$false},@{widgets=4;phases=$true},@{widgets=4;phases=$false},@{widgets=22;phases=$true},@{widgets=22;phases=$false})
$order=[Collections.Generic.List[object]]::new()
for ($round=1; $round -le $Runs; $round++) {
 $indices=if ($round % 2) { 0..5 } else { 5..0 }
 foreach ($index in $indices) {
  $config=$configs[$index]
  $name="round-$round-w$($config.widgets)-phases-$($config.phases)"
  $order.Add([pscustomobject]@{round=$round;configuration=$name;started=(Get-Date -Format o)})
  $order | ConvertTo-Json | Set-Content "$Out/order.json"
  & "$PSScriptRoot/measure-overlays.ps1" -UI $UI -Core $Core -Recording $Recording -Out "$Out/$name" -Widgets $config.widgets -Seconds $Seconds -Phases:$config.phases -MaxSystemLoadPercent $MaxSystemLoadPercent
  & python "$PSScriptRoot/summarize-overlays.py" "$Out/$name" > "$Out/$name/summary.stdout.json"
  if ($LASTEXITCODE) { throw "Summary failed: $name" }
 }
}
& python "$PSScriptRoot/aggregate-overlay-campaign.py" $Out
if ($LASTEXITCODE) { throw 'Campaign aggregation failed' }
