# One predeclared, bounded campaign. No automatic retries or accelerated replay.
param(
 [Parameter(Mandatory)][string]$ComparisonName,
 [Parameter(Mandatory)][string]$A,
 [Parameter(Mandatory)][string]$B,
 [Parameter(Mandatory)][string]$Core,
 [Parameter(Mandatory)][string]$Recording,
 [Parameter(Mandatory)][string]$Out,
 [string]$Registry,
 [string]$AttemptReason,
 [ValidateRange(6,24)][int]$Rounds=8,
 [ValidateSet(1,4,22)][int]$Widgets=22,
 [int]$Seconds=60,
 [switch]$Phases,
 [Alias('RenderLoad')][switch]$Stress,
 [switch]$QuietControl,
 [switch]$SamplingControl,
 [ValidateSet('Normal','AboveNormal')][string]$Priority='Normal',
 [long]$AffinityMask=0,
 [double]$MaxSystemLoadPercent=35
)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'overlay-campaign.psm1') -Force
& python -c "import sys; sys.exit(0 if sys.version_info >= (3,11) else 'Python 3.11 or newer required')"
if ($LASTEXITCODE) { throw 'Unsupported Python' }
if (@(& git -C $PSScriptRoot status --porcelain).Count) { throw 'Commit measurement sources before a campaign' }
$Out=[IO.Path]::GetFullPath($Out)
if (!$Registry) { $Registry=Join-Path (Split-Path $Out) 'overlay-campaign-attempts.jsonl' }
$study=if ($SamplingControl) { 'sampler' } elseif ($QuietControl) { 'quiet' } else { 'engine' }
if ($QuietControl -and ($Stress -or $Widgets -ne 1 -or $SamplingControl)) { throw 'Quiet control: one widget, normal cadence, no sampling control' }
$aInfo=(& $A --measurement-info | ConvertFrom-Json)
if ($LASTEXITCODE) { throw 'A provenance probe failed' }
$bInfo=(& $B --measurement-info | ConvertFrom-Json)
if ($LASTEXITCODE) { throw 'B provenance probe failed' }
$coreInfo=(& $Core --measurement-info | ConvertFrom-Json)
if ($LASTEXITCODE) { throw 'Core provenance probe failed' }
$recordingHash=(Get-FileHash -LiteralPath $Recording).Hash
$powerPlan=(& powercfg /getactivescheme | Out-String).Trim()
if ($LASTEXITCODE -or !$powerPlan) { throw 'Cannot freeze the power-plan identity' }
$role=if ($study -eq 'engine' -and !$Stress -and !$Phases -and $Widgets -eq 22) { 'primary' } else { 'informative' }
$config=@{
 out=$Out;registry=[IO.Path]::GetFullPath($Registry);attempt_reason=$AttemptReason
 family="$ComparisonName|$recordingHash|w=$Widgets|phases=$Phases|stress=$Stress|study=$study"
 comparison=$ComparisonName;study=$study;role=$role;rounds=$Rounds;widgets=$Widgets
 phases=[bool]$Phases;stress=[bool]$Stress;quiet=[bool]$QuietControl;seconds=$Seconds
 a=$A;b=$B;core=$Core;recording=$Recording;a_info=$aInfo;b_info=$bInfo;core_info=$coreInfo
 a_hash=(Get-FileHash -LiteralPath $A).Hash;b_hash=(Get-FileHash -LiteralPath $B).Hash
 core_hash=(Get-FileHash -LiteralPath $Core).Hash;recording_hash=$recordingHash
 priority=$Priority;affinity_mask=$AffinityMask;power_plan=$powerPlan;maximum_system_load=$MaxSystemLoadPercent
}
$observe={ param($configuration,$entry,$engine,$mode)
 $folder=Join-Path $configuration.out $entry.directory
 & (Join-Path $PSScriptRoot 'measure-overlays.ps1') -UI $engine -Core $configuration.core -Recording $configuration.recording -Out $folder -Widgets $configuration.widgets -Seconds $configuration.seconds -Phases:$configuration.phases -RenderLoad:$configuration.stress -QuietControl:$configuration.quiet -SamplerMode $mode -Priority $configuration.priority -AffinityMask $configuration.affinity_mask -ExpectedPowerPlan $configuration.power_plan -MaxSystemLoadPercent $configuration.maximum_system_load
 & python (Join-Path $PSScriptRoot 'summarize-overlays.py') $folder > "$folder/summary.stdout.json"
 if ($LASTEXITCODE) { throw "Invalid observation $($entry.directory); whole campaign retained as failed" }
}
$result=Invoke-OverlayCampaign $config $observe
$result | ConvertTo-Json -Depth 20
