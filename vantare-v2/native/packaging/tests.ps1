#requires -Version 5.1
param([Parameter(Mandatory = $true)][string]$ArtifactsDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'candidate.ps1')
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
$script:TestRoot = Join-Path ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../target'))) ('phase7-tests-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($script:TestRoot) | Out-Null
Write-Output "Evidencia conservada en $script:TestRoot"

$install = Join-Path $script:TestRoot 'installed with spaces'
$state = Install-NativeCandidate $install $script:Package $hash 'nightly'
$active = Join-Path $install "generations/$($state.active.generation)"
Assert-True ($state.channel -ceq 'nightly' -and $null -eq $state.previous) 'instalación nueva sin versión anterior'
foreach ($bin in $script:NativeBins) {
    Assert-True ((Get-NativeHash (Join-Path $active "bin/$bin.exe")) -ceq (Get-NativeHash (Join-Path $ArtifactsDirectory "payload/bin/$bin.exe"))) "binario real instalado sin alteración: $bin"
}
Assert-Rejected { Install-NativeCandidate $install $script:Package $hash 'nightly' } 'no reinstala encima de datos activos'
Assert-Rejected { Install-NativeCandidate (Join-Path $script:TestRoot 'bad-hash') $script:Package ('0' * 64) 'nightly' } 'rechaza SHA externo incorrecto'
Assert-Rejected { Install-NativeCandidate (Join-Path $script:TestRoot 'no-hash') $script:Package '' 'nightly' } 'exige SHA externo'
Assert-Rejected { Install-NativeCandidate (Join-Path $script:TestRoot 'wrong-channel') $script:Package $hash 'testers' } 'rechaza canal distinto'
Assert-Rejected { Install-NativeCandidate $ArtifactsDirectory $script:Package $hash 'nightly' } 'preserva carpeta ajena no vacía'

$truncated = Join-Path $script:TestRoot 'truncated.zip'
$bytes = [IO.File]::ReadAllBytes($script:Package)
[IO.File]::WriteAllBytes($truncated, $bytes[0..127])
Assert-Rejected { Install-NativeCandidate (Join-Path $script:TestRoot 'truncated') $truncated (Get-NativeHash $truncated) 'nightly' } 'ZIP truncado no activa estado'

foreach ($member in @('../escape.exe', 'bin/vantare.exe:stream', 'bin/CON.exe', '.env', 'BIN/vantare.exe', '/escape.exe')) {
    $malicious = New-TestArchive ('invalid-' + [guid]::NewGuid().ToString('N')) { param($zip); $null = $zip.CreateEntry($member) }
    Assert-Rejected { Install-NativeCandidate (Join-Path $script:TestRoot ([guid]::NewGuid().ToString('N'))) $malicious (Get-NativeHash $malicious) 'nightly' } "rechaza miembro no autorizado: $member"
}
$duplicate = New-TestArchive 'duplicate' { param($zip); $null = $zip.CreateEntry('bin/vantare.exe') }
Assert-Rejected { Install-NativeCandidate (Join-Path $script:TestRoot 'duplicate') $duplicate (Get-NativeHash $duplicate) 'nightly' } 'rechaza miembros duplicados'
$missing = New-TestArchive 'missing' { param($zip); $zip.GetEntry('bin/vantare.exe').Delete() }
Assert-Rejected { Install-NativeCandidate (Join-Path $script:TestRoot 'missing') $missing (Get-NativeHash $missing) 'nightly' } 'rechaza paquete incompleto'
$tampered = New-TestArchive 'tampered' {
    param($zip)
    $entry = $zip.GetEntry('bin/vantare-core.exe'); $entry.Delete()
    $writer = [IO.StreamWriter]::new($zip.CreateEntry('bin/vantare-core.exe').Open())
    try { $writer.Write('no es un ejecutable') } finally { $writer.Dispose() }
}
Assert-Rejected { Install-NativeCandidate (Join-Path $script:TestRoot 'tampered') $tampered (Get-NativeHash $tampered) 'nightly' } 'detecta archivo alterado aunque el SHA externo coincida'

$portable = Join-Path $script:TestRoot 'portable'
[IO.Compression.ZipFile]::ExtractToDirectory((Join-Path $ArtifactsDirectory 'vantare-native-portable-amd64.zip'), $portable)
$portableState = Read-NativeState (Open-NativeRoot $portable)
Assert-True ((Get-NativeHash (Join-Path $portable "generations/$($portableState.active.generation)/bin/vantare.exe")) -ceq (Get-NativeHash (Join-Path $active 'bin/vantare.exe'))) 'portable tiene los mismos binarios que instalación'

# CLI real de los seis exe: argumento inválido; no abre juego, UI o red.
foreach ($bin in $script:NativeBins) {
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = Join-Path $active "bin/$bin.exe"
    $info.Arguments = '--phase7-invalid-option'
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($info)
    try {
        if (-not $process.WaitForExit(10000)) { $process.Kill(); throw "Smoke excede plazo: $bin" }
        $stderr = $process.StandardError.ReadToEnd()
        [IO.File]::WriteAllText((Join-Path $script:TestRoot "$bin-smoke.log"), $stderr)
        Assert-True ($process.ExitCode -eq 2 -and $stderr.Length -gt 0) "exe empaquetado carga y rechaza argumento inválido: $bin"
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
Write-Output "$script:Passed comprobaciones PASS. Sin pruebas físicas ni red."
