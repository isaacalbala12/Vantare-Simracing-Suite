# Importa un solo artefacto de un run push ya completado. Solo operaciones de archivo.
function Import-TandaArtifact([string]$Source,[string]$Output,[long]$RunId,[string]$SourceSha,[ValidateSet('Visual','Medicion')][string]$Mode='Visual',
 [string]$ApprovedKeyId='',[string]$ApprovedRegistrySha256=''){
 $repo='isaacalbala12/Vantare-Simracing-Suite'
 if($RunId -le 0 -or $SourceSha -cnotmatch '\A[0-9a-f]{40}\z'){throw 'Run ID y SHA congelado inválidos'}
 if((git -C $Source rev-parse HEAD) -cne $SourceSha -or (git -C $Source status --porcelain)){throw 'El worktree de fixtures debe estar limpio y en el SHA congelado'}
 $null=git -C $Source merge-base --is-ancestor $SourceSha origin/nightly
 if($LASTEXITCODE){throw 'El SHA congelado no pertenece a origin/nightly'}
 if(Test-Path -LiteralPath $Output){throw 'La salida debe ser nueva'}
 $runJson=& gh api "repos/$repo/actions/runs/$RunId"
 if($LASTEXITCODE){throw 'Falló la consulta del run de CI'}
 $run=$runJson | ConvertFrom-Json -AsHashtable
 if($run.id -ne $RunId -or $run.path -cne '.github/workflows/qa-kit-artifacts.yml' -or
    $run.event -cne 'push' -or $run.head_branch -cne ('qa-kit/'+$SourceSha.Substring(0,8)) -or
    $run.head_sha -cne $SourceSha -or $run.status -cne 'completed' -or $run.conclusion -cne 'success'){
  throw 'El run no es un push QA exitoso del SHA congelado'
 }
 $null=New-Item -ItemType Directory -Path $Output
 $download=Join-Path $Output 'descarga-ci'
 & gh run download $RunId --repo $repo --name "qa-kit-$SourceSha" --dir $download
 if($LASTEXITCODE){throw 'Falló la descarga del único artefacto QA'}
 $receipt=Join-Path $download 'binarios.json'
 $metadata=Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json -AsHashtable
 $profile='release opt=3 debug=0 lto=false codegen-units=16'
 if($metadata.source_sha -cne $SourceSha -or [string]$metadata.run_id -cne [string]$RunId -or $metadata.profile -cne $profile){
  throw 'Recibo de CI contradice SHA, run o perfil'
 }
 $configured=$metadata['license_public_keys_configured']
 $coreFeatures=$metadata['core_features']
 if($configured -isnot [bool] -or $coreFeatures -isnot [array]){
  throw 'CI_LICENSE_MODE: el recibo debe declarar licencia booleana y features en una lista'
 }
 $isMeasurement=$Mode -ceq 'Medicion'
 $expectedCount=if($isMeasurement){2}else{1}
 if($configured -ne $isMeasurement -or $coreFeatures.Count -ne $expectedCount -or
    $coreFeatures[0] -cne 'paint-stats' -or ($isMeasurement -and $coreFeatures[1] -cne 'qa-license')){
  throw 'CI_LICENSE_MODE: licencia/features no corresponden al modo de tanda'
 }
 $expected=@('vantare-overlays-rune.exe','vantare-overlays.exe','vantare-core.exe','vantare-services.exe','vantare.exe','lifecycle.exe')
 if($isMeasurement){
  if($ApprovedKeyId -cnotmatch '\Aqa-[a-f0-9]{8}\z' -or $ApprovedRegistrySha256 -cnotmatch '\A[a-f0-9]{64}\z' -or
     $metadata.license_key_id -cne $ApprovedKeyId -or $metadata.license_registry_sha256 -cne $ApprovedRegistrySha256 -or
     $metadata.qa_license_cli_sha256 -cnotmatch '\A[a-f0-9]{64}\z'){
   throw 'CI_LICENSE_MODE: clave aprobada o hash del CLI no coinciden'
  }
  $expected+='vantare-qa-license.exe'
 }elseif($metadata.license_key_id -or $metadata.license_registry_sha256 -or $metadata.qa_license_cli_sha256 -or
          $ApprovedKeyId -or $ApprovedRegistrySha256){
  throw 'CI_LICENSE_MODE: un kit visual no admite procedencia QA'
 }
 $bin=Join-Path $download 'bin'
 $seen=@{}
 $rows=@(foreach($row in $metadata.files){
  $file=[string]$row.file
  if($file -cnotin $expected -or $seen.ContainsKey($file) -or [string]$row.sha256 -cnotmatch '\A[0-9a-f]{64}\z'){throw 'Recibo de binarios inválido'}
  $seen[$file]=$true
  $image=Get-Item -LiteralPath (Join-Path $bin $file) -Force
  if($image.PSIsContainer -or ($image.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
     $image.Length -le 0 -or $image.Length -ne $row.size -or
     (Get-FileHash -LiteralPath $image.FullName -Algorithm SHA256).Hash -ine $row.sha256){throw "Binario no coincide con el recibo: $file"}
  if($file -ceq 'vantare-qa-license.exe' -and $row.sha256 -cne $metadata.qa_license_cli_sha256){
   throw 'CI_LICENSE_MODE: hash del CLI distinto de su fila en el recibo'
  }
  $features=switch($file){'vantare-overlays.exe'{'parity-capture'} 'vantare-core.exe'{$coreFeatures -join ','} 'vantare-qa-license.exe'{'qa-license'} default{''}}
  $build=@{name=[IO.Path]::GetFileNameWithoutExtension($file);file=$file;size=$image.Length;sha256=$row.sha256;
    source_sha=$SourceSha;profile=$profile;run_id=$RunId;origin='GitHub Actions';features=$features;
    license_public_keys_configured=($file -ceq 'vantare-core.exe' -and $configured)}
  if($build.license_public_keys_configured){
   $build.license_key_id=$ApprovedKeyId
   $build.license_registry_sha256=$ApprovedRegistrySha256
  }
  $build
 })
 if($seen.Count -ne $expected.Count -or @(Get-ChildItem -LiteralPath $bin -Force).Count -ne $expected.Count){throw 'Inventario de binarios de CI distinto del contrato'}
 # Publicar solo después de verificar todos los ejecutables del modo elegido.
 Copy-Item -LiteralPath $receipt -Destination (Join-Path $Output 'ci-binarios.json')
 Move-Item -LiteralPath $bin -Destination (Join-Path $Output 'bin')
 ConvertTo-Json -InputObject $rows -Depth 8|Set-Content -LiteralPath (Join-Path $Output 'binarios.json') -Encoding utf8
}
