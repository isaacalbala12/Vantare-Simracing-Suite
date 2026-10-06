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
function Invoke-RestMethod { param($Uri,$Headers,$TimeoutSec); $script:releases }
function Invoke-WebRequest {
 param([switch]$UseBasicParsing,$Uri,$TimeoutSec,$Headers)
 $script:requested+=@($Uri)
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

