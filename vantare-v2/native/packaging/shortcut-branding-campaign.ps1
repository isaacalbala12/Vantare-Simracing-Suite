#requires -Version 5.1
# Run by a private-desktop controller in a fresh standard account. Never launch
# application binaries: Setup/Uninstall /S and Register are the only operations.
param(
    [Parameter(Mandatory)][string]$Evidence,
    [Parameter(Mandatory)][string]$ExpectedSid,
    [Parameter(Mandatory)][string]$Setup,
    [Parameter(Mandatory)][ValidateSet('0.0.975','0.0.981','0.0.982')][string]$BaselineVersion
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
trap {[IO.File]::WriteAllText((Join-Path $Evidence 'actor-failure.txt'),$_.Exception.ToString());exit 1}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if($identity.User.Value -cne $ExpectedSid -or ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'A fresh standard QA account is required.'}
foreach($item in @{USERPROFILE='UserProfile';LOCALAPPDATA='LocalApplicationData';APPDATA='ApplicationData'}.GetEnumerator()){
    [Environment]::SetEnvironmentVariable($item.Key,[Environment]::GetFolderPath($item.Value),'Process')
}
$env:TEMP=Join-Path $env:LOCALAPPDATA 'Temp';$env:TMP=$env:TEMP
[IO.Directory]::CreateDirectory($env:TEMP)|Out-Null
$programs=[Environment]::GetFolderPath('Programs',[Environment+SpecialFolderOption]::DoNotVerify)
$desktop=[Environment]::GetFolderPath('DesktopDirectory',[Environment+SpecialFolderOption]::DoNotVerify)
foreach($folder in @($programs,$desktop)){
    if(-not $folder.StartsWith($env:USERPROFILE+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Shell folder outside QA profile.'}
    [IO.Directory]::CreateDirectory($folder)|Out-Null
}
$results=[Collections.Generic.List[object]]::new()
function Record($Name,$Data){$results.Add(@{name=$Name;utc=[DateTime]::UtcNow.ToString('o');data=$Data});$results|ConvertTo-Json -Depth 10|Set-Content (Join-Path $Evidence 'results.json') -Encoding UTF8}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Run([string]$File,[string]$Arguments,[string]$Name){
    $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$File;$info.Arguments=$Arguments
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $p=[Diagnostics.Process]::Start($info)
    try {
        $stdout=$p.StandardOutput.ReadToEndAsync();$stderr=$p.StandardError.ReadToEndAsync()
        if(-not $p.WaitForExit(180000)){throw 'QA process exceeded deadline; retained for controller cleanup.'}
        [IO.File]::WriteAllText((Join-Path $Evidence ($Name+'.log')),($stdout.Result+$stderr.Result))
        Record $Name @{exit=$p.ExitCode;sha256=(Get-FileHash $File).Hash}
        Require ($p.ExitCode -eq 0) "$Name exit=$($p.ExitCode)"
    }finally{$p.Dispose()}
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ShortcutCampaignIcons {
    [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
    public static extern uint ExtractIconEx(string path, int index, IntPtr large, IntPtr small, uint count);
}
'@
$root=Join-Path $Evidence 'installed'
$key='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBeta'
Require (-not(Test-Path $key) -and -not(Test-Path $root)) 'QA installation already exists.'
# NSIS requires /D to be the final unquoted argument, including paths with spaces.
$baselineArguments=if($BaselineVersion -ceq '0.0.975'){'/S /D='+$root}else{'/S "/D='+$root+'"'}
Run (Join-Path $Evidence 'LegacySetup.exe') $baselineArguments 'baseline-install'
Require ((Get-ItemProperty $key).DisplayVersion -ceq $BaselineVersion) 'Baseline version mismatch.'
Require ([IO.Path]::GetFullPath((Get-ItemProperty $key).InstallLocation) -eq [IO.Path]::GetFullPath($root)) 'Baseline installed outside the requested QA root.'
function Generation {$state=Get-Content (Join-Path $root 'state.json') -Raw|ConvertFrom-Json;Join-Path $root ('generations/'+$state.active.generation)}
$beforeData=Join-Path (Generation) 'data/shortcut-upgrade.txt'
[IO.File]::WriteAllText($beforeData,'VANTA-105 shortcut upgrade exact data')
$dataHash=(Get-FileHash $beforeData).Hash
$old=@(Get-ChildItem $programs -Recurse -Filter '*.lnk'|Where-Object {$_.BaseName -in @('Vantare','Vantare Native Beta')})
Require ($old.Count -eq 1) 'Expected exactly one original launch link.'
# Prepare an inherited desktop link from the actual baseline, without changing
# preferences. This covers NSIS and OFF preferences with an existing link.
Copy-Item $old[0].FullName (Join-Path $desktop 'Vantare.lnk')
Record 'baseline' @{version=$BaselineVersion;link=$old[0].FullName;data_sha256=$dataHash;desktop_prepared_from_real_baseline=$true}
Run $Setup ('/S "/D='+$root+'"') 'modern-install'
Run "$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe" ('-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $root 'candidate.ps1')+'" -Operation Register -Root "'+$root+'"') 'repeat-register'
$shell=New-Object -ComObject WScript.Shell
$explorer=New-Object -ComObject Shell.Application
$bin=Join-Path (Generation) 'bin'
$links=@((Join-Path $programs 'Vantare/Vantare Simracing Suite.lnk'),(Join-Path $desktop 'Vantare Simracing Suite.lnk'))
foreach($path in $links){
    Require (Test-Path $path) 'Full shortcut name missing.'
    $link=$shell.CreateShortcut($path)
    $appId=$explorer.NameSpace((Split-Path $path)).ParseName([IO.Path]::GetFileName($path)).ExtendedProperty('System.AppUserModel.ID')
    Require ($link.TargetPath -ieq (Join-Path $bin 'vantare.exe') -and $link.Arguments -ceq ('--beta -Root "'+$root+'"')) 'GUI supervisor/root mismatch.'
    Require ($link.IconLocation -ieq ((Join-Path $bin 'vantare.exe')+',0')) 'Explicit icon mismatch.'
    Require ($appId -ceq 'Vantare.SimracingSuite') 'AppUserModelID mismatch.'
    Require ([ShortcutCampaignIcons]::ExtractIconEx((Join-Path $bin 'vantare.exe'),-1,[IntPtr]::Zero,[IntPtr]::Zero,0) -gt 0) 'Supervisor icon resource cannot be extracted.'
    Record 'shortcut' @{path=$path;target=$link.TargetPath;arguments=$link.Arguments;icon=$link.IconLocation;app_id=$appId;icon_extractable=$true}
}
Require (-not(Test-Path $old[0].FullName) -and -not(Test-Path (Join-Path $desktop 'Vantare.lnk'))) 'Original launch duplicate remains.'
$reg=Get-ItemProperty $key
Require ($reg.DisplayName -ceq 'Vantare Simracing Suite' -and $reg.DisplayIcon -ceq ('"'+(Join-Path $root 'Uninstall.exe')+'",0') -and $reg.InstallLocation -ceq $root) 'Uninstall registration mismatch.'
Require ([ShortcutCampaignIcons]::ExtractIconEx((Join-Path $root 'Uninstall.exe'),-1,[IntPtr]::Zero,[IntPtr]::Zero,0) -gt 0) 'Uninstaller icon not extractable.'
$data=Join-Path (Generation) 'data/shortcut-upgrade.txt'
Require ((Get-FileHash $data).Hash -ceq $dataHash -and (Get-FileHash $beforeData).Hash -ceq $dataHash) 'Upgrade changed data.'
Record 'upgrade-verified' @{from=$BaselineVersion;to=$reg.DisplayVersion;display_name=$reg.DisplayName;display_icon=$reg.DisplayIcon;duplicates=$false;data_preserved=$true}
# No readiness is forged: upgrades go directly to uninstall.
Run (Join-Path $root 'Uninstall.exe') '/S' 'uninstall'
Require (-not(Test-Path $key) -and -not(Test-Path (Join-Path $root 'state.json'))) 'Uninstall left registration/state.'
foreach($path in $links+@($old[0].FullName,(Join-Path $desktop 'Vantare.lnk'))){Require (-not(Test-Path $path)) 'Uninstall left a launch link.'}
Require ((Get-FileHash $data).Hash -ceq $dataHash) 'Uninstall changed data.'
$deadline=[DateTime]::UtcNow.AddSeconds(25)
while((Test-Path (Join-Path $root 'Uninstall.exe')) -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 200}
Require (-not(Test-Path (Join-Path $root 'Uninstall.exe'))) 'Asynchronous cleanup did not finish.'
Record 'complete' @{from=$BaselineVersion;data_preserved=$true;readiness_forged=$false;application_started=$false;clean_windows=$false}
