# Runs entirely under an injected QA root; no release is published.
#requires -Version 5.1
param([Parameter(Mandatory)][string]$QaRoot,[string]$Verifier)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
$qa=Assert-BuildPath $QaRoot
if(-not ($qa.StartsWith('D:\VantareServer\qa\',[StringComparison]::OrdinalIgnoreCase) -or ($env:RUNNER_TEMP -and $qa.StartsWith(([IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')+'\'),[StringComparison]::OrdinalIgnoreCase)))){throw 'Test exige raíz QA'}
$root=Join-Path $qa ('build-tooling-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$probe=Join-Path $root 'stdin-probe.ps1'
[IO.File]::WriteAllText($probe,'$s=[Console]::OpenStandardInput();$b=New-Object byte[] 3;$n=$s.Read($b,0,3);[Console]::Write([BitConverter]::ToString($b,0,$n))',[Text.UTF8Encoding]::new($false))
$shell=if($PSVersionTable.PSVersion.Major -eq 5){Join-Path $PSHOME 'powershell.exe'}else{Join-Path $PSHOME 'pwsh.exe'}
if((Invoke-BuildProcess $shell @('-NoProfile','-File',$probe) 'á') -cne 'C3-A1'){throw 'stdin lleva BOM o bytes distintos'}
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
    }catch{$rejected=$true}
    if(-not $rejected -or (Test-Path $out)){throw "$script aceptó versión 65536"}
}
foreach($change in @(@{url='https://example.invalid/x.zip'},@{sha256='x'},@{notes=('á'*8193)},@{version='0.0.65536'},@{extra='x'})){
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
"PASS build-tooling: stdin UTF-8, inventario, sidecars, manifiesto y firma QA"
