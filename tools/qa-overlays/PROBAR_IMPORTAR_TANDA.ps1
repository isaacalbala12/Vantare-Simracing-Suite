# Fakes the remote run and download. No API calls, processes from the artifact, or GPU.
$ErrorActionPreference='Stop'
. "$PSScriptRoot/IMPORTAR_ARTEFACTO_TANDA.ps1"
$script:sourceSha='a'*40
$script:runId=123
$script:case='ok'
$script:configured=$false
$script:coreFeatures=@('paint-stats')
$script:calls=[Collections.Generic.List[string]]::new()
$scratch=Join-Path ([IO.Path]::GetTempPath()) ('vantare-ci-import-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $scratch
function git {
 if($args -contains 'rev-parse'){$script:sourceSha}
 $global:LASTEXITCODE=0
}
function gh {
 $script:calls.Add($args[0])
 $global:LASTEXITCODE=0
 if($args[0] -eq 'api'){
  @{
   id=$script:runId;path='.github/workflows/qa-kit-artifacts.yml';event=if($script:case -eq 'pr'){'pull_request'}else{'push'}
   head_branch='qa-kit/aaaaaaaa';head_sha=$script:sourceSha;status='completed';conclusion='success'
  } | ConvertTo-Json -Compress
  return
 }
 if($args[1] -ne 'download' -or $args[2] -ne $script:runId -or $args[-3] -cne ('qa-kit-'+$script:sourceSha)){throw 'Descarga no fijada al run y al nombre'}
 $dir=$args[-1]
 $bin=Join-Path $dir 'bin'
 $null=New-Item -ItemType Directory -Path $bin -Force
 $rows=@(foreach($name in 'vantare-overlays-rune','vantare-overlays','vantare-core','vantare-services','vantare','lifecycle'){
  $path=Join-Path $bin "$name.exe"
  Set-Content -LiteralPath $path 'FAKE NEVER EXECUTE'
  @{file="$name.exe";size=(Get-Item -LiteralPath $path).Length;sha256=(Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant()}
 })
 if($script:case -eq 'tamper'){Add-Content -LiteralPath (Join-Path $bin 'vantare-core.exe') 'tamper'}
 $source=if($script:case -eq 'sha'){'b'*40}else{$script:sourceSha}
 @{source_sha=$source;run_id=[string]$script:runId;profile='release opt=3 debug=0 lto=false codegen-units=16';files=$rows;
   core_features=$script:coreFeatures;license_public_keys_configured=$script:configured} |
  ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $dir 'binarios.json')
}
$script:case='ok'
foreach($case in @(
 @{name='visual-correcto';mode='Visual';configured=$false;features=@('paint-stats');accepted=$true},
 @{name='medicion-correcta';mode='Medicion';configured=$true;features=@('paint-stats','qa-license');accepted=$true},
 @{name='visual-con-clave';mode='Visual';configured=$true;features=@('paint-stats','qa-license');accepted=$false},
 @{name='medicion-sin-clave';mode='Medicion';configured=$false;features=@('paint-stats');accepted=$false},
 @{name='feature-sin-clave';mode='Visual';configured=$false;features=@('paint-stats','qa-license');accepted=$false},
 @{name='clave-sin-feature';mode='Medicion';configured=$true;features=@('paint-stats');accepted=$false},
 @{name='flag-falso-textual';mode='Visual';configured='false';features=@('paint-stats');accepted=$false}
)){
 $script:configured=$case.configured
 $script:coreFeatures=$case.features
 $out=Join-Path $scratch $case.name
 if($case.accepted){
  Import-TandaArtifact $scratch $out $script:runId $script:sourceSha -Mode $case.mode
  $rows=Get-Content -LiteralPath (Join-Path $out 'binarios.json') -Raw | ConvertFrom-Json
  $core=$rows|Where-Object name -ceq 'vantare-core'
  if($core.features -cne ($case.features -join ',') -or $core.license_public_keys_configured -ne $case.configured -or
     @($rows|Where-Object {$_.name -cne 'vantare-core' -and $_.license_public_keys_configured}).Count){throw 'Procedencia de licencia no coincide con el núcleo'}
 }else{
  $rejected=$false
  try{Import-TandaArtifact $scratch $out $script:runId $script:sourceSha -Mode $case.mode}catch{$rejected=$_.Exception.Message -like 'CI_LICENSE_MODE*'}
  if(-not $rejected -or (Test-Path (Join-Path $out 'binarios.json'))){throw "Modo cruzado/recibo inválido no rechazado: $($case.name)"}
 }
}
$script:configured=$false
$script:coreFeatures=@('paint-stats')
$script:calls.Clear()
$good=Join-Path $scratch 'ok'
Import-TandaArtifact $scratch $good $script:runId $script:sourceSha
if(($script:calls -join ',') -cne 'api,run'){throw 'La importación debe hacer una consulta y una descarga'}
$receipt=Get-Content -LiteralPath (Join-Path $good 'binarios.json') -Raw | ConvertFrom-Json -AsHashtable
if($receipt.Count -ne 6 -or @($receipt | Where-Object {$_.run_id -ne 123 -or $_.source_sha -cne $script:sourceSha}).Count){throw 'Se perdió la procedencia del run'}
foreach($bad in 'pr','tamper','sha'){
 $script:case=$bad;$script:calls.Clear()
 $out=Join-Path $scratch $bad
 $rejected=$false
 try{Import-TandaArtifact $scratch $out $script:runId $script:sourceSha}catch{$rejected=$true}
 if(-not $rejected -or (Test-Path (Join-Path $out 'binarios.json'))){throw "Se publicó un artefacto inválido: $bad"}
 if($bad -eq 'pr' -and ($script:calls -join ',') -cne 'api'){throw 'El run de PR no debe descargarse para el kit'}
}
'PASS: ambos modos y cruce rechazado, consulta y descarga únicas, hashes de seis binarios y rechazo de PR/manipulación/SHA distinto'
