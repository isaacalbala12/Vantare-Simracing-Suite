# vantare-boot-capabilities: indicator-handshake-v1
#requires -Version 5.1
[CmdletBinding()]
param(
    [Alias('Operation')][ValidateSet('Install', 'Run', 'Check', 'Apply', 'Uninstall')][string]$BetaCommand = 'Run',
    [Alias('Root')][string]$BetaRoot,
    [Alias('Archive')][string]$BetaArchive,
    [Alias('ExpectedSha256')][string]$BetaPackageHash,
    [Alias('LocalManifest')][string]$BetaManifestFile,
    [Alias('NoLaunch')][switch]$BetaNoLaunch,
    [Alias('Library')][switch]$BetaLibrary
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

function Save-BetaDownload([uri]$Url, [string]$Destination) {
    $request = [Net.HttpWebRequest]::Create($Url)
    $request.UserAgent = 'Vantare-Native-Beta'
    $request.Timeout = 30000
    $request.ReadWriteTimeout = 30000
    $response = $request.GetResponse()
    try {
        if ($response.ResponseUri.Scheme -cne 'https' -or $response.ContentLength -gt 512MB) { throw 'Descarga insegura o demasiado grande.' }
        $inputStream = $response.GetResponseStream()
        $outputStream = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try {
            $buffer = New-Object byte[] 65536
            $total = 0L
            $watch = [Diagnostics.Stopwatch]::StartNew()
            while (($count = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $total += $count
                if ($total -gt 512MB -or $watch.Elapsed.TotalMinutes -gt 5) { throw 'Descarga supera el límite de tamaño o tiempo.' }
                $outputStream.Write($buffer, 0, $count)
            }
            $outputStream.Flush($true)
        } finally { $inputStream.Dispose(); $outputStream.Dispose() }
    } finally { $response.Dispose() }
}

function Get-BetaRemoteManifest([string]$Verifier) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $headers = @{ 'User-Agent' = 'Vantare-Native-Beta'; Accept = 'application/vnd.github+json' }
    $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$script:BetaRepository/releases?per_page=100" -Headers $headers -TimeoutSec 30
    $candidates = @(
        foreach ($release in $releases) {
            if ($release.draft -or $release.tag_name -cnotmatch '^native-beta-v(.+)$') { continue }
            try { $version = Read-BetaVersion $Matches[1] } catch { continue }
            $asset = @($release.assets | Where-Object { $_.name -ceq 'vantare-native-beta.json' })
            if ($asset.Count -ne 1 -or $asset[0].size -gt 65536) { continue }
            $expected = "https://github.com/$script:BetaRepository/releases/download/$($release.tag_name)/vantare-native-beta.json"
            if ($asset[0].browser_download_url -cne $expected) { continue }
            @{ version = $version; url = $expected; tag = $release.tag_name }
        }
    )
    $downloadError = $null
    foreach ($candidate in ($candidates | Sort-Object { $_.version } -Descending)) {
        try { $response = Invoke-WebRequest -UseBasicParsing -Uri $candidate.url -TimeoutSec 30 -Headers $headers }
        catch { $downloadError = $_.Exception; continue }
        try {
            $json = $response.Content
            if ($json -is [byte[]]) {
                if ($json.Length -gt 65536) { continue }
                # UTF-8 estricto y detección BOM (UTF-8/UTF-16/UTF-32).
                $stream = [IO.MemoryStream]::new($json)
                $reader = [IO.StreamReader]::new($stream, [Text.UTF8Encoding]::new($false, $true), $true)
                try { $json = $reader.ReadToEnd() } finally { $reader.Dispose() }
            }
            if ($json -isnot [string]) { continue }
            $manifest = Read-BetaManifest $json $false $Verifier
            if ("native-beta-v$($manifest.version)" -cne $candidate.tag) { continue }
            return $json
        } catch { continue } # Un asset inválido no veta una versión firmada anterior.
    }
    if ($null -ne $downloadError) { throw $downloadError }
    # Feed consultado correctamente, pero sin actualización verificable.
    return $null
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

function Assert-BetaPackage([string]$Staging, [string]$Zip, $Manifest) {
    $check = Join-Path $Staging ([guid]::NewGuid().ToString('N'))
    try {
        $package = Expand-NativePackage $Zip $Manifest.sha256 $check 'beta'
        if ($package.version -cne $Manifest.version) { throw 'Versión del paquete distinta del manifiesto remoto.' }
    } finally {
        if (Test-Path -LiteralPath $check) {
            $checkedPath = Assert-NativePath $check
            $stagingPrefix = [IO.Path]::GetFullPath($Staging) + [IO.Path]::DirectorySeparatorChar
            if (-not $checkedPath.StartsWith($stagingPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'La limpieza debe permanecer dentro de staging.' }
            Remove-Item -LiteralPath $checkedPath -Recurse -Force
        }
    }
}

function Stage-BetaUpdate([string]$Directory, [string]$ManifestFile = '') {
    $directory = Open-NativeRoot $Directory
    $lock = Open-NativeLock $directory
    try {
        $state = Read-NativeState $directory
        if ($state.channel -cne 'beta') { throw 'El actualizador beta no cambia de canal.' }
        $active = Join-Path $directory "generations/$($state.active.generation)"
        $current = Read-NativeManifest $active 'beta' -Installed
        $verifier = Join-Path $active 'bin/vantare-services.exe'
        if ($ManifestFile) {
            $path = Assert-NativePath $ManifestFile
            if ((Get-Item -LiteralPath $path).Length -gt 65536) { throw 'Manifiesto demasiado grande.' }
            $signedJson = [IO.File]::ReadAllText($path)
            $manifest = Read-BetaManifest $signedJson $true $verifier
        } else {
            try { $signedJson = Get-BetaRemoteManifest $verifier }
            catch {
                Set-BetaStatus $directory 'error' ('No se pudo consultar el feed beta: ' + $_.Exception.Message) $current.version
                return $false
            }
            if (-not $signedJson) {
                Set-BetaStatus $directory 'current' 'Estás al día' $current.version
                return $false
            }
            $manifest = Read-BetaManifest $signedJson $false $verifier
        }
        if ((Read-BetaVersion $manifest.version) -le (Read-BetaVersion $current.version)) {
            Set-BetaStatus $directory 'current' 'Estás al día' $current.version
            return $false
        }
        $staging = Join-Path $directory 'staging'
        [IO.Directory]::CreateDirectory($staging) | Out-Null
        $zip = Join-Path $staging ($manifest.sha256 + '.zip')
        if (-not (Test-Path -LiteralPath $zip)) {
            $download = Join-Path $staging ([guid]::NewGuid().ToString('N') + '.download')
            try {
                $url = [uri]$manifest.url
                if ($url.IsFile -and $ManifestFile) { [IO.File]::Copy((Assert-NativePath $url.LocalPath), $download) }
                else { Save-BetaDownload $url $download }
                if ((Get-Item -LiteralPath $download).Length -gt 512MB -or (Get-NativeHash $download) -cne $manifest.sha256) { throw 'Paquete descargado: tamaño o SHA-256 incorrecto.' }
                [IO.File]::Move($download, $zip)
            } finally { if (Test-Path -LiteralPath $download) { Remove-Item -LiteralPath $download } }
        }
        if ((Get-NativeHash $zip) -cne $manifest.sha256) { throw 'Staging alterado: SHA incorrecto.' }
        # Verifica inventario, hashes, canal y schema antes de anunciar la actualización.
        Assert-BetaPackage $staging $zip $manifest
        Write-BetaJson (Join-Path $staging 'pending.json') ($signedJson | ConvertFrom-Json)
        Set-BetaStatus $directory 'ready' 'Actualización lista, se aplicará al reiniciar' $manifest.version $manifest.notes
        $true
    } finally { $lock.Dispose() }
}

# The interactive bootstrap holds its generation's executable while painting.
# Release that image before the existing exclusive binary guard; never weaken it.
function Complete-BetaBootstrap([string]$Directory, [int]$TimeoutMilliseconds = 10000, [switch]$AllowNaturalExit,
    [ValidateRange(1,47000)][int]$NaturalExitMilliseconds = 47000) {
    $window = $env:VANTARE_STARTUP_WINDOW
    $owner = $env:VANTARE_STARTUP_PID
    if (-not $window -and -not $owner) { return }
    $process = $null
    try {
        if ($window -cnotmatch '^[1-9][0-9]*$' -or $owner -cnotmatch '^[1-9][0-9]*$') { throw 'Identidad del indicador inválida.' }
        try { $process = [Diagnostics.Process]::GetProcessById([int]$owner) }
        catch [ArgumentException] {
            Remove-Item Env:VANTARE_STARTUP_WINDOW, Env:VANTARE_STARTUP_PID -ErrorAction SilentlyContinue
            return
        }
        # Pin the process handle before inspecting its image or waiting for exit.
        $null = $process.Handle
        if ($process.HasExited) { return }
        $wait=[Diagnostics.Stopwatch]::StartNew()
        try {
        try { $image = Assert-NativePath $process.MainModule.FileName }
        catch { if ($process.HasExited) { return }; throw }
        $generations = (Join-Path (Assert-NativePath $Directory) 'generations') + [IO.Path]::DirectorySeparatorChar
        $relative = if ($image.StartsWith($generations, [StringComparison]::OrdinalIgnoreCase)) { $image.Substring($generations.Length).Replace('\', '/') } else { '' }
        if ($relative -cnotmatch '^[a-f0-9]{32}/bin/vantare\.exe$') { throw 'El indicador no pertenece a esta instalación.' }
        if (-not ('Vantare.BootstrapWindow' -as [type])) {
            Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
namespace Vantare {
    public static class BootstrapWindow {
        const string Class = "VantareStartupIndicator";
        const uint Maintenance = 0x806a;
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int count);
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
        [DllImport("user32.dll", SetLastError = true)] static extern bool PostMessage(IntPtr hwnd, uint message, UIntPtr wp, IntPtr lp);
        public static bool Close(long window, uint owner) {
            var hwnd = new IntPtr(window);
            uint pid;
            var name = new StringBuilder(128);
            GetWindowThreadProcessId(hwnd, out pid);
            return pid == owner && GetClassName(hwnd, name, name.Capacity) > 0 &&
                name.ToString() == Class && PostMessage(hwnd, Maintenance, UIntPtr.Zero, IntPtr.Zero);
        }
    }
}
'@
        }
        # A destroyed HWND can precede process exit: still wait on the pinned handle.
        $null=[Vantare.BootstrapWindow]::Close([long]$window, [uint32]$owner)
        } catch {
            if(-not $AllowNaturalExit){throw}
            [Console]::Error.WriteLine('bootstrap: señal no disponible; rollback espera la salida natural: '+$_.Exception.Message)
        }
        if (-not $process.WaitForExit($TimeoutMilliseconds)) {
            $remaining=[Math]::Max(0,$NaturalExitMilliseconds-[int]$wait.ElapsedMilliseconds)
            if($AllowNaturalExit){[Console]::Error.WriteLine('bootstrap: rollback espera el cierre natural del indicador, sin terminarlo a la fuerza.')}
            if(-not $AllowNaturalExit -or -not $process.WaitForExit($remaining)){
                throw [TimeoutException]::new('El indicador sigue en uso; actualización o rollback pendientes para el siguiente arranque.')
            }
        }
    } catch {
        [Console]::Error.WriteLine("bootstrap: operación aplazada: " + $_.Exception.Message)
        throw
    } finally {
        if ($null -ne $process) {
            if ($process.HasExited) { Remove-Item Env:VANTARE_STARTUP_WINDOW, Env:VANTARE_STARTUP_PID -ErrorAction SilentlyContinue }
            $process.Dispose()
        }
    }
}

function Apply-BetaUpdate([string]$Directory) {
    $directory = Open-NativeRoot $Directory
    $pending = Join-Path $directory 'staging/pending.json'
    if (-not (Test-Path -LiteralPath $pending)) { return $false }
    if ((Get-Item -LiteralPath $pending).Length -gt 65536) { throw 'Manifiesto pendiente demasiado grande.' }
    $state = Read-NativeState $directory
    $active = Join-Path $directory "generations/$($state.active.generation)"
    $manifest = Read-BetaManifest ([IO.File]::ReadAllText($pending)) $true (Join-Path $active 'bin/vantare-services.exe')
    $current = Read-NativeManifest $active 'beta' -Installed
    if ((Read-BetaVersion $manifest.version) -le (Read-BetaVersion $current.version)) {
        Remove-Item -LiteralPath $pending
        return $false
    }
    Assert-BetaPackage (Join-Path $directory 'staging') (Join-Path $directory "staging/$($manifest.sha256).zip") $manifest
    Complete-BetaBootstrap $directory
    Activate-BetaPackage $directory (Join-Path $directory "staging/$($manifest.sha256).zip") $manifest.sha256 $manifest.version $manifest.notes
    Remove-Item -LiteralPath $pending
    $true
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

function Start-BetaHub([string]$Directory) {
    $state = Read-NativeState $Directory
    $generation = Join-Path $Directory "generations/$($state.active.generation)"
    $env:VANTARE_BETA_ROOT = $Directory
    $env:VANTARE_NATIVE_DATA_ROOT = Join-Path $generation 'data'
    $ready = Join-Path $Directory 'hub-ready'
    if (Test-Path -LiteralPath $ready) { Remove-Item -LiteralPath $ready }
    $exitMarker = Join-Path $Directory 'hub-exit'
    if (Test-Path -LiteralPath $exitMarker) { Remove-Item -LiteralPath $exitMarker }
    $launcher = Join-Path $generation 'data/Vantare/native/launcher.json'
    $env:VANTARE_APPEARANCE_FILE = Join-Path $generation 'data/hub/appearance.json'
    $runtimeArgs = '--instancia native-beta --launcher-file "' + $launcher + '" -- --live -- --start-hidden'
    $logs = Join-Path $Directory 'logs'
    [IO.Directory]::CreateDirectory($logs) | Out-Null
    $runtime = Start-Process -FilePath (Join-Path $generation 'bin/vantare.exe') -ArgumentList $runtimeArgs -WindowStyle Hidden -RedirectStandardError (Join-Path $logs 'runtime.log') -PassThru
    $runtime.Dispose()
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $pipe = "vantare-core-$sid-native-beta"
    $hubArgs = '--pipe "' + $pipe + '" --data-dir "' + (Join-Path $generation 'data/hub') + '" --layout "' + (Join-Path $generation 'data/Vantare/native/layout.json') + '" --engineer-settings "' + (Join-Path $generation 'data/Vantare/native/engineer.json') + '" --launcher-file "' + $launcher + '"'
    # La ventana del Hub es el arranque solicitado por el tester.
    Start-Process -FilePath (Join-Path $generation 'bin/vantare-hub.exe') -ArgumentList $hubArgs -RedirectStandardError (Join-Path $logs 'hub.log') -PassThru
}

function Stop-BetaRuntime([string]$Directory) {
    $state = Read-NativeState $Directory
    $exe = Join-Path $Directory "generations/$($state.active.generation)/bin/vantare.exe"
    $owned = @(Get-Process -Name vantare -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe })
    if (-not $owned.Count) { return }
    $stop=Invoke-NativeProcess -Executable $exe -Arguments @('--parar','--instancia','native-beta') -TimeoutMilliseconds 10000
    if ($stop.ExitCode -ne 0) { throw 'No se pudo solicitar el cierre del supervisor beta.' }
    foreach ($process in $owned) {
        try { if (-not $process.WaitForExit(10000)) { throw 'El supervisor beta sigue en uso; actualización pendiente.' } }
        finally { $process.Dispose() }
    }
}

function Test-BetaReady([string]$Directory, $Process) {
    $path = Join-Path $Directory 'hub-ready'
    (Test-Path -LiteralPath $path) -and [IO.File]::ReadAllText($path) -ceq $Process.Id.ToString() -and
        (-not $Process.HasExited -or $Process.ExitCode -eq 0)
}

function Sync-BetaRegistration([string]$Directory, [string]$Version) {
    $identity = 'VantareNativeBeta'
    $identityFile = Join-Path $Directory 'registration-identity.txt'
    if (Test-Path -LiteralPath $identityFile) {
        $identity = [IO.File]::ReadAllText($identityFile).Trim()
        if ($identity -cnotmatch '^[A-Za-z0-9]{1,64}$') { throw 'Identidad de registro inválida.' }
    }
    $key = "HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/$identity"
    $registration = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
    if ($null -ne $registration -and [IO.Path]::GetFullPath($registration.InstallLocation) -eq $Directory) {
        Set-ItemProperty -LiteralPath $key -Name DisplayVersion -Value $Version
    }
}

function Confirm-BetaBoot([string]$Directory, $Process, [int]$TimeoutSeconds = 45) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while (-not $Process.HasExited -and -not (Test-BetaReady $Directory $Process) -and [DateTime]::UtcNow -lt $deadline) { $null = $Process.WaitForExit(200) }
    if (Test-BetaReady $Directory $Process) {
        $marker = Join-Path $Directory 'boot-pending.json'
        if (Test-Path -LiteralPath $marker) {
            $boot = [IO.File]::ReadAllText($marker) | ConvertFrom-Json
            $state = Read-NativeState $Directory
            $active = Read-NativeManifest (Join-Path $Directory "generations/$($state.active.generation)") 'beta' -Installed
            if ($active.version -cne $boot.version) {
                Remove-Item -LiteralPath $marker
                return $true
            }
            $saved = [IO.File]::ReadAllText((Join-Path $Directory 'update-status.json')) | ConvertFrom-Json
            Set-BetaStatus $Directory 'current' 'Versión actualizada y arranque confirmado' $boot.version $saved.notes
            # ACK is durable before cosmetic registry I/O, including slow writes.
            Remove-Item -LiteralPath $marker
            try { Sync-BetaRegistration $Directory $boot.version }
            catch { Write-Warning ('No se pudo actualizar DisplayVersion: '+$_.Exception.Message) -WarningAction Continue }
        }
        return $true
    }
    $marker = Join-Path $Directory 'boot-pending.json'
    if (-not $Process.HasExited) {
        if (-not (Test-Path -LiteralPath $marker)) { throw 'El Hub no confirmó su arranque.' }
        # Solo el proceso recién creado por este supervisor y aún sin ready.
        # Nunca se termina una sesión que ya confirmó su arranque.
        $null = $Process.CloseMainWindow()
        if (-not $Process.WaitForExit(3000)) { $Process.Kill(); $Process.WaitForExit() }
    }
    if (Test-Path -LiteralPath $marker) {
        Complete-BetaBootstrap $Directory -AllowNaturalExit
        Stop-BetaRuntime $Directory
        $boot = [IO.File]::ReadAllText($marker) | ConvertFrom-Json
        $state = Read-NativeState $Directory
        if ($state.active.generation -cne $boot.previous -and $null -ne $state.previous -and $state.previous.generation -ceq $boot.previous) { $null = Restore-NativeCandidate $Directory }
        Remove-Item -LiteralPath $marker
        $restored = Read-NativeState $Directory
        $version = (Read-NativeManifest (Join-Path $Directory "generations/$($restored.active.generation)") 'beta' -Installed).version
        Sync-BetaRegistration $Directory $version
        if ($boot.previous -and $restored.active.generation -ceq $boot.previous) { Set-BetaStatus $Directory 'rollback' 'Falló el arranque: se restauró la versión anterior.' }
        else { Set-BetaStatus $Directory 'error' 'No se pudo abrir Vantare tras reparar. Tus datos se conservan; vuelve a ejecutar el instalador.'; throw 'No hay versión anterior íntegra que pueda restaurarse.' }
    }
    $false
}

function Run-BetaHub([string]$Directory, [string]$ManifestFile = '') {
    $directory = Open-NativeRoot $Directory
    $session = [IO.File]::Open((Join-Path $directory 'beta-session.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try {
        if (-not (Test-Path -LiteralPath (Join-Path $directory 'boot-pending.json'))) {
            try { $null = Apply-BetaUpdate $directory } catch { Set-BetaStatus $directory 'error' $_.Exception.Message }
        }
        do {
            $restart = Join-Path $directory 'restart-request'
            if (Test-Path -LiteralPath $restart) { Remove-Item -LiteralPath $restart }
            $process = Start-BetaHub $directory
            try {
                if (-not (Confirm-BetaBoot $directory $process)) {
                    $process.Dispose()
                    $process = Start-BetaHub $directory
                    if (-not (Confirm-BetaBoot $directory $process)) { throw 'La versión restaurada tampoco arrancó.' }
                }
                $next = [DateTime]::MinValue
                while (-not $process.HasExited) {
                    if ([DateTime]::UtcNow -ge $next) {
                        try { $null = Stage-BetaUpdate $directory $ManifestFile } catch { Set-BetaStatus $directory 'error' $_.Exception.Message }
                        $next = [DateTime]::UtcNow.AddHours(6)
                    }
                    $null = $process.WaitForExit(1000)
                }
            } finally { $process.Dispose() }
            $again = Test-Path -LiteralPath $restart
            $exitMarker = Join-Path $directory 'hub-exit'
            if ((Test-Path -LiteralPath $exitMarker) -and [IO.File]::ReadAllText($exitMarker) -ceq 'idle') {
                try { Stop-BetaRuntime $directory } catch { Set-BetaStatus $directory 'error' $_.Exception.Message; $again = $false }
            }
            try { $null = Apply-BetaUpdate $directory } catch { Set-BetaStatus $directory 'error' $_.Exception.Message }
        } while ($again)
    } finally { $session.Dispose() }
}

function Uninstall-Beta([string]$Directory, [scriptblock]$Finalize=$null) {
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
        Remove-NativeLegacyRun $directory
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
        foreach ($name in @('boot-pending.json', 'hub-ready', 'update-status.json', 'registration-status.json', 'staging/pending.json')) {
            $path = Join-Path $directory $name
            if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
        }
        if($null -ne $Finalize){& $Finalize}
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
        if (-not $BetaNoLaunch) { Run-BetaHub $BetaRoot }
    }
    'Check' { Stage-BetaUpdate $BetaRoot $BetaManifestFile }
    'Apply' { Apply-BetaUpdate $BetaRoot }
    'Run' { Run-BetaHub $BetaRoot $BetaManifestFile }
    'Uninstall' { Uninstall-Beta $BetaRoot }
}
