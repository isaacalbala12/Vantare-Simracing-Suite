#requires -Version 5.1
# TODO(#1840 p5): replace this sole Windows-finalization boundary with shell::sync.
# Input <=64 KiB: {operation,request,context,previousUi}; stdout is progress JSON,
# stderr is diagnostics; exit 0 means finalized, nonzero lets Rust restore state.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$RequestFile)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
if([IO.Path]::GetFileName($RequestFile) -cne 'shell.json'){throw 'SHELL_REQUEST_NAME'}
for($ancestor=[IO.Path]::GetFullPath($RequestFile);$ancestor;$ancestor=[IO.Path]::GetDirectoryName($ancestor)){
    if([IO.Path]::GetFileName($ancestor) -like '.env*'){throw 'SHELL_REQUEST_PATH'}
    if((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'SHELL_REQUEST_REPARSE'}
}
if((Get-Item -LiteralPath $RequestFile).Length -gt 65536){throw 'SHELL_REQUEST_SIZE'}
$inputContract=[IO.File]::ReadAllText($RequestFile)|ConvertFrom-Json
if($inputContract.operation -cnotin @('FinalizeInstall','FinalizeUninstall','Cleanup')){throw 'SHELL_OPERATION_REJECTED'}
$request=$inputContract.request
$context=$inputContract.context
if([string]::IsNullOrWhiteSpace($request.root)){throw 'NATIVE_ROOT_REQUIRED'}
if($context.registryPrefix){
    if($context.registryPrefix -cnotmatch '^Software\\VantareInstallerMatrix\\[a-f0-9]{32}(\\[A-Za-z0-9-]+)*$'){throw 'SHELL_REGISTRY_REJECTED'}
    . (Join-Path $PSScriptRoot 'qa-guard.ps1')
    foreach($path in @($request.root,$RequestFile,$context.localAppData,$context.shellRoot)){$null=Assert-MatrixRoot $path}
    Remove-PSDrive HKCU
    New-PSDrive HKCU Registry ('HKEY_CURRENT_USER\'+$context.registryPrefix) -Scope Global|Out-Null
    $env:LOCALAPPDATA=$context.localAppData
}
. (Join-Path $PSScriptRoot 'candidate.ps1') -Library -Root $request.root -Channel beta
if($context.registryPrefix){
    $script:InjectedShellRoot=$context.shellRoot
    function Get-NativeShortcutFolder([string]$Name){
        if($Name -cnotin @('Programs','Startup','DesktopDirectory')){throw 'SHELL_FOLDER_REJECTED'}
        Join-Path $script:InjectedShellRoot $Name
    }
}
function Write-Warning {
    [CmdletBinding()]
    param([Parameter(Mandatory,Position=0)][string]$Message)
    [Console]::Error.WriteLine($Message)
}
function Write-NativeShortcutWarning([string]$Message){[Console]::Error.WriteLine($Message)}
function Send-InstallerProgress([string]$Step,[int]$Percent){
    [Console]::WriteLine((@{step=$Step;percent=$Percent;done=0;total=0;can_cancel=$false}|ConvertTo-Json -Compress))
}
$root=Assert-NativePath $request.root
$identity='VantareNativeBeta';$folder='Vantare';$legacy='Vantare Native Beta'
if($request.qa){
    $identity=$request.qaIdentity;$folder=$request.qaShortcutFolder;$legacy=$request.qaLegacyShortcutFolder
    if($identity -ieq 'VantareNativeBeta' -or $folder -iin @('Vantare','Vantare Native Beta') -or $legacy -iin @('Vantare','Vantare Native Beta')){throw 'SHELL_QA_IDENTITY_REJECTED'}
}
if($identity -cnotmatch '^[A-Za-z0-9]{1,64}$'){throw 'Identidad de registro inválida.'}
foreach($name in @($folder,$legacy)){if($name -cnotmatch '^[A-Za-z0-9][A-Za-z0-9 -]{0,63}$'){throw 'Carpeta de accesos inválida.'}}
if($folder -ieq $legacy){throw 'Carpetas repetidas.'}
$key="HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/$identity"
$registration=Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
$options=$inputContract.previousUi
$optionsFile=Join-Path $root 'installer-ui.json'
switch($inputContract.operation){
    'FinalizeInstall' {
        Send-InstallerProgress 'shortcuts' 84
        $registrationLock=Open-NativeLock $root
        try{
            Invoke-NativeRegistrationTransaction $key $folder $legacy {
                if($request.qa){[IO.File]::WriteAllText((Join-Path $root 'registration-identity.txt'),$identity)}
                New-Item -Path $key -Force|Out-Null
                foreach($item in @{DisplayName='Vantare Simracing Suite';DisplayVersion=$request.version;InstallLocation=$root;UninstallString=('"'+(Join-Path $root 'Uninstall.exe')+'"')}.GetEnumerator()){Set-ItemProperty -LiteralPath $key -Name $item.Key -Value $item.Value}
                foreach($name in @('NoModify','NoRepair')){New-ItemProperty -LiteralPath $key -Name $name -PropertyType DWord -Value 1 -Force|Out-Null}
                if($request.qa){Set-ItemProperty -LiteralPath $key -Name ShortcutFolder -Value $folder;Set-ItemProperty -LiteralPath $key -Name LegacyShortcutFolder -Value $legacy}
                $previousPreference=if($null -ne $options){[bool]$options.autostart}else{Read-NativeStartupPreference $root}
                $legacyRun=Get-NativeLegacyRun $root $identity
                $installAutostart=[bool]$request.autostart
                if($null -ne $legacyRun){$installAutostart=if($null -ne $previousPreference){[bool]$previousPreference}else{$true}}
                Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Uninstall.exe') -Destination (Join-Path $root 'Uninstall.exe') -Force
                Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'installer-notices.txt') -Destination (Join-Path $root 'installer-notices.txt') -Force
                $temporary=Join-Path $root ('beta-'+[guid]::NewGuid().ToString('N')+'.tmp')
                Write-NativeJson $temporary @{schema=1;kind='rust-gpui';uninstaller='Uninstall.exe';sha256=(Get-NativeHash (Join-Path $root 'Uninstall.exe'));desktop=[bool]$request.desktop;autostart=$installAutostart}
                try{if(Test-Path -LiteralPath $optionsFile){[IO.File]::Replace($temporary,$optionsFile,[System.Management.Automation.Language.NullString]::Value)}else{[IO.File]::Move($temporary,$optionsFile)}}finally{if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary}}
                Send-InstallerProgress 'register' 93
                Sync-NativeRegistration $root $request.version $options -LockHeld
            }
        }finally{$registrationLock.Dispose()}
    }
    'FinalizeUninstall' {
        # Rust has already removed state/program members. Never fall through to
        # candidate's legacy branch that would invoke Uninstall-Beta again.
        if(Test-Path -LiteralPath (Join-Path $root 'state.json')){throw 'SHELL_STATE_STILL_ACTIVE'}
        Send-InstallerProgress 'shortcuts' 72
        Uninstall-NativeRegistration $root $true $identity $folder
        Send-InstallerProgress 'register' 88
    }
    'Cleanup' {
        # TODO(#1840 p5): deferred self-removal is the third allowed shell call.
        try{$parent=[Diagnostics.Process]::GetProcessById([int]$request.processId)}catch [ArgumentException]{$parent=$null}
        if($null -ne $parent){try{if(-not $parent.WaitForExit(30000)){throw 'El desinstalador no terminó; limpieza conservada.'}}finally{$parent.Dispose()}}
        $root=Assert-NativePath $root
        $session=[IO.File]::Open((Join-Path $root 'beta-session.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
        try{
            if((Test-Path -LiteralPath (Join-Path $root 'state.json')) -or (Test-Path -LiteralPath $key)){throw 'La instalación se ha renovado; se conserva el desinstalador.'}
            $marker=Join-Path $root 'installer-cleanup.json'
            if((Get-Item -LiteralPath $marker).Length -gt 1024){throw 'Marker de limpieza inválido.'}
            $cleanup=[IO.File]::ReadAllText($marker)|ConvertFrom-Json
            if($cleanup.schema -ne 1 -or $cleanup.sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Marker de limpieza inválido.'}
            $exe=Join-Path $root 'Uninstall.exe'
            if(Test-Path -LiteralPath $exe){if((Get-NativeHash $exe) -cne $cleanup.sha256){throw 'El desinstalador cambió; se conserva.'};Remove-Item -LiteralPath $exe}
            Remove-Item -LiteralPath $marker
            $temporary=Assert-NativePath $PSScriptRoot
            $tempPrefix=[IO.Path]::GetFullPath($env:TEMP)+[IO.Path]::DirectorySeparatorChar
            if(-not $temporary.StartsWith($tempPrefix,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($temporary) -cnotmatch '^VantareSetup-[0-9]+-[0-9]+-[0-9]+$'){throw 'Limpieza temporal fuera de su raíz.'}
            Assert-NativeTree $temporary
            Remove-Item -LiteralPath $temporary -Recurse -Force
        }finally{$session.Dispose()}
    }
}
