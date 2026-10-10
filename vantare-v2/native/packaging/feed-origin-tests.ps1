# Contrato de origen; no simula ni sustituye el verificador de firma.
$ErrorActionPreference='Stop'
. "$PSScriptRoot/beta.ps1"
$version='0.1.1'
$url="https://github.com/isaacalbala12/Vantare-Downloads/releases/download/native-beta-v$version/vantare-native-amd64-package.zip"
Assert-BetaPackageUrl $url $version
$rejected=0
foreach($bad in @(
    $url.Replace('Vantare-Downloads','Vantare-Simracing-Suite'),
    $url.Replace('isaacalbala12','attacker'),
    $url.Replace('https:','http:'),
    "${url}?token=x",
    "${url}#fragment",
    $url.Replace('v0.1.1/','v0.1.2/'),
    $url.Replace('github.com/','github.com.attacker.invalid/'),
    'file:///C:/tmp/fixture.zip'
)) {
    $failed=$false
    try { Assert-BetaPackageUrl $bad $version } catch { $failed=$true }
    if(-not $failed){throw 'Se aceptÃ³ un origen fuera del contrato.'}
    $rejected++
}
Assert-BetaPackageUrl 'file:///C:/tmp/fixture.zip' $version $true
"PASS: origen exacto, modo local explÃ­cito y $rejected rechazos. Firma no sustituida."
