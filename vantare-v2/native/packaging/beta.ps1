# vantare-uninstall-capabilities: defer-run-v1
#requires -Version 5.1
[CmdletBinding()]
param(
    [Alias('Operation')][ValidateSet('Install', 'Uninstall')][string]$BetaCommand = 'Install',
    [Alias('Root')][string]$BetaRoot,
    [Alias('Archive')][string]$BetaArchive,
    [Alias('ExpectedSha256')][string]$BetaPackageHash,
    [Alias('LocalManifest')][string]$BetaManifestFile,
    [Alias('NoLaunch')][switch]$BetaNoLaunch,
    [Alias('Library')][switch]$BetaLibrary,
    [Alias('KeepLegacyRun')][switch]$BetaKeepLegacyRun
)
if ([string]::IsNullOrWhiteSpace($BetaRoot)) { throw 'NATIVE_ROOT_REQUIRED' }
if ($MyInvocation.InvocationName -eq '.' -and -not $BetaLibrary) { throw 'NATIVE_LIBRARY_MODE_REQUIRED' }
if ($BetaLibrary -and $MyInvocation.InvocationName -ne '.') { throw 'NATIVE_LIBRARY_REQUIRES_DOT_SOURCE' }
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'candidate.ps1') -Library -Root $BetaRoot -Channel beta
# #1565: repo publico de descargas; cero releases hasta version integrada/verificada.
$script:BetaRepository = 'isaacalbala12/Vantare-Downloads'

function Read-BetaVersion([string]$Value) {
    if ($Value -cnotmatch '^(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})$') { throw 'Versión beta inválida: use major.minor.patch.' }
    $parts = @($Value.Split('.') | ForEach-Object { [int]$_ })
    if (@($parts | Where-Object { $_ -gt 65535 }).Count) { throw 'Versión fuera de rango.' }
    [version]$Value
}

function Invoke-BetaManifestTool([string]$Executable, [string]$Json, [string]$KeyFile = '') {
    if (-not $Executable -or -not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw 'Falta el verificador de la instalación beta.' }
    $arguments = @('--verify-update')
    if ($KeyFile) {
        $keyPath = [IO.Path]::GetFullPath($KeyFile)
        if ($keyPath.Contains('"')) { throw 'Ruta de clave inválida.' }
        $arguments = @('--sign-update', $keyPath)
    }
    $result=Invoke-NativeProcess -Executable $Executable -Arguments $arguments -InputText $Json
    if ($result.ExitCode -ne 0) { throw 'Manifiesto rechazado: firma inválida o clave pública sin configurar.' }
    $result.Stdout
}

function Assert-BetaPackageUrl([string]$Value, [string]$Version, [bool]$Local = $false) {
    $null = Read-BetaVersion $Version
    $url = [uri]$Value
    $expected = "https://github.com/$script:BetaRepository/releases/download/native-beta-v$Version/vantare-native-amd64-package.zip"
    if ($Value -cne $expected -and -not ($Local -and $url.IsFile)) { throw 'URL de paquete fuera de la release beta declarada.' }
}

function Read-BetaManifest([string]$Json, [bool]$Local = $false, [string]$Verifier = '') {
    if ($Json.Length -gt 65536) { throw 'Manifiesto remoto demasiado grande.' }
    $Json = Invoke-BetaManifestTool $Verifier $Json
    $manifest = $Json | ConvertFrom-Json
    $fields = @('schema', 'product', 'channel', 'version', 'url', 'sha256', 'notes')
    if (@(Compare-Object $fields @($manifest.PSObject.Properties.Name) -CaseSensitive).Count) { throw 'Campos del manifiesto incompatibles.' }
    foreach ($field in @('product', 'channel', 'version', 'url', 'sha256', 'notes')) {
        if ($manifest.$field -isnot [string]) { throw "Campo no textual: $field" }
    }
    if (($manifest.schema -isnot [int] -and $manifest.schema -isnot [long]) -or $manifest.schema -ne 1 -or $manifest.product -cne 'vantare-native' -or $manifest.channel -cne 'beta' -or
        $manifest.sha256 -cnotmatch '^[a-f0-9]{64}$' -or [Text.Encoding]::UTF8.GetByteCount($manifest.notes) -gt 8192) { throw 'Manifiesto beta inválido.' }
    $null = Read-BetaVersion $manifest.version
    Assert-BetaPackageUrl $manifest.url $manifest.version $Local
    $manifest
}

function Write-BetaJson([string]$Path, $Value) {
    $temp = Join-Path ([IO.Path]::GetDirectoryName($Path)) ('beta-' + [guid]::NewGuid().ToString('N') + '.tmp')
    Write-NativeJson $temp $Value
    try {
        if (Test-Path -LiteralPath $Path) { [IO.File]::Replace($temp, $Path, [System.Management.Automation.Language.NullString]::Value) }
        else { [IO.File]::Move($temp, $Path) }
    } finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp } }
}

function Set-BetaStatus([string]$Directory, [string]$State, [string]$Message, [string]$Version = '', [string]$Notes = '') {
    Write-BetaJson (Join-Path $Directory 'update-status.json') ([ordered]@{ schema = 1; state = $State; message = $Message; version = $Version; notes = $Notes })
}

function Throw-BetaInstallError([int]$Code, [string]$Message) {
    $exception = [InvalidOperationException]::new($Message)
    $exception.Data['InstallExitCode'] = $Code
    throw $exception
}

# Setup y el feed comparten activación, confirmación y rollback.
function Activate-BetaPackage([string]$Directory, [string]$Zip, [string]$Hash, [string]$Version, [string]$Notes = '', [bool]$Repair = $false) {
    $state = Read-NativeState $Directory (-not $Repair)
    $marker = Join-Path $Directory 'boot-pending.json'
    if (Test-Path -LiteralPath $marker) { Throw-BetaInstallError 4 'Abre Vantare y ciérralo antes de volver a instalar; hay un arranque pendiente de comprobar.' }
    $previous = $state.active.generation
    if ($Repair) {
        try { $null = Read-NativeState $Directory }
        catch { $previous = if ($null -ne $state.previous) { $state.previous.generation } else { '' } }
    }
    Write-BetaJson $marker @{ schema = 1; previous = $previous; version = $Version }
    try { $null = Update-NativeCandidate $Directory $Zip $Hash $Repair }
    catch {
        if ((Read-NativeState $Directory (-not $Repair)).active.generation -ceq $state.active.generation) { Remove-Item -LiteralPath $marker }
        throw
    }
    Set-BetaStatus $Directory 'applied' 'Instalación aplicada; comprobando el arranque' $Version $Notes
}

function Install-Beta([string]$Directory, [string]$Zip, [string]$Hash, [scriptblock]$Finalize=$null, [scriptblock]$Prepare=$null) {
    $directory = Open-NativeRoot $Directory -Initialize
    try { $session = [IO.File]::Open((Join-Path $directory 'beta-session.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
    catch { Throw-BetaInstallError 2 'Cierra Vantare para continuar. Si estás en carrera, espera a terminar.' }
    try {
        # Setup finalizes registration under the same session lock as activation.
        # Keep exact metadata/bootstrap bytes; existing generations/data are immutable.
        $before=@{}; $beforeHash=@{}; $generations=@()
        if($null -ne $Prepare){& $Prepare}
        $metadata=@('state.json','candidate.ps1','beta.ps1','retained-data.json','boot-pending.json','update-status.json','registration-identity.txt','Uninstall.exe','uninstall-vantare.ps1','installer-ui.json','installer-notices.txt')
        if($null -ne $Finalize){
            foreach($file in Get-ChildItem -LiteralPath $directory -File -Force){
                if($file.Name -in $metadata){$before[$file.Name]=[IO.File]::ReadAllBytes($file.FullName);$beforeHash[$file.Name]=Get-NativeHash $file.FullName}
            }
            $generations=@()
            if(Test-Path -LiteralPath (Join-Path $directory 'generations')){
                $generations=@(Get-ChildItem -LiteralPath (Join-Path $directory 'generations') -Directory -ErrorAction Stop|ForEach-Object Name)
            }
        }
        try {
            # Validar el paquete completo antes de seleccionar datos o cambiar el estado.
            $probe = Join-Path $directory ('staging/setup-' + [guid]::NewGuid().ToString('N'))
            try { $incoming = Expand-NativePackage $Zip $Hash $probe 'beta' }
            finally { if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe -Recurse -Force } }
            $version = Read-BetaVersion $incoming.version
            $retained = Join-Path $directory 'retained-data.json'
            if (Test-Path -LiteralPath (Join-Path $directory 'state.json')) {
                $state = Read-NativeState $directory $false
                $current = Read-NativeManifest (Join-Path $directory "generations/$($state.active.generation)") 'beta' $false -Installed
                if ($version -lt (Read-BetaVersion $current.version)) { Throw-BetaInstallError 3 'Ya tienes una versión más reciente de Vantare. Este instalador es anterior; descarga el más reciente.' }
                Write-NativeProgress 'copy' 54
                Activate-BetaPackage $directory $Zip $Hash $incoming.version '' ($version -eq (Read-BetaVersion $current.version))
            } else {
                $source = ''
                if (Test-Path -LiteralPath $retained) {
                    $saved = [IO.File]::ReadAllText($retained) | ConvertFrom-Json
                    if ($saved.schema -ne 1 -or $saved.generation -cnotmatch '^[a-f0-9]{32}$') { throw 'No se reconoce la referencia a tus datos conservados; no se han modificado.' }
                    if ($version -lt (Read-BetaVersion $saved.version)) { Throw-BetaInstallError 3 'Tus datos pertenecen a una versión más reciente. Descarga el instalador más reciente.' }
                    $source = Join-Path $directory "generations/$($saved.generation)/data"
                    if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw 'No se encuentran tus datos conservados; no se han modificado.' }
                } elseif (Test-Path -LiteralPath (Join-Path $directory 'generations')) {
                    # Desinstaladores anteriores no guardaban la referencia activa.
                    # Una sola carpeta con datos es inequívoca; nunca elegir entre perfiles diferentes.
                    $sources = @(Get-ChildItem -LiteralPath (Join-Path $directory 'generations') -Directory | Where-Object {
                        $_.Name -cmatch '^[a-f0-9]{32}$' -and (Test-Path -LiteralPath (Join-Path $_.FullName 'data') -PathType Container)
                    })
                    if ($sources.Count) {
                        $source = Join-Path $sources[0].FullName 'data'
                        $index = Get-NativeDataIndex $source
                        foreach ($other in $sources) {
                            if ((Get-NativeDataIndex (Join-Path $other.FullName 'data')) -cne $index) { throw 'Hay varias copias antiguas diferentes de tus datos y no se puede identificar la activa. Se conservan todas; necesitas recuperar la instalación anterior.' }
                        }
                    }
                }
                $handles = @{}
                try {
                    if (Test-Path -LiteralPath (Join-Path $directory 'generations')) { $handles = Open-NativeBinaryGuard $directory }
                    Write-NativeProgress 'copy' 54
                    $null = Install-NativeCandidate $directory $Zip $Hash 'beta' $source
                } finally { foreach ($handle in $handles.Values) { $handle.Dispose() } }
            }
            # Setup explícito renueva el bootstrap; el feed conserva el instalado.
            Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'candidate.ps1') -Destination (Join-Path $directory 'candidate.ps1') -Force
            Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'beta.ps1') -Destination (Join-Path $directory 'beta.ps1') -Force
            if (Test-Path -LiteralPath $retained) { Remove-Item -LiteralPath $retained }
            if($null -ne $Finalize){& $Finalize}
        } catch {
            $failure=$_
            if($null -ne $Finalize){
                # One denied file must not prevent the remaining restorations.
                # State is first, so cleanup can retain anything still referenced.
                foreach($name in $metadata){
                    $path=Join-Path $directory $name
                    try {
                        if($before.ContainsKey($name)){
                            if(-not (Test-Path -LiteralPath $path) -or (Get-NativeHash $path) -cne $beforeHash[$name]){[IO.File]::WriteAllBytes($path,$before[$name])}
                        } elseif(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path}
                    } catch {[Console]::Error.WriteLine("Rollback: no se pudo restaurar ${path}: $($_.Exception.Message)")}
                }
                try {
                    $referenced=@()
                    if(Test-Path -LiteralPath (Join-Path $directory 'state.json')){
                        $current=Read-NativeState $directory $false
                        $referenced=@($current.active.generation)
                        if($null -ne $current.previous){$referenced+= $current.previous.generation}
                    }
                    # If enumeration or state validation fails, preserve all.
                    $created=@(Get-ChildItem -LiteralPath (Join-Path $directory 'generations') -Directory -ErrorAction Stop)
                    foreach($generation in $created){
                        if($generation.Name -cnotin $generations -and $generation.Name -cnotin $referenced -and $generation.Name -cmatch '^[a-f0-9]{32}$'){
                            try {
                                Assert-NativeTree $generation.FullName
                                Remove-Item -LiteralPath $generation.FullName -Recurse -Force
                            } catch {[Console]::Error.WriteLine("Rollback: no se pudo retirar $($generation.FullName): $($_.Exception.Message)")}
                        }
                    }
                } catch {[Console]::Error.WriteLine("Rollback: se conservan las generaciones al no poder comprobarlas: $($_.Exception.Message)")}
            }
            throw $failure
        }
    } finally { $session.Dispose() }
}

function Uninstall-Beta([string]$Directory, [scriptblock]$Finalize=$null,[switch]$KeepLegacyRun) {
    $directory = Open-NativeRoot $Directory
    $session = [IO.File]::Open((Join-Path $directory 'beta-session.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $lock = $null
    try {
        $lock = Open-NativeLock $directory
        if($null -ne $Finalize -and -not (Test-Path -LiteralPath (Join-Path $directory 'state.json'))){& $Finalize;return}
        # Una desinstalación interrumpida ya no tiene todos los hashes/archivos.
        # Validar el estado estructural, sin exigir integridad de lo que se va a borrar.
        $state = [IO.File]::ReadAllText((Join-Path $directory 'state.json')) | ConvertFrom-Json
        if ($state.schema -ne 1 -or $state.product -cne 'vantare-native' -or $state.channel -cne 'beta' -or $null -eq $state.active) { throw 'No es una instalación beta.' }
        foreach ($reference in @($state.active, $state.previous)) {
            if ($null -ne $reference -and ($reference.generation -cnotmatch '^[a-f0-9]{32}$' -or $reference.manifest_sha256 -cnotmatch '^[a-f0-9]{64}$')) { throw 'Referencia de generación inválida.' }
        }
        $handles = Open-NativeBinaryGuard $directory
        foreach ($handle in $handles.Values) { $handle.Dispose() }
        $knownMembers=@(Get-NativeKnownMembers $state.channel)
        $legacyRunBefore=$null
        try{$legacyRunBefore=Get-NativeLegacyRun $directory}catch{Write-NativeShortcutWarning ('No se pudo comprobar Run: '+$_.Exception.Message)}
        $retained = Join-Path $directory 'retained-data.json'
        if (-not (Test-Path -LiteralPath $retained)) {
            $manifest = [IO.File]::ReadAllText((Join-Path $directory "generations/$($state.active.generation)/manifest.json")) | ConvertFrom-Json
            $null = Read-BetaVersion $manifest.version
            Write-BetaJson $retained @{ schema = 1; generation = $state.active.generation; version = $manifest.version }
        }
        # Conserva cada data/ junto a su generación, sin descubrir datos Wails.
        foreach ($generation in Get-ChildItem -LiteralPath (Join-Path $directory 'generations') -Directory) {
            if ($generation.Name -cnotmatch '^[a-f0-9]{32}$') { throw 'Generación ajena; no se desinstala.' }
            Assert-NativeTree $generation.FullName
            foreach ($member in ($knownMembers + @('manifest.json'))) {
                $path = Join-Path $generation.FullName $member
                if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
                Invoke-NativeCheckpoint 'uninstall-member'
            }
            # Solo carpetas del inventario, vacías, de hijas a padres; nunca data/.
            $directories = @($knownMembers | ForEach-Object {
                $parent = [IO.Path]::GetDirectoryName($_)
                while ($parent) { $parent; $parent = [IO.Path]::GetDirectoryName($parent) }
            } | Sort-Object -Unique | Sort-Object Length -Descending)
            foreach ($relative in $directories) {
                $path = Join-Path $generation.FullName $relative
                if ((Test-Path -LiteralPath $path) -and -not @(Get-ChildItem -LiteralPath $path -Force).Count) {
                    try { [IO.Directory]::Delete($path, $false) }
                    catch [IO.IOException] {
                        # A foreign file may appear after enumeration. Preserve
                        # nonempty program folders and finish uninstalling state.
                        if(-not(Test-Path -LiteralPath $path) -or -not @(Get-ChildItem -LiteralPath $path -Force).Count){throw}
                    }
                }
            }
        }
        Remove-Item -LiteralPath (Join-Path $directory 'state.json')
        foreach ($name in @('boot-pending.json', 'hub-ready', 'update-status.json', 'registration-status.json', 'startup-options.json', 'staging/pending.json')) {
            $path = Join-Path $directory $name
            if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
        }
        if($null -ne $Finalize){& $Finalize}
        if(-not $KeepLegacyRun -and $null -ne $legacyRunBefore){$null=Remove-NativeLegacyRun $directory $legacyRunBefore.identity -ConfirmedCleanup}
    } finally { if($null -ne $lock){$lock.Dispose()}; $session.Dispose() }
}

if ($BetaLibrary) { return }
switch ($BetaCommand) {
    'Install' {
        try { Install-Beta $BetaRoot $BetaArchive $BetaPackageHash }
        catch {
            Write-Error $_ -ErrorAction Continue
            if ($_.Exception.Data.Contains('InstallExitCode')) { exit ([int]$_.Exception.Data['InstallExitCode']) }
            exit 1
        }
    }
    'Uninstall' { Uninstall-Beta $BetaRoot -KeepLegacyRun:$BetaKeepLegacyRun }
}
