# Runs entirely under an injected QA root; no release is published.
#requires -Version 5.1
param([Parameter(Mandatory)][string]$QaRoot,[string]$Verifier,[string]$ServicesExecutable)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
. (Join-Path $PSScriptRoot 'build-config.ps1')
$qa=Assert-BuildPath $QaRoot
if(-not ($qa.StartsWith('D:\VantareServer\qa\',[StringComparison]::OrdinalIgnoreCase) -or ($env:RUNNER_TEMP -and $qa.StartsWith(([IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')+'\'),[StringComparison]::OrdinalIgnoreCase)))){throw 'Test exige raíz QA'}
$root=Join-Path $qa ('build-tooling-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$probe=Join-Path $root 'stdin-probe.ps1'
[IO.File]::WriteAllText($probe,'$s=[Console]::OpenStandardInput();$b=New-Object byte[] 3;$n=$s.Read($b,0,3);[Console]::Write([BitConverter]::ToString($b,0,$n))',[Text.UTF8Encoding]::new($false))
$shell=if($PSVersionTable.PSVersion.Major -eq 5){Join-Path $PSHOME 'powershell.exe'}else{Join-Path $PSHOME 'pwsh.exe'}
$stdinBytes=Invoke-BuildProcess $shell @('-NoProfile','-File',$probe) 'á'
if($stdinBytes -cnotin @('C3-A1','EF-BB-BF')){throw "stdin UTF-8 inesperado: $stdinBytes"}
$slow=Join-Path $root 'slow-version.ps1'
[IO.File]::WriteAllText($slow,'Start-Sleep -Seconds 30',[Text.UTF8Encoding]::new($false))
$clock=[Diagnostics.Stopwatch]::StartNew()
$rejected=$false;try{Invoke-BuildProcess $shell @('-NoProfile','-File',$slow) $null 500|Out-Null}catch{$rejected=$true}
if(-not $rejected -or $clock.Elapsed.TotalSeconds -gt 5){throw 'Plazo de --version no corta el proceso'}
$inventory=Get-Content (Join-Path $PSScriptRoot 'public-inventory.json') -Raw|ConvertFrom-Json
$bins=@($inventory.executables|ForEach-Object {[IO.Path]::GetFileNameWithoutExtension($_)})
Assert-PublicBins $bins $inventory
$rejected=$false;try{Assert-PublicBins ($bins+@('surprise')) $inventory}catch{$rejected=$true}
if(-not $rejected){throw 'Binario desconocido aceptado'}
$payload=Join-Path $root 'payload'
foreach($name in @('README.md','licenses/OFL-Inter.txt','dependencies.json')+@($inventory.executables|ForEach-Object {"bin/$_";"bin/$_.sha256"})+@($inventory.resources|ForEach-Object {"bin/fixtures/$_"})){
    $file=Join-Path $payload $name
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file))|Out-Null
    [IO.File]::WriteAllText($file,'x')
}
Assert-PublicInventory $payload $inventory
foreach($extra in @('bin/unknown.exe','bin/fixtures/telemetry-real/unwanted.json')){
    $file=Join-Path $payload $extra
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file))|Out-Null
    [IO.File]::WriteAllText($file,'x')
    $rejected=$false;try{Assert-PublicInventory $payload $inventory}catch{$rejected=$true}
    if(-not $rejected){throw "Inventario aceptó $extra"}
    [IO.File]::Delete($file)
}
$missing=$inventory|ConvertTo-Json -Depth 10|ConvertFrom-Json
$missing.resources=@($missing.resources|Where-Object {$_ -cne 'session-alerts.snapshot.json'})
$rejected=$false;try{Assert-PublicInventory $payload $missing}catch{if($_.Exception.Message -notlike '*Recurso obligatorio ausente*'){throw};$rejected=$true}
if(-not $rejected){throw 'Recurso obligatorio ausente aceptado'}
$badResource=$inventory|ConvertTo-Json -Depth 10|ConvertFrom-Json
$badResource.resources=@($badResource.resources)+@('layouts/forbidden.json')
$rejected=$false;try{Assert-PublicInventory $payload $badResource}catch{if($_.Exception.Message -notlike '*Ruta de recurso inválida*'){throw};$rejected=$true}
if(-not $rejected){throw 'Ruta layouts aceptada'}
$rejected=$false;try{Assert-BuildPath '\\test-server\share\package.zip'|Out-Null}catch{if($_.Exception.Message -notlike '*Raíz de build inválida*'){throw};$rejected=$true}
if(-not $rejected){throw 'Ubicación de red aceptada'}
$passNames=@('VANTARE_SCCACHE','VANTARE_CARGO_SLOTS','VANTARE_CARGO_MIN_GB')
$passBefore=@{}
foreach($name in $passNames){$passBefore[$name]=[Environment]::GetEnvironmentVariable($name,'Process');[Environment]::SetEnvironmentVariable($name,'1','Process')}
try{
    $savedConfig=Import-NativeBuildConfig ''
    try{foreach($name in $passNames){if([Environment]::GetEnvironmentVariable($name,'Process') -cne '1'){throw "Build perdió $name"}}}
    finally{Restore-NativeBuildConfig $savedConfig}
}finally{foreach($name in $passNames){[Environment]::SetEnvironmentVariable($name,$passBefore[$name],'Process')}}
foreach($name in @('VantareSetup.exe','vantare-native-amd64-package.zip')){
    $file=Join-Path $root $name
    [IO.File]::WriteAllText($file,'fixture')
    [IO.File]::WriteAllText("$file.sha256","$(Get-NativeHash $file)  $name`n")
}
Assert-PublishArtifacts $root
[IO.File]::Delete((Join-Path $root 'VantareSetup.exe.sha256'))
$rejected=$false;try{Assert-PublishArtifacts $root}catch{$rejected=$true}
if(-not $rejected){throw 'Falta de sidecar de Setup aceptada'}
$manifest=[pscustomobject]@{schema=1;product='vantare-native';channel='beta';version='0.0.989';url='https://github.com/isaacalbala12/Vantare-Downloads/releases/download/native-beta-v0.0.989/vantare-native-amd64-package.zip';sha256=('a'*64);notes='Actualización rápida para José'}
Assert-BetaManifest $manifest
$max=$manifest|ConvertTo-Json|ConvertFrom-Json
$max.version='0.0.65535';$max.url=$max.url.Replace('0.0.989','0.0.65535')
Assert-BetaManifest $max
foreach($script in @('build-candidate.ps1','publish-beta.ps1')){
    $out=Join-Path $root ('invalid-'+$script)
    $rejected=$false
    try{
        if($script -eq 'build-candidate.ps1'){& (Join-Path $PSScriptRoot $script) -Version '0.0.65536' -Channel beta -OutputDirectory $out -AllowDirty|Out-Null}
        else{& (Join-Path $PSScriptRoot $script) -Version '0.0.65536' -OutputDirectory $out -SigningKeyFile $probe -AllowDirty|Out-Null}
    }catch{if($_.Exception.Message -notmatch 'Versión (beta )?fuera de rango'){throw};$rejected=$true}
    if(-not $rejected -or (Test-Path $out)){throw "$script aceptó versión 65536"}
}
foreach($change in @(@{url='https://example.invalid/x.zip'},@{sha256='x'},@{sha256=(('a'*64)+"`n")},@{notes=('á'*8193)},@{version='0.0.65536'},@{version="0.0.989`n"},@{extra='x'})){
    $copy=$manifest|ConvertTo-Json|ConvertFrom-Json
    foreach($key in $change.Keys){$copy|Add-Member -NotePropertyName $key -NotePropertyValue $change[$key] -Force}
    $rejected=$false;try{Assert-BetaManifest $copy}catch{$rejected=$true}
    if(-not $rejected){throw "Manifiesto inválido aceptado: $($change.Keys)"}
}
$bad=Join-Path $root 'bad-manifest.json'
[IO.File]::WriteAllText($bad,('{"schema":1,"product":"vantare-native","channel":"beta","version":"0.0.989","url":"https://example.invalid/x.zip","sha256":"'+('a'*64)+'","notes":"á"}'),[Text.UTF8Encoding]::new($false))
$rejected=$false
try{& (Join-Path $PSScriptRoot 'sign-beta-manifest.ps1') -Manifest $bad -Output (Join-Path $root 'bad-signed.json') -ServicesExecutable (Join-Path $root 'missing.exe') -SigningKeyFile $probe}catch{if($_.Exception.Message -notlike '*URL beta inválida*'){throw};$rejected=$true}
if(-not $rejected -or (Test-Path (Join-Path $root 'bad-signed.json'))){throw 'Firma empezó antes de validar el manifiesto'}
if($Verifier){
    $inputJson=$manifest|ConvertTo-Json -Compress
    $signed=Invoke-BuildProcess $Verifier @('--matrix-sign') $inputJson
    $roundTrip=Invoke-BuildProcess $Verifier @('--verify-update') $signed
    if($roundTrip -cne $inputJson){throw 'Firma de ida y vuelta alteró acentos'}
}
if($ServicesExecutable){
    if(-not $Verifier){throw 'La firma real de prueba exige matrix-verifier'}
    $testVerifier=Join-Path $root 'matrix-verifier.exe'
    Copy-Item -LiteralPath $Verifier -Destination $testVerifier
    $testKey=Join-Path $root 'test-update-seed.bin'
    [IO.File]::WriteAllBytes($testKey,([byte[]]@(42)*32))
    $testManifest=Join-Path $root 'test-manifest.json'
    $testJson=$manifest|ConvertTo-Json -Compress
    [IO.File]::WriteAllText($testManifest,$testJson,[Text.UTF8Encoding]::new($false))
    $signedPath=Join-Path $root 'signed-test-manifest.json'
    & (Join-Path $PSScriptRoot 'sign-beta-manifest.ps1') -Manifest $testManifest -Output $signedPath -ServicesExecutable $ServicesExecutable -SigningKeyFile $testKey -QaVerifier $testVerifier
    $signed=[IO.File]::ReadAllText($signedPath)
    if((Invoke-BuildProcess $testVerifier @('--verify-update') $signed) -cne $testJson){throw 'Firma real alteró JSON o acentos'}
    $withBom=Invoke-BuildProcess $ServicesExecutable @('--sign-update',$testKey) ([char]0xfeff+$testJson)
    if((Invoke-BuildProcess $testVerifier @('--verify-update') $withBom) -cne $testJson){throw 'Firma real incluyó BOM'}
    $rejected=$false;try{Invoke-BuildProcess $ServicesExecutable @('--verify-update') $signed|Out-Null}catch{$rejected=$true}
    if(-not $rejected){throw 'Clave TEST aceptada por verificación de producción'}
}
$packageTree=Join-Path $root 'zip-limits-tree'
[IO.Directory]::CreateDirectory((Join-Path $packageTree 'bin'))|Out-Null
$resource=Join-Path $packageTree 'bin/fixture.txt'
[IO.File]::WriteAllText($resource,'owned fixture',[Text.UTF8Encoding]::new($false))
Write-BuildJson (Join-Path $packageTree 'manifest.json') @{schema=1;product='vantare-native';version='0.0.989';channel='beta';engine=2;files=@(@{path='bin/fixture.txt';size=(Get-Item $resource).Length;sha256=(Get-NativeHash $resource)})}
$zipPath=Join-Path $root 'valid-package.zip'
New-BuildZip $packageTree $zipPath
$null=Test-BuildPackage $zipPath '0.0.989' 'beta'
$readZip=[IO.Compression.ZipFile]::OpenRead($zipPath)
try{
    $rejected=$false;try{Get-BoundedZipHash ($readZip.GetEntry('bin/fixture.txt')) 1|Out-Null}catch{if($_.Exception.Message -notlike '*Tamaño ZIP extraído incorrecto*'){throw};$rejected=$true}
    if(-not $rejected){throw 'Salida expandida por encima del tamaño declarado aceptada'}
}finally{$readZip.Dispose()}
$linkZip=Join-Path $root 'link-package.zip'
Copy-Item -LiteralPath $zipPath -Destination $linkZip
$archive=[IO.Compression.ZipFile]::Open($linkZip,[IO.Compression.ZipArchiveMode]::Update)
try{$archive.GetEntry('bin/fixture.txt').ExternalAttributes=-1610612736}finally{$archive.Dispose()}
$rejected=$false;try{Test-BuildPackage $linkZip '0.0.989' 'beta'|Out-Null}catch{if($_.Exception.Message -notlike '*Enlace ZIP rechazado*'){throw};$rejected=$true}
if(-not $rejected){throw 'Enlace ZIP aceptado'}
$rejected=$false;try{Assert-BuildArchiveLength (128MB+1)}catch{if($_.Exception.Message -notlike '*ZIP comprimido supera el límite*'){throw};$rejected=$true}
if(-not $rejected){throw 'ZIP comprimido sobredimensionado aceptado'}
$rejected=$false;try{Assert-BuildExpandedLength (256MB+1) (256MB+1)}catch{if($_.Exception.Message -notlike '*ZIP supera el límite de extracción*'){throw};$rejected=$true}
if(-not $rejected){throw 'Miembro ZIP sobredimensionado aceptado'}
$rejected=$false;try{Assert-BuildExpandedLength 1 (512MB+1)}catch{if($_.Exception.Message -notlike '*ZIP supera el límite de extracción*'){throw};$rejected=$true}
if(-not $rejected){throw 'Suma ZIP sobredimensionada aceptada'}
"PASS build-tooling: stdin=$stdinBytes; inventario, sidecars, manifiesto y firma QA"
