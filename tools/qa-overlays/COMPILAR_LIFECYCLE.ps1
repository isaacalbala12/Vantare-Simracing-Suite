# Compila, nunca ejecuta, los cuatro tests ignorados de #2522 para transportarlos.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Source,[Parameter(Mandatory)][string]$Output,[switch]$DentroDelSlot)
$ErrorActionPreference='Stop'
if(Test-Path D:/VantareServer/qa/captura.lock){throw 'BLOCKED_CAPTURE_LOCK: no lanzar Rust'}
if((Get-PSDrive D).Free -lt 40GB -or (Get-PSDrive C).Free -lt 8GB){throw 'BLOCKED_DISK'}
if(-not $DentroDelSlot){
 Push-Location (Join-Path $Source 'vantare-v2')
 try {
  & pwsh -NoProfile -File native/scripts/compilar.ps1 pwsh -NoProfile -File $PSCommandPath -Source $Source -Output $Output -DentroDelSlot
  if($LASTEXITCODE){throw 'Falló compilación por la cola'}
 } finally {Pop-Location}
 return
}
if(-not $env:CARGO_TARGET_DIR -or -not ([IO.Path]::GetFullPath($env:CARGO_TARGET_DIR)).StartsWith('D:\VantareServer\targets\',[StringComparison]::OrdinalIgnoreCase)){throw 'Target fuera de slots D:'}
$env:RUSTUP_TOOLCHAIN='1.99.1';$env:CARGO_BUILD_JOBS='1'
$env:CARGO_PROFILE_RELEASE_DEBUG='0';$env:CARGO_PROFILE_RELEASE_OPT_LEVEL='3'
$env:CARGO_PROFILE_RELEASE_LTO='false';$env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS='16'
$env:VANTARE_BUILD_CHANNEL='nightly'
$registry=[Environment]::GetEnvironmentVariable('VANTARE_LICENSE_PUBLIC_KEYS','Machine')
if($registry){$env:VANTARE_LICENSE_PUBLIC_KEYS=$registry}else{Remove-Item Env:VANTARE_LICENSE_PUBLIC_KEYS -ErrorAction SilentlyContinue}
$sha=(git -C $Source rev-parse HEAD).Trim()
if(git -C $Source status --porcelain --untracked-files=normal){throw 'Fuentes de pruebas deben estar confirmadas'}
$log=Join-Path $Output 'lifecycle-cargo.jsonl'
if(Test-Path -LiteralPath $log){throw 'No sobrescribir compilación anterior'}
Push-Location (Join-Path $Source 'vantare-v2')
try {
 & cargo test --manifest-path native/Cargo.toml --locked --release -p vantare-runtime --test lifecycle --test lifecycle_rune --no-run --message-format=json-render-diagnostics -j 1 | Set-Content -LiteralPath $log -Encoding utf8
 if($LASTEXITCODE){throw 'No se pudieron compilar los tests lifecycle'}
} finally {Pop-Location}
$rows=@()
foreach($line in Get-Content -LiteralPath $log){
 $artifact=$line|ConvertFrom-Json -AsHashtable
 if($artifact.reason -ne 'compiler-artifact' -or -not $artifact.executable -or $artifact.target.name -notin @('lifecycle','lifecycle_rune')){continue}
 $name=if($artifact.target.name -eq 'lifecycle'){'lifecycle-harness.exe'}else{'lifecycle-rune-tests.exe'}
 $destination=Join-Path $Output "bin/$name"
 if(Test-Path -LiteralPath $destination){throw 'No sobrescribir arnés existente'}
 Copy-Item -LiteralPath $artifact.executable -Destination $destination
 $rows+=@{name=$name;sha256=(Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()}
}
if($rows.Count -ne 2){throw 'Cargo no produjo exactamente dos ejecutables lifecycle'}
ConvertTo-Json -InputObject @{source_sha=$sha;upstream_m2='8358fdae1a03dda5ac7c47bc8721c5c0c0e1fd0c';profile='release opt=3 debug=0 lto=false codegen-units=16';binaries=$rows;executed=$false} -Depth 10|Set-Content -LiteralPath (Join-Path $Output 'lifecycle-binarios.json') -Encoding utf8
'PASS: dos arneses precompilados; NO se han ejecutado pruebas gráficas en el servidor'
