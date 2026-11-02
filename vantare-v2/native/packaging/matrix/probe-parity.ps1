# Test-only differential oracle. Compare violated invariants, never formatted stderr.
function Write-MatrixProbeFixtureJson([string]$Path,$Value) {
    $null=Assert-MatrixRoot $Path
    # Product Write-NativeJson intentionally uses CreateNew. Only owned test
    # fixtures are overwritten here, and finally restores their original bytes.
    [IO.File]::WriteAllText($Path,($Value|ConvertTo-Json -Depth 15),[Text.UTF8Encoding]::new($false))
}

function Get-MatrixProbeRejection($Failure) {
    $id=$Failure.FullyQualifiedErrorId
    if($id -ceq 'PropertyNotFoundStrict' -and $Failure.InvocationInfo.Line -match '\$state\.previous') { return 'previous-missing' }
    if($id -like '*ConvertFromJsonCommand*'){return 'json'}
    $cause=$Failure.Exception.GetBaseException()
    if($cause -is [IO.FileNotFoundException] -or $cause -is [IO.DirectoryNotFoundException]){return 'io-not-found'}
    # Legacy throw statements have no typed domain exception. Their structured
    # ErrorRecord IDs identify the canonical invariant; text presentation is unused.
    switch -Wildcard ($id) {
        'Estado de instalaci*n inv*lido*' {return 'state-contract'}
        'Estado de desinstalaci*n inv*lido*' {return 'state-contract'}
        'Referencia de generaci*n inv*lida*' {return 'generation-reference'}
        'Generaci*n activa/anterior incompleta*' {return 'generation-binding'}
        'Lista de archivos inv*lida o duplicada*' {return 'inventory'}
        'Manifiesto, esquema o canal incompatible*' {return 'manifest-contract'}
        default {throw ('MATRIX_UNCLASSIFIED_PS_REJECTION: '+$id)}
    }
}

function Compare-MatrixProbe([string]$Driver,[string]$Request,[string]$ReadProbe,[bool]$Uninstall=$false,[string]$ExpectedRejection='',[string]$Scenario='baseline') {
    $value=[IO.File]::ReadAllText($Request)|ConvertFrom-Json
    $null=Assert-MatrixRoot $value.root
    $value.readContext=$false;$value.uninstall=$Uninstall
    $prefix=$Request+'.'+$Scenario+$(if($Uninstall){'.uninstall'}else{'.install'})
    $legacyRequest=$prefix+'.legacy.json';Write-NativeJson $legacyRequest $value
    $failure=$null;$global:LASTEXITCODE=0
    try{$expected=& $Driver -RequestFile $legacyRequest;if($LASTEXITCODE){throw 'MATRIX_LEGACY_PROBE_EXIT'}}catch{$failure=$_}
    $value.readContext=$true
    $contextRequest=$prefix+'.context.json';Write-NativeJson $contextRequest $value
    $global:LASTEXITCODE=0
    $context=& $Driver -RequestFile $contextRequest
    if($LASTEXITCODE){throw 'MATRIX_PROBE_CONTEXT_FAILED'}
    $probeArguments=@('--outcome');if($Uninstall){$probeArguments=@('--uninstall','--outcome')}
    $result=Invoke-NativeProcess -Executable $ReadProbe -Arguments $probeArguments -InputText $context -TimeoutMilliseconds 30000 -LogPath ($prefix+'.rust.log')
    if($null -ne $failure){
        if(-not $result.ExitCode){throw 'MATRIX_RUST_ACCEPTED_PS_REJECTION'}
        $legacyReason=Get-MatrixProbeRejection $failure
        $rustReason=($result.Stdout|ConvertFrom-Json).rejected
        if($rustReason -cne $legacyReason -or ($ExpectedRejection -and $legacyReason -cne $ExpectedRejection)){throw ('MATRIX_PROBE_REJECTION_CHANGED: '+$legacyReason+' / '+$rustReason+' / '+$ExpectedRejection)}
        Write-NativeJson ($prefix+'.rejection.json') @{legacy=$legacyReason;rust=$rustReason}
        return
    }
    if($ExpectedRejection){throw ('MATRIX_PS_ACCEPTED_INVALID_FIXTURE: '+$ExpectedRejection)}
    if($result.ExitCode){throw ('MATRIX_RUST_PROBE_FAILED: '+$result.Stderr)}
    $old=$expected|ConvertFrom-Json;$new=$result.Stdout|ConvertFrom-Json
    if(@(Compare-Object @($old.PSObject.Properties.Name) @($new.PSObject.Properties.Name) -CaseSensitive).Count){throw 'MATRIX_PROBE_FIELDS_CHANGED'}
    foreach($field in $old.PSObject.Properties){
        if($field.Value -cne $new.PSObject.Properties[$field.Name].Value){throw ('MATRIX_PROBE_VALUE_CHANGED: '+$field.Name)}
    }
    $result.Stdout
}

function Test-MatrixProbeRejections([string]$Install,[string]$Driver,[string]$Request,[string]$ReadProbe) {
    $null=Assert-MatrixRoot $Install
    $statePath=Join-Path $Install 'state.json'
    if(-not(Test-Path -LiteralPath $statePath)){return}
    $originalState=[IO.File]::ReadAllBytes($statePath)
    $state=[IO.File]::ReadAllText($statePath)|ConvertFrom-Json
    $manifestPath=Join-Path $Install ('generations/'+$state.active.generation+'/manifest.json')
    $originalManifest=[IO.File]::ReadAllBytes($manifestPath)
    $faults=@{'schema'='state-contract';'reference'='generation-reference';'sha'='generation-binding';'inventory'='inventory';'manifest'='manifest-contract';'previous'='previous-missing';'channel'='manifest-contract';'json'='json';'missing-manifest'='io-not-found'}
    foreach($fault in @($faults.Keys|Sort-Object)){
        try{
            $changedState=[Text.Encoding]::UTF8.GetString($originalState)|ConvertFrom-Json
            $changedManifest=[Text.Encoding]::UTF8.GetString($originalManifest)|ConvertFrom-Json
            switch($fault){
                'schema' {$changedState.schema=2}
                'reference' {$changedState.active.generation='not-a-generation'}
                'sha' {$changedState.active.manifest_sha256=('0'*64)}
                'inventory' {$changedManifest.files[0].path='bin/not-in-the-catalogue.exe'}
                'manifest' {$changedManifest.schema=2}
                'previous' {$changedState.PSObject.Properties.Remove('previous')}
                'channel' {$changedState.channel='nightly';$changedManifest.channel='nightly'}
                'json' {}
                'missing-manifest' {}
            }
            if($fault -in @('inventory','manifest','channel')){
                Write-MatrixProbeFixtureJson $manifestPath $changedManifest
                $changedState.active.manifest_sha256=Get-NativeHash $manifestPath
            }
            Write-MatrixProbeFixtureJson $statePath $changedState
            if($fault -ceq 'json'){[IO.File]::WriteAllText($statePath,'{broken')}
            if($fault -ceq 'missing-manifest'){[IO.File]::Delete($manifestPath)}
            if($fault -ceq 'channel'){
                # Read-NativeState and the common Rust reader accept nightly;
                # only Setup's extra ExpectedChannel='beta' policy rejects it.
                $legacyRead=Read-NativeState $Install $false
                $context=& $Driver -RequestFile $Request
                $common=Invoke-NativeProcess -Executable $ReadProbe -Arguments @('--reader') -InputText $context -TimeoutMilliseconds 30000 -LogPath ($Request+'.common.log')
                if($common.ExitCode){throw 'MATRIX_COMMON_READER_REJECTED_NIGHTLY'}
                $read=$common.Stdout|ConvertFrom-Json
                if($read.channel -cne $legacyRead.channel -or $read.version -cne $changedManifest.version){throw 'MATRIX_COMMON_READER_CHANGED'}
            }
            Compare-MatrixProbe $Driver $Request $ReadProbe $false $faults[$fault] $fault | Out-Null
        }finally{
            [IO.File]::WriteAllBytes($manifestPath,$originalManifest)
            [IO.File]::WriteAllBytes($statePath,$originalState)
        }
    }
}
