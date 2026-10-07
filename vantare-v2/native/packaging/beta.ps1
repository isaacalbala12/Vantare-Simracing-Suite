#requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('Install', 'Run', 'Check', 'Apply', 'Uninstall')][string]$Operation = 'Run',
    [string]$Root = (Join-Path $env:LOCALAPPDATA 'Programs/Vantare Native Beta'),
    [string]$Archive,
    [string]$ExpectedSha256,
    [string]$LocalManifest,
    [switch]$NoLaunch
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$betaOperation = $Operation
. (Join-Path $PSScriptRoot 'candidate.ps1') -Root $Root -Archive $Archive -ExpectedSha256 $ExpectedSha256 -Channel beta
$Operation = $betaOperation
$script:BetaRepository = 'isaacalbala12/Vantare-Simracing-Suite'

function Read-BetaVersion([string]$Value) {
    if ($Value -cnotmatch '^(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})$') { throw 'Versión beta inválida: use major.minor.patch.' }
    $parts = @($Value.Split('.') | ForEach-Object { [int]$_ })
    if (@($parts | Where-Object { $_ -gt 65535 }).Count) { throw 'Versión fuera de rango.' }
    [version]$Value
}

function Invoke-BetaManifestTool([string]$Executable, [string]$Json, [string]$KeyFile = '') {
    if (-not $Executable -or -not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw 'Falta el verificador de la instalación beta.' }
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = [IO.Path]::GetFullPath($Executable)
    $info.Arguments = '--verify-update'
    if ($KeyFile) {
        $keyPath = [IO.Path]::GetFullPath($KeyFile)
        if ($keyPath.Contains('"')) { throw 'Ruta de clave inválida.' }
        $info.Arguments = '--sign-update "' + $keyPath + '"'
    }
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $process = [Diagnostics.Process]::Start($info)
    try {
        # Sobres base64 ASCII; el firmador recibe JSON codificado como UTF-8.
        $bytes = [Text.Encoding]::UTF8.GetBytes($Json)
        $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
        $process.StandardInput.Close()
        $output = $process.StandardOutput.ReadToEndAsync()
        $errors = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(30000)) { $process.Kill(); throw 'La firma del manifiesto excedió el tiempo permitido.' }
        if ($process.ExitCode -ne 0) { throw 'Manifiesto rechazado: firma inválida o clave pública sin configurar.' }
        $output.GetAwaiter().GetResult()
        $null = $errors.GetAwaiter().GetResult()
    } finally { $process.Dispose() }
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
    $url = [uri]$manifest.url
    $expected = "https://github.com/$script:BetaRepository/releases/download/native-beta-v$($manifest.version)/vantare-native-amd64-package.zip"
    if ($manifest.url -cne $expected -and -not ($Local -and $url.IsFile)) { throw 'URL de paquete fuera de la release beta declarada.' }
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
    foreach ($candidate in ($candidates | Sort-Object { $_.version } -Descending)) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $candidate.url -TimeoutSec 30 -Headers $headers
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
    throw 'No hay release native-beta con manifiesto válido y firmado.'
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
        $current = Read-NativeManifest $active 'beta'
        $verifier = Join-Path $active 'bin/vantare-services.exe'
        if ($ManifestFile) {
            $path = Assert-NativePath $ManifestFile
            if ((Get-Item -LiteralPath $path).Length -gt 65536) { throw 'Manifiesto demasiado grande.' }
            $signedJson = [IO.File]::ReadAllText($path)
            $manifest = Read-BetaManifest $signedJson $true $verifier
        } else {
            $signedJson = Get-BetaRemoteManifest $verifier
            $manifest = Read-BetaManifest $signedJson $false $verifier
        }
        if ((Read-BetaVersion $manifest.version) -le (Read-BetaVersion $current.version)) { return $false }
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

function Apply-BetaUpdate([string]$Directory) {
    $directory = Open-NativeRoot $Directory
    $pending = Join-Path $directory 'staging/pending.json'
    if (-not (Test-Path -LiteralPath $pending)) { return $false }
    if ((Get-Item -LiteralPath $pending).Length -gt 65536) { throw 'Manifiesto pendiente demasiado grande.' }
    $state = Read-NativeState $directory
    $active = Join-Path $directory "generations/$($state.active.generation)"
    $manifest = Read-BetaManifest ([IO.File]::ReadAllText($pending)) $true (Join-Path $active 'bin/vantare-services.exe')
    $current = Read-NativeManifest $active 'beta'
    if ((Read-BetaVersion $manifest.version) -le (Read-BetaVersion $current.version)) {
        Remove-Item -LiteralPath $pending
        return $false
    }
    Assert-BetaPackage (Join-Path $directory 'staging') (Join-Path $directory "staging/$($manifest.sha256).zip") $manifest
    # Marcador durable: recupera también una interrupción tras activar.
    Write-BetaJson (Join-Path $directory 'boot-pending.json') @{ schema = 1; previous = $state.active.generation; version = $manifest.version }
    try {
        $null = Update-NativeCandidate $directory (Join-Path $directory "staging/$($manifest.sha256).zip") $manifest.sha256
    } catch {
        $after = Read-NativeState $directory
        if ($after.active.generation -ceq $state.active.generation) {
            Remove-Item -LiteralPath (Join-Path $directory 'boot-pending.json')
        }
        throw
    }
    Remove-Item -LiteralPath $pending
    Set-BetaStatus $directory 'applied' 'Actualización aplicada; comprobando el arranque' $manifest.version $manifest.notes
    $true
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
    $runtimeArgs = '--instancia native-beta --launcher-file "' + $launcher + '" -- --live'
    $runtime = Start-Process -FilePath (Join-Path $generation 'bin/vantare.exe') -ArgumentList $runtimeArgs -WindowStyle Hidden -PassThru
    $runtime.Dispose()
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $pipe = "vantare-core-$sid-native-beta"
    $hubArgs = '--pipe "' + $pipe + '" --data-dir "' + (Join-Path $generation 'data/hub') + '" --layout "' + (Join-Path $generation 'data/Vantare/native/layout.json') + '" --engineer-settings "' + (Join-Path $generation 'data/Vantare/native/engineer.json') + '" --launcher-file "' + $launcher + '"'
    # La ventana del Hub es el arranque solicitado por el tester.
    Start-Process -FilePath (Join-Path $generation 'bin/vantare-hub.exe') -ArgumentList $hubArgs -PassThru
}

function Stop-BetaRuntime([string]$Directory) {
    $state = Read-NativeState $Directory
    $exe = Join-Path $Directory "generations/$($state.active.generation)/bin/vantare.exe"
    $owned = @(Get-Process -Name vantare -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe })
    if (-not $owned.Count) { return }
    $stop = Start-Process -FilePath $exe -ArgumentList '--parar --instancia native-beta' -WindowStyle Hidden -PassThru
    try { if (-not $stop.WaitForExit(10000) -or $stop.ExitCode -ne 0) { throw 'No se pudo solicitar el cierre del supervisor beta.' } }
    finally { $stop.Dispose() }
    foreach ($process in $owned) {
        try { if (-not $process.WaitForExit(10000)) { throw 'El supervisor beta sigue en uso; actualización pendiente.' } }
        finally { $process.Dispose() }
    }
}

function Test-BetaReady([string]$Directory, $Process) {
    $path = Join-Path $Directory 'hub-ready'
    -not $Process.HasExited -and (Test-Path -LiteralPath $path) -and [IO.File]::ReadAllText($path) -ceq $Process.Id.ToString()
}

function Confirm-BetaBoot([string]$Directory, $Process, [int]$TimeoutSeconds = 45) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while (-not $Process.HasExited -and -not (Test-BetaReady $Directory $Process) -and [DateTime]::UtcNow -lt $deadline) { $null = $Process.WaitForExit(200) }
    if (Test-BetaReady $Directory $Process) {
        $marker = Join-Path $Directory 'boot-pending.json'
        if (Test-Path -LiteralPath $marker) {
            $boot = [IO.File]::ReadAllText($marker) | ConvertFrom-Json
            $state = Read-NativeState $Directory
            $active = Read-NativeManifest (Join-Path $Directory "generations/$($state.active.generation)") 'beta'
            if ($active.version -cne $boot.version) {
                Remove-Item -LiteralPath $marker
                return $true
            }
            $key = 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBeta'
            $registration = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
            if ($null -ne $registration -and [IO.Path]::GetFullPath($registration.InstallLocation) -eq $Directory) {
                Set-ItemProperty -LiteralPath $key -Name DisplayVersion -Value $boot.version
            }
            $saved = [IO.File]::ReadAllText((Join-Path $Directory 'update-status.json')) | ConvertFrom-Json
            Set-BetaStatus $Directory 'current' 'Versión actualizada y arranque confirmado' $boot.version $saved.notes
            Remove-Item -LiteralPath $marker
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
        Stop-BetaRuntime $Directory
        $boot = [IO.File]::ReadAllText($marker) | ConvertFrom-Json
        $state = Read-NativeState $Directory
        if ($state.active.generation -cne $boot.previous -and $null -ne $state.previous -and $state.previous.generation -ceq $boot.previous) { $null = Restore-NativeCandidate $Directory }
        Remove-Item -LiteralPath $marker
        Set-BetaStatus $Directory 'rollback' 'Falló el arranque: se restauró la versión anterior.'
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

function Uninstall-Beta([string]$Directory) {
    $directory = Open-NativeRoot $Directory
    $session = [IO.File]::Open((Join-Path $directory 'beta-session.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $lock = Open-NativeLock $directory
    try {
        # Una desinstalación interrumpida ya no tiene todos los hashes/archivos.
        # Validar el estado estructural, sin exigir integridad de lo que se va a borrar.
        $state = [IO.File]::ReadAllText((Join-Path $directory 'state.json')) | ConvertFrom-Json
        if ($state.schema -ne 1 -or $state.product -cne 'vantare-native' -or $state.channel -cne 'beta' -or $null -eq $state.active) { throw 'No es una instalación beta.' }
        foreach ($reference in @($state.active, $state.previous)) {
            if ($null -ne $reference -and ($reference.generation -cnotmatch '^[a-f0-9]{32}$' -or $reference.manifest_sha256 -cnotmatch '^[a-f0-9]{64}$')) { throw 'Referencia de generación inválida.' }
        }
        $handles = Open-NativeBinaryGuard $directory
        foreach ($handle in $handles.Values) { $handle.Dispose() }
        # Conserva cada data/ junto a su generación, sin descubrir datos Wails.
        foreach ($generation in Get-ChildItem -LiteralPath (Join-Path $directory 'generations') -Directory) {
            if ($generation.Name -cnotmatch '^[a-f0-9]{32}$') { throw 'Generación ajena; no se desinstala.' }
            Assert-NativeTree $generation.FullName
            foreach ($member in ($script:NativeMembers + @('manifest.json'))) {
                $path = Join-Path $generation.FullName $member
                if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
                Invoke-NativeCheckpoint 'uninstall-member'
            }
            # Solo carpetas del inventario, vacías, de hijas a padres; nunca data/.
            $directories = @($script:NativeMembers | ForEach-Object {
                $parent = [IO.Path]::GetDirectoryName($_)
                while ($parent) { $parent; $parent = [IO.Path]::GetDirectoryName($parent) }
            } | Sort-Object -Unique | Sort-Object Length -Descending)
            foreach ($relative in $directories) {
                $path = Join-Path $generation.FullName $relative
                if (Test-Path -LiteralPath $path) { [IO.Directory]::Delete($path, $false) }
            }
        }
        Remove-Item -LiteralPath (Join-Path $directory 'state.json')
    } finally { $lock.Dispose(); $session.Dispose() }
}

if ($MyInvocation.InvocationName -eq '.') { return }
switch ($Operation) {
    'Install' {
        $null = Install-NativeCandidate $Root $Archive $ExpectedSha256 'beta'
        Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $Root 'beta.ps1')
        if (-not $NoLaunch) { Run-BetaHub $Root }
    }
    'Check' { Stage-BetaUpdate $Root $LocalManifest }
    'Apply' { Apply-BetaUpdate $Root }
    'Run' { Run-BetaHub $Root $LocalManifest }
    'Uninstall' { Uninstall-Beta $Root }
}
