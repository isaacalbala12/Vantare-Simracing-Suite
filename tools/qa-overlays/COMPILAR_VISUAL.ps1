# Solo compila en servidor. Los tests lifecycle se transportan, jamás se ejecutan aquí.
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$Source,
 [Parameter(Mandatory)][string]$Sha,
 [Parameter(Mandatory)][string]$Output,
 [switch]$DentroDelSlot
)
$ErrorActionPreference='Stop'
function Assert-BuildReady {
 if(Test-Path D:/VantareServer/qa/captura.lock){throw 'BLOCKED_CAPTURE_LOCK'}
 if((Get-PSDrive D).Free -lt 40GB -or (Get-PSDrive C).Free -lt 8GB){throw 'BLOCKED_DISK'}
}
Assert-BuildReady
if($Sha -cnotmatch '^[0-9a-f]{40}$' -or (git -C $Source rev-parse HEAD) -cne $Sha -or (git -C $Source status --porcelain)){throw 'Fuentes no coinciden con SHA limpio'}
Set-Location (Join-Path $Source 'vantare-v2')
if(-not $DentroDelSlot){
 if(Test-Path -LiteralPath $Output){throw 'La salida debe ser nueva'}
 $null=New-Item -ItemType Directory -Path $Output
 & pwsh -NoProfile -File native/scripts/compilar.ps1 pwsh -NoProfile -File $PSCommandPath -Source $Source -Sha $Sha -Output $Output -DentroDelSlot
 exit $LASTEXITCODE
}
if(-not $env:CARGO_TARGET_DIR -or -not ([IO.Path]::GetFullPath($env:CARGO_TARGET_DIR)).StartsWith('D:\VantareServer\targets\',[StringComparison]::OrdinalIgnoreCase)){throw 'Target fuera de los slots en D:'}
# The repo override is below the working directory used by the queue.
$toolchain=Select-String -LiteralPath 'native/rust-toolchain.toml' -Pattern '^channel\s*=\s*"([^"]+)"\s*$'
if($toolchain.Count -ne 1){throw 'No se pudo fijar la versión de Rust de native'}
$env:RUSTUP_TOOLCHAIN=$toolchain.Matches[0].Groups[1].Value
$env:CARGO_BUILD_JOBS='1'
$env:CARGO_PROFILE_RELEASE_DEBUG='0'
$env:CARGO_PROFILE_RELEASE_OPT_LEVEL='3'
$env:CARGO_PROFILE_RELEASE_LTO='false'
$env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS='16'
$env:VANTARE_BUILD_CHANNEL='nightly'
Remove-Item Env:VANTARE_LICENSE_PUBLIC_KEYS -ErrorAction SilentlyContinue
$null=New-Item -ItemType Directory -Path (Join-Path $Output 'bin')
function Copy-Build([string]$Image,[string]$Name,[string]$Features){
 $destination=Join-Path $Output "bin/$Name.exe"
 [IO.File]::Copy($Image,$destination)
 @{
  name=$Name;source_sha=$Sha;profile='release opt=3 debug=0 lto=false codegen-units=16'
  sha256=(Get-FileHash -LiteralPath $destination).Hash.ToLowerInvariant()
  features=$Features;origin='server queue'
 }
}
$builds=@()
foreach($step in @(
 @{manifest='native/overlays-rune/Cargo.toml';crate='vantare-overlays-rune';bin='vantare-overlays-rune';features=''},
 @{manifest='native/Cargo.toml';crate='vantare-ui';bin='vantare-overlays';features='parity-capture'},
 @{manifest='native/Cargo.toml';crate='vantare-runtime';bin='vantare';features=''}
)){
 Assert-BuildReady
 $arguments=@('build','--manifest-path',$step.manifest,'--locked','--release','-p',$step.crate,'--bin',$step.bin,'-j','1')
 if($step.features){$arguments+=@('--features',$step.features)}
 & cargo @arguments
 if($LASTEXITCODE){throw "Build falló: $($step.bin)"}
 $builds+=Copy-Build (Join-Path $env:CARGO_TARGET_DIR "release/$($step.bin).exe") $step.bin $step.features
 ConvertTo-Json -InputObject $builds -Depth 8 | Set-Content -LiteralPath (Join-Path $Output 'binarios.json')
}
Assert-BuildReady
$log=Join-Path $Output 'lifecycle-cargo.jsonl'
& cargo test --manifest-path native/Cargo.toml --locked --release -p vantare-runtime --test lifecycle --test lifecycle_rune --no-run --message-format=json-render-diagnostics -j 1 > $log
if($LASTEXITCODE){throw 'Compilación de lifecycle falló'}
$testNames=@{lifecycle='lifecycle-harness';lifecycle_rune='lifecycle-rune-tests'}
$tests=@(Get-Content -LiteralPath $log | ForEach-Object {
 $artifact=$_ | ConvertFrom-Json -AsHashtable
 if($artifact.reason -eq 'compiler-artifact' -and $artifact.executable -and $testNames.ContainsKey($artifact.target.name)){
  $record=Copy-Build $artifact.executable $testNames[$artifact.target.name] ''
  $record.name+='.exe'
  $record
 }
})
if($tests.Count -ne 2){throw 'Faltan los dos arneses lifecycle'}
@{source_sha=$Sha;binaries=$tests;executed=$false} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $Output 'lifecycle-binarios.json')
