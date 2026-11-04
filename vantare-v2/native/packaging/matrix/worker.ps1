#requires -Version 5.1
param([string]$Root,[string]$Case,[string]$Operation,[string]$Assets,[string]$RegistryRoot,[string]$ReadProbe,[string]$WriteEngine)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'guard.ps1')
$qaCaseRoot=Assert-MatrixRoot $Root
$env:LOCALAPPDATA=Join-Path $qaCaseRoot 'LocalAppData'
$script:Packaging=Split-Path $PSScriptRoot -Parent
$qaInstallRoot=Join-Path $qaCaseRoot 'install'
$qaShellRoot=Join-Path $qaCaseRoot 'shell'
$qaRequestedOperation=$Operation
# Remap the drive in THIS PROCESS before any product code is loaded.
if ($RegistryRoot -cnotmatch '^HKEY_CURRENT_USER\\Software\\VantareInstallerMatrix\\[a-f0-9]{32}\\[a-z0-9-]+$') { throw 'MATRIX_REGISTRY_REJECTED' }
Remove-PSDrive HKCU
New-PSDrive -Name HKCU -PSProvider Registry -Root $RegistryRoot -Scope Global | Out-Null
$qaImportCallerRoot=$Root
. (Join-Path $PSScriptRoot 'support.ps1')
$Operation=$qaRequestedOperation
if ($Root -cne $qaImportCallerRoot) { throw 'MATRIX_IMPORT_ROOT_CHANGED' }
$null=Assert-MatrixRoot $Root
. (Join-Path $PSScriptRoot 'fixtures.ps1')
. (Join-Path $PSScriptRoot 'probe-invariants.ps1')
function Get-NativeShortcutFolder([string]$Name) {
    if ($Name -cnotin @('Programs','Startup','DesktopDirectory')) { throw 'MATRIX_FOLDER_REJECTED' }
    Join-Path $qaCaseRoot $Name
}
$script:MatrixNativePath=${function:Assert-NativePath}
function Assert-NativePath([string]$Path) {
    $full=& $script:MatrixNativePath $Path
    $casePrefix=$qaCaseRoot+'\'
    $assetPrefix=$Assets+'\'
    if ($full -cne $qaCaseRoot -and -not $full.StartsWith($casePrefix,[StringComparison]::OrdinalIgnoreCase) -and
        $full -cne $Assets -and -not $full.StartsWith($assetPrefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'MATRIX_PATH_ESCAPED' }
    $null=Assert-MatrixRoot $full
    $full
}
Initialize-MatrixCase $Case $qaInstallRoot $Assets
Write-NativeJson (Join-Path $qaCaseRoot 'before-data.json') (Get-MatrixData $qaInstallRoot)
$null=Assert-MatrixRoot $qaInstallRoot
try {
    if($Operation -in @('Check','Apply','Confirm','Timeout','Rollback')){
        if(-not $WriteEngine){throw 'MATRIX_NATIVE_WRITER_REQUIRED'}
        $beforeState=if(Test-Path -LiteralPath (Join-Path $qaInstallRoot 'state.json')){Get-NativeHash (Join-Path $qaInstallRoot 'state.json')}else{$null}
        if($Operation -ceq 'Rollback'){Write-NativeJson (Join-Path $qaCaseRoot 'before-state.json') @{sha256=$beforeState}}
        $applied=Test-Path -LiteralPath (Join-Path $qaInstallRoot 'staging/pending.json')
        $contract=Join-Path $qaCaseRoot 'qa-action.json'
        Write-NativeJson $contract @{
            qaAction=$Operation;verifier=(Join-Path $Assets 'verifier.exe');payloadDirectory=$Assets
            request=@{operation='Probe';root=$qaInstallRoot;qa=$false;silent=$true;uninstall=$false;version='0.0.989';size=1;mode='auto';desktop=$false;autostart=$false;processId=2147483647;packageSha=('0'*64);logFile=(Join-Path $qaCaseRoot 'writer.log')}
            context=@{localAppData=$env:LOCALAPPDATA;registryPrefix=$RegistryRoot.Substring('HKEY_CURRENT_USER\'.Length);shellRoot=$qaShellRoot}
        }
        & $WriteEngine $contract
        $code=$LASTEXITCODE
        if($Operation -ceq 'Apply' -and $code -eq 0){Write-NativeJson (Join-Path $qaCaseRoot 'apply-result.json') @{applied=[bool]$applied;beforeState=$beforeState}}
        exit $code
    }
    switch ($Operation) {
        {$_ -in @('Probe','Install','Repair','Uninstall','Cleanup') -or ($_ -ceq 'Update' -and $WriteEngine)} {
            $engine=Join-Path $qaCaseRoot ('VantareSetup-'+$PID+'-1-1')
            [IO.Directory]::CreateDirectory($engine) | Out-Null
            $version=if($Operation -ceq 'Repair'){'0.0.988'}else{'0.0.989'}
            Copy-Item -LiteralPath (Join-Path $Assets ('v'+$version.Split('.')[2]+'.zip')) -Destination (Join-Path $engine 'package.zip')
            Copy-Item -LiteralPath "$env:WINDIR/System32/cmd.exe" -Destination (Join-Path $engine 'Uninstall.exe')
            [IO.File]::WriteAllText((Join-Path $engine 'installer-notices.txt'),'fixture')
            $request=Join-Path $qaCaseRoot 'request.json'
            $requestValue=@{
                root=$qaInstallRoot;qa=$false;silent=$true;uninstall=($Operation -in @('Uninstall','Cleanup'));
                operation=$(if($Operation -ceq 'Repair'){'Install'}else{$Operation});
                version=$version;mode=$(if($Operation -ceq 'Repair'){'repair'}else{'auto'});
                size=1;desktop=$true;autostart=$true;processId=2147483647;
                packageSha=(Get-NativeHash (Join-Path $engine 'package.zip'))
            }
            if(-not $WriteEngine){throw 'MATRIX_NATIVE_WRITER_REQUIRED'}
            $env:TEMP=$qaCaseRoot;$env:TMP=$qaCaseRoot
            [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
            $OutputEncoding=[Text.UTF8Encoding]::new($false)
            $contract=Join-Path $qaCaseRoot 'writer.json'
            $context=@{localAppData=$env:LOCALAPPDATA;registryPrefix=$RegistryRoot.Substring('HKEY_CURRENT_USER\'.Length);shellRoot=$qaShellRoot}
            Write-NativeJson $contract @{request=$requestValue;context=$context;payloadDirectory=$engine}
            if($Operation -ceq 'Probe'){
                $actual=& $WriteEngine $contract
                if($LASTEXITCODE){throw 'MATRIX_WRITER_PROBE_FAILED'}
                $probe=$actual|ConvertFrom-Json
                if($probe.root -cne $qaInstallRoot){throw 'MATRIX_PROBE_ROOT_CHANGED'}
                if($ReadProbe){Test-MatrixProbeRejections $qaInstallRoot $ReadProbe $probe}
                $actual
                exit 0
            }
            & $WriteEngine $contract
            exit $LASTEXITCODE
        }
        default { throw 'MATRIX_OPERATION_REJECTED' }
    }
    exit 0
} catch {
    [Console]::Error.WriteLine($_.Exception.ToString())
    if ($_.Exception.Data.Contains('InstallExitCode')) { exit ([int]$_.Exception.Data['InstallExitCode']) }
    exit 1
}
