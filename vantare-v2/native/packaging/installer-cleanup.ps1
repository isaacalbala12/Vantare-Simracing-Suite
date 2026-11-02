#requires -Version 5.1
# Permanent ADR0103 exception: powershell.exe lives outside the tree it removes.
# Cleanup only. No state, registry, shortcuts, generation or user-data operations.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$RequestFile)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function Assert-CleanupPath([string]$Path){
    if([string]::IsNullOrWhiteSpace($Path)){throw 'CLEANUP_PATH_REQUIRED'}
    $full=[IO.Path]::GetFullPath($Path)
    if(-not [IO.Path]::IsPathRooted($Path) -or $full.StartsWith('\\')){throw 'CLEANUP_LOCAL_ROOT_REQUIRED'}
    for($ancestor=$full;$ancestor;$ancestor=[IO.Path]::GetDirectoryName($ancestor)){
        if([IO.Path]::GetFileName($ancestor) -like '.env*'){throw 'CLEANUP_ENV_REJECTED'}
        if((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'CLEANUP_REPARSE_REJECTED'}
    }
    $full
}
$RequestFile=Assert-CleanupPath $RequestFile
if([IO.Path]::GetFileName($RequestFile) -cne 'shell.json' -or (Get-Item -LiteralPath $RequestFile).Length -gt 65536){throw 'CLEANUP_REQUEST_REJECTED'}
$contract=[IO.File]::ReadAllText($RequestFile)|ConvertFrom-Json
if($contract.operation -cne 'Cleanup'){throw 'CLEANUP_OPERATION_REJECTED'}
$root=Assert-CleanupPath $contract.root
$temporary=Assert-CleanupPath $PSScriptRoot
$prefix=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
if(-not $temporary.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($temporary) -cnotmatch '^VantareSetup-[0-9]+-[0-9]+-[0-9]+$'){throw 'CLEANUP_TEMP_REJECTED'}
if($temporary -ieq $root -or $temporary.StartsWith($root.TrimEnd('\','/')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'CLEANUP_TEMP_OVERLAPS_ROOT'}
if($contract.qa){
    . (Join-Path $temporary 'qa-guard.ps1')
    foreach($path in @($root,$temporary,$RequestFile)){$null=Assert-MatrixRoot $path}
}
try{$parent=[Diagnostics.Process]::GetProcessById([int]$contract.parentId)}catch [ArgumentException]{$parent=$null}
if($null -ne $parent){try{if(-not $parent.WaitForExit(30000)){throw 'CLEANUP_PARENT_STILL_RUNNING'}}finally{$parent.Dispose()}}
$session=[IO.File]::Open((Join-Path $root 'beta-session.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try{
    $marker=Assert-CleanupPath (Join-Path $root 'installer-cleanup.json')
    if((Get-Item -LiteralPath $marker).Length -gt 1024){throw 'CLEANUP_MARKER_SIZE'}
    $cleanup=[IO.File]::ReadAllText($marker)|ConvertFrom-Json
    if($cleanup.schema -ne 1 -or $cleanup.sha256 -cnotmatch '^[a-f0-9]{64}$' -or @($cleanup.PSObject.Properties).Count -ne 2){throw 'CLEANUP_MARKER_REJECTED'}
    $exe=Assert-CleanupPath (Join-Path $root 'Uninstall.exe')
    if(Test-Path -LiteralPath $exe){
        if((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $cleanup.sha256){throw 'CLEANUP_HASH_CHANGED'}
        Remove-Item -LiteralPath $exe
    }
    Remove-Item -LiteralPath $marker
    foreach($item in Get-ChildItem -LiteralPath $temporary -Recurse -Force){$null=Assert-CleanupPath $item.FullName}
    Remove-Item -LiteralPath $temporary -Recurse -Force
}finally{$session.Dispose()}
