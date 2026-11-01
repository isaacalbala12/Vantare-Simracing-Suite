#requires -Version 5.1
# Inert OS PE fixtures exercise the real scripts; no Hub or installer UI is opened.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'shortcut-branding-tests.ps1')
. (Join-Path $PSScriptRoot 'beta.ps1') -Library -Root $PSScriptRoot
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('vantare-registration-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($testRoot)|Out-Null
$passed=0
function Assert-Registration([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message};$script:passed++;"PASS $Message"}
# The resolver is the only substituted OS boundary. COM links, disk, package,
# generations, registry and driver are real. Nothing touches the user's folders.
function Get-NativeShortcutFolder([string]$Name){
    $script:resolvedFolders+=,$Name
    if($script:rejectFolders){throw 'Folder resolution must not occur for OFF'}
    if($Name -ceq $script:emptyFolder){return ''}
    if($script:driverFolders -and $Name -ceq 'Programs'){return [Environment]::GetFolderPath('Programs')}
    Join-Path $testRoot $Name
}
$script:driverFolders=$false
$script:rejectFolders=$true
$script:emptyFolder=''
$script:resolvedFolders=@()
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
$shortcutRoot=Join-Path $testRoot 'shortcut-context'
Install-Beta $shortcutRoot $zip $hash
$off=@{desktop=$false;autostart=$false}
$offWarnings=@(Sync-NativeOptionalShortcuts $shortcutRoot 'Vantare test' $off 3>&1)
$offWarnings+=@(Sync-NativeOptionalShortcuts $shortcutRoot 'Vantare test' $off $true 3>&1)
Assert-Registration ($script:resolvedFolders.Count -eq 0 -and $offWarnings.Count -eq 0 -and -not (Test-Path (Join-Path $testRoot 'Startup'))) 'OFF neither resolves nor creates absent Startup/Desktop, including uninstall'
$script:rejectFolders=$false
$on=@{desktop=$true;autostart=$true}
Sync-NativeOptionalShortcuts $shortcutRoot 'Vantare test' $on
$startup=Join-Path $testRoot 'Startup/Vantare test.lnk'
Assert-Registration (Test-Path -LiteralPath $startup) 'ON creates missing Startup and real shortcut'
$shell=New-Object -ComObject WScript.Shell
$startupLink=$shell.CreateShortcut($startup)
Assert-Registration ($startupLink.Arguments -ceq ('--beta -Root "'+$shortcutRoot+'" --background')) 'Startup uses the GUI bootstrap with the installation root'
Assert-Registration ([IO.Path]::GetFileName($startupLink.TargetPath) -ieq 'vantare.exe') 'Startup targets the GUI supervisor instead of a console host'
$shortcutState=Read-NativeState $shortcutRoot
Assert-Registration ($startupLink.TargetPath -eq (Join-Path $shortcutRoot "generations/$($shortcutState.active.generation)/bin/vantare.exe")) 'Startup resolves the verified active generation'

# A real generation rollback must repair the COM link before the old Hub runs.
$legacyPayload=Join-Path $testRoot 'legacy-payload'
Copy-Item $payload $legacyPayload -Recurse
$legacyScript=Join-Path $legacyPayload 'candidate.ps1'
$scriptText=[IO.File]::ReadAllText($legacyScript)
[IO.File]::WriteAllText($legacyScript,$scriptText.Substring($scriptText.IndexOf("`n")+1),[Text.UTF8Encoding]::new($true))
$legacyManifestPath=Join-Path $legacyPayload 'manifest.json'
$legacyManifest=[IO.File]::ReadAllText($legacyManifestPath)|ConvertFrom-Json
foreach($file in $legacyManifest.files){if($file.path -ceq 'candidate.ps1'){$file.sha256=Get-NativeHash $legacyScript;$file.size=(Get-Item $legacyScript).Length}}
[IO.File]::WriteAllText($legacyManifestPath,($legacyManifest|ConvertTo-Json -Depth 15),[Text.UTF8Encoding]::new($true))
$legacyZip=Join-Path $testRoot 'legacy-package.zip';New-NativeZip $legacyPayload $legacyZip
$startupRoot=Join-Path $testRoot 'startup-rollback'
Install-Beta $startupRoot $legacyZip (Get-NativeHash $legacyZip)
$legacyState=Read-NativeState $startupRoot
$startupId='VantareStartup'+[guid]::NewGuid().ToString('N')
[IO.File]::WriteAllText((Join-Path $startupRoot 'registration-identity.txt'),$startupId)
$startupKey='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/'+$startupId
$startupPath=Join-Path $testRoot 'Startup/Startup QA.lnk'
try {
    New-Item $startupKey -Force|Out-Null
    foreach($entry in @{InstallLocation=$startupRoot;ShortcutFolder='Startup QA';LegacyShortcutFolder='Startup Legacy'}.GetEnumerator()){Set-ItemProperty $startupKey $entry.Key $entry.Value}
    Sync-NativeOptionalShortcuts $startupRoot 'Startup QA' @{desktop=$false;autostart=$true}
    $startupPath=Join-Path $testRoot 'Startup/Startup QA.lnk'
    $oldTarget=$shell.CreateShortcut($startupPath).TargetPath
    Assert-Registration ($shell.CreateShortcut($startupPath).Arguments -ceq ('--beta -Root "'+$startupRoot+'"')) 'legacy Startup uses no unsupported flag'
    Copy-Item $legacyScript (Join-Path $startupRoot 'candidate.ps1') -Force
    $null=Update-NativeCandidate $startupRoot $zip $hash
    Sync-NativeRegistration $startupRoot '' -StartupOnly
    Assert-Registration ($shell.CreateShortcut($startupPath).TargetPath -ceq $oldTarget -and -not $shell.CreateShortcut($startupPath).Arguments.EndsWith(' --background')) 'frozen feed bootstrap preserves its compatible Startup across updates'
    Copy-Item (Join-Path $PSScriptRoot 'candidate.ps1') (Join-Path $startupRoot 'candidate.ps1') -Force
    Sync-NativeRegistration $startupRoot '' -StartupOnly
    $newTarget=$shell.CreateShortcut($startupPath).TargetPath
    Assert-Registration ($newTarget -ne $oldTarget -and $shell.CreateShortcut($startupPath).Arguments.EndsWith(' --background')) 'new Startup uses the capable GUI supervisor in background'
    $restored=Restore-NativeCandidate $startupRoot
    $link=$shell.CreateShortcut($startupPath)
    Assert-Registration ($restored.active.generation -ceq $legacyState.active.generation -and $link.TargetPath -ceq $oldTarget -and $link.Arguments -ceq ('--beta -Root "'+$startupRoot+'"')) 'real rollback restores old target and compatible arguments without waiting for old Hub Register'
    $null=Restore-NativeCandidate $startupRoot
    $link=$shell.CreateShortcut($startupPath)
    Assert-Registration ($link.TargetPath -ceq $newTarget -and $link.Arguments.EndsWith(' --background')) 'rollback to another capable generation keeps background mode'
    Assert-Registration (@(Get-ChildItem (Join-Path $testRoot 'Startup') -Filter 'Startup QA*.lnk').Count -eq 1) 'rollback never duplicates Startup'
    $evidence=Join-Path $testRoot 'natural-rollback'
    [IO.Directory]::CreateDirectory($evidence)|Out-Null
    function Assert-Beta([bool]$Condition,[string]$Message){Assert-Registration $Condition $Message}
    function Reject-Beta([scriptblock]$Action,[string]$Message){$failed=$false;try{& $Action}catch{$failed=$true};Assert-Beta $failed $Message}
    . (Join-Path $PSScriptRoot 'bootstrap-tests.ps1')
    Test-RollbackNaturalExit $startupRoot
    Assert-Registration ($shell.CreateShortcut($startupPath).TargetPath -ceq $oldTarget -and -not $shell.CreateShortcut($startupPath).Arguments.EndsWith(' --background')) 'failed Hub rollback repairs Startup before launching the restored Hub'
} finally {if(Test-Path $startupPath){Remove-Item -LiteralPath $startupPath};if(Test-Path $startupKey){Remove-Item $startupKey}}

Sync-NativeOptionalShortcuts $shortcutRoot 'Vantare test' $on $true
Assert-Registration (-not (Test-Path -LiteralPath $startup)) 'uninstall removes enabled owned shortcuts'
Remove-Item -LiteralPath (Join-Path $testRoot 'Startup')
[IO.File]::WriteAllText((Join-Path $testRoot 'Startup'),'blocked folder')
$warnings=@()
$warnings=@(Sync-NativeOptionalShortcuts $shortcutRoot 'Vantare test' @{desktop=$false;autostart=$true} 3>&1)
Assert-Registration ($warnings.Count -gt 0 -and [IO.File]::ReadAllText((Join-Path $testRoot 'Startup')) -ceq 'blocked folder') 'unavailable ON emits warning and preserves obstacle'
$script:emptyFolder='Startup'
$warnings=@(Sync-NativeOptionalShortcuts $shortcutRoot 'Vantare test' @{desktop=$false;autostart=$true} 3>&1)
Assert-Registration ($warnings.Count -eq 1) 'ON with empty GetFolderPath warns without throwing'
$script:emptyFolder='Programs';$called=$false;$failed=$false
try{Invoke-NativeRegistrationTransaction 'HKCU:/unused-1695' 'Test' 'Legacy' {$called=$true}}catch{$failed=$_.Exception -is [InvalidOperationException]}
Assert-Registration ($failed -and -not $called) 'empty Programs fails clearly before registry or Join-Path writes'
$script:emptyFolder=''

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
# Keep a real sharing violation alive throughout rollback, not just Finalize.
foreach($blockedName in @('beta.ps1','state.json')){
    $install=Join-Path $testRoot ('partial-'+$blockedName)
    Install-Beta $install $zip $hash
    $oldState=Read-NativeState $install
    $oldGeneration=Join-Path $install ('generations/'+$oldState.active.generation)
    $notice=Join-Path $install 'installer-notices.txt'
    [IO.File]::WriteAllText($notice,'original notice')
    $oldWriter=[Console]::Error;$log=[IO.StringWriter]::new();$script:held=$null
    $cause=[IO.IOException]::new('Deliberate finalization failure');$cause.Data['Fixture1695']=$true
    try {
        [Console]::SetError($log)
        try {
            Install-Beta $install $zip $hash -Finalize {
                [IO.File]::WriteAllText($notice,'changed notice')
                [IO.File]::WriteAllText((Join-Path $install 'Uninstall.exe'),'partial')
                $script:held=[IO.File]::Open((Join-Path $install $blockedName),'Open','ReadWrite','None')
                throw $cause
            }
            throw 'Expected failure'
        }catch{Assert-Registration ($_.Exception.Data.Contains('Fixture1695')) "$blockedName preserves original error after rollback errors"}
    }finally{if($script:held){$script:held.Dispose()};[Console]::SetError($oldWriter)}
    Assert-Registration ($log.ToString().Contains($blockedName)) "$blockedName rollback failure is logged"
    Assert-Registration ([IO.File]::ReadAllText($notice) -ceq 'original notice' -and -not(Test-Path (Join-Path $install 'Uninstall.exe'))) "$blockedName cannot prevent later restoration and cleanup"
    Assert-Registration (Test-Path $oldGeneration) "$blockedName retains old generation"
    $current=Read-NativeState $install
    Assert-Registration (Test-Path (Join-Path $install ('generations/'+$current.active.generation))) "$blockedName never deletes the still-referenced active generation"
    if($blockedName -ceq 'beta.ps1'){
        Assert-Registration ($current.active.generation -ceq $oldState.active.generation -and @(Get-ChildItem (Join-Path $install 'generations') -Directory).Count -eq 1) 'other denied file still restores state and removes failed generation'
    }
}
# The filesystem boundary refuses enumeration before any activation; do not
# turn an unreadable snapshot into an empty set of previously existing data.
$install=Join-Path $testRoot 'enumeration';Install-Beta $install $zip $hash
$oldState=Read-NativeState $install;$stateHash=Get-NativeHash (Join-Path $install 'state.json')
$script:denyEnumeration=$true;$script:enumPath=Join-Path $install 'generations'
function Get-ChildItem {
    [CmdletBinding()]param([Parameter(Position=0)][Alias('Path')][string]$LiteralPath,[switch]$Directory,[switch]$File,[switch]$Force,[switch]$Recurse,[string]$Filter)
    if($script:denyEnumeration -and $Directory -and $LiteralPath -ceq $script:enumPath){Write-Error -Exception ([IO.IOException]::new('Enumeration unavailable'));return}
    Microsoft.PowerShell.Management\Get-ChildItem @PSBoundParameters
}
try{
    $called=$false;$failed=$false
    try{Install-Beta $install $zip $hash -Finalize {$called=$true}}catch{$failed=$true}
    Assert-Registration ($failed -and -not $called -and (Get-NativeHash (Join-Path $install 'state.json')) -ceq $stateHash) 'unreadable generation snapshot aborts before activation'
    $script:denyEnumeration=$false;$oldWriter=[Console]::Error;$log=[IO.StringWriter]::new()
    try{
        [Console]::SetError($log)
        try{Install-Beta $install $zip $hash -Finalize {$script:denyEnumeration=$true;throw $cause}}catch{}
    }finally{[Console]::SetError($oldWriter);$script:denyEnumeration=$false}
    Assert-Registration ((Get-NativeHash (Join-Path $install 'state.json')) -ceq $stateHash -and (Test-Path (Join-Path $install ('generations/'+$oldState.active.generation)))) 'failed cleanup enumeration preserves original state and generation'
    Assert-Registration ($log.ToString().Contains('generaciones')) 'failed cleanup enumeration is logged'
}finally{Remove-Item Function:/Get-ChildItem}

# A real competing installer process must be refused throughout finalization.
$install=Join-Path $testRoot 'uninstall-lock';Install-Beta $install $zip $hash
$probe=Join-Path $testRoot 'competing-install.ps1'
[IO.File]::WriteAllText($probe,@'
param($Beta,$TargetRoot,$Zip,$Hash,$Result)
$ErrorActionPreference='Stop';. $Beta -Library -Root $TargetRoot
try{Install-Beta $TargetRoot $Zip $Hash;@{installed=$true}|ConvertTo-Json|Set-Content $Result}
catch{@{installed=$false;install_exit=$_.Exception.Data['InstallExitCode'];message=$_.Exception.Message}|ConvertTo-Json|Set-Content $Result}
'@)
$probeResult=Join-Path $testRoot 'competing-result.json'
Uninstall-Beta $install -Finalize {
    $psi=[Diagnostics.ProcessStartInfo]::new();$psi.FileName=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $psi.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$probe+'" -Beta "'+(Join-Path $PSScriptRoot 'beta.ps1')+'" -TargetRoot "'+$install+'" -Zip "'+$zip+'" -Hash '+$hash+' -Result "'+$probeResult+'"'
    $psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
    $p=[Diagnostics.Process]::Start($psi)
    try{if(-not $p.WaitForExit(30000)){throw 'Competing fixture timeout'}}finally{$p.Dispose()}
    $result=Get-Content $probeResult -Raw|ConvertFrom-Json
    Assert-Registration (-not $result.installed -and $result.install_exit -eq 2) 'competing installer is refused with busy exit2 during uninstall finalization'
    Write-NativeJson (Join-Path $install 'installer-cleanup.json') @{schema=1;sha256=('a'*64)}
    $held=$null;$blocked=$false
    try{$held=[IO.File]::Open((Join-Path $install 'beta-session.lock'),'Open','ReadWrite','None')}catch{$blocked=$true}finally{if($held){$held.Dispose()}}
    Assert-Registration ($blocked -and (Test-Path (Join-Path $install 'installer-cleanup.json'))) 'lock remains held after cleanup marker write'
}
$held=[IO.File]::Open((Join-Path $install 'beta-session.lock'),'Open','ReadWrite','None');$held.Dispose()
Assert-Registration $true 'uninstall releases lock only after finalization'

# Full driver boundary with inert payload: successful silent install followed by
# a real sharing violation in mandatory registration after the new state is active.
$script:driverFolders=$true # Parent cleanup must resolve the same Programs as the real child.
$driverRoot=Join-Path 'C:/tmp/ola2/1591-qa' ('1690-driver-'+[guid]::NewGuid().ToString('N'))
$engine=Join-Path ([IO.Path]::GetTempPath()) ('VantareSetup-1695-'+$PID+'-'+[DateTime]::UtcNow.Ticks);[IO.Directory]::CreateDirectory($engine)|Out-Null
foreach($name in @('candidate.ps1','beta.ps1','installer-driver.ps1')){Copy-Item (Join-Path $PSScriptRoot $name) $engine}
Copy-Item $zip (Join-Path $engine 'package.zip')
Copy-Item (Join-Path $env:WINDIR 'System32/cmd.exe') (Join-Path $engine 'Uninstall.exe')
[IO.File]::WriteAllText((Join-Path $engine 'installer-notices.txt'),'inert fixture')
$request=Join-Path $engine 'request.json'
Write-NativeJson $request @{operation='Install';root=$driverRoot;qa=$true;qaIdentity='VantareNativeBetaQA1492';qaShortcutFolder='Vantare QA1492';qaLegacyShortcutFolder='Vantare Native Beta QA1492';qaPrefix='C:/tmp/ola2/1591-qa';silent=$true;uninstall=$false;version='0.0.979';size=1;mode='auto';packageSha=$hash;desktop=$false;autostart=$false}
$qaKey='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBetaQA1492'
if(Test-Path $qaKey){throw 'Existing QA registration preserved; cannot run driver fixture'}
function Run-RegistrationDriver {
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $engine 'installer-driver.ps1')+'" -RequestFile "'+$request+'"'
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    # .NET Framework creates StandardInput with Console.InputEncoding and can
    # emit its BOM immediately at Process.Start, before even BaseStream.Write.
    # Rust sends ASCII continue/cancel bytes. Match those bytes without changing
    # the caller's encoding or relaxing the driver's exact acknowledgement.
    $previousEncoding=[Console]::InputEncoding
    try {
        [Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
        $process=[Diagnostics.Process]::Start($info)
    }finally{[Console]::InputEncoding=$previousEncoding}
    try {
        $process.StandardInput.WriteLine('continue');$process.StandardInput.Close()
        $out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        foreach($line in ($out.Result -split "`n")){if($line.Trim()){$null=$line|ConvertFrom-Json}}
        $script:driverError=$err.Result
        [IO.File]::WriteAllText((Join-Path $testRoot ('driver-'+$process.ExitCode+'.log')),($out.Result+$err.Result))
        if($process.ExitCode -ne 0){[Console]::Error.WriteLine('Driver fixture exit '+$process.ExitCode+': '+$err.Result)}
        $process.ExitCode
    }finally{$process.Dispose()}
}
$previousInputEncoding=[Console]::InputEncoding
[Console]::InputEncoding=[Text.UTF8Encoding]::new($true)
try {
    $orphan=Join-Path 'C:/tmp/ola2/1591-qa' ('1695-orphan-'+[guid]::NewGuid().ToString('N'))
    $null=Open-NativeRoot $orphan -Initialize
    $orphanMarker=Join-Path $orphan 'installer-cleanup.json'
    Write-NativeJson $orphanMarker @{schema=1;sha256=('a'*64)}
    $value=Get-Content $request -Raw|ConvertFrom-Json;$value.root=$orphan;Write-BetaJson $request $value
    $session=[IO.File]::Open((Join-Path $orphan 'beta-session.lock'),'OpenOrCreate','ReadWrite','None')
    try{Assert-Registration ((Run-RegistrationDriver) -eq 2 -and (Test-Path $orphanMarker)) 'Setup cannot remove orphan marker outside the held session lock'}
    finally{$session.Dispose();$value.root=$driverRoot;Write-BetaJson $request $value}
    Assert-Registration ((Run-RegistrationDriver) -eq 0) 'real driver silently installs inert package with both options OFF'
    Assert-Registration ([Console]::InputEncoding.GetPreamble().Length -eq 3) 'driver harness handles UTF8 BOM parent input and restores its encoding'
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
    # Wrap only the real registration boundary in this child fixture. Observe
    # FileShare.None both before registration removal and after marker creation.
    $proof=Join-Path $testRoot 'driver-uninstall-lock.json'
    $lockProbe=@'
$registrationImplementation=${function:Uninstall-NativeRegistration}
function Uninstall-NativeRegistration {
    param([string]$Directory,[bool]$DeferUninstaller,[string]$KnownIdentity,[string]$KnownFolder)
    foreach($phase in @('before','after')){
        if($phase -ceq 'after'){& $registrationImplementation @PSBoundParameters}
        $held=$null;$blocked=$false
        try{$held=[IO.File]::Open((Join-Path $Directory 'beta-session.lock'),'Open','ReadWrite','None')}catch [IO.IOException]{$blocked=$true}finally{if($held){$held.Dispose()}}
        if(-not $blocked){throw 'Registration finalization escaped the session lock'}
    }
    if(-not(Test-Path (Join-Path $Directory 'installer-cleanup.json'))){throw 'Cleanup marker was not written under lock'}
    [IO.File]::WriteAllText('__PROOF__','{"before":true,"after_marker":true}')
}
'@
    $lockProbe=$lockProbe.Replace('__PROOF__',$proof.Replace("'","''"))
    [IO.File]::WriteAllText($driverPath,[IO.File]::ReadAllText($driverPath).Replace('# stdout is exclusively',($lockProbe+"`n# stdout is exclusively")))
    $requestValue.operation='Uninstall';$requestValue.uninstall=$true;Write-BetaJson $request $requestValue
    Assert-Registration ((Run-RegistrationDriver) -eq 0 -and -not(Test-Path $qaKey) -and (Test-Path (Join-Path $driverRoot 'installer-cleanup.json'))) 'real driver uninstalls and writes hash-bound marker before releasing lock'
    $lockResult=Get-Content $proof -Raw|ConvertFrom-Json
    Assert-Registration ($lockResult.before -and $lockResult.after_marker) 'actual driver holds lock across registration removal and cleanup marker creation'
    $requestValue.operation='Cleanup';$requestValue|Add-Member -NotePropertyName processId -NotePropertyValue 2147483647
    Write-BetaJson $request $requestValue
    $session=[IO.File]::Open((Join-Path $driverRoot 'beta-session.lock'),'Open','ReadWrite','None')
    try{Assert-Registration ((Run-RegistrationDriver) -eq 1 -and (Test-Path (Join-Path $driverRoot 'Uninstall.exe')) -and (Test-Path (Join-Path $driverRoot 'installer-cleanup.json'))) 'Cleanup cannot remove EXE or marker outside the held session lock'}
    finally{$session.Dispose()}
    Assert-Registration ((Run-RegistrationDriver) -eq 0 -and -not(Test-Path (Join-Path $driverRoot 'Uninstall.exe')) -and -not(Test-Path (Join-Path $driverRoot 'installer-cleanup.json'))) 'Cleanup removes own EXE and marker under lock after parent exits'
} finally {
    try {if(Test-Path $qaKey){Uninstall-NativeRegistration $driverRoot}}
    finally{[Console]::InputEncoding=$previousInputEncoding}
}
"$passed installer registration checks PASS; fixtures: $testRoot"
