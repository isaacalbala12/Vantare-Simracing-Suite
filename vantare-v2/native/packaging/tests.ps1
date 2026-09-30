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
Write-Output "$script:Passed comprobaciones PASS. Sin pruebas físicas ni red."
