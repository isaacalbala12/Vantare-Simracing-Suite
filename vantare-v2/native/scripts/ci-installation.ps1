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
& cargo test --manifest-path native/Cargo.toml -p vantare-runtime --bin vantare --features hub-update-qa --locked --offline -j 4 --target-dir $target hub_update_feed::tests
if ($LASTEXITCODE) { throw 'isolated Hub feed QA authority regression' }
& cargo test --manifest-path native/Cargo.toml -p vantare-services --features hub-update-qa --lib --locked --offline -j 4 --target-dir $target update_manifest
if ($LASTEXITCODE) { throw 'regresión de la autoridad TEST en update_manifest' }
# #2771: activar solo la feature de services (p. ej. por unificación) no puede compilar
# un vantare.exe con la clave TEST sin los guards ni el contexto aislado de runtime.
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$unified = @(& cargo check --manifest-path native/Cargo.toml -p vantare-runtime --bin vantare --features vantare-services/hub-update-qa --locked --offline -j 4 --target-dir $target 2>&1 | ForEach-Object { "$_" })
$unifiedExit = $LASTEXITCODE
$ErrorActionPreference = $previousPreference
if (-not $unifiedExit -or -not @($unified -match 'vantare-services/hub-update-qa exige vantare-runtime/hub-update-qa').Count) {
  $unified | Select-Object -Last 20 | Write-Host
  throw 'la clave TEST de services compiló en vantare.exe sin la feature QA de runtime'
}
# #2771: the real TEST-authority launcher, before the matrix replaces it with installer-qa only.
& cargo build --manifest-path native/Cargo.toml -p vantare-runtime --bin vantare --features hub-update-qa --locked --offline -j 4 --target-dir $target
if ($LASTEXITCODE) { throw 'isolated Hub update QA launcher build failed' }
pwsh -NoProfile -File native/packaging/hub-update-qa-exe-tests.ps1 -QaExecutable "$target/debug/vantare.exe" -CleanExecutable "$target/debug/vantare-services.exe" -EvidenceDirectory "$env:RUNNER_TEMP/hub-update-qa-exe" -RefusalRoot "$env:RUNNER_TEMP/hub-update-qa-refusal"
if ($LASTEXITCODE) { throw 'real Hub update QA launcher escaped the gate or ran without isolation' }
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
