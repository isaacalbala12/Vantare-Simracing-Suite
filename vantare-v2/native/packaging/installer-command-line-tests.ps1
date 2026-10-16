#requires -Version 5.1
param([Parameter(Mandatory)][string]$VersionDirectory,[Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'beta.ps1')
$evidence=Assert-NativePath $EvidenceDirectory
if(-not $evidence.StartsWith([IO.Path]::GetFullPath('C:/tmp/ola2/1591-qa/'),[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $evidence)){throw 'Use fresh isolated evidence.'}
$key='HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBetaQA1492'
if(Test-Path -LiteralPath $key){throw 'Preserve existing QA identity.'}
[IO.Directory]::CreateDirectory($evidence)|Out-Null
$root=Join-Path $evidence 'QA  instalación con espacios'
function Invoke-Win32Installer([string]$Exe,[string]$Arguments,[int]$Expected){
    $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$Exe;$info.Arguments=$Arguments;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $p=[Diagnostics.Process]::Start($info)
    try{if(-not $p.WaitForExit(180000) -or $p.ExitCode -ne $Expected){throw 'Actual Win32 CLI exit code mismatch'}}finally{$p.Dispose()}
}
try {
    # Same native command line as cmd.exe: /D final, unquoted, with double spaces.
    Invoke-Win32Installer (Join-Path $VersionDirectory 'VantareSetup.exe') ('/S /D='+$root) 0
    $actual=(Get-ItemProperty -LiteralPath $key).InstallLocation
    if($actual -cne $root -or -not (Test-Path -LiteralPath (Join-Path $root 'state.json'))){throw 'Windows command line lost exact directory suffix'}
    Write-Output 'PASS unquoted /D: Unicode and repeated spaces preserved through actual Setup'
    $before=Get-NativeHash (Join-Path $root 'state.json')
    Invoke-Win32Installer (Join-Path $VersionDirectory 'VantareSetup.exe') ('/D='+$root+' /S') 1
    if((Get-NativeHash (Join-Path $root 'state.json')) -cne $before){throw 'Rejected suffix flags changed state'}
    Write-Output 'PASS switches after /D reject without changing state'
    $generation=(Read-NativeState $root).active.generation
    $data=Join-Path $root ('generations/'+$generation+'/data')
    [IO.File]::WriteAllText((Join-Path $data 'profile.json'),'TEST ONLY unchanged data')
    $index=Get-NativeDataIndex $data
    Invoke-Win32Installer (Join-Path $root 'Uninstall.exe') ('/S _?='+$root) 0
    if(Test-Path -LiteralPath $key){throw 'Legacy unquoted uninstall suffix did not remove QA registry'}
    if((Get-NativeDataIndex $data) -cne $index){throw 'Uninstall changed data'}
    Write-Output 'PASS unquoted _?=: exact suffix and preserved data'
}finally{
    if(Test-Path -LiteralPath $key){if(Test-Path -LiteralPath (Join-Path $root 'state.json')){Uninstall-Beta $root|Out-Null};Uninstall-NativeRegistration $root $true}
}
