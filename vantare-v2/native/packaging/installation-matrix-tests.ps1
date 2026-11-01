#requires -Version 5.1
[CmdletBinding()]
param([string]$Root,[string]$LegacyPackage,[string]$TestVerifier,[switch]$Record,
      [ValidateSet('clean','nsis975','nsis975-incomplete974','rc-options','pending','boot','retained','retained-no-marker')]
      [string[]]$Cases=@('clean','nsis975','nsis975-incomplete974','rc-options','pending','boot','retained','retained-no-marker'),
      [ValidateSet('Probe','Install','Update','Repair','Check','Apply','Confirm','Timeout','Rollback','Uninstall','Cleanup')]
      [string[]]$Operations=@('Probe','Install','Update','Repair','Check','Apply','Confirm','Timeout','Rollback','Uninstall','Cleanup'))
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'matrix/guard.ps1')
$qaMatrixRoot=Assert-MatrixRoot $Root
if (Test-Path -LiteralPath $qaMatrixRoot) { throw 'MATRIX_NEEDS_FRESH_ROOT' }
if (-not $LegacyPackage -or -not $TestVerifier) { throw 'MATRIX_FIXTURES_REQUIRED' }
$script:Packaging=$PSScriptRoot
$qaImportCallerRoot=$Root
. (Join-Path $PSScriptRoot 'beta.ps1') -Library -Root $qaMatrixRoot
if ($Root -cne $qaImportCallerRoot) { throw 'MATRIX_IMPORT_ROOT_CHANGED' }
$null=Assert-MatrixRoot $Root
if ((Get-NativeHash $LegacyPackage) -cne '372bcd60cf168cb6187be1c481b21c835268db1dbcc3e0a0aeb17246bede7066') { throw 'MATRIX_LEGACY_DIGEST' }
[IO.Directory]::CreateDirectory($qaMatrixRoot) | Out-Null
. (Join-Path $PSScriptRoot 'matrix/fixtures.ps1')
$assets=Join-Path $qaMatrixRoot 'assets';[IO.Directory]::CreateDirectory($assets) | Out-Null
Copy-Item -LiteralPath $TestVerifier -Destination (Join-Path $assets 'verifier.exe')
[IO.Compression.ZipFile]::ExtractToDirectory($LegacyPackage,(Join-Path $assets 'legacy'))
foreach ($version in @('987','988','989')) {
    $payload=Join-Path $assets ('v'+$version)
    New-MatrixPayload $payload ('0.0.'+$version) $TestVerifier
    New-NativeZip $payload (Join-Path $assets ('v'+$version+'.zip'))
}
$incoming=Join-Path $assets 'v989.zip'
Write-NativeJson (Join-Path $assets 'offer.json') @{
    schema=1;product='vantare-native';channel='beta';version='0.0.989';
    url=([uri]$incoming).AbsoluteUri;sha256=(Get-NativeHash $incoming);notes='matrix offer'
}
# The same five classes of rejected root as RC9, before any product operation.
foreach ($bad in @('', 'C:/Users/matrix/Programs/Vantare','C:/VantareServer/installed','D:/VantareServer/qa-other/install','D:/VantareServer/qa/../installed')) {
    $rejected=$false
    try { $null=Assert-MatrixRoot $bad } catch { $rejected=$true }
    if (-not $rejected) { throw 'MATRIX_BAD_ROOT_ACCEPTED' }
}
$registryId=[guid]::NewGuid().ToString('N')
$registryPath='HKCU:/Software/VantareInstallerMatrix/'+$registryId
New-Item -Path $registryPath -Force | Out-Null
$baseline=Join-Path $PSScriptRoot 'matrix/baseline.json'
$expected=if(Test-Path -LiteralPath $baseline){Get-Content -LiteralPath $baseline -Raw | ConvertFrom-Json}else{$null}
if (-not $Record -and $null -eq $expected) { throw 'MATRIX_BASELINE_REQUIRED' }
$rows=[ordered]@{}
try {
    $savedLibraryTemp=$env:TEMP;$savedLibraryTmp=$env:TMP;$savedLibraryLocal=$env:LOCALAPPDATA
    try {
        $env:TEMP=$qaMatrixRoot;$env:TMP=$qaMatrixRoot;$env:LOCALAPPDATA=Join-Path $qaMatrixRoot 'LocalAppData'
        $library=Invoke-NativeProcess -Executable "$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe" -Arguments @(
            '-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'matrix/library-mode-tests.ps1'),
            '-Root',(Join-Path $qaMatrixRoot 'library-mode')
        ) -TimeoutMilliseconds 120000 -LogPath (Join-Path $qaMatrixRoot 'library-mode.log')
        if($library.ExitCode -ne 0){throw ('MATRIX_LIBRARY_MODE_FAILED: '+$library.Stderr)}
        $library.Stdout
        $context=Invoke-NativeProcess -Executable "$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe" -Arguments @(
            '-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'matrix/driver-context-tests.ps1'),
            '-Root',(Join-Path $qaMatrixRoot 'driver-context'),'-TestVerifier',$TestVerifier
        ) -TimeoutMilliseconds 120000 -LogPath (Join-Path $qaMatrixRoot 'driver-context.log')
        if($context.ExitCode -ne 0){throw ('MATRIX_DRIVER_CONTEXT_FAILED: '+$context.Stderr)}
        $context.Stdout
        $historySafety=Invoke-NativeProcess -Executable "$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe" -Arguments @(
            '-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'matrix/history-safety-tests.ps1'),
            '-Root',(Join-Path $qaMatrixRoot 'history-safety')
        ) -TimeoutMilliseconds 120000 -LogPath (Join-Path $qaMatrixRoot 'history-safety.log')
        if($historySafety.ExitCode -ne 0){throw ('MATRIX_HISTORY_SAFETY_FAILED: '+$historySafety.Stderr)}
        $historySafety.Stdout
        $snapshot=Invoke-NativeProcess -Executable (Get-Command python).Source -Arguments @(
            (Join-Path $PSScriptRoot 'matrix/snapshot-tests.py'),'--root',(Join-Path $qaMatrixRoot 'snapshot-tests')
        ) -TimeoutMilliseconds 30000 -LogPath (Join-Path $qaMatrixRoot 'snapshot-tests.log')
        if($snapshot.ExitCode -ne 0){throw ('MATRIX_SNAPSHOT_TEST_FAILED: '+$snapshot.Stderr)}
        $snapshot.Stdout
    } finally { $env:TEMP=$savedLibraryTemp;$env:TMP=$savedLibraryTmp;$env:LOCALAPPDATA=$savedLibraryLocal }
    foreach ($case in $Cases) {
        foreach ($operation in $Operations) {
            $name=$case+'-'+$operation.ToLowerInvariant()
            $caseRoot=Assert-MatrixRoot (Join-Path $qaMatrixRoot $name)
            [IO.Directory]::CreateDirectory($caseRoot) | Out-Null
            $caseKey=$registryPath+'/'+$name
            New-Item -Path $caseKey -Force | Out-Null
            $info=[Diagnostics.ProcessStartInfo]::new()
            $info.FileName="$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe"
            $info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'matrix/worker.ps1')+'" -Root "'+$caseRoot+'" -Case '+$case+' -Operation '+$operation+' -Assets "'+$assets+'" -RegistryRoot "HKEY_CURRENT_USER\Software\VantareInstallerMatrix\'+$registryId+'\'+$name+'"'
            $info.UseShellExecute=$false;$info.CreateNoWindow=$true
            # CodeDOM used by Add-Type also writes temporary compiler files.
            # Set this BEFORE process creation, so .NET never caches user TEMP.
            $info.EnvironmentVariables['TEMP']=$caseRoot
            $info.EnvironmentVariables['TMP']=$caseRoot
            $info.EnvironmentVariables['LOCALAPPDATA']=Join-Path $caseRoot 'LocalAppData'
            $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
            $process=[Diagnostics.Process]::Start($info)
            try {
                $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
                if (-not $process.WaitForExit(120000)) { $process.Kill();$process.WaitForExit();throw "MATRIX_WORKER_TIMEOUT $name" }
                [IO.File]::WriteAllText((Join-Path $caseRoot 'stdout.log'),$stdout.Result)
                [IO.File]::WriteAllText((Join-Path $caseRoot 'stderr.log'),$stderr.Result)
                $exitCode=$process.ExitCode
            } finally { $process.Dispose() }
            $install=Join-Path $caseRoot 'install'
            $dataFile=Join-Path $caseRoot 'before-data.json'
            if (-not(Test-Path -LiteralPath $dataFile)) { throw "MATRIX_FIXTURE_FAILED $name (see stderr.log)" }
            if ($operation -ceq 'Probe' -and $exitCode -ne 0) { throw "MATRIX_PROBE_FAILED $name (see stderr.log)" }
            $before=Get-Content -LiteralPath $dataFile -Raw | ConvertFrom-Json
            foreach ($entry in $before.PSObject.Properties) {
                $file=Join-Path $install $entry.Name
                if (-not(Test-Path -LiteralPath $file) -or (Get-NativeHash $file) -cne $entry.Value) { throw "MATRIX_DATA_CHANGED $name $($entry.Name)" }
            }
            $links=[ordered]@{}
            $shell=New-Object -ComObject WScript.Shell
            foreach ($folder in @('Programs','Startup','DesktopDirectory')) {
                $path=Join-Path $caseRoot $folder
                foreach ($file in @(Get-ChildItem -LiteralPath $path -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue | Sort-Object FullName)) {
                    $link=$shell.CreateShortcut($file.FullName)
                    $links[$file.FullName.Substring($caseRoot.Length+1)]=@{target=$link.TargetPath;arguments=$link.Arguments;icon=$link.IconLocation}
                }
            }
            $registry=[ordered]@{}
            foreach ($key in @(Get-ChildItem -LiteralPath $caseKey -Recurse | Sort-Object Name)) {
                $values=[ordered]@{}
                foreach ($value in @($key.GetValueNames() | Sort-Object)) { $values[$value]=@{value=$key.GetValue($value);kind=[string]$key.GetValueKind($value)} }
                if ($values.Count) { $registry[$key.Name.Substring(('HKEY_CURRENT_USER\Software\VantareInstallerMatrix\'+$registryId+'\'+$name).Length)]=$values }
            }
            $probe=if($operation -ceq 'Probe'){$stdout.Result | ConvertFrom-Json}else{$null}
            if ($operation -ceq 'Probe' -and $probe.root -cne $install) { throw 'MATRIX_PROBE_ROOT_CHANGED' }
            Write-NativeJson (Join-Path $caseRoot 'shell.json') @{links=$links;registry=$registry;probe=$probe}
            $snapshot=Join-Path $caseRoot 'snapshot.json'
            & python (Join-Path $PSScriptRoot 'matrix/snapshot.py') --root $caseRoot --assets $assets --output $snapshot
            if ($LASTEXITCODE) { throw 'MATRIX_SNAPSHOT_FAILED' }
            $row=@{exit=$exitCode;sha256=(Get-NativeHash $snapshot);existing_data_files=@($before.PSObject.Properties).Count}
            $rows[$name]=$row
            if (-not $Record) {
                $old=$expected.PSObject.Properties[$name]
                if ($null -eq $old -or $old.Value.exit -ne $row.exit -or $old.Value.sha256 -cne $row.sha256 -or $old.Value.existing_data_files -ne $row.existing_data_files) { throw "MATRIX_REGRESSION $name (snapshot and logs: $caseRoot)" }
            }
            "PASS $name exit=$exitCode existing-data=$($row.existing_data_files)"
        }
    }
    # #1840/1a: the same matrix gate exercises a future inventory growing by one.
    $savedGrowthTemp=$env:TEMP;$savedGrowthTmp=$env:TMP;$savedGrowthLocal=$env:LOCALAPPDATA
    try {
        $env:TEMP=$qaMatrixRoot;$env:TMP=$qaMatrixRoot;$env:LOCALAPPDATA=Join-Path $qaMatrixRoot 'LocalAppData'
        $growth=Invoke-NativeProcess -Executable "$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe" -Arguments @(
            '-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'matrix/inventory-growth-tests.ps1'),
            '-Root',(Join-Path $qaMatrixRoot 'inventory-growth'),'-TestVerifier',$TestVerifier
        ) -TimeoutMilliseconds 120000 -LogPath (Join-Path $qaMatrixRoot 'inventory-growth.log')
        if($growth.ExitCode -ne 0){throw ('MATRIX_INVENTORY_GROWTH_FAILED: '+$growth.Stderr)}
        $growth.Stdout
    } finally { $env:TEMP=$savedGrowthTemp;$env:TMP=$savedGrowthTmp;$env:LOCALAPPDATA=$savedGrowthLocal }
    Write-NativeJson (Join-Path $qaMatrixRoot 'results.json') $rows
    if ($Record) { Write-NativeJson (Join-Path $qaMatrixRoot 'candidate-baseline.json') $rows }
} finally {
    # Exact unique test hive only. Never remove product registration.
    if ($registryPath -cnotmatch '^HKCU:/Software/VantareInstallerMatrix/[a-f0-9]{32}$') { throw 'MATRIX_REGISTRY_CLEANUP_REJECTED' }
    Remove-Item -LiteralPath $registryPath -Recurse -Force
}
"$($rows.Count) matrix rows PASS; evidence $qaMatrixRoot"
