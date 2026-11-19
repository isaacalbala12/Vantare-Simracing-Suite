# Compilación reproducible por UN slot de la cola; jamás ejecuta overlays.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Source,[Parameter(Mandatory)][string]$Output,[switch]$DentroDelSlot,[switch]$SoloNucleo,[string]$BaseArtifacts='',[long]$CiRunId=0,[string]$SourceSha='',[ValidateSet('Visual','Medicion')][string]$ModoArtefacto='Visual',
 [string]$ApprovedKeyId='',[string]$ApprovedRegistrySha256='')
$ErrorActionPreference='Stop'
if($PSBoundParameters.ContainsKey('CiRunId') -or $PSBoundParameters.ContainsKey('SourceSha') -or $PSBoundParameters.ContainsKey('ModoArtefacto') -or $ApprovedKeyId -or $ApprovedRegistrySha256){
 if($DentroDelSlot -or $SoloNucleo -or $BaseArtifacts){throw 'La importación CI es incompatible con la compilación local'}
 . (Join-Path $PSScriptRoot 'IMPORTAR_ARTEFACTO_TANDA.ps1')
 Import-TandaArtifact $Source $Output $CiRunId $SourceSha -Mode $ModoArtefacto -ApprovedKeyId $ApprovedKeyId -ApprovedRegistrySha256 $ApprovedRegistrySha256
 return
}
$sha='fb2e2e520be96b59066e2a69c3899cf9842a0752'
if(Test-Path D:/VantareServer/qa/captura.lock){throw 'BLOCKED_CAPTURE_LOCK: no lanzar Rust'}
if((Get-PSDrive D).Free -lt 40GB -or (Get-PSDrive C).Free -lt 8GB){throw 'BLOCKED_DISK: D >=40 GiB y C >=8 GiB'}
if((git -C $Source rev-parse HEAD) -ne $sha){throw 'SHA de fuentes distinto del congelado'}
$dirty=git -C $Source status --porcelain --untracked-files=normal
if($LASTEXITCODE -or $dirty){throw 'Worktree de binarios no está limpio; separar herramientas y fuentes congeladas'}
if($SoloNucleo -and -not [Environment]::GetEnvironmentVariable('VANTARE_LICENSE_PUBLIC_KEYS','Machine')){throw 'BLOCKED_LICENSE_CONFIG: falta registro Machine; no entrar en cola ni crear salida'}
if(-not $DentroDelSlot){
 if(Test-Path -LiteralPath $Output){throw 'Salida de compilación debe ser nueva'}
 if($SoloNucleo -and -not(Test-Path -LiteralPath (Join-Path $BaseArtifacts 'binarios.json'))){throw 'SoloNucleo necesita BaseArtifacts de la construcción anterior'}
 $null=New-Item -ItemType Directory -Path $Output
 if($SoloNucleo){
  $null=New-Item -ItemType Directory -Path (Join-Path $Output 'bin')
  Get-ChildItem -LiteralPath (Join-Path $BaseArtifacts 'bin') -File|Where-Object Name -ne 'vantare-core.exe'|Copy-Item -Destination (Join-Path $Output 'bin')
  $previous=@(Get-Content -LiteralPath (Join-Path $BaseArtifacts 'binarios.json') -Raw|ConvertFrom-Json -AsHashtable)|Where-Object name -ne 'vantare-core'
  ConvertTo-Json -InputObject @($previous) -Depth 10|Set-Content -LiteralPath (Join-Path $Output 'binarios.json') -Encoding utf8
  foreach($name in @('lifecycle-binarios.json','lifecycle-ci.json','presentmon-procedencia.json','presentmon-verificado.json')){
   Copy-Item -LiteralPath (Join-Path $BaseArtifacts $name) -Destination (Join-Path $Output $name)
  }
 }
 Push-Location (Join-Path $Source 'vantare-v2')
 try {
  $extra=if($SoloNucleo){@('-SoloNucleo','-BaseArtifacts',$BaseArtifacts)}else{@()}
  & pwsh -NoProfile -File native/scripts/compilar.ps1 pwsh -NoProfile -File $PSCommandPath -Source $Source -Output $Output -DentroDelSlot @extra
  if($LASTEXITCODE){throw "Cola/compilación falló: $LASTEXITCODE"}
 } finally {Pop-Location}
 return
}
if(-not $env:CARGO_TARGET_DIR -or -not ([IO.Path]::GetFullPath($env:CARGO_TARGET_DIR)).StartsWith('D:\VantareServer\targets\',[StringComparison]::OrdinalIgnoreCase)){throw 'Target ajeno a los slots D:; no compilar'}
$env:RUSTUP_TOOLCHAIN='1.99.1';$env:CARGO_BUILD_JOBS='1'
$env:CARGO_PROFILE_RELEASE_DEBUG='0';$env:CARGO_PROFILE_RELEASE_OPT_LEVEL='3'
$env:CARGO_PROFILE_RELEASE_LTO='false';$env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS='16'
$env:VANTARE_BUILD_CHANNEL='nightly'
$null=New-Item -ItemType Directory -Path (Join-Path $Output 'bin') -Force
$steps=@(
 @{manifest='native/overlays-rune/Cargo.toml';package='vantare-overlays-rune';binary='vantare-overlays-rune';features=''},
 @{manifest='native/Cargo.toml';package='vantare-ui';binary='vantare-overlays';features='parity-capture'},
 @{manifest='native/Cargo.toml';package='vantare-runtime';binary='vantare-core';features='paint-stats'},
 @{manifest='native/Cargo.toml';package='vantare-services';binary='vantare-services';features=''},
 @{manifest='native/Cargo.toml';package='vantare-runtime';binary='vantare';features=''}
)
$rows=@()
if($SoloNucleo){$rows=@(Get-Content -LiteralPath (Join-Path $Output 'binarios.json') -Raw|ConvertFrom-Json -AsHashtable)}
if($SoloNucleo){$steps=@($steps|Where-Object binary -eq 'vantare-core')}
foreach($step in $steps){
 if(Test-Path D:/VantareServer/qa/captura.lock){throw 'BLOCKED_CAPTURE_LOCK: no arrancar otro cargo'}
 if((Get-PSDrive D).Free -lt 40GB){throw 'BLOCKED_DISK: detener antes de otro cargo'}
 # Única procedencia autorizada: Machine configurado por la raíz. No .env,
 # repo, binarios instalados, firmas QA ni extracción de registros ajenos.
 $registry=[Environment]::GetEnvironmentVariable('VANTARE_LICENSE_PUBLIC_KEYS','Machine')
 if($registry){$env:VANTARE_LICENSE_PUBLIC_KEYS=$registry}
 else {Remove-Item Env:VANTARE_LICENSE_PUBLIC_KEYS -ErrorAction SilentlyContinue}
 $arguments=@('build','--manifest-path',$step.manifest,'--locked','--release','-p',$step.package,'--bin',$step.binary,'-j','1')
 if($step.features){$arguments+=@('--features',$step.features)}
 $start=[DateTime]::UtcNow
 Push-Location (Join-Path $Source 'vantare-v2')
 try {& cargo @arguments;if($LASTEXITCODE){throw "Build $($step.binary) falló: $LASTEXITCODE"}} finally {Pop-Location}
 $binary=Join-Path $env:CARGO_TARGET_DIR "release/$($step.binary).exe"
 $destination=Join-Path $Output "bin/$($step.binary).exe"
 Copy-Item -LiteralPath $binary -Destination $destination
 $rows+=@{name=$step.binary;sha256=(Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant();source_sha=$sha;
  profile='release opt=3 debug=0 lto=false codegen-units=16';features=$step.features;
  elapsed_seconds=([DateTime]::UtcNow-$start).TotalSeconds;target=$env:CARGO_TARGET_DIR;
  license_public_keys_configured=[bool]$registry}
 ConvertTo-Json -InputObject $rows -Depth 10|Set-Content -LiteralPath (Join-Path $Output 'binarios.json') -Encoding utf8
}
