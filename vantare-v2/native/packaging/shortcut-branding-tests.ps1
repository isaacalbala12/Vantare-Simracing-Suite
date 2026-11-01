#requires -Version 5.1
# Real COM links and registry, with only Windows folder resolution substituted.
# No process, installer window or public shortcut is opened.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'candidate.ps1') -Library -Root $PSScriptRoot
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('vantare-shortcut-branding-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($testRoot)|Out-Null
function Get-NativeShortcutFolder([string]$Name){Join-Path $testRoot $Name}
$script:passed=0
function Assert-Brand([bool]$Value,[string]$Message){if(-not $Value){throw $Message};$script:passed++;"PASS $Message"}
$shell=New-Object -ComObject WScript.Shell
$explorer=New-Object -ComObject Shell.Application
function AppId([string]$Path){$explorer.NameSpace((Split-Path $Path)).ParseName([IO.Path]::GetFileName($Path)).ExtendedProperty('System.AppUserModel.ID')}
foreach($baseline in @('0.0.975','0.0.981','0.0.982')){
    $root=Join-Path $testRoot $baseline
    $null=Open-NativeRoot $root -Initialize
    $id='VantareBrand'+[guid]::NewGuid().ToString('N')
    $key='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/'+$id
    $menu=Join-Path $testRoot 'Programs/Vantare'
    $legacy=Join-Path $testRoot 'Programs/Vantare Native Beta'
    $desktop=Join-Path $testRoot 'DesktopDirectory'
    $generation='a'*32
    $bin=Join-Path $root "generations/$generation/bin"
    [IO.Directory]::CreateDirectory($bin)|Out-Null
    # Inert images exercise paths only; PE icon content is tested separately on RC4.
    foreach($name in @('vantare.exe','vantare-hub.exe')){Copy-Item "$env:WINDIR/System32/cmd.exe" (Join-Path $bin $name)}
    Copy-Item (Join-Path $PSScriptRoot 'candidate.ps1') (Join-Path (Split-Path $bin) 'candidate.ps1')
    Copy-Item (Join-Path $PSScriptRoot 'candidate.ps1') (Join-Path $root 'candidate.ps1')
    Copy-Item "$env:WINDIR/System32/cmd.exe" (Join-Path $root 'Uninstall.exe')
    Write-NativeJson (Join-Path $root 'state.json') @{schema=1;product='vantare-native';channel='beta';active=@{generation=$generation}}
    Write-NativeJson (Join-Path $root 'installer-ui.json') @{schema=1;kind='rust-gpui';uninstaller='Uninstall.exe';sha256=(Get-NativeHash (Join-Path $root 'Uninstall.exe'));desktop=$true;autostart=$false}
    [IO.File]::WriteAllText((Join-Path $root 'registration-identity.txt'),$id)
    try {
        New-Item $key -Force|Out-Null
        foreach($entry in @{InstallLocation=$root;DisplayName='Vantare';DisplayVersion=$baseline;ShortcutFolder='Vantare';LegacyShortcutFolder='Vantare Native Beta'}.GetEnumerator()){Set-ItemProperty $key $entry.Key $entry.Value}
        $old=if($baseline -ceq '0.0.975'){Join-Path $legacy 'Vantare Native Beta.lnk'}else{Join-Path $menu 'Vantare.lnk'}
        foreach($path in @($old,(Join-Path $desktop 'Vantare.lnk'))){
            [IO.Directory]::CreateDirectory((Split-Path $path))|Out-Null
            $link=$shell.CreateShortcut($path)
            if($baseline -ceq '0.0.982'){$link.TargetPath=Join-Path $bin 'vantare.exe';$link.Arguments='--beta -Root "'+$root+'"'}
            else{$link.TargetPath="$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe";$link.Arguments='-File "'+(Join-Path $root 'beta.ps1')+'" -Root "'+$root+'"'}
            $link.Save()
        }
        # NSIS has no desktop preference: an existing desktop link still migrates.
        if($baseline -ceq '0.0.975'){
            $ui=Read-NativeInstallerUi $root;$ui.desktop=$false
            [IO.File]::WriteAllText((Join-Path $root 'installer-ui.json'),($ui|ConvertTo-Json))
        }
        Copy-Item (Join-Path $desktop 'Vantare.lnk') (Join-Path $desktop 'Vantare Native Beta.lnk')
        Sync-NativeRegistration $root '0.0.982'
        Sync-NativeRegistration $root '0.0.982'
        foreach($path in @((Join-Path $menu 'Vantare Simracing Suite.lnk'),(Join-Path $desktop 'Vantare Simracing Suite.lnk'))){
            Assert-Brand (Test-Path $path) "$baseline creates full visible shortcut name"
            $link=$shell.CreateShortcut($path)
            Assert-Brand ($link.TargetPath -eq (Join-Path $bin 'vantare.exe') -and $link.Arguments -ceq ('--beta -Root "'+$root+'"')) "$baseline preserves GUI supervisor and root"
            Assert-Brand ($link.IconLocation -eq ((Join-Path $bin 'vantare.exe')+',0')) "$baseline explicitly uses supervisor icon"
            Assert-Brand ((AppId $path) -ceq 'Vantare.SimracingSuite') "$baseline persists shell AppUserModelID"
        }
        $registration=Get-ItemProperty $key
        Assert-Brand ($registration.DisplayName -ceq 'Vantare Simracing Suite' -and $registration.DisplayIcon -ceq ('"'+(Join-Path $root 'Uninstall.exe')+'",0')) "$baseline uninstall entry has full name and icon"
        Assert-Brand ($registration.InstallLocation -ceq $root) "$baseline retains installation directory"
        Assert-Brand (-not(Test-Path $old) -and -not(Test-Path (Join-Path $desktop 'Vantare.lnk')) -and @(Get-ChildItem $menu -Filter '*.lnk').Count -eq 2) "$baseline repeat registration leaves no duplicates"
        Assert-Brand (-not(Test-Path (Join-Path $desktop 'Vantare Native Beta.lnk'))) "$baseline removes legacy beta desktop alias"
        Assert-Brand (-not(Test-Path (Join-Path $testRoot 'Startup'))) "$baseline OFF does not create Startup"
        $ui=Read-NativeInstallerUi $root;$ui.autostart=$true
        [IO.File]::WriteAllText((Join-Path $root 'installer-ui.json'),($ui|ConvertTo-Json))
        Sync-NativeRegistration $root '0.0.982'
        $startup=Join-Path $testRoot 'Startup/Vantare.lnk'
        $startupLink=$shell.CreateShortcut($startup)
        Assert-Brand ((Test-Path $startup) -and $startupLink.Arguments -ceq ('--beta -Root "'+$root+'" --background')) "$baseline ON preserves Startup filename and background arguments for the capable generation"
        Assert-Brand (-not(Test-Path (Join-Path $testRoot 'Startup/Vantare Simracing Suite.lnk'))) "$baseline Startup is not renamed into a second entry"
        $ui.autostart=$false
        [IO.File]::WriteAllText((Join-Path $root 'installer-ui.json'),($ui|ConvertTo-Json))
        Sync-NativeRegistration $root '0.0.982' @{desktop=$ui.desktop;autostart=$true}
        Assert-Brand (-not(Test-Path $startup)) "$baseline disabling Startup removes own entry"
        # Keep each baseline's initial raw-profile precondition independent.
        Remove-Item (Split-Path $startup)
        # Failed registration must restore the exact old link and remove the new.
        $current=Join-Path $menu 'Vantare Simracing Suite.lnk'
        $before=Get-NativeHash $current
        $failed=$false
        try{Invoke-NativeRegistrationTransaction $key 'Vantare' 'Vantare Native Beta' {Remove-Item $current;throw 'transaction fixture'}}catch{$failed=$true}
        Assert-Brand ($failed -and (Get-NativeHash $current) -ceq $before) "$baseline transaction restores branded shortcut bytes"
        # Simulate an unavailable shell property store after Save. Exercise the
        # Hub's registration path and Setup's transaction, without starting apps.
        $appIdWriter=${function:Set-NativeShortcutAppId}
        try {
            function Set-NativeShortcutAppId([string]$Path){throw [IO.IOException]::new('property store fixture')}
            foreach($transactional in @($false,$true)){
                Copy-Item $current (Join-Path $menu 'Vantare.lnk')
                Remove-Item $current
                $stateHash=Get-NativeHash (Join-Path $root 'state.json')
                $warnings=@(if($transactional){
                    Invoke-NativeRegistrationTransaction $key 'Vantare' 'Vantare Native Beta' {Sync-NativeRegistration $root '0.0.982'} 3>&1
                }else{Sync-NativeRegistration $root '0.0.982' 3>&1})
                Assert-Brand (@($warnings|Where-Object {$_ -is [Management.Automation.WarningRecord] -and $_.Message -like '*AppUserModelID*'}).Count -gt 0) "$baseline AppID failure logs warning (transaction=$transactional)"
                Assert-Brand ((Test-Path $current) -and -not(Test-Path (Join-Path $menu 'Vantare.lnk')) -and @(Get-ChildItem $menu -Filter '*Suite.lnk').Count -eq 1) "$baseline AppID failure finishes registration with one launch link (transaction=$transactional)"
                $link=$shell.CreateShortcut($current)
                Assert-Brand ($link.TargetPath -eq (Join-Path $bin 'vantare.exe') -and $link.IconLocation -eq ((Join-Path $bin 'vantare.exe')+',0')) "$baseline AppID failure preserves name target and icon (transaction=$transactional)"
                Assert-Brand ((Get-NativeHash (Join-Path $root 'state.json')) -ceq $stateHash -and (Get-ItemProperty $key).DisplayName -ceq 'Vantare Simracing Suite') "$baseline AppID failure does not roll back active generation or registration (transaction=$transactional)"
            }
        } finally {${function:Set-NativeShortcutAppId}=$appIdWriter}
        # Exercise old and new cleanup in the same uninstall, preserving a foreign link.
        Copy-Item $current (Join-Path $menu 'Vantare.lnk')
        Copy-Item (Join-Path $desktop 'Vantare Simracing Suite.lnk') (Join-Path $desktop 'Vantare.lnk')
        Copy-Item (Join-Path $desktop 'Vantare Simracing Suite.lnk') (Join-Path $desktop 'Vantare Native Beta.lnk')
        [IO.Directory]::CreateDirectory($legacy)|Out-Null
        Copy-Item $current (Join-Path $legacy 'Vantare Native Beta.lnk')
        $foreign=Join-Path $menu 'Foreign.lnk';$link=$shell.CreateShortcut($foreign);$link.TargetPath="$env:WINDIR/System32/cmd.exe";$link.Save();$foreignHash=Get-NativeHash $foreign
        Remove-Item (Join-Path $root 'state.json')
        Uninstall-NativeRegistration $root
        Assert-Brand (-not(Test-Path $key) -and @(Get-ChildItem $menu -Filter '*.lnk').Count -eq 1 -and (Get-NativeHash $foreign) -ceq $foreignHash) "$baseline uninstall removes old/new own entries and preserves foreign link"
        Assert-Brand (@(Get-ChildItem $desktop -Filter '*.lnk').Count -eq 0 -and -not(Test-Path $legacy)) "$baseline uninstall clears old/new desktop and beta links"
        Remove-Item $foreign
    } finally {if(Test-Path $key){Remove-Item $key}}
}
"$script:passed shortcut branding checks PASS; evidence $testRoot"
