# Synthetic fixture only. Builds the same probe against three source generations.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$PreviousWorktree,
    [Parameter(Mandatory)][string]$PreNeedsSignInWorktree,
    [Parameter(Mandatory)][string]$TargetDirectory,
    [Parameter(Mandatory)][string]$EvidenceDirectory
)
$ErrorActionPreference = 'Stop'
$jobs = if ($env:CARGO_BUILD_JOBS) { $env:CARGO_BUILD_JOBS } else { '2' }
Set-StrictMode -Version Latest
$currentRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$source = Join-Path $currentRoot 'native/runtime/examples/license_generation_fixture.rs'
$generations = @(
    @{ Name='new'; Root=$currentRoot; Sha=$null },
    @{ Name='v17'; Root=(Join-Path $PreviousWorktree 'vantare-v2'); Sha='7eae8cef177e898776cada129a9d06baab5e5d13' },
    @{ Name='pre5'; Root=(Join-Path $PreNeedsSignInWorktree 'vantare-v2'); Sha='bb7a5dbfb' }
)
New-Item -ItemType Directory -Force -Path $EvidenceDirectory | Out-Null
foreach ($generation in $generations) {
    Push-Location $generation.Root
    try {
        if ($generation.Sha) {
            $head = git rev-parse HEAD
            $expected = git rev-parse $generation.Sha
            if ($head -ne $expected) { throw "Wrong generation $($generation.Name): $head" }
            $destination = Join-Path $generation.Root 'native/runtime/examples/license_generation_fixture.rs'
            New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
            if (Test-Path -LiteralPath $destination) {
                if ((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $destination).Hash) { throw "Different probe already exists: $destination" }
            } else { Copy-Item -LiteralPath $source -Destination $destination }
        }
        $target = if ($generation.Name -eq 'new') { $TargetDirectory } else { Join-Path $TargetDirectory "rollback-$($generation.Name)" }
        & pwsh -NoProfile -File native/scripts/compilar.ps1 cargo build --manifest-path native/Cargo.toml --target-dir $target -p vantare-runtime --example license_generation_fixture --locked --offline -j $jobs
        if ($LASTEXITCODE -ne 0) { throw "Build failed: $($generation.Name)" }
        $generation.Binary = Join-Path $target 'debug/examples/license_generation_fixture.exe'
    } finally { Pop-Location }
}
foreach ($old in @('v17','pre5')) {
    foreach ($state in @('SignedIn','NeedsSignIn')) {
        $fixtureRoot = Join-Path $EvidenceDirectory "fixture-$old-$state-$([guid]::NewGuid().ToString('N'))"
        New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
        [IO.File]::WriteAllText((Join-Path $fixtureRoot 'license-fixture-owned'), 'isa1827-p8')
        & $generations[0].Binary write $fixtureRoot $state
        if ($LASTEXITCODE -ne 0) { throw 'New generation write failed' }
        $previous = $generations | Where-Object Name -eq $old
        $expected = if ($old -eq 'pre5' -and $state -eq 'NeedsSignIn') { 'absent' } else { $state }
        & $previous.Binary read $fixtureRoot $expected
        if ($LASTEXITCODE -ne 0) { throw "Rollback failed: $old/$state" }
        if ($expected -eq 'absent') {
            $archives = @(Get-ChildItem -LiteralPath (Join-Path $fixtureRoot 'account') -Recurse -File | Where-Object Name -Like 'account*.corrupto')
            if ($archives.Count -ne 1) { throw 'Old account reader must preserve NeedsSignIn in quarantine' }
        }
        & $generations[0].Binary read $fixtureRoot $expected
        if ($LASTEXITCODE -ne 0) { throw "Return failed: $old/$state" }
        Write-Output "PASS new -> $old -> new / $state"
    }
}

# Mandatory upgrade/downgrade regression: old B on the same PC, no binding.
$emptyRoot = Join-Path $EvidenceDirectory "fixture-retired-B-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $emptyRoot | Out-Null
[IO.File]::WriteAllText((Join-Path $emptyRoot 'license-fixture-owned'), 'isa1827-p8')
& $generations[0].Binary write-empty $emptyRoot empty
if ($LASTEXITCODE -ne 0) { throw 'v18 did not retire old B' }
$previous = $generations | Where-Object Name -eq 'v17'
& $previous.Binary read $emptyRoot empty
if ($LASTEXITCODE -ne 0) { throw 'v17 attempted a disk install without binding' }
& $generations[0].Binary read $emptyRoot empty
if ($LASTEXITCODE -ne 0) { throw 'Return to v18 unexpectedly granted rights' }
$archives = @(Get-ChildItem -LiteralPath (Join-Path $emptyRoot 'services') -Recurse -File | Where-Object { $_.Name -like 'license-candidate-*.corrupto' -or $_.Name -like 'license-transfer-pending-*.corrupto' })
if ($archives.Count -ne 2) { throw 'Both retired documents must remain archived' }
Write-Output 'PASS v18 retires B -> v17 without binding only Read/no access -> v18 no access'
