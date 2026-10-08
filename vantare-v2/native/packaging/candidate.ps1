#requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('Build', 'Install', 'Update', 'Rollback', 'ImportProfiles', 'ImportLayout', 'Status', 'Start')][string]$Operation = 'Status',
    [string]$Root = $PSScriptRoot,
    [string]$Archive,
    [string]$ExpectedSha256,
    [ValidateSet('nightly', 'testers', 'master', 'beta')][string]$Channel = 'nightly',
    [string]$Version = '0.0.0-local',
    [ValidateSet('Debug', 'Release')][string]$BuildProfile = 'Release',
    [string]$OutputDirectory,
    [switch]$AllowDirty,
    [string[]]$ApplicationArgs = @(),
    [string[]]$ProfileFiles = @(),
    [double[]]$MonitorBounds = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$script:NativeBuildBins = @('vantare', 'vantare-core', 'vantare-overlays', 'vantare-hub', 'vantare-engineer', 'vantare-services', 'vantare-storage', 'vantare-workshop', 'vantare-grabar-lmu', 'vantare-grabar-acc', 'vantare-import-profile')
function Get-NativeBins([string]$CandidateChannel) {
    # Workshop sigue compilándose para desarrollo/paridad, pero no se distribuye en beta.
    @($script:NativeBuildBins | Where-Object { $CandidateChannel -cne 'beta' -or $_ -cne 'vantare-workshop' })
}
$script:NativeBins = @(Get-NativeBins $Channel)
# El Hub resuelve su catalogo de escenas en runtime: si los fixtures no viajan
# junto al ejecutable, `vantare-hub.exe` no abre ventana en un equipo donde solo
# se instalo el paquete. Se enumeran aqui para que entren tambien en el
# manifiesto y en la verificacion de reinstalacion.
$script:NativeFixtures = @(
    'bin/fixtures/broadcast-tower-crossing.scene.json'
    'bin/fixtures/broadcast-tower-default.scene.json'
    'bin/fixtures/broadcast-tower-exit-reentry.scene.json'
    'bin/fixtures/broadcast-tower-fast-inversion.scene.json'
    'bin/fixtures/broadcast-tower-overtake-sequence.scene.json'
    'bin/fixtures/broadcast-tower-stable-values.scene.json'
    'bin/fixtures/broadcast-tower.snapshot.json'
    'bin/fixtures/car-damage-numbers-default.scene.json'
    'bin/fixtures/car-damage-numbers.snapshot.json'
    'bin/fixtures/car-damage-visual-default.scene.json'
    'bin/fixtures/car-damage-visual.snapshot.json'
    'bin/fixtures/delta-cross-zero.scene.json'
    'bin/fixtures/delta-default.scene.json'
    'bin/fixtures/delta-new-best.scene.json'
    'bin/fixtures/delta-trace-default.scene.json'
    'bin/fixtures/delta-trace.sequence.json'
    'bin/fixtures/delta-trace.snapshot.json'
    'bin/fixtures/delta.snapshot.json'
    'bin/fixtures/fastest-lap-alert.scene.json'
    'bin/fixtures/fastest-lap-default.scene.json'
    'bin/fixtures/fastest-lap.snapshot.json'
    'bin/fixtures/fuel-strategy-default.scene.json'
    'bin/fixtures/fuel-strategy.snapshot.json'
    'bin/fixtures/head-to-head-default.scene.json'
    'bin/fixtures/head-to-head.snapshot.json'
    'bin/fixtures/input-telemetry-default.scene.json'
    'bin/fixtures/input-telemetry.sequence.json'
    'bin/fixtures/input-telemetry.snapshot.json'
    'bin/fixtures/layout.json'
    'bin/fixtures/lmu47.snapshot.json'
    'bin/fixtures/multiclass-relative-default.scene.json'
    'bin/fixtures/multiclass-relative.snapshot.json'
    'bin/fixtures/pedals-clutch.scene.json'
    'bin/fixtures/pedals-default.scene.json'
    'bin/fixtures/pedals-lap.scene.json'
    'bin/fixtures/pedals-telemetry-default.scene.json'
    'bin/fixtures/pedals-telemetry.snapshot.json'
    'bin/fixtures/pedals.snapshot.json'
    'bin/fixtures/racing-flags-default.scene.json'
    'bin/fixtures/racing-flags.snapshot.json'
    'bin/fixtures/radar-default.scene.json'
    'bin/fixtures/radar-nearby-traffic.scene.json'
    'bin/fixtures/radar.snapshot.json'
    'bin/fixtures/relative-default.scene.json'
    'bin/fixtures/relative-functional-cross-ahead.scene.json'
    'bin/fixtures/relative-functional-cross-behind.scene.json'
    'bin/fixtures/relative-functional-fast-reversal.scene.json'
    'bin/fixtures/relative-functional-lap-difference.scene.json'
    'bin/fixtures/relative-functional-sequence.scene.json'
    'bin/fixtures/relative-functional-stable-values.scene.json'
    'bin/fixtures/relative-functional-window-cycle.scene.json'
    'bin/fixtures/relative.snapshot.json'
    'bin/fixtures/standings-default.scene.json'
    'bin/fixtures/standings-functional-battle.scene.json'
    'bin/fixtures/standings-functional-combined.scene.json'
    'bin/fixtures/standings-functional-personal-best.scene.json'
    'bin/fixtures/standings-functional-pit.scene.json'
    'bin/fixtures/standings-functional-position.scene.json'
    'bin/fixtures/standings-functional-session-best.scene.json'
    'bin/fixtures/standings-functional-window.scene.json'
    'bin/fixtures/standings-legacy.snapshot.json'
    'bin/fixtures/standings.snapshot.json'
    'bin/fixtures/track-map-default.scene.json'
    'bin/fixtures/track-map.snapshot.json'
    'bin/fixtures/track-weather-default.scene.json'
    'bin/fixtures/track-weather.snapshot.json'
    'bin/fixtures/workshop-sources.json'
)
function Get-NativeMembers([string]$CandidateChannel) {
    @((Get-NativeBins $CandidateChannel) | ForEach-Object { "bin/$_.exe"; "bin/$_.exe.sha256" }) + $script:NativeFixtures + @('candidate.ps1', 'README.md', 'licenses/OFL-Inter.txt', 'dependencies.json')
}
$script:NativeMembers = @(Get-NativeMembers $Channel)

function Get-NativeHash([string]$Path) {
    # Streaming .NET: el host instalado no depende del autoload de Get-FileHash.
    $stream = [IO.File]::OpenRead((Assert-NativePath $Path))
    try {
        $sha = [Security.Cryptography.SHA256]::Create()
        try { [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
        finally { $sha.Dispose() }
    } finally { $stream.Dispose() }
}

function Assert-NativePath([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { throw 'Se necesita una ruta local explícita.' }
    $full = [IO.Path]::GetFullPath($Path)
    if ($full -eq [IO.Path]::GetPathRoot($full) -or $full.StartsWith('\\')) { throw 'Se requiere una carpeta en un volumen local, no su raíz.' }
    if ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($full)).DriveType -eq [IO.DriveType]::Network) { throw 'No se permiten unidades de red.' }
    $parent = $full
    while ($parent) {
        if ([IO.Path]::GetFileName($parent) -like '.env*') { throw 'No se permiten rutas .env.' }
        if (Test-Path -LiteralPath $parent) {
            $item = Get-Item -LiteralPath $parent -Force
            if ($item.Name -like '.env*' -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Ruta .env o reparse point rechazada.' }
        }
        $parent = [IO.Path]::GetDirectoryName($parent)
    }
    $full
}

function Assert-NativeTree([string]$Path) {
    $pending = [Collections.Generic.Queue[string]]::new()
    $pending.Enqueue((Assert-NativePath $Path))
    while ($pending.Count) {
        foreach ($item in Get-ChildItem -LiteralPath $pending.Dequeue() -Force) {
            if ($item.Name -like '.env*' -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Árbol .env o reparse point rechazado antes de leerlo.' }
            if ($item.PSIsContainer) { $pending.Enqueue($item.FullName) }
        }
    }
}

function Write-NativeJson([string]$Path, $Value) {
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($Value | ConvertTo-Json -Depth 15))
    $file = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $file.Write($bytes, 0, $bytes.Length); $file.Flush($true) } finally { $file.Dispose() }
}

# Punto sin efectos para que las pruebas corten un proceso real en cada frontera.
function Invoke-NativeCheckpoint([string]$Point) { }

function Open-NativeRoot([string]$Path, [switch]$Initialize) {
    $full = Assert-NativePath $Path
    if ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($full)).DriveFormat -cne 'NTFS') { throw 'Este candidato requiere NTFS para el commit atómico.' }
    $marker = Join-Path $full '.vantare-native'
    if (-not (Test-Path -LiteralPath $marker)) {
        if (-not $Initialize) { throw 'No es una instalación nativa candidata.' }
        if ((Test-Path -LiteralPath $full) -and @(Get-ChildItem -LiteralPath $full -Force).Count) { throw 'Instalar exige una carpeta vacía o una instalación candidata reconocida.' }
        [IO.Directory]::CreateDirectory($full) | Out-Null
        [IO.File]::WriteAllText($marker, 'offline-candidate-v1')
    }
    Assert-NativeTree $full
    if ([IO.File]::ReadAllText($marker) -cne 'offline-candidate-v1') { throw 'Marcador de instalación desconocido.' }
    $full
}

function Open-NativeLock([string]$Path) {
    # FileShare.None se libera también si Windows mata el proceso.
    [IO.File]::Open((Join-Path $Path '.operation.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
}

function Assert-NativePe([string]$Path) {
    $reader = [IO.BinaryReader]::new([IO.File]::OpenRead($Path))
    try {
        if ($reader.BaseStream.Length -lt 64 -or $reader.ReadUInt16() -ne 0x5a4d) { throw 'Binario sin cabecera MZ.' }
        $reader.BaseStream.Position = 60
        $offset = $reader.ReadUInt32()
        if ($offset -gt $reader.BaseStream.Length - 6) { throw 'Cabecera PE fuera del archivo.' }
        $reader.BaseStream.Position = $offset
        if ($reader.ReadUInt32() -ne 0x4550 -or $reader.ReadUInt16() -ne 0x8664) { throw 'Se requiere PE Windows x64.' }
    } finally { $reader.Dispose() }
}

function Read-NativeManifest([string]$Directory, [string]$ExpectedChannel, [bool]$VerifyFiles = $true) {
    $path = Join-Path $Directory 'manifest.json'
    if ((Get-Item -LiteralPath $path).Length -gt 65536) { throw 'Manifiesto demasiado grande.' }
    $manifest = [IO.File]::ReadAllText($path) | ConvertFrom-Json
    if ($manifest.schema -ne 1 -or $manifest.product -cne 'vantare-native' -or
        $manifest.candidate -isnot [bool] -or -not $manifest.candidate -or
        $manifest.architecture -cne 'windows-x64' -or $manifest.data_schema -cne 'opaque-v1' -or
        $manifest.source_sha -cnotmatch '^[0-9a-f]{40}$' -or
        $manifest.source_dirty -isnot [bool] -or
        $manifest.build_profile -cnotin @('Debug', 'Release') -or
        $manifest.version -cnotmatch '^[0-9]+(?:\.[0-9]+){2,3}(?:-[a-z0-9][a-z0-9.-]{0,63})?$' -or
        $manifest.channel -cnotin @('nightly', 'testers', 'master', 'beta') -or
        ($ExpectedChannel -and $manifest.channel -cne $ExpectedChannel)) { throw 'Manifiesto, esquema o canal incompatible.' }
    $members = @(Get-NativeMembers $manifest.channel)
    foreach ($item in Get-ChildItem -LiteralPath $Directory -File -Recurse -Force) {
        $relative = $item.FullName.Substring($Directory.Length + 1).Replace('\', '/')
        if (-not $relative.StartsWith('data/') -and $relative -cnotin ($members + @('manifest.json'))) { throw 'Archivo instalado no enumerado en el manifiesto.' }
    }
    $seen = @{}
    foreach ($file in $manifest.files) {
        if ($file.path -cnotin $members -or $seen.ContainsKey($file.path) -or
            $file.sha256 -cnotmatch '^[0-9a-f]{64}$') { throw 'Lista de archivos inválida o duplicada.' }
        $seen[$file.path] = $true
        if (-not $VerifyFiles) { continue }
        $actual = Get-Item -LiteralPath (Join-Path $Directory $file.path)
        if ($actual.Length -ne $file.size -or (Get-NativeHash $actual.FullName) -cne $file.sha256) { throw "Integridad incorrecta: $($file.path)" }
        if ($file.path.EndsWith('.exe')) {
            Assert-NativePe $actual.FullName
            $sidecar = [IO.File]::ReadAllText("$($actual.FullName).sha256")
            if ($sidecar -cne "$($file.sha256)  $($actual.Name)`n") { throw "Sidecar incorrecto: $($file.path)" }
        }
    }
    if ($seen.Count -ne $members.Count) { throw 'Faltan archivos obligatorios.' }
    $manifest
}

function Expand-NativePackage([string]$ZipPath, [string]$Hash, [string]$Destination, [string]$ExpectedChannel) {
    $zipPath = Assert-NativePath $ZipPath
    if ($Hash -cnotmatch '^[0-9a-f]{64}$') { throw 'SHA-256 externo obligatorio (hex minúsculas).' }
    # El handle impide cambiar o borrar el ZIP entre checksum y extracción.
    $inputFile = [IO.File]::Open($zipPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        if ($inputFile.Length -gt 128MB) { throw 'ZIP comprimido supera el límite.' }
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $actual = [BitConverter]::ToString($sha.ComputeHash($inputFile)).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
        if ($actual -cne $Hash) { throw 'SHA-256 externo incorrecto.' }
        $inputFile.Position = 0
        $zip = [IO.Compression.ZipArchive]::new($inputFile, [IO.Compression.ZipArchiveMode]::Read, $true)
        try {
            $allowed = @(Get-NativeMembers $ExpectedChannel) + @('manifest.json')
            if ($zip.Entries.Count -ne $allowed.Count) { throw 'Número de miembros ZIP incorrecto.' }
            $seen = @{}; $total = 0L
            foreach ($entry in $zip.Entries) {
                if ($entry.FullName -cnotin $allowed -or $seen.ContainsKey($entry.FullName)) { throw 'Miembro ZIP no autorizado o duplicado.' }
                $seen[$entry.FullName] = $true
                $total += $entry.Length
                if ($entry.Length -gt 256MB -or $total -gt 512MB) { throw 'ZIP supera el límite de extracción.' }
                # ZIP Unix symlink / Windows reparse point: no se extraen enlaces.
                $unixType = ($entry.ExternalAttributes -shr 16) -band 0xf000
                if ($unixType -eq 0xa000 -or ($entry.ExternalAttributes -band 0x400)) { throw 'Enlace ZIP rechazado.' }
            }
            if ($seen.Count -ne $allowed.Count) { throw 'ZIP incompleto.' }
            [IO.Directory]::CreateDirectory($Destination) | Out-Null
            foreach ($entry in $zip.Entries) {
                $dest = Join-Path $Destination $entry.FullName
                [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest)) | Out-Null
                [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest)
            }
        } finally { $zip.Dispose() }
    } finally { $inputFile.Dispose() }
    Read-NativeManifest $Destination $ExpectedChannel
}

function Read-NativeState([string]$Directory, [bool]$VerifyActiveFiles = $true) {
    $state = [IO.File]::ReadAllText((Join-Path $Directory 'state.json')) | ConvertFrom-Json
    if ($state.schema -ne 1 -or $state.product -cne 'vantare-native' -or $state.channel -cnotin @('nightly', 'testers', 'master', 'beta')) { throw 'Estado de instalación inválido.' }
    foreach ($reference in @($state.active, $state.previous)) {
        if ($null -eq $reference) { continue }
        if ($reference.generation -cnotmatch '^[0-9a-f]{32}$' -or $reference.manifest_sha256 -cnotmatch '^[0-9a-f]{64}$') { throw 'Referencia de generación inválida.' }
        $generation = Join-Path $Directory "generations/$($reference.generation)"
        if ((Get-NativeHash (Join-Path $generation 'manifest.json')) -cne $reference.manifest_sha256 -or
            -not (Test-Path -LiteralPath (Join-Path $generation 'data') -PathType Container)) { throw 'Generación activa/anterior incompleta.' }
        $verify = $VerifyActiveFiles -or $reference.generation -cne $state.active.generation
        $null = Read-NativeManifest $generation $state.channel $verify
    }
    if ($null -eq $state.active) { throw 'Falta generación activa.' }
    $state
}

function Set-NativeState([string]$Directory, $State) {
    $target = Join-Path $Directory 'state.json'
    $temp = Join-Path $Directory ('.state-' + [guid]::NewGuid().ToString('N') + '.tmp')
    Write-NativeJson $temp $State
    Invoke-NativeCheckpoint 'before-commit'
    # PowerShell 5.1 convierte $null a string vacío; NullString pasa null real a .NET.
    if (Test-Path -LiteralPath $target) { [IO.File]::Replace($temp, $target, [System.Management.Automation.Language.NullString]::Value) }
    else { [IO.File]::Move($temp, $target) }
    Invoke-NativeCheckpoint 'after-commit'
}

function Install-NativeCandidate([string]$Directory, [string]$ZipPath, [string]$Hash, [string]$ExpectedChannel, [string]$DataSource = '') {
    $directory = Open-NativeRoot $Directory -Initialize
    $lock = Open-NativeLock $directory
    try {
        if (Test-Path -LiteralPath (Join-Path $directory 'state.json')) { throw 'Ya instalado; utilice actualización.' }
        $id = [guid]::NewGuid().ToString('N')
        $generation = Join-Path $directory "generations/$id"
        $null = Expand-NativePackage $ZipPath $Hash $generation $ExpectedChannel
        if ($DataSource) { Copy-NativeData $DataSource (Join-Path $generation 'data') }
        else { [IO.Directory]::CreateDirectory((Join-Path $generation 'data')) | Out-Null }
        Invoke-NativeCheckpoint 'staged'
        # Bootstrap estable schema=1; no sobrescribirlo durante actualizaciones.
        Copy-Item -LiteralPath (Join-Path $generation 'candidate.ps1') -Destination (Join-Path $directory 'candidate.ps1') -Force
        $state = [ordered]@{ schema = 1; product = 'vantare-native'; channel = $ExpectedChannel; active = @{ generation = $id; manifest_sha256 = (Get-NativeHash (Join-Path $generation 'manifest.json')) }; previous = $null }
        Set-NativeState $directory $state
        Read-NativeState $directory
    } finally { $lock.Dispose() }
}

function New-NativeZip([string]$Directory, [string]$Destination) {
    Assert-NativeTree $Directory
    $zip = [IO.Compression.ZipFile]::Open($Destination, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($item in Get-ChildItem -LiteralPath $Directory -Recurse -Force) {
            # .NET Framework 4 genera backslashes con CreateFromDirectory; fijar '/'.
            $name = $item.FullName.Substring($Directory.Length + 1).Replace('\', '/')
            if (-not $item.PSIsContainer) { $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $item.FullName, $name) }
            elseif (-not @(Get-ChildItem -LiteralPath $item.FullName -Force).Count) { $null = $zip.CreateEntry("$name/") }
        }
    } finally { $zip.Dispose() }
}

function Open-NativeBinaryGuard([string]$Directory) {
    $handles = @{}
    try {
        foreach ($file in Get-ChildItem -LiteralPath (Join-Path $Directory 'generations') -Filter '*.exe' -File -Recurse) {
            # Acceso de escritura sin escribir: Windows lo deniega a una imagen
            # ejecutándose. FileShare.None impide abrirla mientras se prepara el cambio.
            $handles[$file.FullName] = [IO.File]::Open($file.FullName, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        }
        $handles
    } catch {
        foreach ($handle in $handles.Values) { $handle.Dispose() }
        throw 'Cierre los procesos de esta instalación antes de actualizar/importar/restaurar; no se mata la aplicación.'
    }
}

function Get-NativeDataIndex([string]$Directory) {
    Assert-NativeTree $Directory
    $items = @(Get-ChildItem -LiteralPath $Directory -Recurse -Force | Sort-Object FullName | ForEach-Object {
        $path = $_.FullName.Substring($Directory.Length + 1)
        if ($_.PSIsContainer) { [ordered]@{ path = $path; directory = $true } }
        else { [ordered]@{ path = $path; size = $_.Length; sha256 = (Get-NativeHash $_.FullName) } }
    })
    ConvertTo-Json -InputObject $items -Depth 5 -Compress
}

function Copy-NativeData([string]$Source, [string]$Destination) {
    $before = Get-NativeDataIndex $Source
    [IO.Directory]::CreateDirectory($Destination) | Out-Null
    foreach ($item in Get-ChildItem -LiteralPath $Source -Recurse -Force) {
        $target = Join-Path $Destination $item.FullName.Substring($Source.Length + 1)
        if ($item.PSIsContainer) { [IO.Directory]::CreateDirectory($target) | Out-Null }
        else {
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
            [IO.File]::Copy($item.FullName, $target)
        }
    }
    if ((Get-NativeDataIndex $Source) -cne $before -or (Get-NativeDataIndex $Destination) -cne $before) { throw 'Datos cambiaron durante la copia; no se activa la generación.' }
}

function Update-NativeCandidate([string]$Directory, [string]$ZipPath, [string]$Hash, [bool]$Repair = $false) {
    $directory = Open-NativeRoot $Directory
    $lock = Open-NativeLock $directory
    try {
        $state = Read-NativeState $directory (-not $Repair)
        $previous = $state.active
        if ($Repair) {
            try { $null = Read-NativeManifest (Join-Path $directory "generations/$($state.active.generation)") $state.channel }
            catch { $previous = $state.previous }
        }
        $handles = Open-NativeBinaryGuard $directory
        try {
            $id = [guid]::NewGuid().ToString('N')
            $generation = Join-Path $directory "generations/$id"
            $incoming = Expand-NativePackage $ZipPath $Hash $generation $state.channel
            if ($Repair) {
                $current = Read-NativeManifest (Join-Path $directory "generations/$($state.active.generation)") $state.channel $false
                if ($incoming.version -cne $current.version) { throw 'La reparación exige la misma versión; no se activa el paquete.' }
            }
            Copy-NativeData (Join-Path $directory "generations/$($state.active.generation)/data") (Join-Path $generation 'data')
            Invoke-NativeCheckpoint 'staged'
            $next = [ordered]@{ schema = 1; product = 'vantare-native'; channel = $state.channel; active = @{ generation = $id; manifest_sha256 = (Get-NativeHash (Join-Path $generation 'manifest.json')) }; previous = $previous }
            Set-NativeState $directory $next
        } finally { foreach ($handle in $handles.Values) { $handle.Dispose() } }
        Read-NativeState $directory
    } finally { $lock.Dispose() }
}

function Restore-NativeCandidate([string]$Directory) {
    $directory = Open-NativeRoot $Directory
    $lock = Open-NativeLock $directory
    try {
        $state = Read-NativeState $directory
        if ($null -eq $state.previous) { throw 'No hay generación anterior; no se cambian datos.' }
        $handles = Open-NativeBinaryGuard $directory
        try {
            $next = [ordered]@{ schema = 1; product = 'vantare-native'; channel = $state.channel; active = $state.previous; previous = $state.active }
            Set-NativeState $directory $next
        } finally { foreach ($handle in $handles.Values) { $handle.Dispose() } }
        Read-NativeState $directory
    } finally { $lock.Dispose() }
}

function Import-NativeProfiles([string]$Directory, [string[]]$Files, [double[]]$Bounds = @()) {
    if (-not $Files.Count) { throw 'Indique perfiles JSON explícitos; no se descubre AppData.' }
    if ($Bounds.Count -and ($Bounds.Count -ne 4 -or $Files.Count -ne 1)) { throw 'ImportLayout exige un perfil y bounds x,y,width,height explícitos.' }
    $directory = Open-NativeRoot $Directory
    $lock = Open-NativeLock $directory
    try {
        $state = Read-NativeState $directory
        $source = Join-Path $directory "generations/$($state.active.generation)"
        $handles = Open-NativeBinaryGuard $directory
        try {
            $id = [guid]::NewGuid().ToString('N')
            $generation = Join-Path $directory "generations/$id"
            foreach ($member in (@(Get-NativeMembers $state.channel) + @('manifest.json'))) {
                $from = Join-Path $source $member; $to = Join-Path $generation $member
                [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($to)) | Out-Null
                if ($member.EndsWith('.exe')) {
                    # Leer a través del handle que ya mantiene bloqueada la imagen.
                    $inputFile = $handles[[IO.Path]::GetFullPath($from)]; $inputFile.Position = 0
                    $outputFile = [IO.File]::Open($to, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
                    try { $inputFile.CopyTo($outputFile); $outputFile.Flush($true) } finally { $outputFile.Dispose() }
                } else { [IO.File]::Copy($from, $to) }
            }
            if ((Get-NativeHash (Join-Path $generation 'manifest.json')) -cne $state.active.manifest_sha256) { throw 'Manifiesto de origen cambió; no se importa.' }
            $null = Read-NativeManifest $generation $state.channel
            Copy-NativeData (Join-Path $source 'data') (Join-Path $generation 'data')
            $import = Join-Path $generation "data/legacy-profiles/$id"
            [IO.Directory]::CreateDirectory($import) | Out-Null
            $records = @()
            foreach ($file in $Files) {
                $path = Assert-NativePath $file
                $name = [IO.Path]::GetFileName($path)
                if ($name -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$' -or $name -ceq 'import.json') { throw 'Nombre de perfil JSON no admitido.' }
                $inputFile = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
                try {
                    if ($inputFile.Length -gt 8MB) { throw 'Perfil supera 8 MiB.' }
                    $reader = [IO.StreamReader]::new($inputFile, [Text.Encoding]::UTF8, $true, 4096, $true)
                    try { $profile = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
                    $fields = @($profile.PSObject.Properties.Name)
                    if ('widgets' -notin $fields -and 'layouts' -notin $fields) { throw 'No es un perfil Wails reconocible; no se importan ajustes/cuentas.' }
                    if ('schemaVersion' -in $fields -and $profile.schemaVersion -notin @(0, 1, 2, 3, 4)) { throw 'Versión de perfil desconocida.' }
                    $inputFile.Position = 0
                    $sha = [Security.Cryptography.SHA256]::Create()
                    try { $hash = [BitConverter]::ToString($sha.ComputeHash($inputFile)).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
                    $inputFile.Position = 0
                    $dest = Join-Path $import $name
                    $outputFile = [IO.File]::Open($dest, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
                    try { $inputFile.CopyTo($outputFile); $outputFile.Flush($true) } finally { $outputFile.Dispose() }
                    if ((Get-NativeHash $dest) -cne $hash) { throw 'Copia de perfil no coincide.' }
                    $records += [ordered]@{ name = $name; sha256 = $hash }
                } finally { $inputFile.Dispose() }
            }
            Write-NativeJson (Join-Path $import 'import.json') ([ordered]@{ schema = 1; kind = 'wails-profile-archive'; conversion = 'none'; files = $records })
            if ($Bounds.Count) {
                $converter = Join-Path $generation 'bin/vantare-import-profile.exe'
                $converted = Join-Path $import 'native'
                $arguments = @((Join-Path $import $records[0].name), $converted) + @($Bounds | ForEach-Object { $_.ToString('R', [Globalization.CultureInfo]::InvariantCulture) })
                & $converter @arguments
                if ($LASTEXITCODE) { throw 'Conversión V4 rechazada; generación anterior sigue activa.' }
                Copy-Item -LiteralPath (Join-Path $converted 'layout.json') -Destination (Join-Path $generation 'data/layout.json') -Force
            }
            Invoke-NativeCheckpoint 'staged'
            Set-NativeState $directory ([ordered]@{ schema = 1; product = 'vantare-native'; channel = $state.channel; active = @{ generation = $id; manifest_sha256 = $state.active.manifest_sha256 }; previous = $state.active })
        } finally { foreach ($handle in $handles.Values) { $handle.Dispose() } }
        Read-NativeState $directory
    } finally { $lock.Dispose() }
}

function Build-NativeCandidate([string]$Destination, [string]$CandidateVersion, [string]$CandidateChannel, [string]$Profile, [bool]$PermitDirty) {
    if (Test-Path Env:DUCKDB_LIB_DIR) { throw [InvalidOperationException]::new('Empaquetado exige DuckDB bundled; retira DUCKDB_LIB_DIR del entorno de desarrollo.') }
    $native = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $sourceSha = (& git -C $native rev-parse HEAD).Trim()
    if ($LASTEXITCODE) { throw 'No se puede identificar el SHA fuente.' }
    $dirty = [bool]@(& git -C $native status --porcelain)
    if ($LASTEXITCODE -or ($dirty -and -not $PermitDirty)) { throw 'Build exige checkout limpio; AllowDirty registra explícitamente el candidato de prueba.' }
    if ($CandidateVersion -cnotmatch '^[0-9]+(?:\.[0-9]+){2,3}(?:-[a-z0-9][a-z0-9.-]{0,63})?$') { throw 'Versión de candidato inválida.' }
    $destination = Assert-NativePath $Destination
    if ((Test-Path -LiteralPath $destination) -and @(Get-ChildItem -LiteralPath $destination -Force).Count) { throw 'La salida debe estar vacía para preservar evidencia anterior.' }
    [IO.Directory]::CreateDirectory($destination) | Out-Null
    Push-Location $native
    try {
        # La miniapp owner se construye aparte y nunca entra en el paquete público.
        $cargoArgs = @('build', '--offline', '--locked', '--workspace', '--exclude', 'vantare-admin', '--bins', '-j', '2')
        if ($Profile -eq 'Release') { $cargoArgs += '--release' }
        $oldVersion = $env:VANTARE_VERSION
        $oldChannel = $env:VANTARE_BUILD_CHANNEL
        try {
            $env:VANTARE_VERSION = $CandidateVersion
            $env:VANTARE_BUILD_CHANNEL = $CandidateChannel
            & cargo @cargoArgs
            $buildExit = $LASTEXITCODE
        } finally {
            $env:VANTARE_VERSION = $oldVersion
            $env:VANTARE_BUILD_CHANNEL = $oldChannel
        }
        $global:LASTEXITCODE = $buildExit
        if ($LASTEXITCODE) { throw 'Falló la compilación offline.' }
        $metadata = (& cargo metadata --offline --locked --format-version 1 --filter-platform x86_64-pc-windows-msvc | ConvertFrom-Json)
        if ($LASTEXITCODE) { throw 'Falló la lectura del grafo fijado.' }
        $bins = @($metadata.packages | Where-Object { $_.id -cin $metadata.workspace_members -and $_.name -cne 'vantare-admin' } | ForEach-Object { $_.targets | Where-Object { 'bin' -cin $_.kind } | ForEach-Object { $_.name } })
        if (@(Compare-Object $script:NativeBuildBins $bins -CaseSensitive).Count) { throw 'El inventario de binarios no coincide con cargo metadata; actualizarlo antes de empaquetar.' }
    } finally { Pop-Location }
    $payload = Join-Path $destination 'payload'
    [IO.Directory]::CreateDirectory((Join-Path $payload 'bin')) | Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $payload 'licenses')) | Out-Null
    foreach ($bin in (Get-NativeBins $CandidateChannel)) {
        $source = Join-Path $metadata.target_directory ($Profile.ToLowerInvariant() + "/$bin.exe")
        Assert-NativePe $source
        $embedded = & $source --version
        if ($LASTEXITCODE -or $embedded -cne "Vantare Native $CandidateVersion ($CandidateChannel)") { throw "Versión de producto no coincide: $bin" }
        Copy-Item -LiteralPath $source -Destination (Join-Path $payload "bin/$bin.exe")
        [IO.File]::WriteAllText((Join-Path $payload "bin/$bin.exe.sha256"), "$(Get-NativeHash $source)  $bin.exe`n", [Text.UTF8Encoding]::new($false))
    }
    $fixturesRoot = Join-Path $native 'ui/fixtures'
    foreach ($fixture in $script:NativeFixtures) {
        $relative = $fixture.Substring('bin/fixtures/'.Length)
        $target = Join-Path $payload ('bin/fixtures/' + $relative)
        [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
        Copy-Item -LiteralPath (Join-Path $fixturesRoot $relative) -Destination $target
    }
    Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $payload 'candidate.ps1')
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'README.md') -Destination (Join-Path $payload 'README.md')
    $matrix = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'PARIDAD-SERVICIOS.md'))
    $readmePath = Join-Path $payload 'README.md'
    $readme = [IO.File]::ReadAllText($readmePath).Replace('[matriz de servicios](PARIDAD-SERVICIOS.md)', 'matriz de servicios incluida abajo')
    [IO.File]::WriteAllText($readmePath, "$readme`n`n$matrix", [Text.UTF8Encoding]::new($false))
    Copy-Item -LiteralPath (Join-Path $native 'ui/assets/fonts/OFL-Inter.txt') -Destination (Join-Path $payload 'licenses/OFL-Inter.txt')
    # Catálogo de procedencia/licencias declaradas, no sustituye notices/SBOM revisado.
    $dependencies = @($metadata.packages | Sort-Object name, version | ForEach-Object { [ordered]@{ name = $_.name; version = $_.version; license = $_.license; source = $_.source } })
    Write-NativeJson (Join-Path $payload 'dependencies.json') $dependencies
    $files = @((Get-NativeMembers $CandidateChannel) | ForEach-Object { $file = Get-Item -LiteralPath (Join-Path $payload $_); [ordered]@{ path = $_; size = $file.Length; sha256 = (Get-NativeHash $file.FullName) } })
    $manifest = [ordered]@{ schema = 1; product = 'vantare-native'; candidate = $true; channel = $CandidateChannel; version = $CandidateVersion; source_sha = $sourceSha; source_dirty = $dirty; build_profile = $Profile; architecture = 'windows-x64'; data_schema = 'opaque-v1'; files = $files }
    Write-NativeJson (Join-Path $payload 'manifest.json') $manifest
    $package = Join-Path $destination 'vantare-native-amd64-package.zip'
    New-NativeZip $payload $package
    $hash = Get-NativeHash $package
    $portableTree = Join-Path $destination 'portable-tree'
    $null = Install-NativeCandidate $portableTree $package $hash $CandidateChannel
    $portable = Join-Path $destination 'vantare-native-portable-amd64.zip'
    New-NativeZip $portableTree $portable
    $installer = Join-Path $destination 'vantare-native-installer.ps1'
    Copy-Item -LiteralPath $PSCommandPath -Destination $installer
    foreach ($artifact in @($package, $portable, $installer)) {
        [IO.File]::WriteAllText("$artifact.sha256", "$(Get-NativeHash $artifact)  $([IO.Path]::GetFileName($artifact))`n", [Text.UTF8Encoding]::new($false))
    }
    [pscustomobject]@{ package = $package; sha256 = $hash; portable = $portable; installer = $installer; source_sha = $sourceSha; source_dirty = $dirty; build_profile = $Profile }
}

if ($MyInvocation.InvocationName -eq '.') { return }
switch ($Operation) {
    'Build' { Build-NativeCandidate $OutputDirectory $Version $Channel $BuildProfile ([bool]$AllowDirty) }
    'Install' { Install-NativeCandidate $Root $Archive $ExpectedSha256 $Channel | ConvertTo-Json -Depth 5 }
    'Update' { Update-NativeCandidate $Root $Archive $ExpectedSha256 | ConvertTo-Json -Depth 5 }
    'Rollback' { Restore-NativeCandidate $Root | ConvertTo-Json -Depth 5 }
    'ImportProfiles' { Import-NativeProfiles $Root $ProfileFiles | ConvertTo-Json -Depth 5 }
    'ImportLayout' {
        if ($MonitorBounds.Count -ne 4) { throw 'Indique MonitorBounds x,y,width,height.' }
        Import-NativeProfiles $Root $ProfileFiles $MonitorBounds | ConvertTo-Json -Depth 5
    }
    'Status' {
        $Root = Open-NativeRoot $Root; $lock = Open-NativeLock $Root
        try { Read-NativeState $Root | ConvertTo-Json -Depth 5 } finally { $lock.Dispose() }
    }
    'Start' {
        if (-not $ApplicationArgs.Count) { throw 'Indique argumentos explícitos del launcher (live/replay); no hay fuente de datos implícita.' }
        $Root = Open-NativeRoot $Root; $lock = Open-NativeLock $Root
        try {
            $state = Read-NativeState $Root
            $exe = Join-Path $Root "generations/$($state.active.generation)/bin/vantare.exe"
            $layout = Join-Path $Root "generations/$($state.active.generation)/data/layout.json"
            # Sin grupo explícito de overlays, usar el layout de esta generación.
            # Nunca sobreescribir un grupo de argumentos elegido por el usuario.
            if ((Test-Path -LiteralPath $layout) -and @($ApplicationArgs | Where-Object { $_ -ceq '--' }).Count -eq 1) {
                $ApplicationArgs += @('--', '--layout', $layout)
            }
            # Quoting de argv de Windows: duplicar backslashes ante comillas y
            # al final. El launcher recibe argv y PowerShell termina tras crearlo.
            $quoted = @($ApplicationArgs | ForEach-Object {
                '"' + [regex]::Replace([regex]::Replace($_, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1') + '"'
            }) -join ' '
            $info = [Diagnostics.ProcessStartInfo]::new()
            $info.FileName = $exe; $info.Arguments = $quoted
            $info.UseShellExecute = $true; $info.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
            $process = [Diagnostics.Process]::Start($info)
            try { [pscustomobject]@{ launcher_pid = $process.Id; generation = $state.active.generation } | ConvertTo-Json }
            finally { $process.Dispose() }
        } finally { $lock.Dispose() }
    }
}
