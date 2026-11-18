# CPU only. All process/input/shutdown actions are supplied as fakes.
$ErrorActionPreference='Stop'
. "$PSScriptRoot/TANDA.ps1" -SoloFunciones
$env:VANTARE_SIN_GRAFICOS='1'
function Require($Value,[string]$Message){if(-not $Value){throw $Message}}
$base=Join-Path ([IO.Path]::GetTempPath()) ('vantare-security-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $base
$start=[DateTime]::UtcNow.AddMinutes(-1).ToString('o');$end=[DateTime]::UtcNow.AddMinutes(5).ToString('o')
Assert-TandaWindow $start $end
foreach($bad in @(' '+$start,$start+' ', $start.Replace('Z','+00:00'),$start+"';shutdown /s",'2026-99-01T00:00:00Z')){
 $rejected=$false;try {Assert-TandaWindow $bad $end} catch {$rejected=$true}
 Require $rejected 'Invalid/injectable UTC accepted'
 $rejected=$false;try {Assert-TandaWindow $start $bad} catch {$rejected=$true}
 Require $rejected 'Invalid/injectable deadline accepted'
}
foreach($name in @('iRacingSim64DX11','AC2-Win64-Shipping','AssettoCorsaEVO','AMS2','rFactor2','SimHub','Le Mans Ultimate')){
 Require (@(Find-TandaGameActivity @(@{Name=$name;CommandLine=''})).Count -eq 1) "Game omitted: $name"
}
Require (@(Find-TandaGameActivity @(@{Name='steam';CommandLine='steam.exe -gamepadui'})).Count -eq 1) 'Big Picture omitted'
foreach($flag in @('-bigpicture','--gamepadui','-tenfoot')){
 Require (@(Find-TandaGameActivity @(@{Name='steam';CommandLine="steam.exe $flag"})).Count -eq 1) "Big Picture flag omitted: $flag"
}
Require (@(Find-TandaGameActivity @(@{Name='steam';CommandLine='steam.exe -silent'},@{Name='notepad';CommandLine=''})).Count -eq 0) 'Launcher falsely identified as game'
$definitions=@(Get-TandaSamplerDefinitions 'C:/VantareQA/kit' 'C:/VantareQA/evidence' 'Vantare-tanda-20261117T220000Z' @(@{id='one';state='replay'},@{id='two';state='waiting'}))
Require ($definitions.Count -eq 2 -and @($definitions|Where-Object run_level -ne 'Highest').Count -eq 0) 'Sampler elevation missing'
Require (@($definitions|Where-Object {$_.arguments -notlike '*SAMPLER_TANDA.ps1*' -or $_.arguments -match 'capture-scene|lifecycle|python'}).Count -eq 0) 'Elevated task can launch UI/Python'
$profileDir=Join-Path $base 'profile';$null=New-Item -ItemType Directory -Path (Join-Path $profileDir 'logs') -Force
Set-Content (Join-Path $profileDir 'settings.json') '{"value":1}'
$before=@(Get-TandaProfileSnapshot @($profileDir))
Set-Content (Join-Path $profileDir 'logs/run.txt') 'log only'
Assert-TandaProfileUnchanged $before @(Get-TandaProfileSnapshot @($profileDir))
Set-Content (Join-Path $profileDir 'settings.json') '{"value":2}'
$rejected=$false;try {Assert-TandaProfileUnchanged $before @(Get-TandaProfileSnapshot @($profileDir))} catch {$rejected=$true}
Require $rejected 'Real profile change ignored'
$policy=Convert-TandaPolicyEvidence @{state=@{kind='active';account_id='SECRET-ID'};catalog='founders';subject='SECRET-ID';credential='SECRET-TOKEN'}
$text=ConvertTo-Json -InputObject $policy -Depth 10
Require ($text -notmatch 'SECRET|subject|credential|account') 'Policy evidence contains identifiers'
Require ($policy.state.kind -eq 'active' -and $policy.catalog -eq 'founders') 'Policy status omitted'
$output=Join-Path $base 'evidence';$null=New-Item -ItemType Directory -Path $output
Set-Content (Join-Path $output 'one.txt') 'evidence'
Write-TandaEvidenceHashes $output
Require ((Test-Path (Join-Path $output 'evidence-hashes.json')) -and -not(Test-Path (Join-Path $output 'evidence-hashes.json.tmp'))) 'Non-atomic manifest'
$manifestBefore=(Get-FileHash (Join-Path $output 'evidence-hashes.json')).Hash
$rejected=$false;try {Write-TandaEvidenceHashes $output} catch {$rejected=$true}
Require ($rejected -and (Get-FileHash (Join-Path $output 'evidence-hashes.json')).Hash -eq $manifestBefore) 'Existing manifest overwritten'
$script:realWrite=${function:Write-TandaJson}
function Write-TandaJson {param($Value,$Path) & $script:realWrite $Value $Path;throw 'interrupted write'}
$partial=Join-Path $base 'partial';$null=New-Item -ItemType Directory -Path $partial
try {Write-TandaEvidenceHashes $partial} catch {}
Require (-not(Test-Path (Join-Path $partial 'evidence-hashes.json'))) 'Partial manifest published'
Set-Item Function:Write-TandaJson $script:realWrite
$rejected=$false;try {Invoke-TandaShutdown $base $output} catch {$rejected=$_.Exception.Message -like 'GRAPHICS_DISABLED*'}
Require $rejected 'Shutdown server guard did not throw'
# No real shutdown command is reachable from this sequence test.
$script:time=0.0;$script:requests=@();$script:cancels=0
$request={param($Arguments) $script:requests=@($Arguments)}
$cancel={$script:cancels++}
$check={if($script:time -ge 20){throw 'input changed'}}
$sleep={param($Milliseconds) $script:time+=10}
$clock={$script:time}
$result=Invoke-TandaShutdownCountdown $request $cancel $check $sleep $clock
Require (-not $result.accepted -and $result.cancelled -and $script:cancels -eq 1) 'Input failed to cancel shutdown'
Require (($script:requests -join '|') -eq '/s|/t|60|/c|Tanda QA de Vantare: apagado automático') 'Wrong shutdown arguments'
$script:time=0.0;$script:cancels=0
$result=Invoke-TandaShutdownCountdown $request $cancel {} $sleep $clock
Require ($result.accepted -and -not $result.cancelled -and $script:cancels -eq 0 -and $script:time -ge 60) 'Unattended countdown incomplete'
$script:requests=@();$script:cancels=0
$result=Invoke-TandaShutdownCountdown $request $cancel {throw 'activity before scheduling'} $sleep $clock
Require (-not $result.accepted -and $script:requests.Count -eq 0 -and $script:cancels -eq 0) 'Active session scheduled shutdown'
$script:time=0.0
$result=Invoke-TandaShutdownCountdown $request {throw 'cancel failed'} $check $sleep $clock
Require (-not $result.accepted -and -not $result.cancelled -and $result.cancel_error) 'Failed cancellation reported accepted'
# Reject symlinks AND hardlinks before creating the extraction destination.
foreach($type in @([System.Formats.Tar.TarEntryType]::SymbolicLink,[System.Formats.Tar.TarEntryType]::HardLink)){
 $archive=Join-Path $base ($type.ToString()+'.tar')
 $stream=[IO.File]::Create($archive);$writer=[System.Formats.Tar.TarWriter]::new($stream)
 try {$entry=[System.Formats.Tar.PaxTarEntry]::new($type,'link');$entry.LinkName='outside';$writer.WriteEntry($entry)} finally {$writer.Dispose();$stream.Dispose()}
 $destination=$archive+'.out';$rejected=$false
 try {Expand-TandaEvidence $archive $destination} catch {$rejected=$true}
 Require ($rejected -and -not(Test-Path $destination)) 'Archive link accepted or extracted before validation'
}
$pythonFake=Join-Path $base 'python.exe';Set-Content $pythonFake 'FAKE NEVER EXECUTE'
foreach($invalidPython in @('python','python.exe','./python.exe','C:/python.exe;shutdown.exe','C:/python.exe" -c evil')){
 $rejected=$false;try {Assert-TandaPython $invalidPython -SyntaxOnly} catch {$rejected=$true}
 Require $rejected "Unsafe Python path accepted: $invalidPython"
}
$pythonCandidates=@(Get-Command python.exe -CommandType Application -All|ForEach-Object Source|Where-Object {$_ -notlike '*\WindowsApps\*'})
$script:PythonExe=$pythonCandidates|Where-Object {(Get-TandaPythonVersion $_) -ge [version]'3.11'}|Select-Object -First 1
Require $script:PythonExe 'No Python 3.11+ interpreter for the fake run'
Assert-TandaPython $script:PythonExe
# Same validator Assert-TandaPython applies to the probed interpreter version.
$rejected=$false;try {Assert-TandaPythonVersion ([version]'3.10')} catch {$rejected=$_.Exception.Message -like '*3.11*'}
Require $rejected 'Python 3.10 accepted'
Assert-TandaPythonVersion ([version]'3.11')
# A file that does not answer as Python >=3.11 is rejected before any scan.
$rejected=$false;try {Assert-TandaPython $pythonFake} catch {$rejected=$_.Exception.Message -like '*3.11*'}
Require $rejected 'Non-Python executable accepted'
$samplerRejected=$false
try { & "$PSScriptRoot/SAMPLER_TANDA.ps1" -Kit $base -Round $base -Seconds 60 } catch {$samplerRejected=$_.Exception.Message -like 'GRAPHICS_DISABLED*'}
Require ($samplerRejected -and -not(Test-Path (Join-Path $base 'sampler.log'))) 'Sampler guard reached ETW on server'
function Invoke-TandaProcess {param($Image,$Arguments,$Log,$Timeout=120)
 Require ([IO.Path]::IsPathFullyQualified($Image) -and $Image -ceq $script:PythonExe -and $Arguments[0] -ceq '-I') 'Python uses PATH or non-isolated mode'
 @{code=0;stdout='';stderr=''}
}
$null=Invoke-TandaPython @('-c','print(1)') (Join-Path $base 'python')
'PASS: strict UTC, games, profile hashes, redacted rights, atomic manifest, shutdown cancellation, archive links and isolated Python; no GPU'
