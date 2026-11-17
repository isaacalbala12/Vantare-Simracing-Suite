# Signed Hub schema/tooling boundaries; no build, signing secret or publication.
#requires -Version 5.1
param([Parameter(Mandatory)][string]$QaRoot)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
$root=Join-Path $QaRoot ('hub-feed-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$offer=[pscustomobject]@{schema=2;product='vantare-hub';channel='beta';version='0.0.990';url='https://github.com/isaacalbala12/Vantare-Downloads/releases/download/hub-beta-v0.0.990/vantare-native-amd64-package.zip';sha256=('a'*64);notes='Notas para José';compressed_bytes=256MB;expanded_bytes=768MB}
Assert-HubBetaManifest $offer
foreach($change in @(@{schema=1},@{product='vantare-native'},@{channel='nightly'},@{url=$offer.url.Replace('hub-beta-v','native-beta-v')},@{compressed_bytes=(256MB+1)},@{expanded_bytes=(768MB+1)},@{compressed_bytes=0},@{expanded_bytes=-1},@{compressed_bytes='12'},@{extra='x'})){
    $bad=$offer|ConvertTo-Json|ConvertFrom-Json
    foreach($name in $change.Keys){$bad|Add-Member -NotePropertyName $name -NotePropertyValue $change[$name] -Force}
    $failed=$false;try{Assert-HubBetaManifest $bad}catch{$failed=$true}
    if(-not $failed){throw 'Invalid signed Hub schema accepted'}
}
$path=Join-Path $root 'legacy.zip'
$stream=[IO.File]::Open($path,[IO.FileMode]::CreateNew)
try{
    $stream.SetLength(128MB);$stream.Flush();Assert-LegacyFeedCapacity $path
    $stream.SetLength(128MB+1);$stream.Flush()
    $failed=$false;try{Assert-LegacyFeedCapacity $path}catch{$failed=$true}
    if(-not $failed){throw 'Legacy publisher accepted >128 MiB'}
}finally{$stream.Dispose();[IO.File]::Delete($path)}
. (Join-Path $PSScriptRoot 'no-qa.ps1')
$failed=$false;try{Assert-NativeDistributionFeatures @('network','hub-update-qa')}catch{$failed=$true}
if(-not $failed){throw 'Isolated Hub QA authority admitted to distribution'}
'PASS Hub manifest boundaries, legacy publisher128/+1 and isolated QA exclusion'
