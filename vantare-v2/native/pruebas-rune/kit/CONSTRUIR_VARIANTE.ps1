# Construye GPUI y guarda el PE antes de liberar el slot. Nunca ejecuta el PE.
[CmdletBinding()]
param(
 [Parameter(Mandatory)][ValidateSet('gpui','gpui_fast','hub_fast')][string]$Variant,
 [Parameter(Mandatory)][string]$SourceRoot,
 [Parameter(Mandatory)][string]$ArtifactDirectory,
 [switch]$Clippy
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if(Test-Path -LiteralPath 'D:\VantareServer\qa\captura.lock'){throw 'Captura activa: no compilar.'}
if(-not $env:VANTARE_CARGO_QUEUE_OWNER -or -not $env:CARGO_TARGET_DIR){throw 'Usar la cola canónica.'}
if((Get-PSDrive C).Free -lt 8GB -or (Get-PSDrive D).Free -lt 40GB){throw 'Disco por debajo de C 8 / D 40 GiB.'}
$root=[IO.Path]::GetFullPath($SourceRoot)
if($root -notlike 'D:\VantareServer\worktrees\isa-2213-*\vantare-v2'){throw 'Usar un worktree propio de #2213.'}
if(@(& git -C $root status --porcelain).Count){throw 'La fuente debe estar limpia.'}
$sha=(& git -C $root rev-parse HEAD).Trim()
$targetRoot=$env:CARGO_TARGET_DIR
$package=if($Variant -eq 'hub_fast'){'vantare-hub'}else{'vantare-ui'}
$binary=if($Variant -eq 'hub_fast'){'vantare-hub'}else{'vantare-overlays'}
$features=switch($Variant){gpui{'medir-latencia'} gpui_fast{'medir-latencia,gpui-fast'} hub_fast{'medir-inicio'}}
$command=if($Clippy){'clippy'}else{'build'}
$cargoArgs=@($command,'--manifest-path',(Join-Path $root 'native/Cargo.toml'),'--release','--locked','-p',$package,'--features',$features,'-j','2')
if($Clippy){$cargoArgs+=@('--all-targets','--','-D','warnings')}else{$cargoArgs+=@('--bin',$binary)}
$watch=[Diagnostics.Stopwatch]::StartNew()
& (Join-Path $root 'native/pruebas-rune/compilar_windows.ps1') @cargoArgs
if($LASTEXITCODE){throw "Cargo terminó con $LASTEXITCODE"}
$watch.Stop()
if($Clippy){Write-Output "PASS: Clippy estricto $Variant ($($watch.Elapsed.TotalSeconds) s)";return}
if(Test-Path -LiteralPath $ArtifactDirectory){throw 'Conservar los artefactos anteriores; usar una carpeta nueva.'}
$null=New-Item -ItemType Directory -Path $ArtifactDirectory
$target=Join-Path $ArtifactDirectory ($binary+'.exe')
Copy-Item -LiteralPath (Join-Path $targetRoot ('release/'+$binary+'.exe')) -Destination $target
try{
 $text=[Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($target))
 $match=[regex]::Match($text,'VANTARE_[A-Z_]*BUILD;[a-zA-Z0-9_=;.,-]+')
 if(-not $match.Success){throw 'El PE no contiene procedencia.'}
 $values=@{}
 foreach($field in $match.Value.Split(';')|Select-Object -Skip 1){$key,$value=$field.Split('=',2);$values[$key]=$value}
 foreach($pair in @{sha=$sha;dirty='false';profile='release';'opt-level'='3';lto='false';'codegen-units'='16'}.GetEnumerator()){
  if($values[$pair.Key] -ne $pair.Value){throw "Procedencia o perfil distintos: $($pair.Key)"}
 }
 foreach($feature in $features.Split(',')){
  if($feature.Replace('-','_').ToUpperInvariant() -notin $values.features.Split(',')){throw 'Falta una opción de compilación.'}
 }
 $dump='C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\dumpbin.exe'
 & $dump /dependents $target | Set-Content -LiteralPath (Join-Path $ArtifactDirectory 'dumpbin.txt')
 if($LASTEXITCODE){throw 'dumpbin falló.'}
 [ordered]@{source_sha=$sha;variant=$Variant;sha256=(Get-FileHash -LiteralPath $target).Hash.ToLowerInvariant()
  bytes=(Get-Item $target).Length;embedded_provenance=$values;build_elapsed_s=$watch.Elapsed.TotalSeconds
  profile='release';opt_level=3;lto=$false;codegen_units=16;debug=$false;incremental=$false
  target=$targetRoot;comparable_build_time=$false;executed=$false}|
  ConvertTo-Json -Depth 5|Out-File -Width 2147483647 -LiteralPath (Join-Path $ArtifactDirectory 'artefacto.json') -NoClobber -Encoding utf8
 Write-Output "PASS: $Variant guardado y verificado sin ejecutarlo."
}catch{$_.Exception.Message | Out-File -Width 2147483647 -LiteralPath (Join-Path $ArtifactDirectory 'INVALIDA.txt') -NoClobber;throw}
