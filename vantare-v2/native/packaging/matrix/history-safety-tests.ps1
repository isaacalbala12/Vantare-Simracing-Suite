#requires -Version 5.1
param([string]$Root)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'guard.ps1')
$qaSafetyRoot=Assert-MatrixRoot $Root
if(Test-Path -LiteralPath $qaSafetyRoot){throw 'HISTORY_SAFETY_NEEDS_FRESH_ROOT'}
[IO.Directory]::CreateDirectory($qaSafetyRoot)|Out-Null
$sentinel=Join-Path $qaSafetyRoot 'sentinel.txt'
[IO.File]::WriteAllText($sentinel,'unchanged')
$passed=0
foreach($name in @('build-inventory-tests.ps1','historical-inventory-tests.ps1')){
    $scriptPath=Join-Path (Split-Path $PSScriptRoot -Parent) $name
    $target=Join-Path $qaSafetyRoot 'must-not-be-created'
    $shellRoot=Join-Path $qaSafetyRoot 'shell'
    $cases=@(
        @{args=@();cause='HISTORY_CONTEXT_REQUIRED'},
        @{args=@('-Root',$target);cause='HISTORY_CONTEXT_REQUIRED'},
        @{args=@('-Root',$target,'-ShellRoot',$shellRoot);cause='HISTORY_CONTEXT_REQUIRED'},
        @{args=@('-Root',$target,'-RegistryRoot','HKEY_CURRENT_USER');cause='HISTORY_CONTEXT_REQUIRED'},
        @{args=@('-Root',$target,'-RegistryRoot','HKEY_CURRENT_USER','-ShellRoot',$shellRoot);cause='HISTORY_REGISTRY_REJECTED'},
        @{args=@('-Root','C:/Users/fixture','-RegistryRoot','HKEY_CURRENT_USER','-ShellRoot',$shellRoot);cause='MATRIX_ROOT_REJECTED'},
        @{args=@('-Root',$target,'-RegistryRoot','HKEY_CURRENT_USER','-ShellRoot','D:/VantareServer/qa-other/shell');cause='MATRIX_ROOT_REJECTED'}
    )
    foreach($case in $cases){
        $info=[Diagnostics.ProcessStartInfo]::new()
        $info.FileName="$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe"
        $arguments=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$scriptPath)+$case.args
        $info.Arguments=(@($arguments|ForEach-Object {'"'+$_+'"'}) -join ' ')
        $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
        $info.EnvironmentVariables['TEMP']=$qaSafetyRoot;$info.EnvironmentVariables['TMP']=$qaSafetyRoot;$info.EnvironmentVariables['LOCALAPPDATA']=Join-Path $qaSafetyRoot 'LocalAppData'
        $child=[Diagnostics.Process]::Start($info)
        try{
            $out=$child.StandardOutput.ReadToEndAsync();$err=$child.StandardError.ReadToEndAsync()
            if(-not $child.WaitForExit(30000)){$child.Kill();$child.WaitForExit();throw 'HISTORY_SAFETY_TIMEOUT'}
            if($child.ExitCode -eq 0 -or -not $err.Result.Contains($case.cause)){throw ('Unexpected history rejection: '+$name+' '+$err.Result)}
            if(@(Get-ChildItem -LiteralPath $qaSafetyRoot -Force).Count -ne 1 -or [IO.File]::ReadAllText($sentinel) -cne 'unchanged'){throw 'Rejected history invocation wrote files'}
            $passed++;"PASS $name rejects $($case.cause) without writes"
        }finally{$child.Dispose()}
    }
}
"$passed history-safety checks PASS"
