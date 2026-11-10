# A/A first, then paired ABBA. Every observation starts fresh owned processes.
param(
 [Parameter(Mandatory)][string]$A,
 [Parameter(Mandatory)][string]$B,
 [Parameter(Mandatory)][string]$Core,
 [Parameter(Mandatory)][string]$Recording,
 [Parameter(Mandatory)][string]$Out,
 [ValidateRange(8,24)][int]$Rounds=8,
 [ValidateSet(1,4,22)][int]$Widgets=4,
 [int]$Seconds=60,
 [switch]$Phases,
 [switch]$RenderLoad,
 [ValidateRange(1,10)][double]$ReplaySpeed=1,
 [double]$MaxSystemLoadPercent=35
)
$ErrorActionPreference='Stop'
if (Test-Path -LiteralPath $Out) { throw 'Use a fresh comparison directory' }
if ((Get-FileHash -LiteralPath $A).Hash -eq (Get-FileHash -LiteralPath $B).Hash) { throw 'A/B requires two distinct binaries; A/A is run automatically first' }
New-Item -ItemType Directory -Path $Out | Out-Null
$order=[Collections.Generic.List[object]]::new()
foreach ($experiment in @('aa','ab')) {
 for ($round=1; $round -le $Rounds; $round++) {
  for ($slot=0; $slot -lt 4; $slot++) {
   $label=if ($slot -in @(0,3)) { 'A' } else { 'B' }
   $binary=if ($experiment -eq 'aa' -or $label -eq 'A') { $A } else { $B }
   $directory="$experiment-round-$round-slot-$slot-$label"
   $order.Add([pscustomobject]@{experiment=$experiment;round=$round;slot=$slot;label=$label;directory=$directory;started=(Get-Date -Format o)})
   $order | ConvertTo-Json | Set-Content -LiteralPath "$Out/ab-order.json"
   & "$PSScriptRoot/measure-overlays.ps1" -UI $binary -Core $Core -Recording $Recording -Out "$Out/$directory" -Widgets $Widgets -Seconds $Seconds -Phases:$Phases -RenderLoad:$RenderLoad -ReplaySpeed $ReplaySpeed -MaxSystemLoadPercent $MaxSystemLoadPercent
   & python "$PSScriptRoot/summarize-overlays.py" "$Out/$directory" > "$Out/$directory/summary.stdout.json"
   if ($LASTEXITCODE) { throw "Invalid observation $directory; discard the whole round" }
  }
 }
}
& python "$PSScriptRoot/aggregate-overlay-ab.py" $Out
if ($LASTEXITCODE) { throw 'A/A–A/B aggregation failed' }
