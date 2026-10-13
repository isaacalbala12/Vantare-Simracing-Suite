#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][string]$RequestFile)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'beta.ps1')
if ((Get-Item -LiteralPath $RequestFile).Length -gt 65536) { throw 'Petición demasiado grande.' }
$request = [IO.File]::ReadAllText((Assert-NativePath $RequestFile)) | ConvertFrom-Json
$identity = if ($request.qa) { 'VantareNativeBetaQA1492' } else { 'VantareNativeBeta' }
$folder = if ($request.qa) { 'Vantare QA1492' } else { 'Vantare' }
$legacy = if ($request.qa) { 'Vantare Native Beta QA1492' } else { 'Vantare Native Beta' }
$key = "HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/$identity"
$registration = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
$root = $request.root
if($request.uninstall -and $null -ne $registration -and $root -and
   (Assert-NativePath $root) -ne (Assert-NativePath $registration.InstallLocation)){throw 'El desinstalador no pertenece a esta instalación.'}
if ($request.qa -and -not $root) { throw 'QA necesita /D=<raíz aislada>.' }
if (-not $root) { $root = Join-Path $env:LOCALAPPDATA 'Programs/Vantare' }
if ($null -ne $registration) { $root = $registration.InstallLocation }
elseif (-not $request.qa -and -not $request.uninstall) {
    $old = Join-Path $env:LOCALAPPDATA 'Programs/Vantare Native Beta'
    if ((Test-Path -LiteralPath (Join-Path $old 'state.json')) -or (Test-Path -LiteralPath (Join-Path $old 'retained-data.json'))) { $root = $old }
}
$root = Assert-NativePath $root
if ($request.qa) {
    $prefix = [IO.Path]::GetFullPath('C:/tmp/ola2/1591-qa/')
    if (-not $root.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'QA fuera de su raíz aislada.' }
}
if (Test-Path -LiteralPath $root) { Assert-NativeTree $root }
$current = $null
$data = Join-Path $root 'generations'
if (Test-Path -LiteralPath (Join-Path $root 'state.json')) {
    if($request.uninstall){
        # Uninstall may already have removed manifest/bin members before interruption.
        $state=[IO.File]::ReadAllText((Join-Path $root 'state.json'))|ConvertFrom-Json
        if($state.schema -ne 1 -or $state.product -cne 'vantare-native' -or $state.channel -cne 'beta' -or $state.active.generation -cnotmatch '^[a-f0-9]{32}$'){throw 'Estado de desinstalación inválido.'}
        if($null -ne $registration){$current=[string]$registration.DisplayVersion}
    } else {
        $state = Read-NativeState $root $false
        $manifest = Read-NativeManifest (Join-Path $root "generations/$($state.active.generation)") 'beta' $false
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
$optionsFile = Join-Path $root 'installer-ui.json'
if (Test-Path -LiteralPath $optionsFile) {
    $options = Read-NativeInstallerUi $root
    $desktop = [bool]$options.desktop; $autostart = [bool]$options.autostart
}
if ($request.operation -ceq 'Probe') {
    [ordered]@{ root=$root; version=$request.version; installed_version=$current; data_path=$data; desktop=$desktop; autostart=$autostart; size=$request.size } | ConvertTo-Json -Compress
    exit 0
}
function Send-InstallerProgress([string]$Step, [int]$Percent, [long]$Done=0, [long]$Total=0) {
    [Console]::WriteLine(([ordered]@{step=$Step; percent=$Percent; done=$Done; total=$Total; can_cancel=$false} | ConvertTo-Json -Compress))
}
function Write-NativeProgress([string]$Step,[int]$Percent){Send-InstallerProgress $Step $Percent}
try {
    Send-InstallerProgress 'prepare' 0
    switch ($request.operation) {
        'Install' {
            if(Test-Path -LiteralPath (Join-Path $root 'installer-cleanup.json')){Throw-BetaInstallError 2 'Espera a que termine la limpieza del desinstalador anterior.'}
            if ($request.mode -ceq 'repair' -and $current -cne $request.version) { Throw-BetaInstallError 3 'Reparar exige el Setup de la misma versión.' }
            Send-InstallerProgress 'verify' 40
            Install-Beta $root (Join-Path $PSScriptRoot 'package.zip') $request.packageSha | Out-Null
            Send-InstallerProgress 'shortcuts' 84
            if ($request.qa) { [IO.File]::WriteAllText((Join-Path $root 'registration-identity.txt'), $identity) }
            New-Item -Path $key -Force | Out-Null
            foreach ($item in @{DisplayName='Vantare'; DisplayVersion=$request.version; InstallLocation=$root; UninstallString=('"'+(Join-Path $root 'Uninstall.exe')+'"')}.GetEnumerator()) { Set-ItemProperty -LiteralPath $key -Name $item.Key -Value $item.Value }
            foreach ($name in @('NoModify','NoRepair')) { New-ItemProperty -LiteralPath $key -Name $name -PropertyType DWord -Value 1 -Force | Out-Null }
            if ($request.qa) { Set-ItemProperty -LiteralPath $key -Name ShortcutFolder -Value $folder; Set-ItemProperty -LiteralPath $key -Name LegacyShortcutFolder -Value $legacy }
            Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Uninstall.exe') -Destination (Join-Path $root 'Uninstall.exe') -Force
            Write-BetaJson $optionsFile @{schema=1; kind='rust-gpui'; uninstaller='Uninstall.exe'; sha256=(Get-NativeHash (Join-Path $root 'Uninstall.exe')); desktop=[bool]$request.desktop; autostart=[bool]$request.autostart}
            Send-InstallerProgress 'register' 93
            Sync-NativeRegistration $root $request.version
        }
        'Uninstall' {
            if($null -eq $registration){
                if(-not (Test-Path -LiteralPath (Join-Path $root 'installer-cleanup.json'))){throw 'La instalación no está registrada.'}
            } else {
                Send-InstallerProgress 'copy' 12
                Uninstall-Beta $root | Out-Null
                Send-InstallerProgress 'shortcuts' 72
                Uninstall-NativeRegistration $root $true
                Send-InstallerProgress 'register' 88
            }
        }
        'Cleanup' {
            try{$parent=[Diagnostics.Process]::GetProcessById([int]$request.processId)}catch [ArgumentException]{$parent=$null}
            if($null -ne $parent){try{if(-not $parent.WaitForExit(30000)){throw 'El desinstalador no terminó; limpieza conservada.'}}finally{$parent.Dispose()}}
            $root=Assert-NativePath $root
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
