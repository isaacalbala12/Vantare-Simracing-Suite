param([Parameter(Mandatory)][string]$Out)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'overlay-campaign.psm1') -Force
if (Test-Path -LiteralPath $Out) { throw 'Use fresh test evidence' }
New-Item -ItemType Directory -Path $Out | Out-Null
$Out=(Resolve-Path -LiteralPath $Out).Path
function Assert-Condition($Condition,$Message) { if (!$Condition) { throw $Message } }
function New-Info {
 [pscustomobject]@{profile='release';opt_level='3';dirty=$false;sha=('a'*40);features=@('PAINT_STATS');measurement_capabilities=@('render_load','d3d11_timestamps')}
}
function New-Config($Name,$Family) {
 @{out=(Join-Path $Out $Name);registry=(Join-Path $Out 'attempts.jsonl');family=$Family;attempt_reason='declared integration test';
  a_info=(New-Info);b_info=(New-Info);core_info=(New-Info);a='A';b='B';a_hash=('a'*64);b_hash=('b'*64);
  core_hash=('c'*64);recording_hash=('d'*64);role='primary';study='engine';rounds=8;widgets=22;phases=$false;stress=$false;quiet=$false}
}
$calls=[Collections.Generic.List[object]]::new()
$observe={param($configuration,$entry,$engine,$mode)
 $index=$calls.Count
 $calls.Add([pscustomobject]@{experiment=$entry.experiment;round=$entry.round;label=$entry.label;engine=$engine})
 $folder=Join-Path $configuration.out $entry.directory
 New-Item -ItemType Directory -Path $folder | Out-Null
 'complete' | Set-Content "$folder/complete.txt"
 $hash=if ($engine -eq 'A') { $configuration.a_hash } else { $configuration.b_hash }
 $cost=if ($engine -eq 'A') { 100 } else { 95 }
 @{metadata=@{profile='release';measurement_version=3;collector_sha=('f'*40);collector_dirty=$false;collector_script_sha256='fixture';
    core_sha256=$configuration.core_hash;recording_sha256=$configuration.recording_hash;widgets=22;phases=$false;render_load=$false;
    quiet_control=$false;qpc_frequency=1000;executable_sha256=$hash;sampler_mode=$mode};
   stable_qpc=@(($index*10000+100),($index*10000+9100));ui=@{cycles_per_second=$cost}} |
  ConvertTo-Json -Depth 10 | Set-Content "$folder/summary.json"
}.GetNewClosure()
$config=New-Config 'valid' 'valid'
$result=Invoke-OverlayCampaign $config $observe
Assert-Condition ($calls.Count -eq 64) 'Wrong observation count'
Assert-Condition (($calls[0..3].experiment -join ',') -eq 'aa,aa,aa,aa') 'A/A did not start the campaign'
Assert-Condition (($calls[4..7].experiment -join ',') -eq 'ab,ab,ab,ab') 'A/B was not interleaved'
Assert-Condition (($calls[8..11].label -join '') -eq 'BAAB') 'BAAB alternation missing'
Assert-Condition (@($calls | Where-Object { $_.experiment -eq 'aa' -and $_.engine -ne 'A' }).Count -eq 0) 'A/A used B'
Assert-Condition ($result.verdict -eq 'improvement' -and $result.accepted) 'Predeclared primary metric produced wrong verdict'
$bad=New-Config 'paced-stress' 'paced-stress'
$bad.stress=$true
$reason=$null
try { Invoke-OverlayCampaign $bad $observe | Out-Null } catch { $reason=$_.Exception.Message }
Assert-Condition ($reason -like '*uncapped capability*') 'Compositor-paced stress was accepted'
for ($attempt=1;$attempt -le 4;$attempt++) {
 $bad=New-Config "invalid-$attempt" 'bounded'
 $bad.b_info.measurement_capabilities=@('render_load')
 $reason=$null
 try { Invoke-OverlayCampaign $bad $observe | Out-Null } catch { $reason=$_.Exception.Message }
 if ($attempt -le 3) { Assert-Condition ($reason -like '*capabilities differ*') 'Capability mismatch was not rejected before sampling' }
 else { Assert-Condition ($reason -like '*attempts exhausted*') 'Fourth campaign was not refused' }
}
Assert-Condition ($calls.Count -eq 64) 'Preflight failure executed observations'
$events=@(Get-Content "$Out/attempts.jsonl" | ForEach-Object { $_ | ConvertFrom-Json })
Assert-Condition (@($events | Where-Object { $_.family -eq 'bounded' -and $_.event -eq 'start' }).Count -eq 3) 'Attempt ledger lost a failure'
Write-Host 'PASS: interleaving, balanced order, actual A/A identity, t verdict, early capabilities and three-attempt limit'
