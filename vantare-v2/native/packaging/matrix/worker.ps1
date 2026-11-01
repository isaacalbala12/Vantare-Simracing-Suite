#requires -Version 5.1
param([string]$Root,[string]$Case,[string]$Operation,[string]$Assets,[string]$RegistryRoot,[string]$ReadProbe)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'guard.ps1')
$qaCaseRoot=Assert-MatrixRoot $Root
$env:LOCALAPPDATA=Join-Path $qaCaseRoot 'LocalAppData'
$script:Packaging=Split-Path $PSScriptRoot -Parent
$qaInstallRoot=Join-Path $qaCaseRoot 'install'
$qaRequestedOperation=$Operation
# Remap the drive in THIS PROCESS before any product code is loaded.
if ($RegistryRoot -cnotmatch '^HKEY_CURRENT_USER\\Software\\VantareInstallerMatrix\\[a-f0-9]{32}\\[a-z0-9-]+$') { throw 'MATRIX_REGISTRY_REJECTED' }
Remove-PSDrive HKCU
New-PSDrive -Name HKCU -PSProvider Registry -Root $RegistryRoot -Scope Global | Out-Null
$qaImportCallerRoot=$Root
. (Join-Path $script:Packaging 'beta.ps1') -Library -Root $qaInstallRoot
$Operation=$qaRequestedOperation
if ($Root -cne $qaImportCallerRoot) { throw 'MATRIX_IMPORT_ROOT_CHANGED' }
$null=Assert-MatrixRoot $Root
. (Join-Path $PSScriptRoot 'fixtures.ps1')
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
    switch ($Operation) {
        {$_ -in @('Probe','Install','Repair','Uninstall','Cleanup')} {
            $engine=Join-Path $qaCaseRoot ('VantareSetup-'+$PID+'-1-1')
            [IO.Directory]::CreateDirectory($engine) | Out-Null
            foreach ($name in @('beta.ps1','candidate.ps1')) { Copy-Item -LiteralPath (Join-Path $script:Packaging $name) -Destination $engine }
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
            if($Operation -ceq 'Probe' -and $ReadProbe){$requestValue.readContext=$true}
            Write-NativeJson $request $requestValue
            # Inject only OS folder resolution and explicit library root in a TEST
            # copy. The driver's operations/transactions remain byte-for-byte.
            $driver=Get-Content -LiteralPath (Join-Path $script:Packaging 'installer-driver.ps1') -Raw
            $import=". (Join-Path `$PSScriptRoot 'beta.ps1') -Library -Root `$PSScriptRoot"
            if (-not $driver.Contains($import)) { throw 'MATRIX_DRIVER_IMPORT_CHANGED' }
            $injection=". (Join-Path `$PSScriptRoot 'beta.ps1') -Library -Root `$qaInstallRoot"+"`n"+'$script:MatrixNativePath=${function:Assert-NativePath}'+"`n"+${function:Get-NativeShortcutFolder}.ToString().Insert(0,'function Get-NativeShortcutFolder {')+"`n}"+
                "`n"+${function:Assert-NativePath}.ToString().Insert(0,'function Assert-NativePath {')+"`n}"
            $driver=$driver.Replace($import,$injection)
            $driverPath=Join-Path $engine 'installer-driver.ps1'
            # PS 5.1 needs the source BOM to preserve localized string literals.
            [IO.File]::WriteAllText($driverPath,$driver,[Text.UTF8Encoding]::new($true))
            # Cleanup validates this exact temporary naming convention.
            $env:TEMP=$qaCaseRoot
            [Console]::SetIn([IO.StringReader]::new("continue`n"))
            if($Operation -ceq 'Probe' -and $ReadProbe){
                # Differential oracle: legacy Probe and Rust-completed context
                # must return the same public fields on the same guarded root.
                $legacyRequest=$requestValue.Clone();$legacyRequest.Remove('readContext')
                Write-NativeJson ($request+'.legacy.json') $legacyRequest
                $expected=& $driverPath -RequestFile ($request+'.legacy.json')
                if($LASTEXITCODE){throw 'MATRIX_LEGACY_PROBE_FAILED'}
                $context=& $driverPath -RequestFile $request
                if($LASTEXITCODE){exit $LASTEXITCODE}
                $OutputEncoding=[Text.UTF8Encoding]::new($false)
                $actual=$context | & $ReadProbe
                if($LASTEXITCODE){exit $LASTEXITCODE}
                $old=$expected|ConvertFrom-Json;$new=$actual|ConvertFrom-Json
                if(@(Compare-Object @($old.PSObject.Properties.Name) @($new.PSObject.Properties.Name) -CaseSensitive).Count){throw 'MATRIX_PROBE_FIELDS_CHANGED'}
                foreach($field in $old.PSObject.Properties){
                    if($field.Value -cne $new.PSObject.Properties[$field.Name].Value){throw ('MATRIX_PROBE_VALUE_CHANGED: '+$field.Name)}
                }
                # The same root must retain interrupted-uninstall tolerance and
                # its legacy registry version display until the step 4 writer.
                $legacyRequest.uninstall=$true
                Write-NativeJson ($request+'.uninstall-legacy.json') $legacyRequest
                $uninstallExpected=& $driverPath -RequestFile ($request+'.uninstall-legacy.json')
                if($LASTEXITCODE){throw 'MATRIX_LEGACY_UNINSTALL_PROBE_FAILED'}
                $legacyRequest.readContext=$true
                Write-NativeJson ($request+'.uninstall-context.json') $legacyRequest
                $uninstallContext=& $driverPath -RequestFile ($request+'.uninstall-context.json')
                if($LASTEXITCODE){throw 'MATRIX_UNINSTALL_CONTEXT_FAILED'}
                $uninstallActual=$uninstallContext | & $ReadProbe --uninstall
                if($LASTEXITCODE){throw 'MATRIX_UNINSTALL_READ_FAILED'}
                $old=$uninstallExpected|ConvertFrom-Json;$new=$uninstallActual|ConvertFrom-Json
                foreach($field in $old.PSObject.Properties){
                    if($field.Value -cne $new.PSObject.Properties[$field.Name].Value){throw ('MATRIX_UNINSTALL_PROBE_VALUE_CHANGED: '+$field.Name)}
                }
                $actual
            }else{& $driverPath -RequestFile $request}
            exit $LASTEXITCODE
        }
        'Update' { $null=Update-NativeCandidate $qaInstallRoot (Join-Path $Assets 'v989.zip') (Get-NativeHash (Join-Path $Assets 'v989.zip')) }
        'Rollback' { $null=Restore-NativeCandidate $qaInstallRoot }
        'Check' {
            $payload=Get-Content -LiteralPath (Join-Path $Assets 'offer.json') -Raw
            $signed=Invoke-NativeProcess -Executable (Join-Path $Assets 'verifier.exe') -Arguments @('--matrix-sign') -InputText $payload
            if ($signed.ExitCode) { throw 'Fixture signing failed' }
            $local=Join-Path $qaCaseRoot 'offer.json';[IO.File]::WriteAllText($local,$signed.Stdout)
            $null=Stage-BetaUpdate $qaInstallRoot $local
        }
        'Apply' { $null=Apply-BetaUpdate $qaInstallRoot }
        {$_ -in @('Confirm','Timeout')} {
            $info=[Diagnostics.ProcessStartInfo]::new()
            $info.FileName="$env:WINDIR/System32/cmd.exe"
            $info.Arguments='/D /C exit 0'
            if ($Operation -ceq 'Timeout') {
                $info.FileName="$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe"
                $info.Arguments='-NoProfile -NonInteractive -Command "[Console]::ReadLine() | Out-Null"'
            }
            $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true
            $process=[Diagnostics.Process]::Start($info)
            try {
                if ($Operation -ceq 'Confirm') {
                    $process.WaitForExit()
                    [IO.File]::WriteAllText((Join-Path $qaInstallRoot 'hub-ready'),$process.Id.ToString())
                }
                $null=Confirm-BetaBoot $qaInstallRoot $process 0
            } finally {
                if (-not $process.HasExited) { $process.Kill();$process.WaitForExit() }
                $process.Dispose()
            }
        }
        default { throw 'MATRIX_OPERATION_REJECTED' }
    }
    exit 0
} catch {
    [Console]::Error.WriteLine($_.Exception.ToString())
    if ($_.Exception.Data.Contains('InstallExitCode')) { exit ([int]$_.Exception.Data['InstallExitCode']) }
    exit 1
}
