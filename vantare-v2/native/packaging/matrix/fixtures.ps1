# Test fixtures; binaries are never launched as product applications.
function New-MatrixPayload([string]$Destination,[string]$Version,[string]$Verifier) {
    foreach ($member in Get-NativeMembers 'beta') {
        $file = Join-Path $Destination $member
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file)) | Out-Null
        if ($member -ceq 'bin/vantare-services.exe') { Copy-Item -LiteralPath $Verifier -Destination $file }
        elseif ($member.EndsWith('.exe')) { Copy-Item -LiteralPath "$env:WINDIR/System32/cmd.exe" -Destination $file }
        elseif ($member.EndsWith('.exe.sha256')) {
            $exe = $file.Substring(0,$file.Length-7)
            [IO.File]::WriteAllText($file,((Get-NativeHash $exe)+'  '+[IO.Path]::GetFileName($exe)+"`n"))
        }
        elseif ($member -ceq 'candidate.ps1') { Copy-Item -LiteralPath "$script:Packaging/candidate.ps1" -Destination $file }
        else { [IO.File]::WriteAllText($file,'matrix fixture') }
    }
    $files = @(Get-NativeMembers 'beta' | ForEach-Object {
        $file=Join-Path $Destination $_
        @{path=$_;size=(Get-Item -LiteralPath $file).Length;sha256=(Get-NativeHash $file)}
    })
    Write-NativeJson (Join-Path $Destination 'manifest.json') @{
        schema=1; product='vantare-native'; candidate=$true; architecture='windows-x64';
        data_schema='opaque-v1'; source_sha=('a'*40); source_dirty=$false;
        build_profile='Debug'; version=$Version; channel='beta'; files=$files
    }
}

function Add-MatrixGeneration([string]$Install,[string]$Id,[string]$Source) {
    $destination=Join-Path $Install ('generations/'+$Id)
    [IO.Directory]::CreateDirectory($destination) | Out-Null
    Copy-Item -Path (Join-Path $Source '*') -Destination $destination -Recurse
    [IO.Directory]::CreateDirectory((Join-Path $destination 'data')) | Out-Null
    [IO.File]::WriteAllText((Join-Path $destination 'data/user.bin'),('opaque data '+$Id))
    @{generation=$Id;manifest_sha256=(Get-NativeHash (Join-Path $destination 'manifest.json'))}
}

function Set-MatrixRegistration([string]$Install,[string]$Version) {
    $key='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBeta'
    New-Item -Path $key -Force | Out-Null
    foreach ($entry in @{InstallLocation=$Install;DisplayVersion=$Version;DisplayName='Vantare Native Beta'}.GetEnumerator()) {
        Set-ItemProperty -LiteralPath $key -Name $entry.Key -Value $entry.Value
    }
    Sync-NativeRegistration $Install $Version
}

function Initialize-MatrixCase([string]$Case,[string]$Install,[string]$Assets) {
    if ($Case -ceq 'clean') { return }
    $null=Open-NativeRoot $Install -Initialize
    Copy-Item -LiteralPath "$script:Packaging/beta.ps1" -Destination (Join-Path $Install 'beta.ps1')
    Copy-Item -LiteralPath "$script:Packaging/candidate.ps1" -Destination (Join-Path $Install 'candidate.ps1')
    $legacy=$Case -in @('nsis975','nsis975-incomplete974')
    $source=if($legacy){Join-Path $Assets 'legacy'}else{Join-Path $Assets 'v988'}
    $active=Add-MatrixGeneration $Install ('a'*32) $source
    $previous=$null
    if ($Case -in @('rc-options','pending','boot','nsis975-incomplete974')) {
        $previous=Add-MatrixGeneration $Install ('b'*32) (Join-Path $Assets 'v987')
        if ($Case -ceq 'nsis975-incomplete974') {
            Copy-Item -LiteralPath "$script:Packaging/fixtures/manifest-beta-0.0.974.json" -Destination (Join-Path $Install ('generations/'+('b'*32)+'/manifest.json'))
            $previous.manifest_sha256=Get-NativeHash (Join-Path $Install ('generations/'+('b'*32)+'/manifest.json'))
            Remove-Item -LiteralPath (Join-Path $Install ('generations/'+('b'*32)+'/bin/vantare-core.exe'))
        }
    }
    Set-NativeState $Install @{schema=1;product='vantare-native';channel='beta';active=$active;previous=$previous}
    if ($Case -in @('retained','retained-no-marker')) {
        Uninstall-Beta $Install
        foreach ($bootstrap in @('beta.ps1','candidate.ps1')) { Remove-Item -LiteralPath (Join-Path $Install $bootstrap) }
        if ($Case -ceq 'retained-no-marker') { Remove-Item -LiteralPath (Join-Path $Install 'retained-data.json') }
        else {
            # A stopped GPUI uninstall, ready for its deferred Cleanup helper.
            Copy-Item -LiteralPath "$env:WINDIR/System32/cmd.exe" -Destination (Join-Path $Install 'Uninstall.exe')
            Write-NativeJson (Join-Path $Install 'installer-cleanup.json') @{schema=1;sha256=(Get-NativeHash (Join-Path $Install 'Uninstall.exe'))}
        }
        return
    }
    if (-not $legacy) {
        Copy-Item -LiteralPath "$env:WINDIR/System32/cmd.exe" -Destination (Join-Path $Install 'Uninstall.exe')
        Write-NativeJson (Join-Path $Install 'installer-ui.json') @{
            schema=1;kind='rust-gpui';uninstaller='Uninstall.exe';
            sha256=(Get-NativeHash (Join-Path $Install 'Uninstall.exe'));desktop=$true;autostart=$true
        }
    }
    Set-MatrixRegistration $Install $(if($legacy){'0.0.975'}else{'0.0.988'})
    if ($Case -ceq 'pending') {
        [IO.Directory]::CreateDirectory((Join-Path $Install 'staging')) | Out-Null
        $offer=Get-Content -LiteralPath (Join-Path $Assets 'offer.json') -Raw | ConvertFrom-Json
        $payload=Get-Content -LiteralPath (Join-Path $Assets 'offer.json') -Raw
        $signed=Invoke-NativeProcess -Executable (Join-Path $Assets 'verifier.exe') -Arguments @('--matrix-sign') -InputText $payload
        if ($signed.ExitCode) { throw 'Fixture signing failed' }
        [IO.File]::WriteAllText((Join-Path $Install 'staging/pending.json'),$signed.Stdout)
        Copy-Item -LiteralPath (Join-Path $Assets 'v989.zip') -Destination (Join-Path $Install ('staging/'+$offer.sha256+'.zip'))
    }
    if ($Case -ceq 'boot') {
        Write-BetaJson (Join-Path $Install 'boot-pending.json') @{schema=1;previous=$previous.generation;version='0.0.988'}
        Set-BetaStatus $Install 'ready' 'fixture boot' '0.0.988' 'fixture notes'
    }
}

function Get-MatrixData([string]$Install) {
    $index=[ordered]@{}
    foreach ($file in @(Get-ChildItem -LiteralPath $Install -File -Recurse -Force -ErrorAction SilentlyContinue | Sort-Object FullName)) {
        $relative=$file.FullName.Substring($Install.Length+1).Replace('\','/')
        if ($relative -cmatch '^generations/[a-f0-9]{32}/data/') { $index[$relative]=Get-NativeHash $file.FullName }
    }
    $index
}
