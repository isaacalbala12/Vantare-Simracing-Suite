#requires -Version 5.1
param([string]$Root,[string]$TestVerifier,[string]$MatrixDirectory=$PSScriptRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $MatrixDirectory 'guard.ps1')
$qaGrowthRoot=Assert-MatrixRoot $Root
if (Test-Path -LiteralPath $qaGrowthRoot) { throw 'Growth test needs a fresh root' }
[IO.Directory]::CreateDirectory($qaGrowthRoot) | Out-Null
$script:Packaging=Split-Path $PSScriptRoot -Parent
. (Join-Path $script:Packaging 'beta.ps1') -Library -Root $qaGrowthRoot
. (Join-Path $MatrixDirectory 'fixtures.ps1')
function Get-NativeShortcutFolder([string]$Name){
    if($Name -cnotin @('Programs','Startup','DesktopDirectory')){throw 'Unexpected growth shell folder'}
    Join-Path (Join-Path $qaGrowthRoot 'shell') $Name
}
$passed=0
function Assert-Growth([bool]$Value,[string]$Message) { if(-not $Value){throw $Message};$script:passed++;"PASS $Message" }
function Reject-Growth([scriptblock]$Action,[string]$Message,[string]$Expected) {
    if(-not $Expected){throw 'A rejection must declare its cause'}
    $failure=$null
    try { $null=& $Action } catch { $failure=$_.Exception.Message }
    if($null -ne $failure -and $failure -cne $Expected){throw ("Unexpected rejection for {0}: {1}" -f $Message,$failure)}
    Assert-Growth ($failure -ceq $Expected) $Message
}
function Test-ShippedInventory {
    # Fixed snapshot of the 0.0.987 package retained in RC9 evidence, not regenerated from this engine.
    $shipped=Get-Content -LiteralPath (Join-Path $script:Packaging 'fixtures/shipped-inventory-0.0.987.json') -Raw|ConvertFrom-Json
    if($shipped.schema -ne 1 -or $shipped.version -cne '0.0.987' -or @($shipped.channels.beta).Count -ne 109 -or
       @($shipped.channels.beta|Sort-Object -Unique).Count -ne 109 -or $shipped.manifest_sha256 -cnotmatch '^[a-f0-9]{64}$'){return $false}
    foreach($channel in $shipped.channels.PSObject.Properties){
        $current=@(Get-NativeMembers $channel.Name)
        foreach($member in $channel.Value){
            if($member -cnotin $current -and $member -cnotin $script:NativeRetiredMembers){return $false}
        }
    }
    $true
}
$qaHive='Registry::HKEY_CURRENT_USER\Software\VantareInstallerMatrix\'+[guid]::NewGuid().ToString('N')
New-Item -Path $qaHive -Force | Out-Null
Remove-PSDrive HKCU
New-PSDrive HKCU Registry $qaHive -Scope Global | Out-Null
try {
    Assert-Growth (Test-ShippedInventory) 'Current inventory retains or explicitly retires every captured package member'
    $old=Join-Path $qaGrowthRoot 'old'
    New-MatrixPayload $old '1.0.0' $TestVerifier
    $oldMembers=@(Get-NativeMembers 'beta')
    $install=Open-NativeRoot (Join-Path $qaGrowthRoot 'install') -Initialize
    $reference=Add-MatrixGeneration $install ('a'*32) $old
    $oldGeneration=Join-Path $install ('generations/'+$reference.generation)
    [IO.Directory]::CreateDirectory((Join-Path $oldGeneration 'data/empty')) | Out-Null
    Set-NativeState $install @{schema=1;product='vantare-native';channel='beta';active=$reference;previous=$null}
    $before=Get-NativeDataIndex (Join-Path $oldGeneration 'data')
    foreach($bad in @('../x','data/user.bin','bin/data/user.bin','C:/x','/x','\\server\share','bin\x','README.md')){
        $script:NativeRetiredMembers=@($bad)
        Reject-Growth {Get-NativeKnownMembers 'beta'} "Retired catalogue rejects $bad" 'Catálogo de rutas retiradas inválido o duplicado.'
        Reject-Growth {Uninstall-Beta $install} "Uninstall rejects retired $bad before deleting members" 'Catálogo de rutas retiradas inválido o duplicado.'
    }
    $script:NativeRetiredMembers=@('bin/retired.json','BIN/retired.json')
    Reject-Growth {Get-NativeKnownMembers 'beta'} 'Retired catalogue rejects case-insensitive duplicates' 'Catálogo de rutas retiradas inválido o duplicado.'
    $script:NativeRetiredMembers=@()
    Assert-Growth ((Test-Path -LiteralPath (Join-Path $install 'state.json')) -and (Get-NativeDataIndex (Join-Path $oldGeneration 'data')) -ceq $before) 'All invalid catalogues preserve state and data'
    $stateBytes=[IO.File]::ReadAllBytes((Join-Path $install 'state.json'))
    # Simulate the next engine's closed public inventory gaining ONE approved
    # resource. The installed N manifest and its state hash remain unchanged.
    $script:GrowthMembers=$oldMembers+@('bin/fixtures/future-approved.json')
    function Get-NativeMembers([string]$CandidateChannel) {
        if ($CandidateChannel -cne 'beta') { throw 'Unexpected growth fixture channel' }
        $script:GrowthMembers
    }
    $script:NativeMembers=@(Get-NativeMembers 'beta')
    $observed=Read-NativeState $install
    Assert-Growth ($observed.active.generation -ceq $reference.generation -and $observed.active.manifest_sha256 -ceq (Get-NativeHash (Join-Path $oldGeneration 'manifest.json')) -and [Convert]::ToBase64String($stateBytes) -ceq [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $install 'state.json')))) 'N+1 returns the original manifest-bound N reference without changing state'
    $incoming=Join-Path $qaGrowthRoot 'new'
    New-MatrixPayload $incoming '1.0.1' $TestVerifier
    $oldZip=Join-Path $qaGrowthRoot 'old.zip';New-NativeZip $old $oldZip
    Reject-Growth { Expand-NativePackage $oldZip (Get-NativeHash $oldZip) (Join-Path $qaGrowthRoot 'rejected') 'beta' } 'Incoming N is still rejected against the full N+1 inventory' 'Número de miembros ZIP incorrecto.'
    $zip=Join-Path $qaGrowthRoot 'new.zip';New-NativeZip $incoming $zip
    $state=Update-NativeCandidate $install $zip (Get-NativeHash $zip)
    $newGeneration=Join-Path $install ('generations/'+$state.active.generation)
    Assert-Growth ($state.previous.generation -ceq $reference.generation -and (Read-NativeManifest $newGeneration 'beta' -Installed).files.Count -eq ($oldMembers.Count+1)) 'N to N+1 grows the inventory and retains N for rollback'
    Assert-Growth ((Get-NativeDataIndex (Join-Path $oldGeneration 'data')) -ceq $before -and (Get-NativeDataIndex (Join-Path $newGeneration 'data')) -ceq $before) 'Upgrade preserves exact original and copied data, including empty directories'
    $restored=Restore-NativeCandidate $install
    Assert-Growth ($restored.active.generation -ceq $reference.generation -and (Get-NativeDataIndex (Join-Path $oldGeneration 'data')) -ceq $before) 'Rollback restores N with its exact data'

    # Retiring/renaming a resource removes it from INCOMING inventory, but its
    # explicit known path remains valid for installed N and for cleanup.
    $retired='bin/fixtures/standings-legacy.snapshot.json'
    $script:GrowthMembers=@($script:GrowthMembers | Where-Object {$_ -cne $retired})
    Assert-Growth (-not(Test-ShippedInventory)) 'A shipped member cannot disappear without an explicit retirement'
    $script:NativeRetiredMembers=@($retired)
    Assert-Growth (Test-ShippedInventory) 'Explicit retirement preserves the shipped inventory contract'
    $stateBeforeRetirement=Get-NativeHash (Join-Path $install 'state.json')
    $observed=Read-NativeState $install
    $installed=Read-NativeManifest $oldGeneration 'beta' -Installed
    Assert-Growth ($observed.active.generation -ceq $reference.generation -and $installed.files.path -ccontains $retired -and $retired -cnotin @(Get-NativeMembers 'beta') -and (Get-NativeHash (Join-Path $install 'state.json')) -ceq $stateBeforeRetirement) 'Retirement still reads the original active manifest containing the removed resource'
    $withdrawn=Join-Path $qaGrowthRoot 'withdrawn'
    New-MatrixPayload $withdrawn '1.0.2' $TestVerifier
    $withdrawnZip=Join-Path $qaGrowthRoot 'withdrawn.zip';New-NativeZip $withdrawn $withdrawnZip
    $state=Update-NativeCandidate $install $withdrawnZip (Get-NativeHash $withdrawnZip)
    $withdrawnGeneration=Join-Path $install ('generations/'+$state.active.generation)
    Assert-Growth (-not(Test-Path -LiteralPath (Join-Path $withdrawnGeneration $retired)) -and (Get-NativeDataIndex (Join-Path $withdrawnGeneration 'data')) -ceq $before) 'Incoming package omits retired resource and preserves data'
    $restored=Restore-NativeCandidate $install
    Assert-Growth ($restored.active.generation -ceq $reference.generation) 'Rollback reads a generation containing the retired resource'

    $manifestPath=Join-Path $oldGeneration 'manifest.json'
    $manifestBytes=[IO.File]::ReadAllBytes($manifestPath)
    foreach ($mutation in @('traversal','absolute','backslash','unknown','case','duplicate','channel','empty')) {
        $manifest=[Text.Encoding]::UTF8.GetString($manifestBytes) | ConvertFrom-Json
        switch ($mutation) {
            'traversal' {$manifest.files[0].path='../escape.exe'}
            'absolute' {$manifest.files[0].path='C:/escape.exe'}
            'backslash' {$manifest.files[0].path='bin\..\escape.exe'}
            'unknown' {$manifest.files[0].path='bin/unapproved.exe'}
            'case' {$manifest.files[0].path=$manifest.files[0].path.ToUpperInvariant()}
            'duplicate' {$manifest.files+=@($manifest.files[0])}
            'channel' {$manifest.channel='nightly'}
            'empty' {$manifest.files=@()}
        }
        try {
            Write-BetaJson $manifestPath $manifest
            $reason=if($mutation -ceq 'channel'){'Manifiesto, esquema o canal incompatible.'}elseif($mutation -ceq 'empty'){'Inventario instalado vacío.'}else{'Lista de archivos inválida o duplicada.'}
            Reject-Growth {Read-NativeManifest $oldGeneration 'beta' $false -Installed} "Installed manifest rejects $mutation" $reason
            Reject-Growth {Read-NativeState $install $false} "State hash rejects changed manifest: $mutation" 'Generación activa/anterior incompleta.'
        } finally { [IO.File]::WriteAllBytes($manifestPath,$manifestBytes) }
    }
    $unlisted=Join-Path $oldGeneration 'unlisted.json'
    try {
        [IO.File]::WriteAllText($unlisted,'unlisted')
        Reject-Growth {Read-NativeState $install} 'Unlisted disk file remains forbidden' 'Archivo instalado no enumerado en el manifiesto.'
    } finally { Remove-Item -LiteralPath $unlisted }
    $image=Join-Path $oldGeneration 'bin/vantare.exe'
    $imageBytes=[IO.File]::ReadAllBytes($image)
    try {
        [IO.File]::AppendAllText($image,'tampered')
        Reject-Growth {Read-NativeState $install} 'Executable integrity remains mandatory' 'Integridad incorrecta: bin/vantare.exe'
    } finally { [IO.File]::WriteAllBytes($image,$imageBytes) }
    $null=Read-NativeState $install
    $sidecar=$image+'.sha256'
    $sidecarBytes=[IO.File]::ReadAllBytes($sidecar)
    try {
        [IO.File]::WriteAllText($sidecar,(('0'*64)+'  vantare.exe'+"`n"))
        Reject-Growth {Read-NativeState $install} 'Executable sidecar remains mandatory' 'Sidecar incorrecto: bin/vantare.exe'
    } finally { [IO.File]::WriteAllBytes($sidecar,$sidecarBytes) }
    $junction=Join-Path $oldGeneration 'linked'
    $junctionTarget=Join-Path $qaGrowthRoot 'junction-target'
    [IO.Directory]::CreateDirectory($junctionTarget) | Out-Null
    New-Item -ItemType Junction -Path $junction -Target $junctionTarget | Out-Null
    try { Reject-Growth {Read-NativeState $install} 'Generation reparse point remains forbidden' 'Árbol .env o reparse point rechazado antes de leerlo.' }
    finally { $null=Assert-MatrixRoot $qaGrowthRoot;[IO.Directory]::Delete($junction) }
    $foreign=Join-Path $oldGeneration 'bin/foreign.keep'
    [IO.File]::WriteAllText($foreign,'foreign program-folder content')
    $foreignHash=Get-NativeHash $foreign
    $finalized=$false
    Uninstall-Beta $install -Finalize {$script:finalized=$true}
    Assert-Growth (-not(Test-Path -LiteralPath (Join-Path $install 'state.json')) -and $finalized -and (Get-NativeHash $foreign) -ceq $foreignHash) 'Nonempty program folder is preserved and uninstall removes state and reaches finalization'
    $dataUnchanged=(Get-NativeDataIndex (Join-Path $oldGeneration 'data')) -ceq $before -and (Get-NativeDataIndex (Join-Path $newGeneration 'data')) -ceq $before -and (Get-NativeDataIndex (Join-Path $withdrawnGeneration 'data')) -ceq $before
    Assert-Growth $dataUnchanged 'Uninstall retains all three generations of data'
    Assert-Growth (-not(Test-Path -LiteralPath (Join-Path $oldGeneration $retired)) -and -not(Test-Path -LiteralPath (Join-Path $newGeneration $retired))) 'Uninstall removes retired program resources, never user data'
    # Actual installer-driver boundary: a foreign program file must not turn a
    # successful uninstall into the misleading "close Vantare" error path.
    $driverInstall=Open-NativeRoot (Join-Path $qaGrowthRoot 'driver-install') -Initialize
    $driverReference=Add-MatrixGeneration $driverInstall ('c'*32) $old
    Set-NativeState $driverInstall @{schema=1;product='vantare-native';channel='beta';active=$driverReference;previous=$null}
    foreach($name in @('candidate.ps1','beta.ps1')){Copy-Item -LiteralPath (Join-Path $script:Packaging $name) -Destination $driverInstall}
    Set-MatrixRegistration $driverInstall '1.0.0'
    $driverForeign=Join-Path $driverInstall ('generations/'+$driverReference.generation+'/bin/foreign.keep')
    [IO.File]::WriteAllText($driverForeign,'driver foreign file')
    $driverForeignHash=Get-NativeHash $driverForeign
    $driverDataBefore=Get-MatrixData $driverInstall|ConvertTo-Json -Depth 10 -Compress
    $driverEngine=Join-Path $qaGrowthRoot 'driver-engine'
    [IO.Directory]::CreateDirectory($driverEngine)|Out-Null
    foreach($name in @('candidate.ps1','beta.ps1')){Copy-Item -LiteralPath (Join-Path $script:Packaging $name) -Destination $driverEngine}
    $driver=[IO.File]::ReadAllText((Join-Path $script:Packaging 'installer-driver.ps1'))
    $library=". (Join-Path `$PSScriptRoot 'beta.ps1') -Library"
    $import=$library+' -Root $PSScriptRoot'
    $boundary="Remove-PSDrive HKCU`nNew-PSDrive HKCU Registry '"+$qaHive+"' -Scope Global|Out-Null`n"+
        ". '"+(Join-Path $MatrixDirectory 'guard.ps1')+"'`n"+'$null=Assert-MatrixRoot (([IO.File]::ReadAllText($RequestFile)|ConvertFrom-Json).root)'+"`n"+
        $library+" -Root '"+$driverInstall+"'`n"+
        'function Get-NativeShortcutFolder([string]$Name){if($Name -cnotin @(''Programs'',''Startup'',''DesktopDirectory'')){throw ''Unexpected folder''};Join-Path '''+(Join-Path $qaGrowthRoot 'shell')+''' $Name}'
    if(-not $driver.Contains($import)){throw 'Growth driver import changed'}
    $driverPath=Join-Path $driverEngine 'installer-driver.ps1'
    [IO.File]::WriteAllText($driverPath,$driver.Replace($import,$boundary),[Text.UTF8Encoding]::new($true))
    $request=Join-Path $driverEngine 'request.json'
    Write-NativeJson $request @{operation='Uninstall';root=$driverInstall;qa=$false;silent=$true;uninstall=$true;version='1.0.0';size=1}
    $driverResult=Invoke-NativeProcess -Executable "$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe" -Arguments @('-NoProfile','-ExecutionPolicy','Bypass','-File',$driverPath,'-RequestFile',$request) -TimeoutMilliseconds 30000 -LogPath (Join-Path $qaGrowthRoot 'uninstall-driver.log')
    Assert-Growth ($driverResult.ExitCode -eq 0 -and -not(Test-Path -LiteralPath (Join-Path $driverInstall 'state.json')) -and -not(Test-Path 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBeta')) 'Driver completes nonempty-folder uninstall without a false close-Vantare error'
    $driverDataUnchanged=(Get-MatrixData $driverInstall|ConvertTo-Json -Depth 10 -Compress) -ceq $driverDataBefore
    Assert-Growth ($driverDataUnchanged -and (Get-NativeHash $driverForeign) -ceq $driverForeignHash) 'Driver preserves foreign program file and all user data'
    $dataUnchanged=$dataUnchanged -and $driverDataUnchanged
    Write-NativeJson (Join-Path $qaGrowthRoot 'result.json') @{checks=$passed;old_members=$oldMembers.Count;grown_members=($oldMembers.Count+1);withdrawn_members=$script:GrowthMembers.Count;data_unchanged=$dataUnchanged}
} finally {
    Remove-PSDrive HKCU
    New-PSDrive HKCU Registry HKEY_CURRENT_USER -Scope Global | Out-Null
    if($qaHive -cnotmatch '^Registry::HKEY_CURRENT_USER\\Software\\VantareInstallerMatrix\\[a-f0-9]{32}$'){throw 'Growth hive cleanup rejected'}
    Remove-Item -LiteralPath $qaHive -Recurse -Force
}
"$passed inventory growth checks PASS; evidence $qaGrowthRoot"
