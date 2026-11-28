param([Parameter(Mandatory)][string]$EvidenceDirectory,
      [string]$QueueScript = (Join-Path $PSScriptRoot 'compilar.ps1'))
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:VANTARE_CARGO_QUEUE_OWNER) { throw 'Ejecutar la prueba sin reserva exterior.' }
$root = Join-Path ([IO.Path]::GetFullPath($EvidenceDirectory)) ('caller-target-' + [guid]::NewGuid().ToString('N'))
foreach ($directory in @('src', 'scripts', '.cargo')) { [IO.Directory]::CreateDirectory((Join-Path $root $directory)) | Out-Null }
[IO.File]::WriteAllText((Join-Path $root 'Cargo.toml'), "[package]`nname='caller-target-probe'`nversion='0.0.0'`nedition='2024'`n")
[IO.File]::WriteAllText((Join-Path $root 'rust-toolchain.toml'), "[toolchain]`nchannel='1.99.1'`n")
[IO.File]::WriteAllText((Join-Path $root 'src/main.rs'), 'fn main() { println!("caller target {:?}", std::env::args().skip(1).collect::<Vec<_>>()); }')
foreach ($name in @('compilar.ps1', 'target-slot.ps1', 'slot-workspace.ps1', 'queue-decision.ps1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $root "scripts/$name")
}
Copy-Item -LiteralPath $QueueScript -Destination (Join-Path $root 'scripts/compilar.ps1') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../.cargo/config.toml') -Destination (Join-Path $root '.cargo/config.toml')
$old = $env:CARGO_TARGET_DIR
$env:VANTARE_SCCACHE = '0'

# --- #2862: un destino explícito nunca entra en una ranura de la cola ---
. (Join-Path $root 'scripts/target-slot.ps1')
foreach ($case in @(
        @('D:\cola\slot-0', $true), @('D:\cola\slot-0\rune', $true), @('D:\cola\slot-1\rune\', $true),
        @('D:/COLA/SLOT-0/Rune/', $true), @('D:\cola\ci', $true), @('D:\cola\ci\sub\dir', $true),
        @('D:\cola\slot-0-qa\..\slot-1\x', $true), @('D:\cola\\slot-0\.\rune', $true), @('D:\cola\slot-0.\rune', $true),
        @('\\?\D:\cola\slot-0\rune', $true),
        @('D:\cola', $false), @('D:\cola\slot-0-qa', $false), @('D:\cola\slot-0-qa\x', $false), @('D:\cola\slot-10', $false),
        @('D:\cola\ci-gha\x', $false), @('D:\cola\slot-0\..\otra', $false), @('D:\otra\slot-0\rune', $false))) {
    $path, $inside = $case
    if ((Test-VantareSlotPath -Path $path -Root 'D:\cola') -ne $inside) { throw "ranura: '$path' debía dar $inside." }
}
if (Test-VantareSlotPath -Path 'D:\COLA\slot-0\rune\' -Allowed 'D:\cola\slot-0\rune' -Root 'D:\cola') {
    throw 'ranura: se rechaza la ruta permitida.'
}
foreach ($path in @('D:\cola\slot-0\rune\x', 'D:\cola\slot-0', 'D:\cola\slot-1\rune')) {
    if (-not (Test-VantareSlotPath -Path $path -Allowed 'D:\cola\slot-0\rune' -Root 'D:\cola')) { throw "ranura: la excepción admite '$path'." }
}

# The same through the real queue script, with a queue root of this fixture.
$variables = @('VANTARE_TARGET_ROOT', 'VANTARE_CI_TARGET', 'CARGO_TARGET_DIR', 'CASE_TARGET')
$saved = @{}
foreach ($name in $variables) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    $env:VANTARE_TARGET_ROOT = Join-Path $root 'cola'
    Remove-Item Env:VANTARE_CI_TARGET, Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
    $queue = Get-VantareTargetRoot
    $compiler = Join-Path $root 'scripts/compilar.ps1'
    $noop = Join-Path $root 'scripts/noop.ps1'
    $ran = Join-Path $root 'scripts/ran.txt'
    [IO.File]::WriteAllText($noop, 'Add-Content -LiteralPath (Join-Path $PSScriptRoot "ran.txt") -Value ($args -join " ")')
    # Forwarding from another script keeps the `-TargetDirectory:` spelling.
    $forward = Join-Path $root 'scripts/forward.ps1'
    [IO.File]::WriteAllText($forward, '& (Join-Path $PSScriptRoot "compilar.ps1") pwsh -NoProfile -File (Join-Path $PSScriptRoot "noop.ps1") dos-puntos -TargetDirectory:$env:CASE_TARGET; exit $LASTEXITCODE')

    # A rejection is immediate. An accepted target would queue for a slot, so a
    # deadline turns that into a failure; only this fixture's process tree ends.
    function Assert-Rejected([string]$Case, [string[]]$Command) {
        $start = [Diagnostics.ProcessStartInfo]::new((Get-Command pwsh).Source)
        $start.UseShellExecute = $false
        $start.CreateNoWindow = $true
        $start.RedirectStandardOutput = $true
        $start.RedirectStandardError = $true
        $start.WorkingDirectory = $root
        foreach ($argument in @('-NoProfile', '-File') + $Command) { $start.ArgumentList.Add($argument) }
        $process = [Diagnostics.Process]::Start($start)
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(120000)) {
            $process.Kill($true)
            $process.WaitForExit()
            throw "${Case}: no se rechazó; esperaba turno en la cola."
        }
        $text = $stdout.GetAwaiter().GetResult() + $stderr.GetAwaiter().GetResult()
        if (-not $process.ExitCode) { throw "${Case}: se aceptó el destino." }
        if ($text -notmatch 'Destino rechazado|El target expl') { throw "${Case}: falló por otra causa: $text" }
        if (Test-Path -LiteralPath $ran) { throw "${Case}: el comando llegó a ejecutarse." }
    }

    $leaf = 'x-' + [guid]::NewGuid().ToString('N')
    $queued = @($compiler, 'pwsh', '-NoProfile', '-File', $noop, 'fuera')
    $outer = [ordered]@{
        'rune de una ranura' = @('--target-dir', (Join-Path $queue "slot-0/rune/$leaf"))
        'otra ranura' = @('-TargetDirectory', (Join-Path $queue "slot-1/$leaf"))
        'dentro de ci' = @('-TargetDirectory', (Join-Path $queue "ci/$leaf"))
        'con ..' = @('--target-dir', "$queue\slot-0-qa\..\slot-1\$leaf")
        'mayúsculas y barras' = @('--target-dir', ($queue.ToUpperInvariant() + "/SLOT-0/$leaf/"))
        'prefijo largo' = @('--target-dir', ('\\?\' + (Join-Path $queue "slot-0\$leaf")))
        'relativa a la unidad' = @('--target-dir', ($queue.Substring(0, 2) + "slot-0\$leaf"))
    }
    foreach ($case in $outer.Keys) { Assert-Rejected $case ($queued + $outer[$case]) }
    $env:CASE_TARGET = Join-Path $queue "slot-0/$leaf"
    Assert-Rejected 'forma con dos puntos' @($forward)
    $env:CARGO_TARGET_DIR = Join-Path $queue "slot-1/$leaf"
    Assert-Rejected 'CARGO_TARGET_DIR' @($compiler, 'cargo', 'build', '--locked', '--offline', '-j', '4')
    Remove-Item Env:CARGO_TARGET_DIR
    foreach ($slot in @('slot-0', 'slot-1', 'ci')) {
        foreach ($created in @("$slot/$leaf", "$slot/rune/$leaf")) {
            if (Test-Path -LiteralPath (Join-Path $queue $created)) { throw "Un destino rechazado creó $created." }
        }
    }

    # Inside a reservation (the `ci` slot here): its own folder and `rune/`, as
    # the candidate does; nothing else of any slot.
    $env:VANTARE_CI_TARGET = '1'
    $nested = Join-Path $root 'scripts/nested.ps1'
    [IO.File]::WriteAllText($nested, @'
$ErrorActionPreference = 'Continue'
$own = $env:VANTARE_SLOT_TARGET
$queue = Split-Path $own
$results = foreach ($case in @(
        @('propia', $own), @('rune', (Join-Path $own 'rune')), @('rune-mas-abajo', (Join-Path $own 'rune/x')),
        @('dentro-propia', (Join-Path $own 'otra')), @('rune-de-otra', (Join-Path $queue 'slot-0/rune')),
        @('otra-ranura', (Join-Path $queue 'slot-1')))) {
    $name, $target = $case
    & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'compilar.ps1') pwsh -NoProfile -File (Join-Path $PSScriptRoot 'noop.ps1') "anidada-$name" --target-dir $target *> $null
    "$name=$([int][bool]$LASTEXITCODE)"
}
$results | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'nested.txt')
exit 0
'@)
    & pwsh -NoProfile -File $compiler pwsh -NoProfile -File $nested
    if ($LASTEXITCODE) { throw 'Falló la reserva de las llamadas anidadas.' }
    $got = @(Get-Content -LiteralPath (Join-Path $root 'scripts/nested.txt')) -join ' '
    $expected = 'propia=0 rune=0 rune-mas-abajo=1 dentro-propia=1 rune-de-otra=1 otra-ranura=1'
    if ($got -cne $expected) { throw "Llamadas anidadas (0 admitida, 1 rechazada): '$got'; esperado '$expected'." }
    $executed = @(Get-Content -LiteralPath $ran) -join ' | '
    if (@(Get-Content -LiteralPath $ran).Count -ne 2) { throw "Se ejecutó un comando rechazado: $executed" }
    Remove-Item -LiteralPath $ran

    # Another slot named exactly, with a trailing slash, from the `ci` reservation.
    $output = & pwsh -NoProfile -File $compiler pwsh -NoProfile -File $noop otra-exacta -TargetDirectory ((Join-Path $queue 'slot-0') + '/') *>&1
    $text = $output -join ' '
    if (-not $LASTEXITCODE -or $text -notmatch 'reservado a otro slot' -or (Test-Path -LiteralPath $ran)) {
        throw "Otra ranura con barra final no se rechazó por la reserva: $text"
    }

    # A sibling of a slot is an ordinary explicit target.
    Remove-Item Env:VANTARE_CI_TARGET
    & pwsh -NoProfile -File $compiler pwsh -NoProfile -File $noop hermana -TargetDirectory (Join-Path $queue "slot-0-qa/$leaf")
    if ($LASTEXITCODE -or -not (Test-Path -LiteralPath $ran)) { throw 'Se rechazó una carpeta hermana de una ranura.' }
} finally {
    # PowerShell turns a `$null` argument into an empty variable: remove it instead.
    foreach ($name in $variables) {
        if ($null -eq $saved[$name]) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
    }
}
# --- fin #2862 ---

Push-Location $root
try {
    & cargo generate-lockfile --offline
    if ($LASTEXITCODE) { throw 'No se pudo preparar la fixture.' }
    $env:CARGO_TARGET_DIR = Join-Path $root 'output/target-build'
    & pwsh -NoProfile -File scripts/compilar.ps1 cargo run --locked --offline -j 4
    if ($LASTEXITCODE -or -not (Test-Path -LiteralPath (Join-Path $env:CARGO_TARGET_DIR 'debug/caller-target-probe.exe'))) {
        throw 'Packaging no encuentra su ejecutable en el target del llamador.'
    }
    # `& script ... -- arg` loses the literal `--` in PowerShell; the target must
    # stay a Cargo option and reach the binary only the caller's argument.
    $output = & (Join-Path $root 'scripts/compilar.ps1') cargo run --locked --offline -j 4 -- hello
    if ($LASTEXITCODE) { throw 'Falló cargo run con argumento del binario.' }
    $text = $output -join "`n"
    if ($text -notmatch 'hello') { throw 'El binario no recibió su argumento.' }
    if ($text -match 'target-dir') { throw 'El wrapper coló --target-dir tras el separador.' }
    $env:CARGO_TARGET_DIR = 'relative-target'
    & pwsh -NoProfile -File scripts/compilar.ps1 cargo build --locked --offline -j 4
    if (-not $LASTEXITCODE) { throw 'Se aceptó un target relativo del llamador.' }
} finally {
    [Environment]::SetEnvironmentVariable('CARGO_TARGET_DIR', $old, 'Process')
    Pop-Location
}
'PASS: target de packaging conservado; destinos relativos y dentro de ranuras rechazados.'

