#requires -Version 5.1
param([string]$Root,[string]$LegacyPackage)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'guard.ps1')
$qaHarnessRoot=Assert-MatrixRoot $Root
if(Test-Path -LiteralPath $qaHarnessRoot){throw 'HISTORY_NEEDS_FRESH_HARNESS'}
$source=Split-Path $PSScriptRoot -Parent
[IO.Directory]::CreateDirectory($qaHarnessRoot)|Out-Null
$engine=Join-Path $qaHarnessRoot 'packaging'
[IO.Directory]::CreateDirectory($engine)|Out-Null
foreach($name in @('candidate.ps1','beta.ps1','installer-driver.ps1','historical-inventory-tests.ps1','build-inventory-tests.ps1')){
    Copy-Item -LiteralPath (Join-Path $source $name) -Destination $engine
    if((Get-FileHash (Join-Path $source $name)).Hash -cne (Get-FileHash (Join-Path $engine $name)).Hash){throw 'HISTORY_COPY_CHANGED'}
}
foreach($name in @('matrix','fixtures')){Copy-Item -LiteralPath (Join-Path $source $name) -Destination $engine -Recurse}
$ui=Join-Path $qaHarnessRoot 'ui'
[IO.Directory]::CreateDirectory($ui)|Out-Null
Copy-Item -LiteralPath (Join-Path (Split-Path $source -Parent) 'ui/fixtures') -Destination $ui -Recurse
$hiveId=[guid]::NewGuid().ToString('N')
$registry='Registry::HKEY_CURRENT_USER\Software\VantareInstallerMatrix\'+$hiveId
New-Item -Path $registry -Force|Out-Null
try{
    $savedTemp=$env:TEMP;$savedTmp=$env:TMP;$savedLocal=$env:LOCALAPPDATA
    try{
        $env:TEMP=$qaHarnessRoot;$env:TMP=$qaHarnessRoot;$env:LOCALAPPDATA=Join-Path $qaHarnessRoot 'LocalAppData'
        # Launch from a fresh process so CodeDOM cannot cache inherited TEMP.
        $info=[Diagnostics.ProcessStartInfo]::new()
        $info.FileName="$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe"
        $arguments=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',(Join-Path $engine 'build-inventory-tests.ps1'),
            '-Root',(Join-Path $qaHarnessRoot 'history'),'-RegistryRoot',('HKEY_CURRENT_USER\Software\VantareInstallerMatrix\'+$hiveId),
            '-ShellRoot',(Join-Path $qaHarnessRoot 'shell'))
        if($LegacyPackage){$arguments+=@('-LegacyPackage',$LegacyPackage)}
        $info.Arguments=(@($arguments|ForEach-Object {'"'+[regex]::Replace([regex]::Replace($_,'(\\*)"','$1$1\"'),'(\\+)$','$1$1')+'"'}) -join ' ')
        $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
        $child=[Diagnostics.Process]::Start($info)
        try{
            $out=$child.StandardOutput.ReadToEndAsync();$err=$child.StandardError.ReadToEndAsync()
            if(-not $child.WaitForExit(600000)){$child.Kill();$child.WaitForExit();throw 'HISTORY_TIMEOUT'}
            [IO.File]::WriteAllText((Join-Path $qaHarnessRoot 'history.log'),($out.Result+$err.Result),[Text.UTF8Encoding]::new($false))
            $out.Result;$err.Result
            if($child.ExitCode){throw 'HISTORY_GATE_FAILED'}
        }finally{$child.Dispose()}
    }finally{$env:TEMP=$savedTemp;$env:TMP=$savedTmp;$env:LOCALAPPDATA=$savedLocal}
}finally{
    if($registry -cnotmatch '^Registry::HKEY_CURRENT_USER\\Software\\VantareInstallerMatrix\\[a-f0-9]{32}$'){throw 'HISTORY_HIVE_REJECTED'}
    Remove-Item -LiteralPath $registry -Recurse -Force
}
