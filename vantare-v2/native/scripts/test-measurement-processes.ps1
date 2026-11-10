$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/measurement-processes.ps1"
$cases = @(
    @{name='cargo.exe';line='cargo metadata --locked --offline --no-deps --format-version 1';expected=$false},
    @{name='cargo.exe';line='"C:\toolchain\cargo.exe" metadata --manifest-path D:\repo\Cargo.toml';expected=$false},
    @{name='cargo.exe';line='cargo clippy --all-targets';expected=$true},
    @{name='cargo.exe';line='cargo check --package metadata';expected=$true},
    @{name='cargo.exe';line='cargo build --message-format metadata';expected=$true},
    @{name='cargo.exe';line='cargo nextest run';expected=$true},
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
