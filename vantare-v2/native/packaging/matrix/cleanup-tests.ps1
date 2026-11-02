#requires -Version 5.1
param([Parameter(Mandatory)][string]$Root)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'guard.ps1')
$qaCleanupRoot=Assert-MatrixRoot $Root
if(Test-Path -LiteralPath $qaCleanupRoot){throw 'CLEANUP_TEST_NEEDS_FRESH_ROOT'}
[IO.Directory]::CreateDirectory($qaCleanupRoot)|Out-Null
$passed=0
function Assert-Cleanup([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message};$script:passed++;"PASS $Message"}
function New-CleanupCase([string]$Name){
    $case=Assert-MatrixRoot (Join-Path $qaCleanupRoot $Name)
    $install=Join-Path $case 'install'
    $temporary=Join-Path $case ('VantareSetup-'+$PID+'-1-1')
    foreach($path in @($install,$temporary)){[IO.Directory]::CreateDirectory($path)|Out-Null}
    Copy-Item -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'installer-cleanup.ps1') -Destination $temporary
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'guard.ps1') -Destination (Join-Path $temporary 'qa-guard.ps1')
    $exe=Join-Path $install 'Uninstall.exe';[IO.File]::WriteAllText($exe,'owned inert fixture')
    $marker=Join-Path $install 'installer-cleanup.json'
    $hash=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($marker,(@{schema=1;sha256=$hash}|ConvertTo-Json))
    $request=Join-Path $temporary 'shell.json'
    $contract=@{operation='Cleanup';root=$install;parentId=2147483647;qa=$true}
    @{case=$case;install=$install;temporary=$temporary;exe=$exe;marker=$marker;request=$request;contract=$contract}
}
function Start-CleanupCase($Case){
    $env:TEMP=$Case.case;$env:TMP=$Case.case
    [IO.File]::WriteAllText($Case.request,($Case.contract|ConvertTo-Json))
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName="$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe"
    $info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $Case.temporary 'installer-cleanup.ps1')+'" -RequestFile "'+$Case.request+'"'
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $process=[Diagnostics.Process]::Start($info)
    @{process=$process;stdout=$process.StandardOutput.ReadToEndAsync();stderr=$process.StandardError.ReadToEndAsync()}
}
function Finish-CleanupCase($Case,$Run){
    try{
        if(-not $Run.process.WaitForExit(30000)){throw 'CLEANUP_TEST_TIMEOUT'}
        $Run.process.ExitCode
    }finally{
        if(-not $Run.process.HasExited){$Run.process.Kill();$Run.process.WaitForExit()}
        [IO.File]::WriteAllText((Join-Path $Case.case 'stdout.log'),$Run.stdout.Result)
        [IO.File]::WriteAllText((Join-Path $Case.case 'stderr.log'),$Run.stderr.Result)
        $Run.process.Dispose()
    }
}
foreach($mode in @('operation','temporary-content','schema','hash','missing-marker','renewed')){
    $case=New-CleanupCase $mode
    switch($mode){
        'operation'{$case.contract.operation='Other'}
        'temporary-content'{[IO.File]::WriteAllText((Join-Path $case.temporary 'foreign.txt'),'preserve')}
        'schema'{[IO.File]::WriteAllText($case.marker,(@{schema=2;sha256=('0'*64)}|ConvertTo-Json))}
        'hash'{[IO.File]::WriteAllText($case.marker,(@{schema=1;sha256=('0'*64)}|ConvertTo-Json))}
        'missing-marker'{Remove-Item -LiteralPath $case.marker}
        'renewed'{[IO.File]::WriteAllText((Join-Path $case.install 'state.json'),'{}')}
    }
    $before=(Get-FileHash -LiteralPath $case.exe -Algorithm SHA256).Hash
    $run=Start-CleanupCase $case
    $code=Finish-CleanupCase $case $run
    Assert-Cleanup ($code -ne 0 -and (Get-FileHash -LiteralPath $case.exe -Algorithm SHA256).Hash -ceq $before) ("Cleanup rejects $mode without deleting the uninstaller")
}
foreach($renewed in @($false,$true)){
    $case=New-CleanupCase ('parent-'+$renewed)
    $id=[guid]::NewGuid().ToString('N')
    $ready=[Threading.EventWaitHandle]::new($false,[Threading.EventResetMode]::ManualReset,('Local\VantareCleanupReady-'+$id))
    $release=[Threading.EventWaitHandle]::new($false,[Threading.EventResetMode]::ManualReset,('Local\VantareCleanupRelease-'+$id))
    $parentScript=Join-Path $case.case 'parent.ps1'
    [IO.File]::WriteAllText($parentScript,@'
param([string]$Exe,[string]$Ready,[string]$Release)
$held=[IO.File]::Open($Exe,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
$readyEvent=[Threading.EventWaitHandle]::OpenExisting($Ready)
$releaseEvent=[Threading.EventWaitHandle]::OpenExisting($Release)
try{$null=$readyEvent.Set();$null=$releaseEvent.WaitOne()}finally{$held.Dispose();$readyEvent.Dispose();$releaseEvent.Dispose()}
'@)
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName="$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe"
    $info.Arguments='-NoProfile -File "'+$parentScript+'" -Exe "'+$case.exe+'" -Ready "'+('Local\VantareCleanupReady-'+$id)+'" -Release "'+('Local\VantareCleanupRelease-'+$id)+'"'
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $parent=[Diagnostics.Process]::Start($info);$run=$null
    try{
        if(-not $ready.WaitOne(10000)){throw 'OWNED_PARENT_NOT_READY'}
        $case.contract.parentId=$parent.Id
        $run=Start-CleanupCase $case
        # Intentional observation interval: the real owned parent remains blocked
        # on our event and holds the EXE. Cleanup must not finish while it is alive.
        Assert-Cleanup (-not $run.process.WaitForExit(1000) -and -not $parent.HasExited -and (Test-Path -LiteralPath $case.exe)) 'Cleanup waits for its live owned parent'
        if($renewed){
            $session=[IO.File]::Open((Join-Path $case.install 'beta-session.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
            try{[IO.File]::WriteAllText((Join-Path $case.install 'state.json'),'{}')}finally{$session.Dispose()}
        }
        $null=$release.Set()
        if(-not $parent.WaitForExit(5000)){throw 'OWNED_PARENT_DID_NOT_EXIT'}
        $code=Finish-CleanupCase $case $run;$run=$null
        if($renewed){Assert-Cleanup ($code -ne 0 -and (Test-Path -LiteralPath $case.exe) -and (Test-Path -LiteralPath $case.marker)) 'Renewal while waiting is rejected inside the session lock'}
        else{Assert-Cleanup ($code -eq 0 -and -not(Test-Path -LiteralPath $case.exe) -and -not(Test-Path -LiteralPath $case.temporary)) 'Cleanup deletes its files and temporary after the owned parent exits'}
    }finally{
        $null=$release.Set()
        if(-not $parent.WaitForExit(5000)){$parent.Kill();$parent.WaitForExit()}
        $parent.Dispose();$ready.Dispose();$release.Dispose()
        if($null -ne $run){$null=Finish-CleanupCase $case $run}
    }
}
"$passed cleanup checks PASS"
