#requires -Version 5.1
param([string]$LegacyPackage)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'beta.ps1')
$root=Join-Path 'C:/tmp/ola2/1591-qa' ('history-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$passed=0
function Assert-History([bool]$Value,[string]$Message){if(-not $Value){throw $Message};$script:passed++;"PASS $Message"}
function Reject-History([scriptblock]$Action,[string]$Message,[string]$Reason,[string]$ErrorId=''){
    if(-not $Reason -and -not $ErrorId){throw 'A negative test must specify its rejection reason'}
    $failure=$null;try{$null=& $Action}catch{$failure=$_}
    if($null -eq $failure){throw "$Message : expected rejection did not occur"}
    $reasonMatches=if($ErrorId){$failure.FullyQualifiedErrorId.Split(',')[0] -ceq $ErrorId}else{$failure.Exception.Message -ceq $Reason}
    if(-not $reasonMatches){throw "Unexpected rejection for $Message : $($failure.FullyQualifiedErrorId) / $($failure.Exception.Message)"}
    Assert-History $true $Message
}
$fixture=Join-Path $PSScriptRoot 'fixtures/manifest-beta-0.0.975.json'
Assert-History ((Get-NativeHash $fixture) -ceq '4fc39c73a4660a3c859638d8078c97b30b732048f70ed72f5535d8ec12cc9219') 'Public 975 manifest bytes match release provenance'
$real=Join-Path $root 'real-manifest';[IO.Directory]::CreateDirectory($real)|Out-Null
Copy-Item $fixture (Join-Path $real 'manifest.json')
$original=Read-NativeManifest $real 'beta' $false -Installed
Assert-History ($original.version -ceq '0.0.975' -and @($original.files).Count -eq 91) 'Actual public manifest accepted only as installed generation'
Reject-History {Read-NativeManifest $real 'beta' $false} 'Actual public manifest rejected as incoming inventory' 'Faltan archivos obligatorios.'
Reject-History {Read-NativeManifest $real 'beta' $false -Instaled} 'Misspelled parameter is rejected by binding' '' 'NamedParameterNotFound'
$unexpected=$false
try{Reject-History {throw [IO.IOException]::new('unrelated fixture failure')} 'unrelated error' 'Faltan archivos obligatorios.'}catch{$unexpected=$_.Exception.Message.StartsWith('Unexpected rejection for unrelated error')}
Assert-History $unexpected 'Negative helper refuses an exception with an unrelated cause'
foreach($version in @('0.0.976','0.0.977','0.0.978','0.0.979')){
    $original.version=$version;Write-BetaJson (Join-Path $real 'manifest.json') $original
    $null=Read-NativeManifest $real 'beta' $false -Installed
    Assert-History $true "Known pre-resources inventory accepted for installed $version"
}
$original.version='0.0.980';Write-BetaJson (Join-Path $real 'manifest.json') $original
Reject-History {Read-NativeManifest $real 'beta' $false -Installed} 'Legacy subset is not valid for a newer version' 'Faltan archivos obligatorios.'
$original.version='0.0.975'
foreach($change in @('missing','extra','duplicate','traversal','case','wrong-channel')){
    $m=Get-Content $fixture -Raw|ConvertFrom-Json
    switch($change){
        'missing' {$m.files=@($m.files|Select-Object -Skip 1)}
        'extra' {$m.files+=@{path='extra.json';size=0;sha256=('a'*64)}}
        'duplicate' {$m.files+=@($m.files[0])}
        'traversal' {$m.files[0].path='../escape.exe'}
        'case' {$m.files[0].path=$m.files[0].path.ToUpperInvariant()}
        'wrong-channel' {$m.channel='nightly'}
    }
    Write-BetaJson (Join-Path $real 'manifest.json') $m
    $reason=if($change -in @('missing','wrong-channel')){'Faltan archivos obligatorios.'}else{'Lista de archivos inválida o duplicada.'}
    Reject-History {Read-NativeManifest $real '' $false -Installed} "Unknown or malicious installed inventory rejected: $change" $reason
}
# Offline integration uses inert real OS PE bytes, never executed. Only the
# inventory comes from the public manifest; synthetic hashes are recomputed.
function New-HistoryPayload([string]$Directory,[string[]]$Members,[string]$Version){
    foreach($member in $Members){
        $file=Join-Path $Directory $member
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file))|Out-Null
        if($member.EndsWith('.exe')){Copy-Item (Join-Path $env:WINDIR 'System32/cmd.exe') $file}
        elseif($member.EndsWith('.exe.sha256')){[IO.File]::WriteAllText($file,((Get-NativeHash $file.Substring(0,$file.Length-7))+'  '+[IO.Path]::GetFileName($file.Substring(0,$file.Length-7))+"`n"))}
        elseif($member -ceq 'candidate.ps1'){Copy-Item (Join-Path $PSScriptRoot 'candidate.ps1') $file}
        else{[IO.File]::WriteAllText($file,'inert fixture')}
    }
    $m=Get-Content $fixture -Raw|ConvertFrom-Json
    $m.version=$Version
    $m.files=@($Members|ForEach-Object{$f=Join-Path $Directory $_;@{path=$_;size=(Get-Item $f).Length;sha256=(Get-NativeHash $f)}})
    Write-NativeJson (Join-Path $Directory 'manifest.json') $m
}
$payload=Join-Path $root 'incoming'
New-HistoryPayload $payload @(Get-NativeMembers 'beta') '0.0.980'
$zip=Join-Path $root 'incoming.zip';New-NativeZip $payload $zip
$hash=Get-NativeHash $zip
function Test-HistoryUpgrade([string]$Install,[string]$Old){
    [IO.Directory]::CreateDirectory((Join-Path $Old 'data'))|Out-Null
    $data=Join-Path $Old 'data/preserved.bin';[IO.File]::WriteAllText($data,'data before 975 upgrade')
    $dataHash=Get-NativeHash $data
    $id=[IO.Path]::GetFileName($Old)
    Set-NativeState $Install @{schema=1;product='vantare-native';channel='beta';active=@{generation=$id;manifest_sha256=(Get-NativeHash (Join-Path $Old 'manifest.json'))};previous=$null}
    $null=Read-NativeState $Install
    $request=Join-Path $Install 'probe-request.json'
    Write-NativeJson $request @{operation='Probe';root=$Install;qa=$true;silent=$true;uninstall=$false;version='0.0.980';size=1024}
    $probe=& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'installer-driver.ps1') -RequestFile $request
    Assert-History ($LASTEXITCODE -eq 0 -and ($probe|ConvertFrom-Json).installed_version -ceq '0.0.975') 'Real Setup probe accepts installed historical inventory'
    $profile=Join-Path $Install 'profile.json';[IO.File]::WriteAllText($profile,'{"widgets":[]}')
    $imported=Import-NativeProfiles $Install @($profile)
    $id=$imported.active.generation
    $importedManifest=Read-NativeManifest (Join-Path $Install ('generations/'+$id)) 'beta' -Installed
    Assert-History (@($importedManifest.files).Count -eq 91) 'Profile import copies only the validated historical inventory'
    Install-Beta $Install $zip $hash
    $state=Read-NativeState $Install
    Assert-History ($state.active.generation -cne $id -and $state.previous.generation -ceq $id) 'Upgrade activates current inventory and validates historical previous'
    $currentData=Join-Path $Install ('generations/'+$state.active.generation+'/data/preserved.bin')
    Assert-History ((Get-NativeHash $currentData) -ceq $dataHash) 'Upgrade preserves exact data bytes'
    # Exercise rollback with a historical generation; no Hub/readiness claim.
    $null=Restore-NativeCandidate $Install
    Assert-History ((Read-NativeState $Install).active.generation -ceq $id) 'Rollback reads historical active generation'
    $null=Restore-NativeCandidate $Install
    Remove-Item -LiteralPath (Join-Path $Install 'boot-pending.json')
    Install-Beta $Install $zip $hash
    $state=Read-NativeState $Install
    $currentData=Join-Path $Install ('generations/'+$state.active.generation+'/data/preserved.bin')
    Assert-History ((Get-NativeHash $currentData) -ceq $dataHash) 'Same-version reinstall preserves data with historical state'
    Uninstall-Beta $Install
    Assert-History (-not(Test-Path (Join-Path $Install 'state.json')) -and (Get-NativeHash $currentData) -ceq $dataHash -and (Get-NativeHash $data) -ceq $dataHash) 'Uninstall removes state and retains old/new data'
}
$install=Open-NativeRoot (Join-Path $root 'synthetic-install') -Initialize
$old=Join-Path $install ('generations/'+[guid]::NewGuid().ToString('N'))
New-HistoryPayload $old @($original.files.path) '0.0.975'
$null=Read-NativeManifest $old 'beta' -Installed
$tamper=Join-Path $old 'bin/vantare-core.exe'
$bytes=[IO.File]::ReadAllBytes($tamper);[IO.File]::AppendAllText($tamper,'tampered')
Reject-History {Read-NativeManifest $old 'beta' -Installed} 'Historical files still require exact hashes' 'Integridad incorrecta: bin/vantare-core.exe'
[IO.File]::WriteAllBytes($tamper,$bytes)
$legacyZip=Join-Path $root 'historical-incoming.zip';New-NativeZip $old $legacyZip
Reject-History {Expand-NativePackage $legacyZip (Get-NativeHash $legacyZip) (Join-Path $root 'rejected') 'beta'} 'Historical ZIP rejected at actual incoming extraction boundary' 'Número de miembros ZIP incorrecto.'
Test-HistoryUpgrade $install $old
if($LegacyPackage){
    Assert-History ((Get-NativeHash $LegacyPackage) -ceq '372bcd60cf168cb6187be1c481b21c835268db1dbcc3e0a0aeb17246bede7066') 'Public ZIP digest verified'
    $install=Open-NativeRoot (Join-Path $root 'public-install') -Initialize
    $old=Join-Path $install ('generations/'+[guid]::NewGuid().ToString('N'))
    [IO.Compression.ZipFile]::ExtractToDirectory($LegacyPackage,$old)
    Assert-History ((Get-NativeHash (Join-Path $old 'manifest.json')) -ceq (Get-NativeHash $fixture)) 'Public ZIP manifest matches exact regression fixture'
    $null=Read-NativeManifest $old 'beta' -Installed
    Test-HistoryUpgrade $install $old
}
"$passed historical inventory checks PASS; evidence $root"
