#requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('Build', 'Install', 'Update', 'Rollback', 'ImportProfiles', 'ImportLayout', 'Status', 'Start', 'Register', 'UninstallInstalled')][string]$Operation = 'Status',
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

function Get-NativeProcessLogText($OutputTask,$ErrorTask) {
    $parts=foreach($entry in @(@('stdout',$OutputTask),@('stderr',$ErrorTask))){
        if($entry[1].Status -eq 'RanToCompletion'){$entry[1].GetAwaiter().GetResult()}
        else{"`n[Vantare: $($entry[0]) incompleto; lectura $($entry[1].Status)]`n"}
    }
    $parts -join ''
}

# Una llamada finita, tanto GUI como consola. Solo posee/mata al hijo directo,
# no su árbol. No usar para hosts que viven hasta EOF o crean descendientes.
function Invoke-NativeProcess {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Executable,
        [string[]]$Arguments=@(),
        [AllowNull()][string]$InputText=$null,
        [ValidateRange(1,2147483647)][int]$TimeoutMilliseconds=30000,
        [string]$LogPath
    )
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Executable)
    $info.WorkingDirectory=$ExecutionContext.SessionState.Path.CurrentFileSystemLocation.ProviderPath
    # argv de Windows: conservar vacíos, Unicode, comillas y backslashes finales.
    $info.Arguments=(@($Arguments|ForEach-Object {
        '"'+[regex]::Replace([regex]::Replace($_,'(\\*)"','$1$1\"'),'(\\+)$','$1$1')+'"'
    }) -join ' ')
    $info.UseShellExecute=$false
    $info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true
    $info.RedirectStandardOutput=$true
    $info.RedirectStandardError=$true
    $info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $info.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
    $process=[Diagnostics.Process]::new()
    $process.StartInfo=$info
    $started=$false
    $failure=$null
    $output=$null
    $errors=$null
    $watch=[Diagnostics.Stopwatch]::StartNew()
    try {
        $started=$process.Start()
        if(-not $started){throw 'No se pudo iniciar el proceso nativo.'}
        # Drenar ambos pipes ANTES de escribir stdin o esperar: ninguno bloquea al otro.
        $output=$process.StandardOutput.ReadToEndAsync()
        $errors=$process.StandardError.ReadToEndAsync()
        if($null -ne $InputText){
            $bytes=[Text.Encoding]::UTF8.GetBytes($InputText)
            $write=$process.StandardInput.BaseStream.WriteAsync($bytes,0,$bytes.Length)
            $remaining=[Math]::Max(0,$TimeoutMilliseconds-[int]$watch.ElapsedMilliseconds)
            if(-not $write.Wait($remaining)){throw [TimeoutException]::new('El proceso nativo agotó el plazo al recibir stdin.')}
            $null=$write.GetAwaiter().GetResult()
        }
        $process.StandardInput.Close()
        $remaining=[Math]::Max(0,$TimeoutMilliseconds-[int]$watch.ElapsedMilliseconds)
        if(-not $process.WaitForExit($remaining)){throw [TimeoutException]::new('El proceso nativo agotó el plazo de salida.')}
        $remaining=[Math]::Max(0,$TimeoutMilliseconds-[int]$watch.ElapsedMilliseconds)
        if(-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($output,$errors),$remaining)){
            throw [TimeoutException]::new('El proceso nativo agotó el plazo de lectura.')
        }
        [pscustomobject]@{ExitCode=$process.ExitCode;Stdout=$output.GetAwaiter().GetResult();Stderr=$errors.GetAwaiter().GetResult()}
    } catch {
        $failure=$_
        throw
    } finally {
        if($started){
            try {
                try {
                    if(-not $process.HasExited){$process.Kill()}
                } catch {
                    # Puede terminar entre HasExited y Kill. Otros errores se
                    # registran sin sustituir una excepción de timeout previa.
                    if(-not $process.HasExited){throw}
                }
                $null=$process.WaitForExit(5000)
                if($LogPath){
                    # Una lectura fallida no impide registrar el otro flujo.
                    try {$null=[Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($output,$errors),5000)}catch [AggregateException]{}
                    # Pipes separados: conserva cada flujo, sin prometer orden
                    # intercalado. También se escribe cuando el hijo vence plazo.
                    [IO.File]::WriteAllText($LogPath,(Get-NativeProcessLogText $output $errors),[Text.UTF8Encoding]::new($false))
                }
            } catch {
                if($null -eq $failure){
                    # El resultado ya es válido; un fallo de diagnóstico no lo
                    # convierte en fallo del comando. El aviso sigue visible.
                    Write-Warning "Diagnóstico de limpieza nativa: $($_.Exception.Message)" -WarningAction Continue
                }else{
                    $failure.Exception.Data['NativeCleanupError']=$_.Exception.Message
                }
            } finally {
                $process.StandardInput.Dispose()
                $process.StandardOutput.Dispose()
                $process.StandardError.Dispose()
                $process.Dispose()
            }
        }else{
            $process.Dispose()
        }
    }
}

$script:NativeBuildBins = @('vantare', 'vantare-core', 'vantare-overlays', 'vantare-hub', 'vantare-engineer', 'vantare-services', 'vantare-storage', 'vantare-workshop', 'vantare-grabar-lmu', 'vantare-grabar-acc', 'vantare-import-profile')
# Runtime/README: estas herramientas se compilan en el workspace pero son QA privada.
# No forman parte de Get-NativeBins ni del inventario distribuido de ningún canal.
$script:NativePrivateBuildBins = @('vantare-grabar-lmu-completo', 'vantare-verificar-lmu')
function Assert-NativeBuildInventory([string[]]$Bins) {
    if (@(Compare-Object @($script:NativeBuildBins + $script:NativePrivateBuildBins) $Bins -CaseSensitive).Count) {
        throw 'El inventario de binarios no coincide con cargo metadata; actualizarlo antes de empaquetar.'
    }
}
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
    # Secuencias aprobadas que Workshop abre por nombre, incluida la inicial.
    'bin/fixtures/broadcast-tower-design-system.sequence.json'
    'bin/fixtures/car-damage-visual-design-system.sequence.json'
    'bin/fixtures/delta-design-system.sequence.json'
    'bin/fixtures/delta-trace-design-system.sequence.json'
    'bin/fixtures/fastest-lap-design-system.sequence.json'
    'bin/fixtures/fuel-strategy-design-system.sequence.json'
    'bin/fixtures/head-to-head-design-system.sequence.json'
    'bin/fixtures/input-telemetry-design-system.sequence.json'
    'bin/fixtures/multiclass-relative-design-system.sequence.json'
    'bin/fixtures/pedals-design-system.sequence.json'
    'bin/fixtures/pedals-telemetry-design-system.sequence.json'
    'bin/fixtures/racing-flags-design-system.sequence.json'
    'bin/fixtures/radar-design-system.sequence.json'
    'bin/fixtures/relative-design-system.sequence.json'
    'bin/fixtures/standings-design-system.sequence.json'
    'bin/fixtures/track-map-design-system.sequence.json'
    'bin/fixtures/track-weather-design-system.sequence.json'
    'bin/fixtures/session-alerts.snapshot.json'
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

# Frozen beta inventory from public 0.0.975 (also used by pre-resources RC1
# 0.0.979). Never derive it from the current inventory: future additions must
# not change the contract of generations already installed.
$script:NativeLegacyBetaMembers = @(
    'bin/vantare.exe'
    'bin/vantare.exe.sha256'
    'bin/vantare-core.exe'
    'bin/vantare-core.exe.sha256'
    'bin/vantare-overlays.exe'
    'bin/vantare-overlays.exe.sha256'
    'bin/vantare-hub.exe'
    'bin/vantare-hub.exe.sha256'
    'bin/vantare-engineer.exe'
    'bin/vantare-engineer.exe.sha256'
    'bin/vantare-services.exe'
    'bin/vantare-services.exe.sha256'
    'bin/vantare-storage.exe'
    'bin/vantare-storage.exe.sha256'
    'bin/vantare-grabar-lmu.exe'
    'bin/vantare-grabar-lmu.exe.sha256'
    'bin/vantare-grabar-acc.exe'
    'bin/vantare-grabar-acc.exe.sha256'
    'bin/vantare-import-profile.exe'
    'bin/vantare-import-profile.exe.sha256'
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
    'candidate.ps1'
    'README.md'
    'licenses/OFL-Inter.txt'
    'dependencies.json'
)

function Get-NativeInstalledMembers($Manifest) {
    $current = @(Get-NativeMembers $Manifest.channel)
    $paths = @($Manifest.files | ForEach-Object { $_.path })
    if ($Manifest.channel -ceq 'beta' -and
        $Manifest.version -cmatch '^0\.0\.(975|976|977|978|979)$' -and
        -not @(Compare-Object $script:NativeLegacyBetaMembers $paths -CaseSensitive).Count) {
        return $script:NativeLegacyBetaMembers
    }
    # Unknown subsets are never accepted, even for an old version.
    $current
}

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
function Write-NativeProgress([string]$Step,[int]$Percent) { }

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

function Get-NativeDumpbin {
    $command=Get-Command dumpbin.exe -ErrorAction SilentlyContinue
    if($null -ne $command){return $command.Source}
    $vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
    $paths=@(& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find 'VC/Tools/MSVC/**/bin/Hostx64/x64/dumpbin.exe')
    if($LASTEXITCODE -or -not $paths.Count){throw 'Empaquetado requiere dumpbin de MSVC para validar dependencias CRT.'}
    $paths[0]
}

function Assert-NativeStaticCrt([string]$Path,[string]$Dumpbin) {
    Assert-NativePe $Path
    # /DEPENDENTS lists both normal and delay-loaded DLLs. Never execute an
    # unchecked application just to discover a missing runtime on the build PC.
    $report=@(& $Dumpbin /NOLOGO /DEPENDENTS $Path)
    if($LASTEXITCODE){throw "No se pudieron inspeccionar los imports de $Path"}
    $dlls=@($report|ForEach-Object{if($_ -match '^\s+([A-Za-z0-9_.-]+\.dll)\s*$'){$matches[1]}})
    if(-not $dlls.Count){throw "Inventario de imports vacío: $Path"}
    $runtime=@($dlls|Where-Object{$_ -match '^(vcruntime|msvcp[0-9]|msvcr[0-9]|concrt[0-9]|ucrtbase|api-ms-win-crt-)'})
    if($runtime.Count){throw "El binario de distribución exige CRT dinámico: $Path ($($runtime -join ', '))"}
}

# Installed permits only frozen, known layouts. ZIP/build validation never sets
# it; VerifyFiles controls byte integrity independently of inventory compatibility.
function Read-NativeManifest {
    [CmdletBinding()]
    param([string]$Directory, [string]$ExpectedChannel, [bool]$VerifyFiles = $true, [switch]$Installed)
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
    $members = if ($Installed) { @(Get-NativeInstalledMembers $manifest) } else { @(Get-NativeMembers $manifest.channel) }
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

function Read-NativeInstallerUi([string]$Directory,[bool]$VerifyUninstaller=$true) {
    $path=Join-Path (Assert-NativePath $Directory) 'installer-ui.json'
    if(-not (Test-Path -LiteralPath $path)){return $null}
    if((Get-Item -LiteralPath $path).Length -gt 4096){throw 'Opciones del instalador demasiado grandes.'}
    $ui=[IO.File]::ReadAllText($path)|ConvertFrom-Json
    $fields=@('schema','kind','uninstaller','sha256','desktop','autostart')
    if(@(Compare-Object $fields @($ui.PSObject.Properties.Name) -CaseSensitive).Count -or
       $ui.schema -ne 1 -or $ui.kind -cne 'rust-gpui' -or $ui.uninstaller -cne 'Uninstall.exe' -or
       $ui.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $ui.desktop -isnot [bool] -or $ui.autostart -isnot [bool]){throw 'Opciones del instalador inválidas.'}
    if($VerifyUninstaller){
        if((Get-NativeHash (Join-Path $Directory 'Uninstall.exe')) -cne $ui.sha256){throw 'Desinstalador propio alterado.'}
        Assert-NativePe (Join-Path $Directory 'Uninstall.exe')
    }
    $ui
}

function Test-NativeShortcutOwned($Link,[string]$Directory) {
    $hostPath=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    ($Link.TargetPath -eq $hostPath -and $Link.Arguments.Contains('-Root "'+$Directory+'"') -and
     ($Link.Arguments.Contains('-File "'+(Join-Path $Directory 'beta.ps1')+'"') -or
      ($Link.Arguments.Contains('-File "'+(Join-Path $Directory 'uninstall-vantare.ps1')+'"') -and
       $Link.Arguments.Contains('-Operation UninstallInstalled')))) -or
    ($Link.TargetPath -eq (Join-Path $Directory 'Uninstall.exe')) -or
    ($Link.TargetPath.StartsWith((Join-Path $Directory 'generations') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and
     [IO.Path]::GetFileName($Link.TargetPath) -ieq 'vantare.exe' -and $Link.Arguments -ceq ('--beta -Root "'+$Directory+'"'))
}

function Get-NativeLaunchTarget([string]$Directory) {
    $path=Join-Path $Directory 'state.json'
    if(-not (Test-Path -LiteralPath $path -PathType Leaf)){return $null}
    if((Get-Item -LiteralPath $path).Length -gt 65536){throw 'Estado de instalación demasiado grande.'}
    $state=[IO.File]::ReadAllText($path)|ConvertFrom-Json
    if($state.schema -ne 1 -or $state.product -cne 'vantare-native' -or $state.channel -cne 'beta'){throw 'Estado de instalación inválido.'}
    $active=$state.PSObject.Properties['active']
    if($null -eq $active -or $null -eq $active.Value){return $null}
    $generation=$active.Value.PSObject.Properties['generation']
    if($null -eq $generation){return $null}
    if($generation.Value -cnotmatch '^[a-f0-9]{32}$'){throw 'Referencia de generación inválida.'}
    $target=Join-Path $Directory "generations/$($generation.Value)/bin/vantare.exe"
    if(Test-Path -LiteralPath $target -PathType Leaf){return $target}
    return $null
}

function Set-NativeShortcutAppId([string]$Path) {
    if(-not ('VantareShortcutProperties' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class VantareShortcutProperties {
    [StructLayout(LayoutKind.Sequential)] public struct Key { public Guid format; public uint id; }
    [StructLayout(LayoutKind.Explicit, Size=24)] public struct Value {
        [FieldOffset(0)] public ushort type;
        [FieldOffset(8)] public IntPtr text;
    }
    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface Store {
        void GetCount(out uint count);
        void GetAt(uint index, out Key key);
        void GetValue(ref Key key, out Value value);
        void SetValue(ref Key key, ref Value value);
        void Commit();
    }
    [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=false)]
    static extern void SHGetPropertyStoreFromParsingName(string path, IntPtr context, uint flags, ref Guid iid, out Store store);
    public static void Set(string path, string appId) {
        Guid iid=typeof(Store).GUID;
        Store store;
        SHGetPropertyStoreFromParsingName(path, IntPtr.Zero, 2, ref iid, out store);
        Value value=new Value { type=31, text=Marshal.StringToCoTaskMemUni(appId) };
        try {
            Key key=new Key { format=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), id=5 };
            store.SetValue(ref key, ref value);
            store.Commit();
        } finally { Marshal.FreeCoTaskMem(value.text); Marshal.ReleaseComObject(store); }
    }
}
'@
    }
    [VantareShortcutProperties]::Set($Path, 'Vantare.SimracingSuite')
}

function Get-NativeShortcutName([string]$Folder) {
    if($Folder -ceq 'Vantare'){return 'Vantare Simracing Suite'}
    # Keep externally supplied QA identities isolated from the public desktop.
    $Folder
}

function Set-NativeLaunchShortcut($Link,[string]$Directory,[string]$LaunchTarget) {
    if($LaunchTarget){
        $Link.TargetPath=$LaunchTarget
        # -Root conserva el reconocimiento del acceso por generaciones anteriores al hacer rollback.
        $Link.Arguments='--beta -Root "'+$Directory+'"'
        # RC3/RC4's supervisor has no PE icon. The Hub has the shared icon ID 1;
        # use it explicitly while keeping the GUI supervisor as launch owner.
        $Link.IconLocation=(Join-Path (Split-Path $LaunchTarget) 'vantare-hub.exe')+',0'
    }else{
        # Registro inerte/incompleto: conservar la ruta de bootstrap anterior sin abortar el registro.
        $Link.TargetPath=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
        $Link.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $Directory 'beta.ps1')+'" -Root "'+$Directory+'"'
    }
    $Link.Save()
    Set-NativeShortcutAppId $Link.FullName
}

function Get-NativeShortcutFolder([string]$Name) {
    [Environment]::GetFolderPath([Environment+SpecialFolder]$Name, [Environment+SpecialFolderOption]::DoNotVerify)
}

function Write-NativeShortcutWarning([string]$Message) { Write-Warning $Message }

function Get-NativeProgramsFolder {
    $programs=Get-NativeShortcutFolder 'Programs'
    if([string]::IsNullOrWhiteSpace($programs)){throw [InvalidOperationException]::new('Windows no proporciona la carpeta Programs del usuario; no se modifican los accesos.')}
    $programs
}

function Sync-NativeOptionalShortcuts([string]$Directory,[string]$Folder,$Ui,[bool]$Remove=$false,[string]$LaunchTarget,[switch]$ExistingOnly) {
    if(-not $Remove -and -not $PSBoundParameters.ContainsKey('LaunchTarget')){$LaunchTarget=Get-NativeLaunchTarget $Directory}
    if($null -eq $Ui){return}
    $targets=@(
        @{name='DesktopDirectory'; enabled=$Ui.desktop},
        @{name='Startup'; enabled=$Ui.autostart}
    )
    foreach($target in $targets){
        # OFF never asks Windows for a folder (new/headless profiles may lack it).
        if(-not $target.enabled){continue}
        try {
            $shell=New-Object -ComObject WScript.Shell
            $parent=Get-NativeShortcutFolder $target.name
            if([string]::IsNullOrWhiteSpace($parent)){throw 'Windows no ofrece la carpeta opcional.'}
            $path=Join-Path $parent ((Get-NativeShortcutName $Folder)+'.lnk')
            $exists=Test-Path -LiteralPath $path
            $owned=$exists -and (Test-NativeShortcutOwned ($shell.CreateShortcut($path)) $Directory)
            $oldPath=Join-Path $parent ($Folder+'.lnk')
            $oldOwned=($oldPath -ne $path) -and (Test-Path -LiteralPath $oldPath) -and (Test-NativeShortcutOwned ($shell.CreateShortcut($oldPath)) $Directory)
            if($Remove){if($owned){Remove-Item -LiteralPath $path}; if($oldOwned){Remove-Item -LiteralPath $oldPath}; continue}
            if($ExistingOnly -and -not $owned -and -not $oldOwned){continue}
            if($exists -and -not $owned){throw 'El acceso opcional pertenece a otra instalación; se conserva.'}
            [IO.Directory]::CreateDirectory($parent)|Out-Null
            $link=$shell.CreateShortcut($path)
            Set-NativeLaunchShortcut $link $Directory $LaunchTarget
            if($oldOwned){Remove-Item -LiteralPath $oldPath}
        } catch { Write-NativeShortcutWarning ("No se pudo sincronizar el acceso opcional {0}: {1}" -f $target.name,$_.Exception.Message) }
    }
}

# Undo only the registry values and exact shortcut files that Setup can change.
# The caller holds beta-session.lock; Install-Beta restores generations/metadata.
function Invoke-NativeRegistrationTransaction([string]$Key,[string]$Folder,[string]$Legacy,[scriptblock]$Action) {
    $values=@{}; $existed=Test-Path -LiteralPath $Key
    if($existed){
        $registry=Get-Item -LiteralPath $Key
        foreach($name in $registry.GetValueNames()){
            $values[$name]=@{value=$registry.GetValue($name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames);kind=$registry.GetValueKind($name)}
        }
    }
    $links=@{}; $paths=@()
    $programs=Get-NativeProgramsFolder
    foreach($name in @('Vantare Simracing Suite.lnk','Vantare.lnk','Desinstalar.lnk')){$paths+=Join-Path (Join-Path $programs $Folder) $name}
    foreach($name in @('Vantare Native Beta.lnk','Desinstalar.lnk')){$paths+=Join-Path (Join-Path $programs $Legacy) $name}
    # Optional shortcuts run last, after every mandatory write, and cannot throw.
    # Do not resolve/read them here: even their backup can fail in a raw profile.
    foreach($path in $paths){$links[$path]=if(Test-Path -LiteralPath $path){[IO.File]::ReadAllBytes($path)}else{$null}}
    try { & $Action } catch {
        $failure=$_
        # Restore files even if Windows continues denying registry writes.
        try {
            foreach($path in $links.Keys){
                if($null -ne $links[$path]){[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path))|Out-Null;[IO.File]::WriteAllBytes($path,$links[$path])}
                elseif(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path}
            }
        } finally {
            if(-not $existed){if(Test-Path -LiteralPath $Key){Remove-Item -LiteralPath $Key}}
            else {
                if(-not (Test-Path -LiteralPath $Key)){$null=New-Item -Path $Key -Force}
                $registry=Get-Item -LiteralPath $Key
                foreach($name in $registry.GetValueNames()){if(-not $values.ContainsKey($name)){Remove-ItemProperty -LiteralPath $Key -Name $name}}
                foreach($name in $values.Keys){New-ItemProperty -LiteralPath $Key -Name $name -Value $values[$name].value -PropertyType ([string]$values[$name].kind) -Force|Out-Null}
            }
        }
        throw $failure
    }
}

# La clave estable permite que el bootstrap antiguo siga corrigiendo la versión
# tras rollback. Solo cambia la identidad visible; nunca se trasladan datos.
function Sync-NativeRegistration([string]$Directory, [string]$Version, $PreviousUi=$null,[string]$LaunchTarget) {
    $directory = Assert-NativePath $Directory
    if(-not $PSBoundParameters.ContainsKey('LaunchTarget')){$LaunchTarget=Get-NativeLaunchTarget $directory}
    $identity = 'VantareNativeBeta'
    $folder = 'Vantare'
    $legacyFolder = 'Vantare Native Beta'
    $identityFile = Join-Path $directory 'registration-identity.txt'
    $external = Test-Path -LiteralPath $identityFile
    if ($external) {
        $identity = [IO.File]::ReadAllText($identityFile).Trim()
        if ($identity -cnotmatch '^[A-Za-z0-9]{1,64}$') { throw 'Identidad de registro inválida.' }
    }
    $key = "HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/$identity"
    $registration = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
    if ($null -eq $registration -or (Assert-NativePath $registration.InstallLocation) -ne $directory) { return }
    # QA aporta sus carpetas desde NSIS: el producto no conoce identidades QA.
    if ($external) {
        if ($null -eq $registration.PSObject.Properties['ShortcutFolder'] -or
            $null -eq $registration.PSObject.Properties['LegacyShortcutFolder']) {
            Set-ItemProperty -LiteralPath $key -Name DisplayName -Value 'Vantare Simracing Suite'
            if($Version){Set-ItemProperty -LiteralPath $key -Name DisplayVersion -Value $Version}
            return
        }
        $folder = $registration.ShortcutFolder
        $legacyFolder = $registration.LegacyShortcutFolder
    }
    foreach ($name in @($folder, $legacyFolder)) {
        if ($name -cnotmatch '^[A-Za-z0-9][A-Za-z0-9 -]{0,63}$') { throw 'Carpeta de accesos inválida.' }
    }
    if ($folder -eq $legacyFolder) { throw 'Las carpetas de accesos deben ser diferentes.' }
    # El NSIS anterior no conoce la carpeta nueva. La copia durable permite
    # desinstalar por Inicio/Aplicaciones instaladas aun después de interrupciones.
    $uninstaller = Join-Path $directory 'uninstall-vantare.ps1'
    $powershell = Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $uninstallArgs = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $uninstaller + '" -Operation UninstallInstalled -Root "' + $directory + '"'
    $installerUi=Read-NativeInstallerUi $directory
    $uninstallTarget=$powershell
    if($null -ne $installerUi){
        $uninstallTarget=Join-Path $directory 'Uninstall.exe'
        $uninstallArgs='/D="'+$directory+'"'
    }
    $programs = Get-NativeProgramsFolder
    $target = Join-Path $programs $folder
    $shell = New-Object -ComObject WScript.Shell
    foreach ($name in @('Vantare Simracing Suite.lnk', 'Vantare.lnk', 'Desinstalar.lnk')) {
        $path = Join-Path $target $name
        if (-not (Test-Path -LiteralPath $path)) { continue }
        $existing = $shell.CreateShortcut($path)
        $owned = if ($name -ceq 'Desinstalar.lnk') {
            $existing.TargetPath -eq (Join-Path $directory 'Uninstall.exe') -or
                $existing.Arguments.Contains('-Root "' + $directory + '"')
        } else { Test-NativeShortcutOwned $existing $directory }
        if (-not $owned) { throw 'El acceso existente pertenece a otra instalación; se conserva.' }
    }
    $temp = Join-Path $directory ('.uninstall-' + [guid]::NewGuid().ToString('N') + '.tmp')
    try {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'candidate.ps1') -Destination $temp
        if (Test-Path -LiteralPath $uninstaller) { [IO.File]::Replace($temp, $uninstaller, [System.Management.Automation.Language.NullString]::Value) }
        else { [IO.File]::Move($temp, $uninstaller) }
    } finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp } }
    [IO.Directory]::CreateDirectory($target) | Out-Null
    $link = $shell.CreateShortcut((Join-Path $target 'Vantare Simracing Suite.lnk'))
    Set-NativeLaunchShortcut $link $directory $LaunchTarget
    $oldLink=Join-Path $target 'Vantare.lnk'
    if(Test-Path -LiteralPath $oldLink){Remove-Item -LiteralPath $oldLink}
    $link = $shell.CreateShortcut((Join-Path $target 'Desinstalar.lnk'))
    $link.TargetPath = $uninstallTarget
    $link.Arguments = $uninstallArgs
    if($null -ne $installerUi){$link.IconLocation=$uninstallTarget+',0'}
    $link.Save()
    $legacy = Join-Path $programs $legacyFolder
    foreach ($name in @('Vantare Native Beta.lnk', 'Desinstalar.lnk')) {
        $path = Join-Path $legacy $name
        if (-not (Test-Path -LiteralPath $path)) { continue }
        $link = $shell.CreateShortcut($path)
        $owned = if ($name -ceq 'Desinstalar.lnk') {
            $link.TargetPath -eq (Join-Path $directory 'Uninstall.exe')
        } else {
            $link.Arguments.Contains('-Root "' + $directory + '"') -and
                $link.Arguments.Contains('-File "' + (Join-Path $directory 'beta.ps1') + '"')
        }
        if ($owned) { Remove-Item -LiteralPath $path }
    }
    if ((Test-Path -LiteralPath $legacy) -and -not @(Get-ChildItem -LiteralPath $legacy -Force).Count) {
        Remove-Item -LiteralPath $legacy
    }
    Set-ItemProperty -LiteralPath $key -Name DisplayName -Value 'Vantare Simracing Suite'
    if($null -ne $installerUi){Set-ItemProperty -LiteralPath $key -Name DisplayIcon -Value ('"'+$uninstallTarget+'",0')}
    elseif($LaunchTarget){Set-ItemProperty -LiteralPath $key -Name DisplayIcon -Value ('"'+(Join-Path (Split-Path $LaunchTarget) 'vantare-hub.exe')+'",0')}
    if($Version){Set-ItemProperty -LiteralPath $key -Name DisplayVersion -Value $Version}
    Set-ItemProperty -LiteralPath $key -Name UninstallString -Value ('"' + $uninstallTarget + '" ' + $uninstallArgs)
    if($null -ne $PreviousUi -and $null -ne $installerUi){
        # Only previously enabled options are resolved when explicitly disabling them.
        Sync-NativeOptionalShortcuts $directory $folder @{desktop=($PreviousUi.desktop -and -not $installerUi.desktop);autostart=($PreviousUi.autostart -and -not $installerUi.autostart)} $true
    }
    Sync-NativeOptionalShortcuts $directory $folder $installerUi -LaunchTarget $LaunchTarget
    # NSIS did not persist desktop preferences. Migrate an existing owned link
    # even when /S leaves the option OFF; never create a new optional link here.
    if($null -eq $installerUi -or -not $installerUi.desktop){
        Sync-NativeOptionalShortcuts $directory $folder @{desktop=$true;autostart=$false} -LaunchTarget $LaunchTarget -ExistingOnly
    }
}

function Uninstall-NativeRegistration([string]$Directory,[bool]$DeferUninstaller=$false,[string]$KnownIdentity='', [string]$KnownFolder='') {
    $directory = Open-NativeRoot $Directory
    $identityFile = Join-Path $directory 'registration-identity.txt'
    $external = Test-Path -LiteralPath $identityFile
    $identity = if ($KnownIdentity) { $KnownIdentity } elseif ($external) { [IO.File]::ReadAllText($identityFile).Trim() } else { 'VantareNativeBeta' }
    if($external -and ([IO.File]::ReadAllText($identityFile).Trim()) -cne $identity){throw 'La identidad de desinstalación no coincide.'}
    if ($identity -cnotmatch '^[A-Za-z0-9]{1,64}$') { throw 'Identidad de registro inválida.' }
    $key = "HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/$identity"
    $registration = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
    $marker=Join-Path $directory 'installer-cleanup.json'
    $cleanup=$null
    if(Test-Path -LiteralPath $marker){
        if((Get-Item -LiteralPath $marker).Length -gt 1024){throw 'Marker de limpieza inválido.'}
        $cleanup=[IO.File]::ReadAllText($marker)|ConvertFrom-Json
        if($cleanup.schema -ne 1 -or $cleanup.sha256 -cnotmatch '^[a-f0-9]{64}$' -or
           (Get-NativeHash (Join-Path $directory 'Uninstall.exe')) -cne $cleanup.sha256){throw 'Marker de limpieza no pertenece al desinstalador.'}
    }
    if($null -eq $registration){
        # Resume only an already-started, hash-bound cleanup, with the identity
        # and folder supplied by the installer (the identity file may be gone).
        if(-not $DeferUninstaller -or -not $KnownIdentity -or -not $KnownFolder -or $null -eq $cleanup){throw 'La instalación no está registrada.'}
        $folder=$KnownFolder
    } else {
        if ((Assert-NativePath $registration.InstallLocation) -ne $directory) { throw 'El registro pertenece a otra instalación.' }
        $folder = if ($external -or ($KnownIdentity -and $KnownIdentity -cne 'VantareNativeBeta')) { $registration.ShortcutFolder } else { 'Vantare' }
    }
    if ($folder -cnotmatch '^[A-Za-z0-9][A-Za-z0-9 -]{0,63}$') { throw 'Carpeta de accesos inválida.' }
    $installerUi=Read-NativeInstallerUi $directory
    if (Test-Path -LiteralPath (Join-Path $directory 'state.json')) {
        & (Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe') -NoProfile -ExecutionPolicy Bypass -File (Join-Path $directory 'beta.ps1') -Operation Uninstall -Root $directory
        if ($LASTEXITCODE) { throw 'Cierra Vantare antes de desinstalar. Tus datos se conservan.' }
    }
    $target = Join-Path (Get-NativeProgramsFolder) $folder
    $shell = New-Object -ComObject WScript.Shell
    foreach ($name in @('Vantare Simracing Suite.lnk', 'Vantare.lnk', 'Desinstalar.lnk')) {
        $path = Join-Path $target $name
        if ((Test-Path -LiteralPath $path) -and (Test-NativeShortcutOwned ($shell.CreateShortcut($path)) $directory)) { Remove-Item -LiteralPath $path }
    }
    if ((Test-Path -LiteralPath $target) -and -not @(Get-ChildItem -LiteralPath $target -Force).Count) { Remove-Item -LiteralPath $target }
    $legacyFolder=if($null -ne $registration -and ($external -or ($KnownIdentity -and $KnownIdentity -cne 'VantareNativeBeta'))){$registration.LegacyShortcutFolder}else{'Vantare Native Beta'}
    if($legacyFolder -cnotmatch '^[A-Za-z0-9][A-Za-z0-9 -]{0,63}$'){throw 'Carpeta de accesos antigua inválida.'}
    $legacy=Join-Path (Get-NativeProgramsFolder) $legacyFolder
    foreach($name in @('Vantare Native Beta.lnk','Vantare.lnk','Desinstalar.lnk')){
        $path=Join-Path $legacy $name
        if((Test-Path -LiteralPath $path) -and (Test-NativeShortcutOwned ($shell.CreateShortcut($path)) $directory)){Remove-Item -LiteralPath $path}
    }
    if((Test-Path -LiteralPath $legacy) -and -not @(Get-ChildItem -LiteralPath $legacy -Force).Count){Remove-Item -LiteralPath $legacy}
    $optionalUi=if($null -ne $installerUi){$installerUi}elseif($null -ne $cleanup){@{desktop=$false;autostart=$false}}else{$null}
    Sync-NativeOptionalShortcuts $directory $folder $optionalUi $true
    Sync-NativeOptionalShortcuts $directory $folder @{desktop=$true;autostart=$true} $true -ExistingOnly
    if($DeferUninstaller -and $null -ne $installerUi){
        if($null -ne $cleanup){if($cleanup.sha256 -cne $installerUi.sha256){throw 'La limpieza corresponde a otro desinstalador.'}}
        else{Write-NativeJson $marker @{schema=1; sha256=$installerUi.sha256}}
    }
    if($null -ne $registration){Remove-Item -LiteralPath $key}
    foreach ($name in @('beta.ps1', 'candidate.ps1', 'registration-identity.txt', 'Uninstall.exe', 'uninstall-vantare.ps1','installer-ui.json','installer-notices.txt')) {
        if($name -ceq 'Uninstall.exe' -and $DeferUninstaller){continue}
        $path = Join-Path $directory $name
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
    }
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
        $null = Read-NativeManifest $generation $state.channel $verify -Installed
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
        $exception = [InvalidOperationException]::new('Cierre los procesos de esta instalación antes de actualizar/importar/restaurar; no se mata la aplicación.')
        $exception.Data['InstallExitCode'] = 2
        throw $exception
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
            try { $null = Read-NativeManifest (Join-Path $directory "generations/$($state.active.generation)") $state.channel -Installed }
            catch { $previous = $state.previous }
        }
        $handles = Open-NativeBinaryGuard $directory
        try {
            $id = [guid]::NewGuid().ToString('N')
            $generation = Join-Path $directory "generations/$id"
            $incoming = Expand-NativePackage $ZipPath $Hash $generation $state.channel
            if ($Repair) {
                $current = Read-NativeManifest (Join-Path $directory "generations/$($state.active.generation)") $state.channel $false -Installed
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
        $sourceManifest = Read-NativeManifest $source $state.channel -Installed
        $handles = Open-NativeBinaryGuard $directory
        try {
            $id = [guid]::NewGuid().ToString('N')
            $generation = Join-Path $directory "generations/$id"
            foreach ($member in (@($sourceManifest.files | ForEach-Object { $_.path }) + @('manifest.json'))) {
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
            $null = Read-NativeManifest $generation $state.channel -Installed
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
                $conversion=Invoke-NativeProcess -Executable $converter -Arguments $arguments
                if ($conversion.ExitCode) { throw "Conversión V4 rechazada (exit $($conversion.ExitCode)); generación anterior sigue activa. $($conversion.Stderr)" }
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
        $cargoArgs = @('build', '--offline', '--locked', '--target', 'x86_64-pc-windows-msvc', '--workspace', '--exclude', 'vantare-admin', '--exclude', 'vantare-installer', '--bins', '-j', '2')
        if ($Profile -eq 'Release') { $cargoArgs += '--release' }
        $oldVersion = $env:VANTARE_VERSION
        $oldChannel = $env:VANTARE_BUILD_CHANNEL
        $oldFlags = $env:CARGO_ENCODED_RUSTFLAGS
        try {
            $env:VANTARE_VERSION = $CandidateVersion
            $env:VANTARE_BUILD_CHANNEL = $CandidateChannel
            # Only distribution uses static CRT; development and host build
            # scripts/proc macros keep their existing target/toolchain settings.
            $flags=$oldFlags
            if(-not $flags -and $env:RUSTFLAGS){$flags=($env:RUSTFLAGS.Trim() -split '\s+') -join [char]31}
            if($flags){$flags += [char]31}
            $env:CARGO_ENCODED_RUSTFLAGS=$flags+'-C'+[char]31+'target-feature=+crt-static'
            & cargo @cargoArgs
            $buildExit = $LASTEXITCODE
        } finally {
            $env:VANTARE_VERSION = $oldVersion
            $env:VANTARE_BUILD_CHANNEL = $oldChannel
            $env:CARGO_ENCODED_RUSTFLAGS = $oldFlags
        }
        $global:LASTEXITCODE = $buildExit
        if ($LASTEXITCODE) { throw 'Falló la compilación offline.' }
        $metadata = (& cargo metadata --offline --locked --format-version 1 --filter-platform x86_64-pc-windows-msvc | ConvertFrom-Json)
        if ($LASTEXITCODE) { throw 'Falló la lectura del grafo fijado.' }
        $bins = @($metadata.packages | Where-Object { $_.id -cin $metadata.workspace_members -and $_.name -cnotin @('vantare-admin', 'vantare-installer') } | ForEach-Object { $_.targets | Where-Object { 'bin' -cin $_.kind } | ForEach-Object { $_.name } })
        Assert-NativeBuildInventory $bins
        $installerBins = @($metadata.packages | Where-Object name -CEQ 'vantare-installer' | ForEach-Object { $_.targets | Where-Object { 'bin' -cin $_.kind } | ForEach-Object { $_.name } })
        if (@(Compare-Object @('vantare-setup','vantare-uninstall') $installerBins -CaseSensitive).Count) { throw 'Inventario del instalador propio incorrecto.' }
    } finally { Pop-Location }
    $payload = Join-Path $destination 'payload'
    $dumpbin=Get-NativeDumpbin
    [IO.Directory]::CreateDirectory((Join-Path $payload 'bin')) | Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $payload 'licenses')) | Out-Null
    foreach ($bin in (Get-NativeBins $CandidateChannel)) {
        $source = Join-Path $metadata.target_directory ('x86_64-pc-windows-msvc/' + $Profile.ToLowerInvariant() + "/$bin.exe")
        Assert-NativeStaticCrt $source $dumpbin
        $probe=Invoke-NativeProcess -Executable $source -Arguments @('--version')
        $embedded=$probe.Stdout.TrimEnd([char[]]"`r`n")
        if ($probe.ExitCode -or $embedded -cne "Vantare Native $CandidateVersion ($CandidateChannel)") { throw "Versión de producto no coincide: $bin (exit $($probe.ExitCode)). $($probe.Stderr)" }
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
    'UninstallInstalled' { Uninstall-NativeRegistration $Root }
    'Register' {
        $Root = Open-NativeRoot $Root
        $launchTarget=Get-NativeLaunchTarget $Root
        if(-not $launchTarget){Sync-NativeRegistration $Root '' -LaunchTarget ''; break}
        $state = Read-NativeState $Root
        if ($state.channel -cne 'beta') { throw 'El registro solo corresponde al instalador beta.' }
        $generation = Join-Path $Root "generations/$($state.active.generation)"
        # El Hub usa el script de su generación; Setup usa la copia idéntica raíz.
        if ((Get-NativeHash $PSCommandPath) -cne (Get-NativeHash (Join-Path $generation 'candidate.ps1'))) { throw 'El registro requiere el script de la generación activa.' }
        $manifest = Read-NativeManifest $generation 'beta' $false -Installed
        Sync-NativeRegistration $Root $manifest.version -LaunchTarget $launchTarget
    }
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
