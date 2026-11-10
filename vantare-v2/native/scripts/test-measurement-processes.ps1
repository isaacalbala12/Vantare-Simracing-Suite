$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/measurement-processes.ps1"
$cases = @(
    @{name='cargo.exe';line='cargo metadata --locked --offline --no-deps --format-version 1';expected=$false},
    @{name='cargo.exe';line='"C:\toolchain\cargo.exe" metadata --manifest-path D:\repo\Cargo.toml';expected=$false},
    @{name='cargo.exe';line='cargo clippy --all-targets';expected=$true},
    @{name='cargo.exe';line='cargo check --package metadata';expected=$true},
    @{name='cargo.exe';line='cargo build --message-format metadata';expected=$true},
    @{name='cargo.exe';line='cargo nextest run';expected=$true},
    @{name='cargo.exe';line='cargo fmt --manifest-path D:\repo\Cargo.toml --all -- --check';expected=$false},
    @{name='cargo.exe';line='cargo fmt --all';expected=$false},
    @{name='cargo.exe';line='cargo tree --workspace';expected=$true},
    @{name='cargo.exe';line=$null;expected=$true},
    @{name='rustc.exe';line='rustc --crate-name library --emit=metadata,link';expected=$true},
    @{name='clippy-driver.exe';line='clippy-driver --crate-name library';expected=$true}
)
foreach ($case in $cases) {
    if ((Test-MeasurementCompilerProcess -Name $case.name -CommandLine $case.line) -ne $case.expected) {
        throw "Compiler classification failed: $($case.name) $($case.line)"
    }
}
Write-Host "PASS: $($cases.Count) compiler/read-only metadata classifications"

# A formatter outside the queue is allowed only while our collector stays clean.
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('measurement-source-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
& git -C $fixture init --quiet
if ($LASTEXITCODE) { throw 'Source-guard fixture init failed' }
[IO.File]::WriteAllText((Join-Path $fixture 'collector.txt'),'original')
& git -C $fixture add collector.txt
& git -C $fixture -c user.name=MeasurementTest -c user.email=measurement@example.invalid commit --quiet -m original
if ($LASTEXITCODE) { throw 'Source-guard fixture commit failed' }
$revision=Get-MeasurementSourceRevision $fixture
Assert-MeasurementSourceRevision $fixture $revision
[IO.File]::WriteAllText((Join-Path $fixture 'collector.txt'),'mutated')
$rejected=$false
try { Assert-MeasurementSourceRevision $fixture $revision } catch { $rejected=$true }
if (!$rejected) { throw 'Dirty collector source was accepted' }
& git -C $fixture add collector.txt
& git -C $fixture -c user.name=MeasurementTest -c user.email=measurement@example.invalid commit --quiet -m changed
if ($LASTEXITCODE) { throw 'Source-guard second fixture commit failed' }
$rejected=$false
try { Assert-MeasurementSourceRevision $fixture $revision } catch { $rejected=$true }
if (!$rejected) { throw 'Changed clean collector revision was accepted' }
Write-Host 'PASS: clean source accepted; formatter mutation and changed HEAD rejected'
