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
# NTFS streams: Windows opens `slot-1::$INDEX_ALLOCATION\rune` as `slot-1\rune`.
foreach ($case in @(
        @('D:\cola\slot-1::$INDEX_ALLOCATION\rune', $true), @('D:\cola\slot-0:x', $true), @('D:\x:y', $true),
        @('D:\cola\otra\fichero::$DATA', $true), @('\\?\D:\cola\slot-0:x', $true),
        @('D:\VantareServer\targets\slot-0-qa', $false), @('\\?\D:\cola\otra', $false), @('D:/cola/otra', $false),
        @('D:cola\otra', $false), @('\\servidor\recurso\otra', $false))) {
    $path, $stream = $case
    if ((Test-VantareStreamPath $path) -ne $stream) { throw "flujo: '$path' debía dar $stream." }
}

# The same through the real queue script, with a queue root of this fixture.
$variables = @('VANTARE_TARGET_ROOT', 'VANTARE_CI_TARGET', 'CARGO_TARGET_DIR', 'CASE_TARGET', 'RUNNER_ENVIRONMENT', 'RUNNER_TEMP')
$saved = @{}
foreach ($name in $variables) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
# PowerShell turns a `$null` argument into an empty variable: remove it instead.
function Restore-Variables([string[]]$Names) {
    foreach ($name in $Names) {
        if ($null -eq $saved[$name]) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
    }
}
try {
    # The path of the distribution job (branch-channel-gates.yml) stays accepted.
    $env:RUNNER_ENVIRONMENT = 'github-hosted'
    $env:RUNNER_TEMP = Join-Path $root 'runner'
    $exclusion = "$env:RUNNER_TEMP/vantare-targets/qa-exclusion"
    foreach ($path in @($exclusion, "$exclusion/rune")) {
        if (-not (Test-VantareTargetPath $path) -or (Test-VantareStreamPath $path) -or (Test-VantareSlotPath -Path $path)) {
            throw "CI: se rechaza $path."
        }
    }
    if (-not (Test-VantareSlotPath -Path "$env:RUNNER_TEMP/vantare-targets/ci/x")) { throw 'CI: ci/ no cuenta como ranura.' }
    Restore-Variables @('RUNNER_ENVIRONMENT', 'RUNNER_TEMP')

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
        'flujo INDEX_ALLOCATION' = @('--target-dir', ($queue + '\slot-1::$INDEX_ALLOCATION\rune\' + $leaf))
        'flujo en una ranura' = @('-TargetDirectory', ($queue + '\slot-0:' + $leaf))
        'flujo fuera de las ranuras' = @('--target-dir', ($queue + '\x:' + $leaf))
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
    # the candidate does; nothing else of any slot, neither by argument nor by
    # `CARGO_TARGET_DIR`, which `cargo clean` and `cargo +x build` obey.
    $env:VANTARE_CI_TARGET = '1'
    $nested = Join-Path $root 'scripts/nested.ps1'
    [IO.File]::WriteAllText($nested, @'
$ErrorActionPreference = 'Continue'
$own = $env:VANTARE_SLOT_TARGET
$queue = Split-Path $own
$fixture = Split-Path $PSScriptRoot
Set-Location -LiteralPath $fixture
$manifest = Join-Path $fixture 'Cargo.toml'
function Get-Noop([string]$Name) { 'pwsh', '-NoProfile', '-File', (Join-Path $PSScriptRoot 'noop.ps1'), $Name }
function Test-Call([string]$Name, [string[]]$Command) {
    $output = & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'compilar.ps1') @Command *>&1 | Out-String
    if (-not $LASTEXITCODE) { "$Name=admitida" }
    elseif ($output -match 'Destino rechazado|Target anidado') { "$Name=rechazada" }
    else { "$Name=error: $($output -replace '\s+', ' ')" }
}
$results = @(
    foreach ($case in @(
            @('propia', $own), @('rune', (Join-Path $own 'rune')), @('rune-mas-abajo', (Join-Path $own 'rune/x')),
            @('dentro-propia', (Join-Path $own 'otra')), @('rune-de-otra', (Join-Path $queue 'slot-0/rune')),
            @('otra-ranura', (Join-Path $queue 'slot-1')))) {
        $name, $target = $case
        Test-Call $name (@(Get-Noop "anidada-$name") + @('--target-dir', $target))
    }
    foreach ($case in @(
            @('env-propia', $own, @(Get-Noop 'env-propia')),
            @('env-rune', (Join-Path $own 'rune'), @(Get-Noop 'env-rune')),
            @('env-clean', (Join-Path $queue 'slot-1'), @('cargo', 'clean', '--manifest-path', $manifest)),
            @('env-toolchain', (Join-Path $queue 'slot-0/rune'), @('cargo', '+1.99.1', 'build', '--offline', '--manifest-path', $manifest)),
            @('env-otra-ranura', (Join-Path $queue 'slot-1'), @(Get-Noop 'env-otra-ranura')),
            @('env-subcarpeta', (Join-Path $own 'otra'), @(Get-Noop 'env-subcarpeta')),
            @('env-flujo', ($queue + '\slot-1::$INDEX_ALLOCATION\rune'), @(Get-Noop 'env-flujo')),
            @('env-relativa', ($queue.Substring(0, 2) + 'slot-1\x'), @(Get-Noop 'env-relativa')))) {
        $name, $value, $command = $case
        $previous = $env:CARGO_TARGET_DIR
        $env:CARGO_TARGET_DIR = $value
        Test-Call $name $command
        $env:CARGO_TARGET_DIR = $previous
    })
$results | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'nested.txt')
exit 0
'@)
    & pwsh -NoProfile -File $compiler pwsh -NoProfile -File $nested
    if ($LASTEXITCODE) { throw 'Falló la reserva de las llamadas anidadas.' }
    $got = @(Get-Content -LiteralPath (Join-Path $root 'scripts/nested.txt')) -join ' '
    $accepted = @('propia', 'rune', 'env-propia', 'env-rune')
    $expected = @('propia', 'rune', 'rune-mas-abajo', 'dentro-propia', 'rune-de-otra', 'otra-ranura', 'env-propia',
        'env-rune', 'env-clean', 'env-toolchain', 'env-otra-ranura', 'env-subcarpeta', 'env-flujo', 'env-relativa' |
        ForEach-Object { "$_=$(if ($_ -cin $accepted) { 'admitida' } else { 'rechazada' })" }) -join ' '
    if ($got -cne $expected) { throw "Llamadas anidadas: '$got'; esperado '$expected'." }
    $executed = @(Get-Content -LiteralPath $ran) -join ' | '
    if (@(Get-Content -LiteralPath $ran).Count -ne $accepted.Count) { throw "Se ejecutó un comando rechazado: $executed" }
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
    Remove-Item -LiteralPath $ran

    # The distribution job's flow, as a hosted runner: `qa-exclusion` next to the
    # slots and, inside, calls that use it by variable and build into its `rune/`.
    $env:RUNNER_ENVIRONMENT = 'github-hosted'
    $env:RUNNER_TEMP = Join-Path $root 'runner'
    $env:VANTARE_CI_TARGET = '1'
    $flow = Join-Path $root 'scripts/flow.ps1'
    [IO.File]::WriteAllText($flow, @'
param([string]$TargetDirectory)
$queue = Join-Path $PSScriptRoot 'compilar.ps1'
$noop = Join-Path $PSScriptRoot 'noop.ps1'
& pwsh -NoProfile -File $queue pwsh -NoProfile -File $noop ci-variable
$first = $LASTEXITCODE
& pwsh -NoProfile -File $queue pwsh -NoProfile -File $noop ci-rune --target-dir (Join-Path $env:CARGO_TARGET_DIR 'rune')
exit [int]($first -or $LASTEXITCODE)
'@)
    & pwsh -NoProfile -File $compiler pwsh -NoProfile -File $flow -TargetDirectory "$env:RUNNER_TEMP/vantare-targets/qa-exclusion"
    if ($LASTEXITCODE -or @(Get-Content -LiteralPath $ran).Count -ne 2) { throw 'CI: el flujo de qa-exclusion se rechaza.' }
} finally { Restore-Variables $variables }
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

