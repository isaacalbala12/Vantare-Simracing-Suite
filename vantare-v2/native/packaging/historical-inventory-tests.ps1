#requires -Version 5.1
param([string]$LegacyPackage,[string]$Root,[string]$RegistryRoot,[string]$ShellRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'matrix/historical-context.ps1')
$historyContext=Assert-HistoricalContext $Root $RegistryRoot $ShellRoot
. (Join-Path $PSScriptRoot 'beta.ps1') -Library -Root $historyContext.Root
Set-HistoricalBoundary $historyContext
if((Get-PSDrive HKCU).Root -cne $historyContext.Registry){throw 'HISTORY_REGISTRY_NOT_INJECTED'}
foreach($folder in @('Programs','Startup','DesktopDirectory')){
    if((Get-NativeShortcutFolder $folder) -cne (Join-Path $historyContext.Shell $folder)){throw 'HISTORY_SHELL_NOT_INJECTED'}
}
$root=$historyContext.Root
[IO.Directory]::CreateDirectory($root)|Out-Null
$driverDirectory=Join-Path $root 'driver'
[IO.Directory]::CreateDirectory($driverDirectory)|Out-Null
foreach($name in @('candidate.ps1','beta.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $driverDirectory}
$driver=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'installer-driver.ps1'))
$driverImport=". (Join-Path `$PSScriptRoot 'beta.ps1') -Library -Root `$PSScriptRoot"
$boundary=@'
Remove-PSDrive HKCU
New-PSDrive HKCU Registry '__REGISTRY__' -Scope Global|Out-Null
. (Join-Path $PSScriptRoot 'beta.ps1') -Library -Root $PSScriptRoot
function Get-NativeShortcutFolder([string]$Name){
    if($Name -cnotin @('Programs','Startup','DesktopDirectory')){throw 'HISTORY_FOLDER_REJECTED'}
    Join-Path '__SHELL__' $Name
}
'@
$boundary=$boundary.Replace('__REGISTRY__',$historyContext.Registry).Replace('__SHELL__',$historyContext.Shell.Replace("'","''"))
if(-not $driver.Contains($driverImport)){throw 'HISTORY_DRIVER_IMPORT_CHANGED'}
$historyDriver=Join-Path $driverDirectory 'installer-driver.ps1'
[IO.File]::WriteAllText($historyDriver,$driver.Replace($driverImport,$boundary),[Text.UTF8Encoding]::new($true))
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
$previousFixture=Join-Path $PSScriptRoot 'fixtures/manifest-beta-0.0.974.json'
Assert-History ((Get-NativeHash $previousFixture) -ceq '166fbf2c620bb5cc2dad0141d48ca3acde732598874e04cdf2495cc30f2a0845') 'Isaac previous 974 manifest matches observed state hash'
$actualPrevious=Get-Content $previousFixture -Raw|ConvertFrom-Json
Assert-History ($actualPrevious.version -ceq '0.0.974' -and -not @(Compare-Object @($original.files.path) @($actualPrevious.files.path) -CaseSensitive).Count) 'Observed 974 has exact 91-member public 975 inventory'
$observedState=Get-Content (Join-Path $PSScriptRoot 'fixtures/state-beta-0.0.975-previous-0.0.974.json') -Raw|ConvertFrom-Json
Assert-History ($observedState.active.manifest_sha256 -ceq (Get-NativeHash $fixture) -and $observedState.previous.manifest_sha256 -ceq (Get-NativeHash $previousFixture)) 'Observed state binds the exact 975 and 974 manifests'
Reject-History {Read-NativeManifest $real 'beta' $false} 'Actual public manifest rejected as incoming inventory' 'Faltan archivos obligatorios.'
Reject-History {Read-NativeManifest $real 'beta' $false -Instaled} 'Misspelled parameter is rejected by binding' '' 'NamedParameterNotFound'
$unexpected=$false
try{Reject-History {throw [IO.IOException]::new('unrelated fixture failure')} 'unrelated error' 'Faltan archivos obligatorios.'}catch{$unexpected=$_.Exception.Message.StartsWith('Unexpected rejection for unrelated error')}
Assert-History $unexpected 'Negative helper refuses an exception with an unrelated cause'
foreach($version in @('0.0.974','0.0.976','0.0.977','0.0.978','0.0.979')){
    $original.version=$version;Write-BetaJson (Join-Path $real 'manifest.json') $original
    $null=Read-NativeManifest $real 'beta' $false -Installed
    Assert-History $true "Known pre-resources inventory accepted for installed $version"
}
$original.version='0.0.980';Write-BetaJson (Join-Path $real 'manifest.json') $original
$null=Read-NativeManifest $real 'beta' $false -Installed
Assert-History $true 'Installed inventory belongs to its bound manifest, not a frozen version interval'
$original.version='0.0.975'
foreach($change in @('unlisted-disk','extra','duplicate','traversal','case','wrong-channel')){
    $m=Get-Content $fixture -Raw|ConvertFrom-Json
    switch($change){
        'unlisted-disk' {
            $unlisted=Join-Path $real $m.files[0].path
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($unlisted))|Out-Null
            [IO.File]::WriteAllText($unlisted,'unlisted fixture')
            $m.files=@($m.files|Select-Object -Skip 1)
        }
        'extra' {$m.files+=@{path='extra.json';size=0;sha256=('a'*64)}}
        'duplicate' {$m.files+=@($m.files[0])}
        'traversal' {$m.files[0].path='../escape.exe'}
        'case' {$m.files[0].path=$m.files[0].path.ToUpperInvariant()}
        'wrong-channel' {$m.channel='nightly'}
    }
    Write-BetaJson (Join-Path $real 'manifest.json') $m
    $reason=if($change -ceq 'unlisted-disk'){'Archivo instalado no enumerado en el manifiesto.'}elseif($change -ceq 'wrong-channel'){'Manifiesto, esquema o canal incompatible.'}else{'Lista de archivos inválida o duplicada.'}
    try{Reject-History {Read-NativeManifest $real 'beta' $false -Installed} "Unknown or malicious installed inventory rejected: $change" $reason}
    finally{if($change -ceq 'unlisted-disk'){Remove-Item -LiteralPath $unlisted}}
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
    Write-NativeJson $request @{operation='Probe';root=$Install;qa=$true;qaIdentity='VantareNativeBetaQA1492';qaShortcutFolder='Vantare QA1492';qaLegacyShortcutFolder='Vantare Native Beta QA1492';qaPrefix=$root;silent=$true;uninstall=$false;version='0.0.980';size=1024}
    $probe=& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $historyDriver -RequestFile $request
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
# The real 975 installation still references 974. A previous generation is an
# optional rollback target, never the authority for updating the active one.
foreach($case in @('active974','974','976-974','977-974','978-974','979-974','973','missing','missing-generation','corrupt','tampered','bad-reference')){
    $history=Open-NativeRoot (Join-Path $root ('previous-'+$case)) -Initialize
    $activeId=if($case -ceq '974'){$observedState.active.generation}else{[guid]::NewGuid().ToString('N')}
    $active=Join-Path $history ('generations/'+$activeId)
    $activeVersion=if($case -ceq 'active974'){'0.0.974'}elseif($case -match '^(97[6-9])-974$'){'0.0.'+$Matches[1]}else{'0.0.975'}
    New-HistoryPayload $active @($original.files.path) $activeVersion
    [IO.Directory]::CreateDirectory((Join-Path $active 'data'))|Out-Null
    [IO.File]::WriteAllText((Join-Path $active 'data/user.bin'),'active user data')
    $priorId=if($case -ceq '974'){$observedState.previous.generation}else{[guid]::NewGuid().ToString('N')}
    $prior=Join-Path $history ('generations/'+$priorId)
    $restorable=$case -in @('active974','974','976-974','977-974','978-974','979-974','973')
    New-HistoryPayload $prior @($original.files.path) ('0.0.'+$(if($case -in @('973','active974')){'973'}elseif($restorable){'974'}else{'975'}))
    [IO.Directory]::CreateDirectory((Join-Path $prior 'data'))|Out-Null
    [IO.File]::WriteAllText((Join-Path $prior 'data/user.bin'),'previous user data')
    $reference=@{generation=[IO.Path]::GetFileName($prior);manifest_sha256=(Get-NativeHash (Join-Path $prior 'manifest.json'))}
    switch($case){
        'missing' {Remove-Item -LiteralPath (Join-Path $prior 'manifest.json')}
        'missing-generation' {$reference.generation=[guid]::NewGuid().ToString('N')}
        'corrupt' {[IO.File]::WriteAllText((Join-Path $prior 'manifest.json'),'{invalid')}
        'tampered' {[IO.File]::AppendAllText((Join-Path $prior 'bin/vantare.exe'),'tampered')}
        'bad-reference' {$reference.generation='../outside'}
    }
    Set-NativeState $history @{schema=1;product='vantare-native';channel='beta';active=@{generation=[IO.Path]::GetFileName($active);manifest_sha256=(Get-NativeHash (Join-Path $active 'manifest.json'))};previous=$reference}
    $stateHash=Get-NativeHash (Join-Path $history 'state.json')
    $priorIndex=Get-NativeDataIndex $prior
    $activeData=Get-NativeDataIndex (Join-Path $active 'data')
    $diagnostic=[IO.StringWriter]::new();$savedError=[Console]::Error
    try{[Console]::SetError($diagnostic);$read=Read-NativeState $history}finally{[Console]::SetError($savedError)}
    Assert-History ($read.active.generation -ceq [IO.Path]::GetFileName($active) -and $(if($restorable){$read.previous.generation -ceq [IO.Path]::GetFileName($prior)}else{$null -eq $read.previous})) "$case previous cannot block verified active"
    if($restorable){
        Assert-History ($diagnostic.ToString() -ceq '') "$case valid previous emits no diagnostic"
    }else{
        $expected=if($case -in @('missing','missing-generation')){'previous-unreadable'}else{'previous-corrupt'}
        Assert-History ($diagnostic.ToString().Trim() -ceq $expected) "$case previous emits exact closed diagnostic on stderr"
    }
    Assert-History ((Get-NativeHash (Join-Path $history 'state.json')) -ceq $stateHash -and (Get-NativeDataIndex $prior) -ceq $priorIndex) "$case read preserves state and previous bytes"
    if(-not $restorable){
        Reject-History {Restore-NativeCandidate $history} "$case cannot be restored" 'No hay generación anterior; no se cambian datos.'
        Assert-History ((Get-NativeHash (Join-Path $history 'state.json')) -ceq $stateHash) "$case rejected rollback preserves state"
        # A nonempty boot.previous must never claim a rollback that did not run.
        Write-BetaJson (Join-Path $history 'boot-pending.json') @{schema=1;previous=$reference.generation;version='0.0.980'}
        $process=Start-Process -FilePath (Join-Path $env:WINDIR 'System32/cmd.exe') -ArgumentList '/D /C exit 7' -WindowStyle Hidden -PassThru
        try{$process.WaitForExit();Reject-History {Confirm-BetaBoot $history $process 0} "$case failed boot cannot announce a fictitious rollback" 'No hay versión anterior íntegra que pueda restaurarse.'}finally{$process.Dispose()}
        $status=Get-Content (Join-Path $history 'update-status.json') -Raw|ConvertFrom-Json
        Assert-History ($status.state -ceq 'error' -and (Read-NativeState $history).active.generation -ceq [IO.Path]::GetFileName($active)) "$case boot reports error and preserves active"
    }
    $request=Join-Path $history 'probe-request.json'
    Write-NativeJson $request @{operation='Probe';root=$history;qa=$true;qaIdentity='VantareNativeBetaQA1492';qaShortcutFolder='Vantare QA1492';qaLegacyShortcutFolder='Vantare Native Beta QA1492';qaPrefix=$root;silent=$true;uninstall=$false;version='0.0.980';size=1024}
    $probe=& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $historyDriver -RequestFile $request
    Assert-History ($LASTEXITCODE -eq 0 -and ($probe|ConvertFrom-Json).installed_version -ceq $activeVersion) "$case Setup probe preserves JSON protocol"
    if($case -in @('active974','974')){
        $updated=& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'candidate.ps1') -Operation Update -Root $history -Archive $zip -ExpectedSha256 $hash
        Assert-History ($LASTEXITCODE -eq 0 -and ($updated|ConvertFrom-Json).active.generation -cne [IO.Path]::GetFileName($active)) "$case CLI Update crosses the actual process boundary"
    }else{Install-Beta $history $zip $hash}
    $after=Read-NativeState $history
    Assert-History ($after.previous.generation -ceq [IO.Path]::GetFileName($active)) "$case upgrade retains verified active as rollback"
    Assert-History ((Get-NativeDataIndex $prior) -ceq $priorIndex -and (Get-NativeDataIndex (Join-Path $history ('generations/'+$after.active.generation+'/data'))) -ceq $activeData) "$case upgrade preserves previous and user data"
    $activeExe=Join-Path $history ('generations/'+$after.active.generation+'/bin/vantare.exe')
    [IO.File]::AppendAllText($activeExe,'tampered')
    Reject-History {Read-NativeState $history} "$case active byte integrity remains mandatory" 'Integridad incorrecta: bin/vantare.exe'
    $after.active.manifest_sha256='0'*64
    Set-NativeState $history $after
    Reject-History {Read-NativeState $history $false} "$case active reference remains mandatory even for repair/probe" 'Generación activa/anterior incompleta.'
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
