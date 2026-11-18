# Real controller round with fake processes/ETW/IPC. No GPU.
$ErrorActionPreference='Stop'
. "$PSScriptRoot/TANDA.ps1" -SoloFunciones
$env:VANTARE_SIN_GRAFICOS='1'
$base=Join-Path ([IO.Path]::GetTempPath()) ('vantare-round-test-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $base
$root=Join-Path $base 'kit';$output=Join-Path $base 'evidence'
$script:PythonExe=Join-Path $base 'python.exe';Set-Content $script:PythonExe 'FAKE NEVER EXECUTE'
$script:fakeProfile=Join-Path $base 'profile';$null=New-Item -ItemType Directory -Path $script:fakeProfile
Set-Content (Join-Path $script:fakeProfile 'settings.json') 'original'
function Get-TandaProfileRoots {@($script:fakeProfile)}
foreach($dir in @('tools/qa-overlays','inputs','bin')){$null=New-Item -ItemType Directory -Path (Join-Path $root $dir) -Force}
$null=New-Item -ItemType Directory -Path (Join-Path $output 'perf') -Force
Write-TandaJson @{version=1;instances=@()} (Join-Path $root 'inputs/layout.json')
@'
function Get-VantareObservedIdentity {param($RootProcessId)
 [ordered]@{process_id=$RootProcessId;created_utc='2026-11-17T00:00:00.0000000Z';image_name='fake-overlay.exe';image_sha256=('a'*64)}
}
'@ | Set-Content -LiteralPath (Join-Path $root 'tools/qa-overlays/OBSERVAR.ps1')
$script:events=[Collections.Generic.List[string]]::new();$script:deny=$false;$script:mode='replay'
$license=@{cli='fake-cli.exe';credential='fake.json';registry='fake-public';key_id='qa-aabbccdd'}
$script:qaProfiles=[Collections.Generic.List[string]]::new()
$script:failInstall=$false
function Install-TandaQaCredential {param($Image,$Credential,$Registry,$ApprovedKeyId,$Directory)
 if($Directory.StartsWith($output,[StringComparison]::OrdinalIgnoreCase) -or $ApprovedKeyId -ne 'qa-aabbccdd'){throw 'Binding dentro de la evidencia o sin clave aprobada'}
 $script:events.Add('install:qa')
 $script:qaProfiles.Add($Directory)
 $environment=New-TandaQaEnvironment $Directory
 if($script:failInstall){throw 'INSTALL_PARTIAL_FAKE'}
 $environment
}
function Assert-TandaUnattended {}
function Start-TandaOwned {param($Image,$Arguments,$Log,$Environment=@{})
 $name=Split-Path $Log -Leaf;$script:events.Add('start:'+ $name)
 if($name -in @('overlay','core')){foreach($key in @('VANTARE_NATIVE_DATA_ROOT','LOCALAPPDATA','APPDATA')){if(-not $Environment[$key]){throw 'Host no aislado'}}}
 if($name -eq 'sampler'){
  $i=[array]::IndexOf($Arguments,'-OutputDirectory');$dir=$Arguments[$i+1]
  $null=New-Item -ItemType Directory -Path $dir
  Write-TandaJson @{ready=$true} (Join-Path $dir 'CAPTURA-LISTA.json')
  if($script:mode -eq 'replay' -and $Arguments -notcontains '-RootInfoFile'){throw 'Missing deferred identity'}
  if($script:mode -eq 'waiting' -and $Arguments -notcontains '-RootProcessId'){throw 'Waiting must retain direct sampling after host startup'}
 }
 if($name -eq 'core' -and $script:mode -eq 'replay' -and $script:events.IndexOf('start:sampler') -lt 0){throw 'Replay before ETW'}
 $process=[pscustomobject]@{Id=123;HasExited=$false;ExitCode=0;StandardError=[IO.StringReader]::new('')}
 $process|Add-Member ScriptMethod WaitForExit {param($Milliseconds) $true}
 @{process=$process;stderr=$null;log=$Log;closed=$false}
}
function Start-TandaSampler {param($Root,$Round,$Case)
 $script:events.Add('start:sampler')
 $null=New-Item -ItemType Directory -Path (Join-Path $Round 'muestreo')
 Write-TandaJson @{ready=$true} (Join-Path $Round 'muestreo/CAPTURA-LISTA.json')
 @{round=$Round;closed=$false}
}
function Test-TandaSamplerFinished {param($Handle) $true}
function Get-TandaSamplerExitCode {param($Handle) 0}
function Close-TandaSampler {param($Handle) if($Handle -and -not $Handle.closed){$Handle.closed=$true;$script:events.Add('close:sampler')}}
function Get-TandaLiveClock {param($Handle) $Handle.stderr=$true;[Diagnostics.Stopwatch]::GetTimestamp()}
function Read-TandaPolicy {param($Root,$PhotoPipe,$Log)
 if($script:deny){throw 'DENIED_FAKE'}
 @{state=@{kind='active'}}
}
function Close-TandaOwned {param($Handle)
 if(-not $Handle -or $Handle.closed){return};$Handle.closed=$true
 $script:events.Add('close:'+(Split-Path $Handle.log -Leaf))
 if($Handle.log -like '*profile-change*core'){Set-Content (Join-Path $script:fakeProfile 'settings.json') 'changed'}
 if($Handle.log.EndsWith('core')){
  $f=[Diagnostics.Stopwatch]::Frequency;$q=[Diagnostics.Stopwatch]::GetTimestamp()
  Set-Content -LiteralPath ($Handle.log+'.stderr.txt') "trace frequency=$f overflow=0`ntrace`tspan`tobserve`t$q`t$q`t0`t0`t0`ntrace_end events=1"
 }
}
function Invoke-TandaProcess {param($Image,$Arguments,$Log,$Timeout=120,[switch]$WatchSession)
 if($script:mode -eq 'waiting' -and $Arguments[-1] -ne '0'){throw 'Waiting received a replay QPC'}
 $script:events.Add('analyze');@{code=0;stdout='';stderr=''}
}
Invoke-TandaMeasurement $root $output @{id='success';state='replay';motor='rune';layout='inputs/layout.json'} $license
$prefix=@($script:events|Select-Object -First 4) -join ','
if($prefix -ne 'install:qa,start:sampler,start:core,start:overlay'){throw "Wrong order: $prefix"}
$identity=Read-TandaJson (Join-Path $output 'perf/success/root-info.json')
if($identity.process_id -ne 123 -or $identity.start_qpc -le 0 -or (Test-Path (Join-Path $output 'perf/success/root-info.json.tmp'))){throw 'Bad/non-atomic deferred identity'}
if(@($script:events|Where-Object {$_ -like 'close:*'}).Count -ne 3){throw 'Missing cleanup'}
$script:events.Clear();$script:mode='waiting'
Invoke-TandaMeasurement $root $output @{id='waiting';state='waiting';motor='gpui';layout='inputs/layout.json'} $license
if((@($script:events|Select-Object -First 4) -join ',') -ne 'install:qa,start:core,start:overlay,start:sampler'){throw 'Waiting warmed before the host existed'}
$script:events.Clear();$script:mode='replay';$script:deny=$true;$denied=$false
try {Invoke-TandaMeasurement $root $output @{id='denied';state='replay';motor='gpui';layout='inputs/layout.json'} $license} catch {$denied=$_.Exception.Message -eq 'DENIED_FAKE'}
if(-not $denied -or $script:events.Contains('start:overlay') -or $script:events.Contains('analyze') -or -not $script:events.Contains('close:sampler') -or -not $script:events.Contains('close:core')){throw 'Denial failed to clean up before host/analysis'}
$script:events.Clear();$script:mode='waiting';$script:deny=$false;$changed=$false
try {Invoke-TandaMeasurement $root $output @{id='profile-change';state='waiting';motor='rune';layout='inputs/layout.json'} $license} catch {$changed=$_.Exception.Message -like 'PROFILE_CHANGED*'}
if(-not $changed -or $script:events.Contains('analyze')){throw 'Real profile modification produced a measurement'}
$script:events.Clear();$missing=$false
try{Invoke-TandaMeasurement $root $output @{id='no-transfer';state='waiting';motor='rune';layout='inputs/layout.json'}}
catch{$missing=$_.Exception.Message -like 'QA_MEASUREMENT_LICENSE_MISSING*'}
if(-not $missing -or $script:events.Count){throw 'Missing signed transfer started processes'}
$script:failInstall=$true
$partial=$false
try{Invoke-TandaMeasurement $root $output @{id='partial';state='waiting';motor='rune';layout='inputs/layout.json'} $license}
catch{$partial=$_.Exception.Message -ceq 'INSTALL_PARTIAL_FAKE'}
if(-not $partial -or $script:events.Contains('start:core')){throw 'Fallo parcial activó el núcleo'}
if(@($script:qaProfiles|Where-Object {Test-Path -LiteralPath $_}).Count){throw 'Quedó un perfil QA propio tras la ronda o el fallo'}
if(@($script:qaProfiles|Where-Object {$_ -notmatch '[/\\]qa-core[/\\]round-[0-9a-f]{32}$'}).Count){throw 'Perfil QA sin ruta única'}
"PASS: ETW ready before replay, deferred identity, cleanup and denial; no GPU; sandbox=$base"
