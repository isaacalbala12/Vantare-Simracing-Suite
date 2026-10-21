#requires -Version 5.1
param(
    [Parameter(Mandatory)][string]$VersionDirectory,
    [Parameter(Mandatory)][string]$EvidenceDirectory,
    [ValidateSet('Shortcut','beta.ps1','candidate.ps1','registration-identity.txt','uninstall-vantare.ps1','installer-ui.json','installer-notices.txt')][string]$Boundary='Shortcut'
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'beta.ps1')
$evidence=Assert-NativePath $EvidenceDirectory
if(-not $evidence.StartsWith([IO.Path]::GetFullPath('C:/tmp/ola2/1591-qa/'),[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $evidence)){throw 'Use fresh isolated evidence.'}
$key='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBetaQA1492'
$menu=Join-Path ([Environment]::GetFolderPath('Programs')) 'Vantare QA1492'
foreach($path in @($key,$menu)){if(Test-Path -LiteralPath $path){throw 'Preserve existing QA identity.'}}
[IO.Directory]::CreateDirectory($evidence)|Out-Null
$root=Join-Path $evidence 'installed'
$p=Start-Process -FilePath (Join-Path $VersionDirectory 'VantareSetup.exe') -ArgumentList ('/S "/D='+$root+'"') -WindowStyle Hidden -PassThru
try{if(-not $p.WaitForExit(180000) -or $p.ExitCode){throw 'Setup fixture failed'}}finally{$p.Dispose()}
$state=Read-NativeState $root
$data=Join-Path $root ('generations/'+$state.active.generation+'/data')
[IO.File]::WriteAllText((Join-Path $data 'profile.json'),'TEST ONLY preserved data')
$index=Get-NativeDataIndex $data
$request=Join-Path $evidence 'request.json'
Write-BetaJson $request @{operation='Uninstall';root=$root;qa=$true;uninstall=$true;silent=$true;version='0.0.978';size=0}
function Run-Uninstall([int]$Expected){
    $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'installer-driver.ps1')+'" -RequestFile "'+$request+'"'
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $p=[Diagnostics.Process]::Start($info)
    try{
        $out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync()
        if(-not $p.WaitForExit(60000)){throw 'Retain owned probe after timeout.'}
        [IO.File]::WriteAllText((Join-Path $evidence ('attempt-'+$Expected+'.log')),$out.GetAwaiter().GetResult()+$err.GetAwaiter().GetResult())
        if($p.ExitCode -ne $Expected){throw "Uninstall retry returned $($p.ExitCode), expected $Expected at $Boundary"}
    }finally{$p.Dispose()}
}
$blocked=if($Boundary -ceq 'Shortcut'){Join-Path $menu 'Desinstalar.lnk'}else{Join-Path $root $Boundary}
$handle=$null
try {
    $handle=[IO.File]::Open($blocked,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    Run-Uninstall 1
    if(Test-Path -LiteralPath (Join-Path $root 'state.json')){throw 'Failure did not reach the post-state frontier'}
    if(($Boundary -ceq 'Shortcut') -ne (Test-Path -LiteralPath $key)){throw 'Failure did not reach the expected registry frontier'}
    $handle.Dispose();$handle=$null
    Run-Uninstall 0
    foreach($path in @($key,$menu)){if(Test-Path -LiteralPath $path){throw 'Retry left own registry or menu behind'}}
    foreach($name in @('beta.ps1','candidate.ps1','registration-identity.txt','uninstall-vantare.ps1','installer-ui.json','installer-notices.txt')){
        if(Test-Path -LiteralPath (Join-Path $root $name)){throw "Retry falsely succeeded: left $name"}
    }
    if((Get-NativeDataIndex $data) -cne $index){throw 'Retry changed preserved data'}
    Write-Output "PASS ${Boundary}: actual delete-denying handle, retry completes own cleanup and preserves data"
}finally{
    if($null -ne $handle){$handle.Dispose()}
    if(Test-Path -LiteralPath $key){Uninstall-NativeRegistration $root $true}
    # Remove only fixed test-owned shell entries; retain all filesystem/data evidence.
    if(Test-Path -LiteralPath $menu){foreach($name in @('Vantare Simracing Suite.lnk','Desinstalar.lnk')){$path=Join-Path $menu $name;if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path}};if(-not @(Get-ChildItem -LiteralPath $menu).Count){Remove-Item -LiteralPath $menu}}
}
