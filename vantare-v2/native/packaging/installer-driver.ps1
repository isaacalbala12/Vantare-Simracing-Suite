#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][string]$RequestFile)
if ($MyInvocation.InvocationName -eq '.') { throw 'INSTALLER_DRIVER_NOT_A_LIBRARY' }
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'beta.ps1') -Library -Root $PSScriptRoot
# stdout is exclusively the bounded JSON progress protocol; warnings go to log.
function Write-NativeShortcutWarning([string]$Message) { [Console]::Error.WriteLine($Message) }
if ((Get-Item -LiteralPath $RequestFile).Length -gt 65536) { throw 'Petición demasiado grande.' }
$request = [IO.File]::ReadAllText((Assert-NativePath $RequestFile)) | ConvertFrom-Json
$identity = 'VantareNativeBeta'
$folder = 'Vantare'
$legacy = 'Vantare Native Beta'
$qaProperty=$request.PSObject.Properties['qa']
if ($null -eq $qaProperty -or $qaProperty.Value -isnot [bool]) { throw 'Flag QA inválido.' }
$explicitRoot = -not [string]::IsNullOrWhiteSpace([string]$request.root)
# Probe discovers the user's installation. Every mutating request must carry
# the root returned by that probe; library import never selects an installation.
if ($request.operation -cne 'Probe' -and -not $explicitRoot) { throw 'NATIVE_ROOT_REQUIRED' }
if ($request.qa) {
    foreach ($field in @('qaIdentity','qaShortcutFolder','qaLegacyShortcutFolder','qaPrefix')) {
        $property=$request.PSObject.Properties[$field]
        if ($null -eq $property -or $property.Value -isnot [string] -or [string]::IsNullOrWhiteSpace($property.Value)) { throw 'Petición QA incompleta.' }
    }
    $identity=$request.qaIdentity;$folder=$request.qaShortcutFolder;$legacy=$request.qaLegacyShortcutFolder
    if ($identity -cnotmatch '^[A-Za-z0-9]{1,64}$' -or $identity -ieq 'VantareNativeBeta') { throw 'Identidad QA inválida.' }
    foreach ($name in @($folder,$legacy)) {
        if ($name -cnotmatch '^[A-Za-z0-9][A-Za-z0-9 -]{0,63}$' -or $name -iin @('Vantare','Vantare Native Beta')) { throw 'Carpeta QA inválida.' }
    }
    if ($folder -ieq $legacy) { throw 'Carpetas QA repetidas.' }
    if ($request.qaPrefix -cnotmatch '^[A-Za-z]:[\\/]' -or $request.qaPrefix -match '(^|[\\/])\.\.([\\/]|$)') { throw 'Prefijo QA inválido.' }
    $prefix=(Assert-NativePath $request.qaPrefix).TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
    if (-not $explicitRoot) { throw 'QA necesita /D=<raíz aislada>.' }
}
$key = "HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/$identity"
$registration = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
$root = $request.root
if($request.uninstall -and $null -ne $registration -and $root -and
   (Assert-NativePath $root) -ne (Assert-NativePath $registration.InstallLocation)){throw 'El desinstalador no pertenece a esta instalación.'}
if ($request.qa -and -not $root) { throw 'QA necesita /D=<raíz aislada>.' }
if (-not $root) { $root = Join-Path $env:LOCALAPPDATA 'Programs/Vantare' }
if ($null -ne $registration) { $root = $registration.InstallLocation }
elseif (-not $explicitRoot -and -not $request.qa -and -not $request.uninstall) {
    $old = Join-Path $env:LOCALAPPDATA 'Programs/Vantare Native Beta'
    if ((Test-Path -LiteralPath (Join-Path $old 'state.json')) -or (Test-Path -LiteralPath (Join-Path $old 'retained-data.json'))) { $root = $old }
}
$root = Assert-NativePath $root
if ($request.qa) {
    if (-not $root.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'QA fuera de su raíz aislada.' }
    foreach ($realRoot in @((Join-Path $env:LOCALAPPDATA 'Programs/Vantare'),(Join-Path $env:LOCALAPPDATA 'Programs/Vantare Native Beta'))) {
        $realRoot=[IO.Path]::GetFullPath($realRoot).TrimEnd('\','/')
        if ($root -ieq $realRoot -or $root.StartsWith($realRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or $realRoot.StartsWith($root.TrimEnd('\','/')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'QA no puede usar la instalación del usuario.' }
    }
}
if (Test-Path -LiteralPath $root) { Assert-NativeTree $root }
$current = $null
$data = Join-Path $root 'generations'
# Step 3: Rust Probe owns state/manifest reads. Legacy operations and callers
# retain this adapter until Setup/Uninstall migrate to Rust in step 4.
$readContextProperty=$request.PSObject.Properties['readContext']
$rustRead=$request.operation -ceq 'Probe' -and $null -ne $readContextProperty -and $readContextProperty.Value -ceq $true
if ($rustRead) {
    if($request.uninstall -and $null -ne $registration){$current=[string]$registration.DisplayVersion}
} elseif (Test-Path -LiteralPath (Join-Path $root 'state.json')) {
    if($request.uninstall){
        # Uninstall may already have removed manifest/bin members before interruption.
        $state=[IO.File]::ReadAllText((Join-Path $root 'state.json'))|ConvertFrom-Json
        if($state.schema -ne 1 -or $state.product -cne 'vantare-native' -or $state.channel -cne 'beta' -or $state.active.generation -cnotmatch '^[a-f0-9]{32}$'){throw 'Estado de desinstalación inválido.'}
        if($null -ne $registration){$current=[string]$registration.DisplayVersion}
    } else {
        $state = Read-NativeState $root $false
        $manifest = Read-NativeManifest (Join-Path $root "generations/$($state.active.generation)") 'beta' $false -Installed
        $current = [string]$manifest.version
    }
    $data = Join-Path $root "generations/$($state.active.generation)/data"
} elseif (Test-Path -LiteralPath (Join-Path $root 'retained-data.json')) {
    $retained = [IO.File]::ReadAllText((Join-Path $root 'retained-data.json')) | ConvertFrom-Json
    if ($retained.schema -ne 1 -or $retained.generation -cnotmatch '^[a-f0-9]{32}$') { throw 'Referencia de datos conservados inválida.' }
    $data = Join-Path $root "generations/$($retained.generation)/data"
}
$desktop = -not [bool]$request.silent
$autostart = $false
$options = $null
$optionsFile = Join-Path $root 'installer-ui.json'
if (Test-Path -LiteralPath $optionsFile) {
    # Setup reads validated preferences, then restores its embedded uninstaller.
    # Executing/removing an installed uninstaller retains the strict PE/hash check.
    $options = Read-NativeInstallerUi $root ([bool]$request.uninstall)
    $desktop = [bool]$options.desktop; $autostart = [bool]$options.autostart
}
if($null -eq $options){$startupPreference=Read-NativeStartupPreference $root;if($null -ne $startupPreference){$autostart=[bool]$startupPreference}}
if ($request.operation -ceq 'Probe') {
    $motion=Get-ItemProperty -LiteralPath 'HKCU:/Control Panel/Desktop/WindowMetrics' -Name MinAnimate -ErrorAction SilentlyContinue
    [ordered]@{ root=$root; version=$request.version; installed_version=$current; data_path=$data; desktop=$desktop; autostart=$autostart; size=$request.size; reduced_motion=($null -ne $motion -and $motion.MinAnimate -ceq '0') } | ConvertTo-Json -Compress
    exit 0
}
function Send-InstallerProgress([string]$Step, [int]$Percent, [long]$Done=0, [long]$Total=0,[bool]$CanCancel=$false) {
    [Console]::WriteLine(([ordered]@{step=$Step; percent=$Percent; done=$Done; total=$Total; can_cancel=$CanCancel} | ConvertTo-Json -Compress))
}
function Write-NativeProgress([string]$Step,[int]$Percent){
    if($Step -ceq 'copy'){
        # Ack del worker antes de escribir el marcador/activar/copiar. Permite
        # cancelar durante la verificación sin matar el host ni la aplicación.
        Send-InstallerProgress $Step $Percent 0 0 $true
        $decision=[Console]::ReadLine()
        if($decision -cne 'continue'){Throw-BetaInstallError 5 'Instalación cancelada antes de copiar.'}
    }
    Send-InstallerProgress $Step $Percent
}
try {
    Send-InstallerProgress 'prepare' 0 0 0 ($request.operation -ceq 'Install')
    switch ($request.operation) {
        'Install' {
            if ($request.mode -ceq 'repair' -and $current -cne $request.version) { Throw-BetaInstallError 3 'Reparar exige el Setup de la misma versión.' }
            Send-InstallerProgress 'verify' 40 0 0 $true
            Install-Beta $root (Join-Path $PSScriptRoot 'package.zip') $request.packageSha -Prepare {
                $marker=Join-Path $root 'installer-cleanup.json'
                if(Test-Path -LiteralPath $marker){
                    # Cleanup can stop after deleting EXE but before deleting marker.
                    # Recover only that orphan, never a pending/renewed installation.
                    if((Test-Path -LiteralPath (Join-Path $root 'Uninstall.exe')) -or
                       (Test-Path -LiteralPath (Join-Path $root 'state.json')) -or (Test-Path -LiteralPath $key)){Throw-BetaInstallError 2 'Espera a que termine la limpieza del desinstalador anterior.'}
                    $null=Open-NativeRoot $root
                    $identityFile=Join-Path $root 'registration-identity.txt'
                    if((Test-Path -LiteralPath $identityFile) -and [IO.File]::ReadAllText($identityFile).Trim() -cne $identity){throw 'La identidad de desinstalación no coincide.'}
                    if((Get-Item -LiteralPath $marker).Length -gt 1024){throw 'Marker de limpieza inválido.'}
                    $cleanup=[IO.File]::ReadAllText($marker)|ConvertFrom-Json
                    if($cleanup.schema -ne 1 -or $cleanup.sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Marker de limpieza inválido.'}
                    Remove-Item -LiteralPath $marker
                }
            } -Finalize {
                Send-InstallerProgress 'shortcuts' 84
                $registrationLock=Open-NativeLock $root
                try{
                Invoke-NativeRegistrationTransaction $key $folder $legacy {
                    if ($request.qa) { [IO.File]::WriteAllText((Join-Path $root 'registration-identity.txt'), $identity) }
                    New-Item -Path $key -Force | Out-Null
                    foreach ($item in @{DisplayName='Vantare Simracing Suite'; DisplayVersion=$request.version; InstallLocation=$root; UninstallString=('"'+(Join-Path $root 'Uninstall.exe')+'"')}.GetEnumerator()) { Set-ItemProperty -LiteralPath $key -Name $item.Key -Value $item.Value }
                    foreach ($name in @('NoModify','NoRepair')) { New-ItemProperty -LiteralPath $key -Name $name -PropertyType DWord -Value 1 -Force | Out-Null }
                    if ($request.qa) { Set-ItemProperty -LiteralPath $key -Name ShortcutFolder -Value $folder; Set-ItemProperty -LiteralPath $key -Name LegacyShortcutFolder -Value $legacy }
                    $previousPreference=if($null -ne $options){[bool]$options.autostart}else{Read-NativeStartupPreference $root}
                    $legacyRun=Get-NativeLegacyRun $root $identity
                    $installAutostart=[bool]$request.autostart
                    if($null -ne $legacyRun){$installAutostart=if($null -ne $previousPreference){[bool]$previousPreference}else{$true}}
                    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Uninstall.exe') -Destination (Join-Path $root 'Uninstall.exe') -Force
                    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'installer-notices.txt') -Destination (Join-Path $root 'installer-notices.txt') -Force
                    Write-BetaJson $optionsFile @{schema=1; kind='rust-gpui'; uninstaller='Uninstall.exe'; sha256=(Get-NativeHash (Join-Path $root 'Uninstall.exe')); desktop=[bool]$request.desktop; autostart=$installAutostart}
                    Send-InstallerProgress 'register' 93
                    Sync-NativeRegistration $root $request.version $options -LockHeld
                }
                }finally{$registrationLock.Dispose()}
            } | Out-Null
        }
        'Uninstall' {
            if($null -eq $registration){
                if(-not (Test-Path -LiteralPath (Join-Path $root 'installer-cleanup.json'))){throw 'La instalación no está registrada.'}
            }
            Send-InstallerProgress 'copy' 12
            Uninstall-Beta $root -Finalize {
                Send-InstallerProgress 'shortcuts' 72
                Uninstall-NativeRegistration $root $true $identity $folder
            } | Out-Null
            Send-InstallerProgress 'register' 88
        }
        'Cleanup' {
            try{$parent=[Diagnostics.Process]::GetProcessById([int]$request.processId)}catch [ArgumentException]{$parent=$null}
            if($null -ne $parent){try{if(-not $parent.WaitForExit(30000)){throw 'El desinstalador no terminó; limpieza conservada.'}}finally{$parent.Dispose()}}
            $root=Assert-NativePath $root
            $session=[IO.File]::Open((Join-Path $root 'beta-session.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
            try {
                if((Test-Path -LiteralPath (Join-Path $root 'state.json')) -or (Test-Path -LiteralPath $key)){throw 'La instalación se ha renovado; se conserva el desinstalador.'}
                $marker=Join-Path $root 'installer-cleanup.json'
                if((Get-Item -LiteralPath $marker).Length -gt 1024){throw 'Marker de limpieza inválido.'}
                $cleanup=[IO.File]::ReadAllText($marker)|ConvertFrom-Json
                if($cleanup.schema -ne 1 -or $cleanup.sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Marker de limpieza inválido.'}
                $exe=Join-Path $root 'Uninstall.exe'
                if(Test-Path -LiteralPath $exe){if((Get-NativeHash $exe) -cne $cleanup.sha256){throw 'El desinstalador cambió; se conserva.'}; Remove-Item -LiteralPath $exe}
                Remove-Item -LiteralPath $marker
                $temporary=Assert-NativePath $PSScriptRoot
                $tempPrefix=[IO.Path]::GetFullPath($env:TEMP)+[IO.Path]::DirectorySeparatorChar
                if(-not $temporary.StartsWith($tempPrefix,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($temporary) -cnotmatch '^VantareSetup-[0-9]+-[0-9]+-[0-9]+$'){throw 'Limpieza temporal fuera de su raíz.'}
                Assert-NativeTree $temporary
                Remove-Item -LiteralPath $temporary -Recurse -Force
            } finally {$session.Dispose()}
        }
        default { throw 'Operación del instalador no permitida.' }
    }
    Send-InstallerProgress 'done' 100
    exit 0
} catch {
    Write-Error $_ -ErrorAction Continue
    if ($_.Exception.Data.Contains('InstallExitCode')) { exit ([int]$_.Exception.Data['InstallExitCode']) }
    exit 1
}
