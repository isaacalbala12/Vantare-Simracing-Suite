param([Parameter(Mandatory)][string]$EvidenceDirectory,
      [string]$ConfigScript = (Join-Path $PSScriptRoot '../packaging/build-config.ps1'),
      [switch]$ExpectBlocked)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:VANTARE_CARGO_QUEUE_OWNER) { throw 'Ejecutar la prueba sin reserva exterior.' }
$root = Join-Path ([IO.Path]::GetFullPath($EvidenceDirectory)) ('config-queue-' + [guid]::NewGuid().ToString('N'))
foreach ($name in @('src', 'scripts', '.cargo')) { [IO.Directory]::CreateDirectory((Join-Path $root $name)) | Out-Null }
[IO.File]::WriteAllText((Join-Path $root 'Cargo.toml'), "[package]`nname='config-queue-probe'`nversion='0.0.0'`nedition='2024'`n")
[IO.File]::WriteAllText((Join-Path $root 'rust-toolchain.toml'), "[toolchain]`nchannel='1.95.0'`n")
[IO.File]::WriteAllText((Join-Path $root 'src/main.rs'), 'fn main() {}')
foreach ($name in @('compilar.ps1', 'target-slot.ps1', 'slot-workspace.ps1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $root "scripts/$name")
}
Copy-Item -LiteralPath $ConfigScript -Destination (Join-Path $root 'build-config.ps1')
. $ConfigScript
foreach ($name in @('VANTARE_CARGO_QUEUE_OWNER', 'VANTARE_SLOT_TARGET', 'VANTARE_CI_TARGET', 'VANTARE_TARGET_ROOT')) {
    $injected = Join-Path $root 'forbidden-public.cfg'
    [IO.File]::WriteAllText($injected, "$name=123")
    $rejected = $false
    try { $null = Import-NativeBuildConfig $injected }
    catch { $rejected = $_.Exception.Message -like 'Variable desconocida o repetida:*' }
    if (-not $rejected) { throw 'Una ConfigFile pública pudo falsificar la reserva de compilación.' }
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../.cargo/config.toml') -Destination (Join-Path $root '.cargo/config.toml')
[IO.File]::WriteAllText((Join-Path $root 'child.ps1'), @'
param([string]$TargetDirectory)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-config.ps1')
$before=$env:VANTARE_CARGO_QUEUE_OWNER
$old=Import-NativeBuildConfig $null
try {
    Write-Host "queue-owner-before=$before; queue-owner-after=$env:VANTARE_CARGO_QUEUE_OWNER"
    & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'scripts/compilar.ps1') cargo build --manifest-path (Join-Path $PSScriptRoot 'Cargo.toml') --locked --offline
    if($LASTEXITCODE){throw 'Falla el build anidado.'}
    if(-not (Test-Path -LiteralPath (Join-Path $TargetDirectory 'debug/config-queue-probe.exe'))){throw 'Target anidado incorrecto.'}
} finally {Restore-NativeBuildConfig $old}
'PASS: candidato anidado termina y conserva el target.'
'@)
Push-Location $root
try {
    & cargo generate-lockfile --offline
    if ($LASTEXITCODE) { throw 'No se pudo preparar la fixture.' }
    $start = [Diagnostics.ProcessStartInfo]::new((Get-Command pwsh).Source)
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.WorkingDirectory = $root
    $start.Environment['VANTARE_SCCACHE'] = '0'
    $null = $start.Environment.Remove('RUSTC_WRAPPER')
    foreach ($argument in @('-NoProfile','-File',(Join-Path $root 'scripts/compilar.ps1'),
        'pwsh','-NoProfile','-File',(Join-Path $root 'child.ps1'),'-TargetDirectory',(Join-Path $root 'target'))) {
        $start.ArgumentList.Add($argument)
    }
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $process = [Diagnostics.Process]::Start($start)
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    # A finite process deadline is the regression oracle for the queue deadlock.
    $blocked = -not $process.WaitForExit(15000)
    if ($blocked) { $process.Kill($true); $process.WaitForExit() } # Only this fixture's owned process tree.
    $clock.Stop()
    $text = $stdout.GetAwaiter().GetResult() + $stderr.GetAwaiter().GetResult()
    $text | Set-Content (Join-Path $root 'process.log')
    [ordered]@{blocked=$blocked;seconds=$clock.Elapsed.TotalSeconds;exit=$process.ExitCode;expected_block=[bool]$ExpectBlocked} |
        ConvertTo-Json | Set-Content (Join-Path $root 'result.json')
    if ($ExpectBlocked -and -not $blocked) { throw 'No se reprodujo el bloqueo anterior.' }
    if (-not $ExpectBlocked -and ($blocked -or $process.ExitCode -ne 0)) { throw "La reserva anidada sigue fallando: $text" }
    Write-Host "PASS: blocked=$blocked; duración=$($clock.Elapsed.TotalSeconds); evidencia=$root"
} finally { Pop-Location }
