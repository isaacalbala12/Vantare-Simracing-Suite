$ErrorActionPreference = 'Stop'
if (-not $env:VANTARE_SLOT_TARGET) { throw 'Invocar por compilar.ps1.' }
$target = $env:VANTARE_SLOT_TARGET
Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
& cargo build --manifest-path native/Cargo.toml -p vantare-services --example matrix-verifier --locked --offline -j 4 --target-dir $target
if ($LASTEXITCODE) { throw 'matrix TEST verifier build failed' }
& cargo build --manifest-path native/Cargo.toml -p vantare-services --bin vantare-services --locked --offline -j 4 --target-dir $target
if ($LASTEXITCODE) { throw 'real services signer build failed' }
& cargo build --manifest-path native/Cargo.toml -p vantare-installer --example verify-package --no-default-features --features write-engine --locked --offline -j 4 --target-dir $target
if ($LASTEXITCODE) { throw 'real package verifier build failed' }
foreach ($shell in @('powershell.exe', 'pwsh')) {
  $policy = if ($shell -eq 'powershell.exe') { @('-ExecutionPolicy', 'Bypass') } else { @() }
  & $shell -NoProfile @policy -File native/packaging/build-tooling-tests.ps1 -QaRoot "$env:RUNNER_TEMP/installation-tooling" -Verifier "$target/debug/examples/matrix-verifier.exe" -ServicesExecutable "$target/debug/vantare-services.exe" -PackageVerifier "$target/debug/examples/verify-package.exe"
  if ($LASTEXITCODE) { throw "release tooling regression: $shell" }
}
& cargo build --manifest-path native/Cargo.toml -p vantare-installer --no-default-features --example probe-read-matrix --locked --offline -j 4 --target-dir $target
if ($LASTEXITCODE) { throw 'matrix read probe build failed' }
& cargo build --manifest-path native/Cargo.toml -p vantare-installer --no-default-features --features write-engine,test-installer --example installer-write-matrix --locked --offline -j 4 --target-dir $target
if ($LASTEXITCODE) { throw 'matrix writer build failed' }
& cargo build --manifest-path native/Cargo.toml -p vantare-hub --example boot-confirmation-matrix --locked --offline -j 4 --target-dir $target
if ($LASTEXITCODE) { throw 'matrix boot confirmation fixture build failed' }
& cargo build --manifest-path native/Cargo.toml -p vantare-runtime --bin vantare --features installer-qa --locked --offline -j 4 --target-dir $target
if ($LASTEXITCODE) { throw 'matrix root launcher build failed' }
& cargo test --manifest-path native/Cargo.toml -p vantare-hub --test installed_data_root --features installer-qa --locked --offline -j 4 --target-dir $target
if ($LASTEXITCODE) { throw 'installed Hub data-root regression' }
& cargo build --manifest-path native/Cargo.toml -p vantare-hub --bin vantare-hub --features installer-qa --locked --offline -j 4 --target-dir $target
if ($LASTEXITCODE) { throw 'standalone Hub QA build failed' }
pwsh -NoProfile -File native/hub/tests/development-fallback.ps1 -HubExecutable "$target/debug/vantare-hub.exe" -QaRoot "$env:RUNNER_TEMP/installation-hub-fallback"
if ($LASTEXITCODE) { throw 'development Hub data-root fallback' }
$legacy = Join-Path $env:RUNNER_TEMP 'matrix-legacy'
New-Item -ItemType Directory -Path $legacy -Force | Out-Null
gh release download native-beta-v0.0.975 --repo $env:GITHUB_REPOSITORY --pattern vantare-native-amd64-package.zip --dir $legacy
if ($LASTEXITCODE) { throw 'pinned historical package unavailable' }
powershell.exe -NoProfile -ExecutionPolicy Bypass -File native/packaging/matrix/guard-tests.ps1 -Root "$env:RUNNER_TEMP/installation-matrix-guard"
if ($LASTEXITCODE) { throw 'installation matrix isolation failed' }
powershell.exe -NoProfile -ExecutionPolicy Bypass -File native/packaging/installation-matrix-tests.ps1 -Root "$env:RUNNER_TEMP/installation-matrix" -LegacyPackage "$legacy/vantare-native-amd64-package.zip" -TestVerifier "$target/debug/examples/matrix-verifier.exe" -BootProbe "$target/debug/examples/boot-confirmation-matrix.exe" -ReadProbe "$target/debug/examples/probe-read-matrix.exe" -WriteEngine "$target/debug/examples/installer-write-matrix.exe" -RootLauncher "$target/debug/vantare.exe" -HubExecutable "$target/debug/vantare-hub.exe"
if ($LASTEXITCODE) { throw 'installation matrix regression' }
