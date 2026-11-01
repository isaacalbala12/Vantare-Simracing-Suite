#requires -Version 5.1
param([string]$Root)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'guard.ps1')
$qaLibraryRoot=Assert-MatrixRoot $Root
if(Test-Path -LiteralPath $qaLibraryRoot){throw 'Library tests need a fresh root'}
[IO.Directory]::CreateDirectory($qaLibraryRoot)|Out-Null
$sentinel=Join-Path $qaLibraryRoot 'sentinel.bin'
[IO.File]::WriteAllText($sentinel,'no import writes')
$passed=0
function Assert-Library([bool]$Value,[string]$Message){if(-not $Value){throw $Message};$script:passed++;"PASS $Message"}
foreach($name in @('candidate.ps1','beta.ps1')){
    $source=Join-Path (Split-Path $PSScriptRoot -Parent) $name
    # Missing-root process tests remain safe even if their guard regresses:
    # root parameters have no default and LOCALAPPDATA points only into QA.
    $tokens=$null;$errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
    Assert-Library (-not $errors.Count) "$name parses under PS5"
    $rootParameter=@($ast.ParamBlock.Parameters | Where-Object {$_.Name.VariablePath.UserPath -in @('NativeRoot','BetaRoot')})
    Assert-Library ($rootParameter.Count -eq 1 -and $null -eq $rootParameter[0].DefaultValue) "$name has no root default"
    & {
        param($Source,$Name,$Directory)
        $Root='root-sentinel';$Operation='operation-sentinel';$Channel='channel-sentinel';$Version='version-sentinel';$Archive='archive-sentinel'
        foreach($library in @($false,$true)){
            $failure=$null
            try{if($library){. $Source -Library}else{. $Source}}catch{$failure=$_.Exception.Message}
            Assert-Library ($failure -ceq 'NATIVE_ROOT_REQUIRED') "$Name missing root fails (library=$library)"
        }
        $failure=$null
        try{. $Source -Root $Directory}catch{$failure=$_.Exception.Message}
        Assert-Library ($failure -ceq 'NATIVE_LIBRARY_MODE_REQUIRED') "$Name cannot be implicitly loaded"
        . $Source -Library -Root $Directory
        Assert-Library ($Root -ceq 'root-sentinel' -and $Operation -ceq 'operation-sentinel' -and $Channel -ceq 'channel-sentinel' -and $Version -ceq 'version-sentinel' -and $Archive -ceq 'archive-sentinel') "$Name preserves all caller sentinels"
        Assert-Library (@(Get-NativeMembers 'beta').Count -gt 0) "$Name exports usable library functions"
        foreach($arguments in @(@(),@('-Library','-Root',$Directory))){
            $info=[Diagnostics.ProcessStartInfo]::new()
            $info.FileName="$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe"
            $quotedArguments=@($arguments | ForEach-Object {'"'+$_.Replace('"','\"')+'"'})
            $info.Arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$Source+'" '+($quotedArguments -join ' ')
            $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
            $info.EnvironmentVariables['TEMP']=$Directory;$info.EnvironmentVariables['TMP']=$Directory;$info.EnvironmentVariables['LOCALAPPDATA']=Join-Path $Directory 'LocalAppData'
            $child=[Diagnostics.Process]::Start($info)
            try{
                $out=$child.StandardOutput.ReadToEndAsync();$err=$child.StandardError.ReadToEndAsync()
                if(-not $child.WaitForExit(30000)){$child.Kill();$child.WaitForExit();throw 'Library guard process timeout'}
                $expected=if($arguments.Count){'NATIVE_LIBRARY_REQUIRES_DOT_SOURCE'}else{'NATIVE_ROOT_REQUIRED'}
                Assert-Library ($child.ExitCode -ne 0 -and $err.Result.Contains($expected)) "$Name CLI rejects unsafe mode $expected"
            }finally{$child.Dispose()}
        }
    } $source $name $qaLibraryRoot
}
Assert-Library ([IO.File]::ReadAllText($sentinel) -ceq 'no import writes' -and @(Get-ChildItem -LiteralPath $qaLibraryRoot -Force).Count -eq 1) 'all imports and rejections leave the QA tree unchanged'
foreach($name in @('candidate.ps1','beta.ps1','installer-driver.ps1')){
    $text=[IO.File]::ReadAllText((Join-Path (Split-Path $PSScriptRoot -Parent) $name))
    Assert-Library ($text -notmatch 'QA1492|1591-qa') "$name contains no fixed QA identity or prefix"
}
"$passed library-mode checks PASS; evidence $qaLibraryRoot"
