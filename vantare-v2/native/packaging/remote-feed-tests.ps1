#requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$TestVerifier, [Parameter(Mandatory=$true)][string]$SigningKeyFile,
      [string]$EvidenceDirectory='C:/tmp/1472-arreglos-r2-evidence')
$ErrorActionPreference='Stop'
. "$PSScriptRoot/beta.ps1"
$script:feedRoot=Join-Path $EvidenceDirectory ('feed-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($script:feedRoot)|Out-Null
$payload=@{schema=1;product='vantare-native';channel='beta';version='0.1.1';url="https://github.com/$script:BetaRepository/releases/download/native-beta-v0.1.1/vantare-native-amd64-package.zip";sha256=('a'*64);notes='Actualización válida — prueba local'}|ConvertTo-Json
$signed=Invoke-BetaManifestTool $TestVerifier $payload $SigningKeyFile
[IO.File]::WriteAllText("$script:feedRoot/valid.json",$signed,[Text.UTF8Encoding]::new($false))
$script:releases=@()
foreach($version in @('0.1.1','65535.0.0','99999.0.0','2.0.0')) {
 $url="https://github.com/$script:BetaRepository/releases/download/native-beta-v$version/vantare-native-beta.json"
 if($version -eq '2.0.0'){$url='https://example.invalid/asset.json'}
 $script:releases+=@{draft=$false;tag_name="native-beta-v$version";assets=@(@{name='vantare-native-beta.json';size=512;browser_download_url=$url})}
}
# Feed simulado desde fichero: solo el transporte es sustituido; firma real.
$script:networkFailure=$false
$script:assetNetworkFailure=$false
function Invoke-RestMethod {
 param($Uri,$Headers,$TimeoutSec)
 if($script:networkFailure){throw [Net.WebException]::new('Red no disponible (prueba)')}
 $script:releases
}
function Invoke-WebRequest {
 param([switch]$UseBasicParsing,$Uri,$TimeoutSec,$Headers)
 $script:requested+=@($Uri)
 if($script:assetNetworkFailure){throw [Net.WebException]::new('Descarga no disponible (prueba)')}
 if($Uri -match 'v0.1.0/') { return @{Content=$script:olderSigned} }
 if($Uri -match 'v65535.0.0/') { return @{Content='{"payload":"invalid","signature":"invalid"}'} }
 $text=[IO.File]::ReadAllText("$script:feedRoot/valid.json")
 switch($script:encoding) {
  'utf8' { @{Content=[Text.Encoding]::UTF8.GetBytes($text)} }
  'utf16' { @{Content=[byte[]]([Text.Encoding]::Unicode.GetPreamble()+[Text.Encoding]::Unicode.GetBytes($text))} }
  'text' { @{Content=$text} }
 }
}

foreach($script:encoding in @('utf8','utf16','text')) {
 $script:requested=@()
 $result=Get-BetaRemoteManifest $TestVerifier
 $manifest=Read-BetaManifest $result $false $TestVerifier
 if($manifest.version -cne '0.1.1' -or $manifest.notes -cne ($payload|ConvertFrom-Json).notes) {throw 'Feed no selecciona versión firmada exacta'}
 if($script:requested.Count -ne 2 -or $script:requested[0] -notmatch 'v65535.0.0/') {throw 'Orden de verificación incorrecto'}
 Write-Output "PASS feed inválido alto + asset raro + válido firmado; encoding=$script:encoding"
}

# Instalación fixture: integridad e inventario reales; solo se sustituye el transporte.
$root=Join-Path $script:feedRoot 'installed'
$null=Open-NativeRoot $root -Initialize
$generation=[guid]::NewGuid().ToString('N')
$active=Join-Path $root "generations/$generation"
[IO.Directory]::CreateDirectory("$active/data")|Out-Null
foreach($member in $script:NativeMembers){
 $path=Join-Path $active $member
 [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path))|Out-Null
 if($member -ceq 'bin/vantare-services.exe'){[IO.File]::Copy($TestVerifier,$path)}
 elseif($member.EndsWith('.exe')){
  $bytes=New-Object byte[] 128
  $bytes[0]=0x4d;$bytes[1]=0x5a;$bytes[60]=64;$bytes[64]=0x50;$bytes[65]=0x45;$bytes[68]=0x64;$bytes[69]=0x86
  [IO.File]::WriteAllBytes($path,$bytes)
 } elseif($member.EndsWith('.sha256')){
  $bin=$path.Substring(0,$path.Length-7)
  [IO.File]::WriteAllText($path,"$(Get-NativeHash $bin)  $([IO.Path]::GetFileName($bin))`n")
 } else {[IO.File]::WriteAllText($path,'{}')}
}
$files=@($script:NativeMembers|ForEach-Object {$item=Get-Item -LiteralPath (Join-Path $active $_); @{path=$_;size=$item.Length;sha256=(Get-NativeHash $item.FullName)}})
Write-NativeJson "$active/manifest.json" @{schema=1;product='vantare-native';candidate=$true;architecture='windows-x64';data_schema='opaque-v1';source_sha=('a'*40);source_dirty=$false;build_profile='Debug';version='0.1.1';channel='beta';files=$files}
Set-NativeState $root @{schema=1;product='vantare-native';channel='beta';active=@{generation=$generation;manifest_sha256=(Get-NativeHash "$active/manifest.json")};previous=$null}
$originalState=[IO.File]::ReadAllText("$root/state.json")
$validRelease=$script:releases|Where-Object {$_.tag_name -ceq 'native-beta-v0.1.1'}
$invalidRelease=$script:releases|Where-Object {$_.tag_name -ceq 'native-beta-v65535.0.0'}
$olderPayload=$payload.Replace('0.1.1','0.1.0')
$script:olderSigned=Invoke-BetaManifestTool $TestVerifier $olderPayload $SigningKeyFile
$olderRelease=@{draft=$false;tag_name='native-beta-v0.1.0';assets=@(@{name='vantare-native-beta.json';size=512;browser_download_url="https://github.com/$script:BetaRepository/releases/download/native-beta-v0.1.0/vantare-native-beta.json"})}
foreach($case in @('empty','equal','older','invalid','network','asset-network')){
 $script:networkFailure=$case -eq 'network'
 $script:assetNetworkFailure=$case -eq 'asset-network'
 $script:releases=switch($case){'empty'{@()} 'equal'{@($validRelease,$olderRelease)} 'older'{@($olderRelease)} 'invalid'{@($invalidRelease)} 'network'{@()} 'asset-network'{@($invalidRelease)}}
 $script:requested=@()
 Set-BetaStatus $root 'error' 'Estado anterior'
 if(Stage-BetaUpdate $root){throw "Actualización inesperada: $case"}
 $status=[IO.File]::ReadAllText("$root/update-status.json")|ConvertFrom-Json
 $expected=if($case -in @('network','asset-network')){'error'}else{'current'}
 if($status.state -cne $expected -or $status.version -cne '0.1.1'){throw "Estado incorrecto: $case"}
 if($expected -eq 'error' -and -not $status.message){throw 'Error de red sin explicación'}
 if((Test-Path "$root/staging/pending.json") -or [IO.File]::ReadAllText("$root/state.json") -cne $originalState){throw 'Check alteró la instalación'}
 Write-Output "PASS Check $case => $expected; sin bloquear ni activar"
}
