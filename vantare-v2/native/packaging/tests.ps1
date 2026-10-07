#requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$ArtifactsDirectory,
    [ValidateSet('nightly', 'beta')][string]$Channel = 'nightly',
    [string]$EvidenceDirectory = (Join-Path ([IO.Path]::GetTempPath()) 'vantare-native-packaging-evidence')
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'candidate.ps1') -Channel $Channel
$script:Passed = 0

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "ASSERT: $Message" }
    $script:Passed++
    Write-Output "PASS $Message"
}

function Assert-Rejected([scriptblock]$Action, [string]$Message) {
    $failed = $false
    try { $null = & $Action } catch { $failed = $true }
    Assert-True $failed $Message
}

function New-TestArchive([string]$Name, [scriptblock]$Change) {
    $dest = Join-Path $script:TestRoot "$Name.zip"
    Copy-Item -LiteralPath $script:Package -Destination $dest
    $zip = [IO.Compression.ZipFile]::Open($dest, [IO.Compression.ZipArchiveMode]::Update)
    try { & $Change $zip } finally { $zip.Dispose() }
    $dest
}

function Set-TestManifest($Zip, [scriptblock]$Change) {
    $entry = $Zip.GetEntry('manifest.json')
    $reader = [IO.StreamReader]::new($entry.Open())
    try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    & $Change $manifest
    $entry.Delete()
    $writer = [IO.StreamWriter]::new($Zip.CreateEntry('manifest.json').Open())
    try { $writer.Write(($manifest | ConvertTo-Json -Depth 15)) } finally { $writer.Dispose() }
}

$ArtifactsDirectory = Assert-NativePath $ArtifactsDirectory
$script:Package = Join-Path $ArtifactsDirectory 'vantare-native-amd64-package.zip'
$hash = Get-NativeHash $script:Package
$script:TestRoot = Join-Path (Assert-NativePath $EvidenceDirectory) ('phase7-tests-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($script:TestRoot) | Out-Null
Write-Output "Evidencia conservada en $script:TestRoot"
if ($Channel -ceq 'beta') {
    Assert-True ('vantare-workshop' -cnotin $script:NativeBins) 'beta excluye Workshop de su inventario'
}

$install = Join-Path $script:TestRoot 'installed with spaces'
$state = Install-NativeCandidate $install $script:Package $hash $Channel
$active = Join-Path $install "generations/$($state.active.generation)"
Assert-True ($state.channel -ceq $Channel -and $null -eq $state.previous) 'instalación nueva sin versión anterior'
foreach ($bin in $script:NativeBins) {
    Assert-True ((Get-NativeHash (Join-Path $active "bin/$bin.exe")) -ceq (Get-NativeHash (Join-Path $ArtifactsDirectory "payload/bin/$bin.exe"))) "binario real instalado sin alteración: $bin"
    Assert-True ([IO.File]::ReadAllText((Join-Path $active "bin/$bin.exe.sha256")) -ceq "$(Get-NativeHash (Join-Path $active "bin/$bin.exe"))  $bin.exe`n") "sidecar de binario verificado: $bin"
}
foreach ($fixture in $script:NativeFixtures) {
    Assert-True ((Get-NativeHash (Join-Path $active $fixture)) -ceq (Get-NativeHash (Join-Path $ArtifactsDirectory "payload/$fixture"))) "fixture instalado sin alteración: $fixture"
}
# El script instalado no dispone de ../ui/fixtures ni del checkout de compilación.
& (Join-Path $active 'candidate.ps1') -Operation Status -Root $install | Out-Null
Assert-True ($? -and (Test-Path -LiteralPath (Join-Path $install 'state.json'))) 'candidate instalado carga fuera del árbol de fuentes'
Assert-True (-not (Test-Path -LiteralPath (Join-Path $active 'bin/vantare-admin.exe'))) 'la miniapp owner no entra en el instalador público'
Assert-True ((Test-Path -LiteralPath (Join-Path $active 'bin/vantare-workshop.exe')) -eq ($Channel -cne 'beta')) 'Workshop instalado solo fuera de beta'
if ($Channel -ceq 'beta') {
    $workshopArchive = New-TestArchive 'unexpected-workshop' {
        param($zip)
        $null = $zip.CreateEntry('bin/vantare-workshop.exe')
        $null = $zip.CreateEntry('bin/vantare-workshop.exe.sha256')
    }
    Assert-Rejected { Install-NativeCandidate (Join-Path $script:TestRoot 'with-workshop') $workshopArchive (Get-NativeHash $workshopArchive) $Channel } 'beta rechaza Workshop añadido al ZIP'
}
Assert-Rejected { Install-NativeCandidate $install $script:Package $hash $Channel } 'no reinstala encima de datos activos'
Assert-Rejected { Install-NativeCandidate (Join-Path $script:TestRoot 'bad-hash') $script:Package ('0' * 64) $Channel } 'rechaza SHA externo incorrecto'
Assert-Rejected { Install-NativeCandidate (Join-Path $script:TestRoot 'no-hash') $script:Package '' $Channel } 'exige SHA externo'
Assert-Rejected { Install-NativeCandidate (Join-Path $script:TestRoot 'wrong-channel') $script:Package $hash 'testers' } 'rechaza canal distinto'
Assert-Rejected { Install-NativeCandidate $ArtifactsDirectory $script:Package $hash $Channel } 'preserva carpeta ajena no vacía'

$truncated = Join-Path $script:TestRoot 'truncated.zip'
$bytes = [IO.File]::ReadAllBytes($script:Package)
[IO.File]::WriteAllBytes($truncated, $bytes[0..127])
Assert-Rejected { Install-NativeCandidate (Join-Path $script:TestRoot 'truncated') $truncated (Get-NativeHash $truncated) $Channel } 'ZIP truncado no activa estado'

foreach ($member in @('../escape.exe', 'bin/vantare.exe:stream', 'bin/CON.exe', '.env', 'BIN/vantare.exe', '/escape.exe')) {
    $malicious = New-TestArchive ('invalid-' + [guid]::NewGuid().ToString('N')) { param($zip); $null = $zip.CreateEntry($member) }
    Assert-Rejected { Install-NativeCandidate (Join-Path $script:TestRoot ([guid]::NewGuid().ToString('N'))) $malicious (Get-NativeHash $malicious) $Channel } "rechaza miembro no autorizado: $member"
}
$duplicate = New-TestArchive 'duplicate' { param($zip); $null = $zip.CreateEntry('bin/vantare.exe') }
Assert-Rejected { Install-NativeCandidate (Join-Path $script:TestRoot 'duplicate') $duplicate (Get-NativeHash $duplicate) $Channel } 'rechaza miembros duplicados'
$missing = New-TestArchive 'missing' { param($zip); $zip.GetEntry('bin/vantare.exe').Delete() }
Assert-Rejected { Install-NativeCandidate (Join-Path $script:TestRoot 'missing') $missing (Get-NativeHash $missing) $Channel } 'rechaza paquete incompleto'
$tampered = New-TestArchive 'tampered' {
    param($zip)
    $entry = $zip.GetEntry('bin/vantare-core.exe'); $entry.Delete()
    $writer = [IO.StreamWriter]::new($zip.CreateEntry('bin/vantare-core.exe').Open())
    try { $writer.Write('no es un ejecutable') } finally { $writer.Dispose() }
}
Assert-Rejected { Install-NativeCandidate (Join-Path $script:TestRoot 'tampered') $tampered (Get-NativeHash $tampered) $Channel } 'detecta archivo alterado aunque el SHA externo coincida'
$badSidecar = New-TestArchive 'bad-sidecar' {
    param($zip)
    $name = 'bin/vantare-hub.exe.sha256'
    $zip.GetEntry($name).Delete()
    $writer = [IO.StreamWriter]::new($zip.CreateEntry($name).Open())
    try { $writer.Write('checksum falso') } finally { $writer.Dispose() }
    Set-TestManifest $zip {
        param($m)
        $file = $m.files | Where-Object { $_.path -ceq $name }
        $file.size = 14
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $file.sha256 = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes('checksum falso'))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
    }
}
Assert-Rejected { Install-NativeCandidate (Join-Path $script:TestRoot 'bad-sidecar') $badSidecar (Get-NativeHash $badSidecar) $Channel } 'sidecar de Hub alterado rechaza instalación'

$portable = Join-Path $script:TestRoot 'portable'
[IO.Compression.ZipFile]::ExtractToDirectory((Join-Path $ArtifactsDirectory 'vantare-native-portable-amd64.zip'), $portable)
$portableState = Read-NativeState (Open-NativeRoot $portable)
Assert-True ((Get-NativeHash (Join-Path $portable "generations/$($portableState.active.generation)/bin/vantare.exe")) -ceq (Get-NativeHash (Join-Path $active 'bin/vantare.exe'))) 'portable tiene los mismos binarios que instalación'

# CLI real de todos los exe: argumentos inválidos; no abre DB, juego, UI o red.
foreach ($bin in $script:NativeBins) {
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = Join-Path $active "bin/$bin.exe"
    $info.Arguments = '--phase7-invalid-option'
    $expectedExit = 2
    if ($bin -cin @('vantare-engineer', 'vantare-services')) { $expectedExit = 1 }
    if ($bin -ceq 'vantare-storage') {
        # Storage recibe ruta posicional; el segundo argumento invalida antes de abrirla.
        $info.Arguments = 'unused.db --phase7-invalid-option'
        $expectedExit = 1
    }
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($info)
    try {
        if (-not $process.WaitForExit(10000)) { $process.Kill(); throw "Smoke excede plazo: $bin" }
        $stderr = $process.StandardError.ReadToEnd()
        [IO.File]::WriteAllText((Join-Path $script:TestRoot "$bin-smoke.log"), $stderr)
        Assert-True ($process.ExitCode -eq $expectedExit -and $stderr.Length -gt 0) "exe empaquetado carga y rechaza argumento inválido: $bin"
    } finally { $process.Dispose() }
}
$lock = Open-NativeLock $install
try { Assert-Rejected { Open-NativeLock $install } 'lock impide operaciones concurrentes' } finally { $lock.Dispose() }

Assert-Rejected { Restore-NativeCandidate $install } 'rollback sin anterior preserva la instalación'
$oldId = $state.active.generation
$oldData = Join-Path $active 'data/marker.txt'
[IO.File]::WriteAllText($oldData, 'antes')
$updatedArchive = New-TestArchive 'next-version' { param($zip); Set-TestManifest $zip { param($m); $m.version = '0.0.1-local' } }
$updatedHash = Get-NativeHash $updatedArchive
$state = Update-NativeCandidate $install $updatedArchive $updatedHash
$newData = Join-Path $install "generations/$($state.active.generation)/data/marker.txt"
Assert-True ($state.active.generation -cne $oldId -and $state.previous.generation -ceq $oldId) 'actualización cambia binarios/datos como una generación'
Assert-True ([IO.File]::ReadAllText($newData) -ceq 'antes') 'actualización conserva datos por copia'
[IO.File]::WriteAllText($newData, 'después')
$state = Restore-NativeCandidate $install
Assert-True ($state.active.generation -ceq $oldId -and [IO.File]::ReadAllText($oldData) -ceq 'antes') 'rollback recupera datos anteriores sin escrituras posteriores'
$state = Restore-NativeCandidate $install
Assert-True ([IO.File]::ReadAllText($newData) -ceq 'después') 'generación retirada conserva también sus datos para inspección/reversión'
$stateHash = Get-NativeHash (Join-Path $install 'state.json')
$wrongSchema = New-TestArchive 'wrong-schema' { param($zip); Set-TestManifest $zip { param($m); $m.data_schema = 'unknown-v2' } }
Assert-Rejected { Update-NativeCandidate $install $wrongSchema (Get-NativeHash $wrongSchema) } 'actualización rechaza esquema de datos desconocido'
Assert-True ((Get-NativeHash (Join-Path $install 'state.json')) -ceq $stateHash) 'rechazo de esquema no cambia versión activa'
$wrongChannel = New-TestArchive 'wrong-channel-update' { param($zip); Set-TestManifest $zip { param($m); $m.channel = 'testers' } }
Assert-Rejected { Update-NativeCandidate $install $wrongChannel (Get-NativeHash $wrongChannel) } 'actualización no cambia canal'
Assert-True ((Get-NativeHash (Join-Path $install 'state.json')) -ceq $stateHash) 'rechazo de canal preserva estado'

# Mata el actualizador real en una frontera mediante eventos Win32/.NET,
# sin sleeps ni una excepción que simule la muerte del proceso.
$childScript = Join-Path $script:TestRoot 'interrupted-update.ps1'
[IO.File]::WriteAllText($childScript, @'
param($ScriptFile, $InstallRoot, $ZipPath, $Hash, $StopAt, $ReadyEvent)
$ErrorActionPreference = 'Stop'
. $ScriptFile
function Invoke-NativeCheckpoint([string]$Point) {
    if ($Point -ceq $StopAt) {
        $ready = [Threading.EventWaitHandle]::OpenExisting($ReadyEvent)
        $null = $ready.Set(); $ready.Dispose()
        $never = [Threading.ManualResetEvent]::new($false)
        $null = $never.WaitOne()
    }
}
$null = Update-NativeCandidate $InstallRoot $ZipPath $Hash
'@, [Text.UTF8Encoding]::new($true))
foreach ($point in @('staged', 'before-commit', 'after-commit')) {
    $before = Read-NativeState $install
    $readyName = 'Local\vantare-packaging-test-' + [guid]::NewGuid().ToString('N')
    $ready = [Threading.EventWaitHandle]::new($false, [Threading.EventResetMode]::ManualReset, $readyName)
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = Join-Path $PSHOME 'powershell.exe'
    $info.Arguments = "-NoProfile -File `"$childScript`" -ScriptFile `"$(Join-Path $PSScriptRoot 'candidate.ps1')`" -InstallRoot `"$install`" -ZipPath `"$updatedArchive`" -Hash $updatedHash -StopAt $point -ReadyEvent $readyName"
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($info)
    try {
        if (-not $ready.WaitOne(30000)) {
            if (-not $process.HasExited) { $process.Kill(); $null = $process.WaitForExit(10000) }
            throw "No llegó a checkpoint $point. $($process.StandardError.ReadToEnd())"
        }
        $process.Kill()
        Assert-True ($process.WaitForExit(10000)) "actualizador terminado abruptamente: $point"
    } finally {
        if (-not $process.HasExited) { $process.Kill(); $null = $process.WaitForExit(10000) }
        $process.Dispose(); $ready.Dispose()
    }
    $after = Read-NativeState $install
    if ($point -ceq 'after-commit') {
        Assert-True ($after.active.generation -cne $before.active.generation -and $after.previous.generation -ceq $before.active.generation) 'muerte tras commit conserva generación nueva completa y rollback'
        $after = Restore-NativeCandidate $install
        Assert-True ($after.active.generation -ceq $before.active.generation) 'rollback después de matar actualizador recupera binarios y datos'
    } else {
        Assert-True ($after.active.generation -ceq $before.active.generation) "muerte antes del commit conserva versión activa: $point"
    }
    $lock = Open-NativeLock $install; $lock.Dispose()
    Assert-True $true "Windows libera lock tras muerte: $point"
}

# Un núcleo real de esta instalación permanece vivo con replay y stdin abierto.
$running = Read-NativeState $install
$info = [Diagnostics.ProcessStartInfo]::new()
$info.FileName = Join-Path $install "generations/$($running.active.generation)/bin/vantare-core.exe"
$fixture = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../testdata/lmu-fixture.bin'))
$info.Arguments = "--replay `"$fixture`" --build 1.3.0.0 --pipe phase7-$([guid]::NewGuid().ToString('N'))"
$info.UseShellExecute = $false; $info.CreateNoWindow = $true
$info.RedirectStandardInput = $true; $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
$process = [Diagnostics.Process]::Start($info)
try {
    Assert-Rejected { Update-NativeCandidate $install $updatedArchive $updatedHash } 'actualización rechaza exe real ejecutándose sin matarlo'
    Assert-Rejected { Restore-NativeCandidate $install } 'rollback rechaza exe real ejecutándose'
    Assert-True (-not $process.HasExited) 'núcleo sigue vivo tras rechazo de actualización'
    $process.StandardInput.Close()
    Assert-True ($process.WaitForExit(10000)) 'núcleo de prueba cierra por EOF del stdin'
} finally {
    if (-not $process.HasExited) { $process.Kill(); $null = $process.WaitForExit(10000) }
    $process.Dispose()
}

# Perfil REAL versionado de Wails: se preservan bytes, no se simula conversión.
$profileFile = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../pkg/config/testdata/profile-v2-general-layout.json'))
$profileHash = Get-NativeHash $profileFile
$before = Read-NativeState $install
$state = Import-NativeProfiles $install @($profileFile)
$importDir = Join-Path $install "generations/$($state.active.generation)/data/legacy-profiles/$($state.active.generation)"
Assert-True ((Get-NativeHash (Join-Path $importDir ([IO.Path]::GetFileName($profileFile)))) -ceq $profileHash) 'perfil Wails real archivado byte por byte'
Assert-True ((Get-NativeHash $profileFile) -ceq $profileHash) 'origen Wails no se modifica'
$receipt = [IO.File]::ReadAllText((Join-Path $importDir 'import.json')) | ConvertFrom-Json
Assert-True ($receipt.conversion -ceq 'none' -and $receipt.files[0].sha256 -ceq $profileHash) 'recibo identifica copia opaca sin conversión ni activación'
$state = Restore-NativeCandidate $install
Assert-True ($state.active.generation -ceq $before.active.generation -and -not (Test-Path -LiteralPath (Join-Path $install "generations/$($state.active.generation)/data/legacy-profiles"))) 'rollback deshace importación sin borrar origen ni archivo importado'
Assert-True (Test-Path -LiteralPath $importDir) 'archivo importado se conserva en generación retirada'
$stateHash = Get-NativeHash (Join-Path $install 'state.json')
Assert-Rejected { Import-NativeProfiles $install @() } 'importación exige archivos explícitos'
Assert-Rejected { Import-NativeProfiles $install @((Join-Path $script:TestRoot '.env-do-not-open.json')) } 'rechaza .env antes de abrir archivo incluso inexistente'
$notProfile = Join-Path $script:TestRoot 'app-settings.json'
[IO.File]::WriteAllText($notProfile, '{"language":"es"}')
Assert-Rejected { Import-NativeProfiles $install @($notProfile) } 'no importa ajustes como perfil'
Assert-True ((Get-NativeHash (Join-Path $install 'state.json')) -ceq $stateHash) 'importaciones rechazadas preservan estado'

# Conversión V4 real por el CLI empaquetado, activación y reversión de layout.
$v4 = Join-Path $PSScriptRoot 'fixtures/studio-v4.json'
$v4Hash = Get-NativeHash $v4
$before = Read-NativeState $install
$previousLayout = Join-Path $install "generations/$($before.active.generation)/data/layout.json"
[IO.File]::WriteAllText($previousLayout, '{"version":1,"instances":[]}')
$previousHash = Get-NativeHash $previousLayout
$state = & (Join-Path $PSScriptRoot 'candidate.ps1') -Operation ImportLayout -Root $install -ProfileFiles @($v4) -MonitorBounds @(-2560, 100, 2560, 1440) | ConvertFrom-Json
$convertedData = Join-Path $install "generations/$($state.active.generation)/data"
$layoutJson = [IO.File]::ReadAllText((Join-Path $convertedData 'layout.json')) | ConvertFrom-Json
Assert-True ($layoutJson.instances.Count -eq 4 -and $layoutJson.instances[0].x -eq -2368 -and $layoutJson.instances[0].opacity -eq 0.6) 'V4 convierte posición global/opacidad con Settings nativo'
Assert-True (-not $layoutJson.instances[1].visible -and -not $layoutJson.instances[2].visible -and $layoutJson.instances[0].settings.showBrand) 'V4 preserva enabled y overrides; visibleWhen se oculta'
$reportPath = Join-Path $convertedData "legacy-profiles/$($state.active.generation)/native/report.json"
$report = [IO.File]::ReadAllText($reportPath) | ConvertFrom-Json
Assert-True ($report.imported -eq 4 -and @($report.notices | Where-Object { $_.reason -clike 'tipo no portado:*' }).Count -eq 4) 'informe identifica cuatro tipos no portados'
Assert-True ((Get-NativeHash $v4) -ceq $v4Hash -and (Get-NativeHash $previousLayout) -ceq $previousHash) 'conversión no altera original ni layout anterior'
$state = Restore-NativeCandidate $install
Assert-True ($state.active.generation -ceq $before.active.generation -and (Get-NativeHash $previousLayout) -ceq $previousHash) 'rollback de V4 restaura layout previo con binarios/datos'
Assert-True (Test-Path -LiteralPath $reportPath) 'informe y layout importados sobreviven en generación retirada'
$stateHash = Get-NativeHash (Join-Path $install 'state.json')
Assert-Rejected { Import-NativeProfiles $install @($profileFile) @(0, 0, 1920, 1080) } 'conversión rechaza V2 sin migración implícita'
Assert-Rejected { Import-NativeProfiles $install @($v4) @(0, 0, 0, 1080) } 'conversión rechaza monitor inválido'
Assert-True ((Get-NativeHash (Join-Path $install 'state.json')) -ceq $stateHash) 'conversión fallida conserva generación activa'

$malformed = New-TestArchive 'bad-files-list' { param($zip); Set-TestManifest $zip { param($m); $m.files[0].path = 'bin/../escape.exe' } }
Assert-Rejected { Update-NativeCandidate $install $malformed (Get-NativeHash $malformed) } 'rechaza escape en lista del manifiesto'
$link = New-TestArchive 'symlink' { param($zip); $zip.GetEntry('README.md').ExternalAttributes = -1610612736 }
Assert-Rejected { Update-NativeCandidate $install $link (Get-NativeHash $link) } 'rechaza symlink de ZIP antes de extracción'

# El launcher REAL supervisa dos núcleos de replay. El segundo ocupa el lugar
# de overlays solo para probar lifecycle sin abrir GPUI; no prueba paridad UI.
$launchScript = Join-Path $script:TestRoot 'launch.ps1'
[IO.File]::WriteAllText($launchScript, @'
param($ScriptFile, $InstallRoot, $CoreExe, $Fixture, $Instance, $PipeOne, $PipeTwo)
& $ScriptFile -Operation Start -Root $InstallRoot -ApplicationArgs @(
    '--core-bin', $CoreExe, '--overlays-bin', $CoreExe, '--instancia', $Instance,
    '--', '--replay', $Fixture, '--build', '1.3.0.0', '--pipe', $PipeOne,
    '--', '--replay', $Fixture, '--build', '1.3.0.0', '--pipe', $PipeTwo)
'@, [Text.UTF8Encoding]::new($true))
$state = Read-NativeState $install
$launcherExe = Join-Path $install "generations/$($state.active.generation)/bin/vantare.exe"
$coreExe = Join-Path $install "generations/$($state.active.generation)/bin/vantare-core.exe"
$instance = 'phase7-' + [guid]::NewGuid().ToString('N')
$info = [Diagnostics.ProcessStartInfo]::new()
$info.FileName = Join-Path $PSHOME 'powershell.exe'
$info.Arguments = "-NoProfile -File `"$launchScript`" -ScriptFile `"$(Join-Path $PSScriptRoot 'candidate.ps1')`" -InstallRoot `"$install`" -CoreExe `"$coreExe`" -Fixture `"$fixture`" -Instance $instance -PipeOne $instance-one -PipeTwo $instance-two"
$info.UseShellExecute = $false; $info.CreateNoWindow = $true
$info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
$process = [Diagnostics.Process]::Start($info)
$launcher = $null
try {
    if (-not $process.WaitForExit(10000)) { $process.Kill(); throw 'Herramienta de arranque no termina.' }
    $out = $process.StandardOutput.ReadToEnd(); $err = $process.StandardError.ReadToEnd()
    [IO.File]::WriteAllText((Join-Path $script:TestRoot 'start-handoff.log'), "$out`n$err")
    Assert-True ($process.ExitCode -eq 0) 'herramienta temporal de arranque termina tras entregar ownership al launcher'
    $launcher = [Diagnostics.Process]::GetProcessById(($out | ConvertFrom-Json).launcher_pid)
    # Conservar handle antes de que muera: GetProcessById solo no retiene ExitCode.
    $null = $launcher.Handle; $launcher.EnableRaisingEvents = $true
    Assert-True (-not $launcher.WaitForExit(500)) 'launcher nativo sigue vivo después de terminar PowerShell'
    $lock = Open-NativeLock $install; $lock.Dispose()
    Assert-Rejected { Update-NativeCandidate $install $updatedArchive $updatedHash } 'exe guard protege la carrera sin un wrapper PowerShell residente'
    $stopInfo = [Diagnostics.ProcessStartInfo]::new()
    $stopInfo.FileName = $launcherExe; $stopInfo.Arguments = "--parar --instancia $instance"
    $stopInfo.UseShellExecute = $false; $stopInfo.CreateNoWindow = $true
    $stop = [Diagnostics.Process]::Start($stopInfo)
    try { Assert-True ($stop.WaitForExit(10000) -and $stop.ExitCode -eq 0) 'señal de cierre usa solo instancia de prueba' } finally { $stop.Dispose() }
    Assert-True ($launcher.WaitForExit(10000) -and $launcher.HasExited -and $launcher.ExitCode -eq 0) 'launcher cierra sus dos hijos de replay por ciclo de vida nativo'
} finally {
    if ($null -ne $launcher) {
        if (-not $launcher.HasExited) { $launcher.Kill(); $null = $launcher.WaitForExit(10000) }
        $launcher.Dispose()
    }
    $process.Dispose()
}

# Ejecutar los comandos públicos del instalador, no solo las funciones de test.
foreach ($operation in @('Status', 'Update', 'Rollback')) {
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = Join-Path $PSHOME 'powershell.exe'
    $info.Arguments = "-NoProfile -File `"$(Join-Path $PSScriptRoot 'candidate.ps1')`" -Operation $operation -Root `"$install`" -Archive `"$updatedArchive`" -ExpectedSha256 $updatedHash"
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($info)
    try {
        if (-not $process.WaitForExit(20000)) { $process.Kill(); throw "CLI $operation excede plazo." }
        $out = $process.StandardOutput.ReadToEnd(); $err = $process.StandardError.ReadToEnd()
        [IO.File]::WriteAllText((Join-Path $script:TestRoot "cli-$operation.log"), "$out`n$err")
        Assert-True ($process.ExitCode -eq 0 -and ($out | ConvertFrom-Json).active.generation -cmatch '^[0-9a-f]{32}$') "CLI pública: $operation"
    } finally { $process.Dispose() }
}

$stateFile = Join-Path $install 'state.json'
$originalState = [IO.File]::ReadAllBytes($stateFile)
try {
    $bad = [IO.File]::ReadAllText($stateFile) | ConvertFrom-Json
    $bad.active.generation = '../escape'
    [IO.File]::WriteAllText($stateFile, ($bad | ConvertTo-Json -Depth 5))
    Assert-Rejected { Read-NativeState $install } 'estado manipulado no permite escapar de generations ni activa fallback'
} finally { [IO.File]::WriteAllBytes($stateFile, $originalState) }
Assert-True ((Read-NativeState $install).active.generation -cmatch '^[0-9a-f]{32}$') 'restauración de estado de prueba conserva instalación válida'
Write-Output "$script:Passed comprobaciones PASS. Sin pruebas físicas ni red."
