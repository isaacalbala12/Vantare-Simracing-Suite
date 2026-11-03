# Read-only Rust rejection invariants; no PowerShell reader or localized text oracle.
function Test-MatrixProbeRejections([string]$Install,[string]$ReadProbe,$Info) {
    $null=Assert-MatrixRoot $Install
    $statePath=Join-Path $Install 'state.json'
    if(-not(Test-Path -LiteralPath $statePath)){return}
    $originalState=[IO.File]::ReadAllBytes($statePath)
    $state=[IO.File]::ReadAllText($statePath)|ConvertFrom-Json
    $manifestPath=Join-Path $Install ('generations/'+$state.active.generation+'/manifest.json')
    $originalManifest=[IO.File]::ReadAllBytes($manifestPath)
    $faults=@{'schema'='state-contract';'reference'='generation-reference';'sha'='generation-binding';'inventory'='inventory';'manifest'='manifest-contract';'previous'='previous-missing';'channel'='manifest-contract';'json'='state-contract';'missing-manifest'='io-not-found'}
    foreach($fault in @($faults.Keys|Sort-Object)){
        try{
            $changedState=[Text.Encoding]::UTF8.GetString($originalState)|ConvertFrom-Json
            $changedManifest=[Text.Encoding]::UTF8.GetString($originalManifest)|ConvertFrom-Json
            switch($fault){
                'schema' {$changedState.schema=2}
                'reference' {$changedState.active.generation='not-a-generation'}
                'sha' {$changedState.active.manifest_sha256=('0'*64)}
                'inventory' {$changedManifest.files[0].path='../outside.exe'}
                'manifest' {$changedManifest.schema=2}
                'previous' {$changedState.PSObject.Properties.Remove('previous')}
                'channel' {$changedManifest.channel='nightly'}
            }
            if($fault -in @('inventory','manifest','channel')){
                [IO.File]::WriteAllText($manifestPath,($changedManifest|ConvertTo-Json -Depth 15),[Text.UTF8Encoding]::new($false))
                $changedState.active.manifest_sha256=Get-NativeHash $manifestPath
            }
            [IO.File]::WriteAllText($statePath,($changedState|ConvertTo-Json -Depth 15),[Text.UTF8Encoding]::new($false))
            if($fault -ceq 'json'){[IO.File]::WriteAllText($statePath,'{broken')}
            if($fault -ceq 'missing-manifest'){[IO.File]::Delete($manifestPath)}
            $prefix=Join-Path (Split-Path $Install) ('reject-'+$fault)
            $result=Invoke-NativeProcess -Executable $ReadProbe -Arguments @('--outcome') -InputText ($Info|ConvertTo-Json -Compress) -TimeoutMilliseconds 30000 -LogPath ($prefix+'.log')
            $reason=($result.Stdout|ConvertFrom-Json).rejected
            if(-not $result.ExitCode -or $reason -cne $faults[$fault]){throw ('MATRIX_REJECTION_CHANGED: '+$fault+' / '+$reason)}
            Write-NativeJson ($prefix+'.json') @{invariant=$reason;rejected=$true}
        }finally{
            [IO.File]::WriteAllBytes($manifestPath,$originalManifest)
            [IO.File]::WriteAllBytes($statePath,$originalState)
        }
    }
}
