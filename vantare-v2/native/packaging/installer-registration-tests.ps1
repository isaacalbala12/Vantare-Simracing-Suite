#requires -Version 5.1
# Inert OS PE fixtures exercise the real scripts; no Hub or installer UI is opened.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'beta.ps1')
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('vantare-registration-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($testRoot)|Out-Null
$passed=0
function Assert-Registration([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message};$script:passed++;"PASS $Message"}
# The resolver is the only substituted OS boundary. COM links, disk, package,
# generations, registry and driver are real. Nothing touches the user's folders.
function Get-NativeShortcutFolder([string]$Name){
    $script:resolvedFolders+=,$Name
    if($script:rejectFolders){throw 'Folder resolution must not occur for OFF'}
    Join-Path $testRoot $Name
}
$script:rejectFolders=$true
$script:resolvedFolders=@()
$off=@{desktop=$false;autostart=$false}
$offWarnings=@(Sync-NativeOptionalShortcuts $testRoot 'Vantare test' $off 3>&1)
$offWarnings+=@(Sync-NativeOptionalShortcuts $testRoot 'Vantare test' $off $true 3>&1)
Assert-Registration ($script:resolvedFolders.Count -eq 0 -and $offWarnings.Count -eq 0 -and -not (Test-Path (Join-Path $testRoot 'Startup'))) 'OFF neither resolves nor creates absent Startup/Desktop, including uninstall'
$script:rejectFolders=$false
$on=@{desktop=$true;autostart=$true}
Sync-NativeOptionalShortcuts $testRoot 'Vantare test' $on
$startup=Join-Path $testRoot 'Startup/Vantare test.lnk'
Assert-Registration (Test-Path -LiteralPath $startup) 'ON creates missing Startup and real shortcut'
$shell=New-Object -ComObject WScript.Shell
Assert-Registration (($shell.CreateShortcut($startup)).Arguments.Contains($testRoot)) 'Startup shortcut belongs to this installation'
Sync-NativeOptionalShortcuts $testRoot 'Vantare test' $on $true
Assert-Registration (-not (Test-Path -LiteralPath $startup)) 'uninstall removes enabled owned shortcuts'
Remove-Item -LiteralPath (Join-Path $testRoot 'Startup')
[IO.File]::WriteAllText((Join-Path $testRoot 'Startup'),'blocked folder')
$warnings=@()
$warnings=@(Sync-NativeOptionalShortcuts $testRoot 'Vantare test' @{desktop=$false;autostart=$true} 3>&1)
Assert-Registration ($warnings.Count -gt 0 -and [IO.File]::ReadAllText((Join-Path $testRoot 'Startup')) -ceq 'blocked folder') 'unavailable ON emits warning and preserves obstacle'

# Valid beta package with inert cmd.exe images, never executed as app binaries.
$payload=Join-Path $testRoot 'payload'
foreach($member in (Get-NativeMembers 'beta')){
    $path=Join-Path $payload $member
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path))|Out-Null
    if($member.EndsWith('.exe')){Copy-Item (Join-Path $env:WINDIR 'System32/cmd.exe') $path}
    elseif($member.EndsWith('.exe.sha256')){[IO.File]::WriteAllText($path,((Get-NativeHash $path.Substring(0,$path.Length-7))+'  '+[IO.Path]::GetFileName($path.Substring(0,$path.Length-7))+"`n"))}
    elseif($member -ceq 'candidate.ps1'){Copy-Item (Join-Path $PSScriptRoot 'candidate.ps1') $path}
    else{[IO.File]::WriteAllText($path,'inert test fixture')}
}
$files=@(Get-NativeMembers 'beta'|ForEach-Object{$p=Join-Path $payload $_;@{path=$_;size=(Get-Item $p).Length;sha256=(Get-NativeHash $p)}})
Write-NativeJson (Join-Path $payload 'manifest.json') @{schema=1;product='vantare-native';candidate=$true;architecture='windows-x64';data_schema='opaque-v1';source_sha=('a'*40);source_dirty=$false;build_profile='Release';version='0.0.979';channel='beta';files=$files}
$zip=Join-Path $testRoot 'package.zip';New-NativeZip $payload $zip
$hash=Get-NativeHash $zip
$testKey='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareRegistration'+[guid]::NewGuid().ToString('N')
$folder='Test '+[guid]::NewGuid().ToString('N')
try {
    $failed=$false
    try {
        Invoke-NativeRegistrationTransaction $testKey $folder 'Legacy Test' {
            New-Item $testKey -Force|Out-Null
            $locked=[IO.File]::Open($zip,'Open','Read','Read')
            try{[IO.File]::WriteAllText($zip,'denied')}finally{$locked.Dispose()}
        }
    }catch{$failed=$true}
    Assert-Registration ($failed -and -not (Test-Path $testKey)) 'fresh registry failure removes newly created uninstall key'
    foreach($kind in @('fresh','update','retained')){
        $install=Join-Path $testRoot $kind
        $null=Open-NativeRoot $install -Initialize
        if($kind -ne 'fresh'){
            Install-Beta $install $zip $hash
            $oldState=Read-NativeState $install
            $data=Join-Path $install "generations/$($oldState.active.generation)/data/profile.json"
            [IO.File]::WriteAllText($data,'opaque data retained')
            $dataHash=Get-NativeHash $data
            if($kind -ceq 'retained'){Uninstall-Beta $install|Out-Null}
        }
        $metadata=@{};foreach($file in Get-ChildItem $install -File -Force){if($file.Name -notlike '*.lock'){$metadata[$file.Name]=Get-NativeHash $file.FullName}}
        $oldGenerations=@(Get-ChildItem (Join-Path $install 'generations') -Directory -ErrorAction SilentlyContinue|ForEach-Object Name)
        New-Item $testKey -Force|Out-Null
        New-ItemProperty $testKey -Name DisplayVersion -Value 'before' -PropertyType String -Force|Out-Null
        New-ItemProperty $testKey -Name NoModify -Value 7 -PropertyType DWord -Force|Out-Null
        $start=Join-Path (Join-Path $testRoot 'Programs') $folder
        [IO.Directory]::CreateDirectory($start)|Out-Null
        $link=Join-Path $start 'Vantare.lnk';[IO.File]::WriteAllText($link,'previous exact shortcut bytes')
        $failed=$false
        try {
            Install-Beta $install $zip $hash -Finalize {
                $null=Read-NativeState $install
                Invoke-NativeRegistrationTransaction $testKey $folder 'Legacy Test' {
                    Set-ItemProperty $testKey -Name DisplayVersion -Value 'after'
                    Set-ItemProperty $testKey -Name NoModify -Value 1
                    [IO.File]::WriteAllText($link,'changed')
                    [IO.File]::WriteAllText((Join-Path $install 'Uninstall.exe'),'partial uninstaller')
                    # Real OS failure after activation and writes, no exception mock.
                    $locked=[IO.File]::Open($link,'Open','ReadWrite','None')
                    try{[IO.File]::WriteAllText($link,'denied')}finally{$locked.Dispose()}
                }
            }
        }catch{$failed=$true}
        Assert-Registration $failed "$kind registration failure propagates"
        Assert-Registration ((Get-ItemProperty $testKey).DisplayVersion -ceq 'before' -and (Get-ItemProperty $testKey).NoModify -eq 7) "$kind restores registry values/types"
        Assert-Registration ([IO.File]::ReadAllText($link) -ceq 'previous exact shortcut bytes') "$kind restores shortcut bytes"
        foreach($name in $metadata.Keys){Assert-Registration ((Get-NativeHash (Join-Path $install $name)) -ceq $metadata[$name]) "$kind restores $name exactly"}
        Assert-Registration (-not (Test-Path (Join-Path $install 'Uninstall.exe'))) "$kind removes partial uninstaller"
        Assert-Registration (@(Compare-Object $oldGenerations @(Get-ChildItem (Join-Path $install 'generations') -Directory|ForEach-Object Name)).Count -eq 0) "$kind removes only new uncommitted generation"
        if($kind -ne 'fresh'){Assert-Registration ((Get-NativeHash $data) -ceq $dataHash) "$kind preserves original data bytes"}
        if($kind -ceq 'fresh'){Assert-Registration (-not (Test-Path (Join-Path $install 'state.json'))) 'fresh failure leaves no active installation'}
        if($kind -ceq 'update'){Assert-Registration ((Read-NativeState $install).active.generation -ceq $oldState.active.generation) 'update failure retains usable old generation'}
    }
} finally {
    if(Test-Path $testKey){Remove-Item $testKey}
}
# Full driver boundary with inert payload: successful silent install followed by
# a real sharing violation in mandatory registration after the new state is active.
$driverRoot=Join-Path 'C:/tmp/ola2/1591-qa' ('1690-driver-'+[guid]::NewGuid().ToString('N'))
$engine=Join-Path $testRoot 'engine';[IO.Directory]::CreateDirectory($engine)|Out-Null
foreach($name in @('candidate.ps1','beta.ps1','installer-driver.ps1')){Copy-Item (Join-Path $PSScriptRoot $name) $engine}
Copy-Item $zip (Join-Path $engine 'package.zip')
Copy-Item (Join-Path $env:WINDIR 'System32/cmd.exe') (Join-Path $engine 'Uninstall.exe')
[IO.File]::WriteAllText((Join-Path $engine 'installer-notices.txt'),'inert fixture')
$request=Join-Path $engine 'request.json'
Write-NativeJson $request @{operation='Install';root=$driverRoot;qa=$true;silent=$true;uninstall=$false;version='0.0.979';size=1;mode='auto';packageSha=$hash;desktop=$false;autostart=$false}
$qaKey='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBetaQA1492'
if(Test-Path $qaKey){throw 'Existing QA registration preserved; cannot run driver fixture'}
function Run-RegistrationDriver {
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $engine 'installer-driver.ps1')+'" -RequestFile "'+$request+'"'
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $process=[Diagnostics.Process]::Start($info)
    try {
        $process.StandardInput.WriteLine('continue');$process.StandardInput.Close()
        $out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        foreach($line in ($out.Result -split "`n")){if($line.Trim()){$null=$line|ConvertFrom-Json}}
        $script:driverError=$err.Result
        [IO.File]::WriteAllText((Join-Path $engine ('driver-'+$process.ExitCode+'.log')),($out.Result+$err.Result))
        $process.ExitCode
    }finally{$process.Dispose()}
}
try {
    Assert-Registration ((Run-RegistrationDriver) -eq 0) 'real driver silently installs inert package with both options OFF'
    $generation=(Read-NativeState $driverRoot).active.generation
    $stateHash=Get-NativeHash (Join-Path $driverRoot 'state.json')
    $uninstallString=(Get-ItemProperty $qaKey).UninstallString
    $locked=[IO.File]::Open((Join-Path $driverRoot 'uninstall-vantare.ps1'),'Open','Read','Read')
    try {Assert-Registration ((Run-RegistrationDriver) -eq 1) 'real driver registration sharing violation returns failure'}finally{$locked.Dispose()}
    Assert-Registration ((Get-NativeHash (Join-Path $driverRoot 'state.json')) -ceq $stateHash -and (Read-NativeState $driverRoot).active.generation -ceq $generation) 'real driver restores exact old state and verified binaries'
    Assert-Registration (-not (Test-Path (Join-Path $driverRoot 'boot-pending.json'))) 'real driver removes failed repair boot marker'
    Assert-Registration ((Get-ItemProperty $qaKey).UninstallString -ceq $uninstallString) 'real driver restores uninstall registration'
    Assert-Registration (@(Get-ChildItem (Join-Path $driverRoot 'generations') -Directory).Count -eq 1) 'real driver removes failed repair generation'
    # Substitute only the configured Startup location in the engine fixture;
    # leave the real user's folders untouched and make ON hit an unavailable path.
    $blocked=Join-Path $engine 'Startup';[IO.File]::WriteAllText($blocked,'blocked folder')
    $override="function Get-NativeShortcutFolder([string]`$Name){if(`$Name -ceq 'Startup'){return '$blocked'};[Environment]::GetFolderPath([Environment+SpecialFolder]`$Name,[Environment+SpecialFolderOption]::DoNotVerify)}`n"
    $driverPath=Join-Path $engine 'installer-driver.ps1'
    [IO.File]::WriteAllText($driverPath,[IO.File]::ReadAllText($driverPath).Replace('# stdout is exclusively',($override+'# stdout is exclusively')))
    $requestValue=[IO.File]::ReadAllText($request)|ConvertFrom-Json
    $requestValue.autostart=$true;Write-BetaJson $request $requestValue
    Assert-Registration ((Run-RegistrationDriver) -eq 0 -and $script:driverError.Length -gt 0) 'real driver ON warning is logged with valid JSON progress and success'
} finally {
    if(Test-Path $qaKey){Uninstall-NativeRegistration $driverRoot}
}
"$passed installer registration checks PASS; fixtures: $testRoot"
