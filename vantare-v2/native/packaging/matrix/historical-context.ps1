#requires -Version 5.1
# Test boundary only. Validation must finish before product import or writes.
. (Join-Path $PSScriptRoot 'guard.ps1')
function Assert-HistoricalContext([string]$Root,[string]$RegistryRoot,[string]$ShellRoot) {
    if(-not $Root -or -not $RegistryRoot -or -not $ShellRoot){throw 'HISTORY_CONTEXT_REQUIRED'}
    $qaHistoryRoot=Assert-MatrixRoot $Root
    $qaHistoryShell=Assert-MatrixRoot $ShellRoot
    if($RegistryRoot -cnotmatch '^HKEY_CURRENT_USER\\Software\\VantareInstallerMatrix\\[a-f0-9]{32}(\\history)?$'){throw 'HISTORY_REGISTRY_REJECTED'}
    if(-not(Test-Path -LiteralPath ('Registry::'+$RegistryRoot))){throw 'HISTORY_REGISTRY_REQUIRED'}
    if(Test-Path -LiteralPath $qaHistoryRoot){throw 'HISTORY_NEEDS_FRESH_ROOT'}
    $null=Assert-MatrixRoot $env:TEMP
    $null=Assert-MatrixRoot $env:TMP
    $null=Assert-MatrixRoot $env:LOCALAPPDATA
    @{Root=$qaHistoryRoot;Registry=$RegistryRoot;Shell=$qaHistoryShell}
}
function Set-HistoricalBoundary($Context) {
    Remove-PSDrive HKCU
    New-PSDrive HKCU Registry $Context.Registry -Scope Global | Out-Null
    $contextFolder=$Context.Shell
    $resolver={param([string]$Name)
        if($Name -cnotin @('Programs','Startup','DesktopDirectory')){throw 'HISTORY_FOLDER_REJECTED'}
        Join-Path $contextFolder $Name
    }.GetNewClosure()
    Set-Item Function:script:Get-NativeShortcutFolder $resolver
}
