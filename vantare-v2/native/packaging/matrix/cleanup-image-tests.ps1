#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Root)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'guard.ps1')
$qaImageRoot=Assert-MatrixRoot $Root
if(-not $qaImageRoot.StartsWith('D:\VantareServer\qa\',[StringComparison]::OrdinalIgnoreCase)){throw 'QA_SERVER_ROOT_REQUIRED'}
if(Test-Path -LiteralPath $qaImageRoot){throw 'CLEANUP_IMAGE_NEEDS_FRESH_ROOT'}
$compiler=Join-Path $qaImageRoot 'compiler'
[IO.Directory]::CreateDirectory($compiler)|Out-Null
$compiled=Join-Path $compiler 'CleanupImageProbe.exe'
# .NET Framework compiler only; no Rust compilation or product executable.
Add-Type -Path (Join-Path $PSScriptRoot 'cleanup-image-probe.cs') -OutputAssembly $compiled -OutputType ConsoleApplication
$sha=(Get-FileHash -LiteralPath $compiled -Algorithm SHA256).Hash.ToLowerInvariant()
$results=@()
function Invoke-OwnedImage([string]$Name,[string]$Identity,[string]$Hash,[uint32]$Flags,[bool]$ReadOnly=$false,[bool]$WrongRoot=$false){
    $case=Assert-MatrixRoot (Join-Path $qaImageRoot $Name)
    [IO.Directory]::CreateDirectory($case)|Out-Null
    $image=Join-Path $case 'CleanupImageProbe.exe'
    Copy-Item -LiteralPath $compiled -Destination $image
    if($ReadOnly){[IO.File]::SetAttributes($image,[IO.FileAttributes]::ReadOnly)}
    $declared=if($WrongRoot){Join-Path $qaImageRoot 'other'}else{$case}
    $start=[Diagnostics.ProcessStartInfo]::new()
    $start.FileName=$image
    $start.Arguments='"'+$declared+'" '+$Hash+' '+$Identity+' '+$Flags
    $start.UseShellExecute=$false;$start.CreateNoWindow=$true
    $start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    $process=[Diagnostics.Process]::Start($start)
    try{
        if(-not $process.WaitForExit(30000)){$process.Kill();$process.WaitForExit();throw 'OWN_IMAGE_TIMEOUT'}
        $result=@{name=$Name;exit=$process.ExitCode;stdout=$process.StandardOutput.ReadToEnd();stderr=$process.StandardError.ReadToEnd();flags=$Flags;readonly=$ReadOnly;imageRemains=(Test-Path -LiteralPath $image);directoryRemains=(Test-Path -LiteralPath $case)}
    }finally{$process.Dispose()}
    $script:results+=,$result
    [IO.File]::WriteAllText((Join-Path $qaImageRoot 'results.json'),($script:results|ConvertTo-Json -Depth 5))
    $result|ConvertTo-Json -Compress
    $result
}
foreach($rejection in @('identity','hash','root')){
    $identity=if($rejection -eq 'identity'){'WrongIdentity'}else{'VantareCleanupImageProbe-v1'}
    $hash=if($rejection -eq 'hash'){'0'*64}else{$sha}
    $result=@(Invoke-OwnedImage $rejection $identity $hash 3 $false ($rejection -eq 'root'))[-1]
    if($result.exit -eq 0 -or -not $result.imageRemains -or (Get-FileHash -LiteralPath (Join-Path $qaImageRoot ($rejection+'/CleanupImageProbe.exe')) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $sha){throw 'OWN_IMAGE_REJECTION_FAILED'}
}
$normal=@(Invoke-OwnedImage 'normal' 'VantareCleanupImageProbe-v1' $sha 3)[-1]
if($normal.exit -ne 0 -or $normal.imageRemains -or $normal.directoryRemains){throw ('CLEANUP_IMAGE_UNSUPPORTED: '+$normal.stderr+' Residue explicitly preserved: '+(Join-Path $qaImageRoot 'normal'))}
$readOnly=@(Invoke-OwnedImage 'readonly-no-ignore' 'VantareCleanupImageProbe-v1' $sha 3 $true)[-1]
$ignore=@(Invoke-OwnedImage 'readonly-ignore' 'VantareCleanupImageProbe-v1' $sha 19 $true)[-1]
if($ignore.exit -ne 0 -or $ignore.imageRemains -or $ignore.directoryRemains){throw ('CLEANUP_IMAGE_READONLY_UNSUPPORTED: '+$ignore.stderr)}
"PASS own-image removal and empty-directory deletion; readonly without IGNORE exit=$($readOnly.exit)"
"NOT TESTED: non-NTFS volume and unsupported Windows; no such QA environment supplied. API failures retain an explicit path in results.json and fail this test."
