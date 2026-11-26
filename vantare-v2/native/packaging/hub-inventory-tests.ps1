# Inert files only: never launches Electron, a host or a renderer.
#requires -Version 5.1
param([Parameter(Mandatory)][string]$QaRoot)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
. (Join-Path $PSScriptRoot 'no-qa.ps1')
$root=Join-Path (Assert-BuildPath $QaRoot) ('hub-inventory-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
function Put([string]$Path,[string]$Text){
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Path))|Out-Null
    [IO.File]::WriteAllText($Path,$Text,[Text.UTF8Encoding]::new($false))
}
function Reject([scriptblock]$Action){
    $failed=$false;try{& $Action|Out-Null}catch{$failed=$true}
    if(-not $failed){throw 'Invalid Hub inventory accepted'}
}
$inventory=Get-Content (Join-Path $PSScriptRoot 'public-inventory.json') -Raw|ConvertFrom-Json
if((Get-PublicArtifact 'vantare-hub.exe' $inventory) -cne 'vantare-hub-host.exe'){throw 'Host artifact mapping missing'}
foreach($case in @(
    @{key='vantare-hub.exe';value='..\x.exe'},
    @{key='vantare-hub.exe';value='../vantare.exe'},
    @{key='vantare-hub.exe';value='D:\vantare.exe'},
    @{key='vantare-hub.exe';value='x.exe'},
    @{key='vantare-hub.exe';value='Vantare.exe'},
    @{key='vantare-hub.exe';value="vantare.exe`n"},
    @{key='../vantare.exe';value='vantare.exe'},
    @{key='vantare-unknown.exe';value='vantare.exe'}
)){
    $bad=$inventory|ConvertTo-Json -Depth 20|ConvertFrom-Json
    $bad.artifact_overrides=[pscustomobject]@{}
    $bad.artifact_overrides|Add-Member -NotePropertyName $case.key -NotePropertyValue $case.value
    Reject {Get-PublicArtifact 'vantare-hub.exe' $bad}
}
$payload=Join-Path $root 'payload'
foreach($name in @('README.md','licenses/OFL-Inter.txt','dependencies.json','licenses/hub-web-notices.txt')+@($inventory.executables|ForEach-Object {"bin/$_"})+@($inventory.resources|ForEach-Object {"bin/fixtures/$_"})){
    Put (Join-Path $payload $name) 'fixture'
}
foreach($name in $inventory.executables){Put (Join-Path $payload "bin/$name.sha256") "$(Get-NativeHash (Join-Path $payload "bin/$name"))  $name`n"}
$ui=Join-Path $root 'ui'
foreach($name in @('vantare-hub-ui.exe','resources/app.asar','LICENSE','LICENSES.chromium.html','locales/es.pak','locales/en-US.pak','vk_swiftshader.dll')){Put (Join-Path $ui $name) 'normal fixture'}
Put (Join-Path $ui 'vantare-hub-ui.exe.sha256') "$(Get-NativeHash (Join-Path $ui 'vantare-hub-ui.exe'))  vantare-hub-ui.exe`n"
$files=@(Get-ChildItem $ui -Recurse -File|Sort-Object FullName|ForEach-Object {@{path=$_.FullName.Substring($ui.Length+1).Replace('\','/');size=$_.Length;sha256=(Get-NativeHash $_.FullName)}})
$receipt=[pscustomobject]@{version='0.0.989';qa=$false;source_sha=('a'*40);source_dirty=$false;source_tree_sha256=('b'*64);architecture='windows-x64';electron_version='45.2.3';files=$files}
$receiptPath=Join-Path $root 'package-inventory.json'
Write-BuildJson $receiptPath $receipt
$null=Assert-HubPackage $ui $receiptPath '0.0.989' ('a'*40) $false
Copy-Item $ui (Join-Path $payload 'hub-ui') -Recurse
Assert-PublicInventory $payload $inventory $files
# External Rune remains mandatory in the payload, including its exact hash sidecar.
$rune=Join-Path $payload 'bin/vantare-overlays-rune.exe'
$bytes=[IO.File]::ReadAllBytes($rune)
[IO.File]::Delete($rune)
Reject {Assert-PublicInventory $payload $inventory $files}
[IO.File]::WriteAllBytes($rune,$bytes)
$sidecar=[IO.File]::ReadAllText("$rune.sha256")
Put "$rune.sha256" ('0'*64)
Reject {Assert-PublicInventory $payload $inventory $files}
[IO.File]::Delete("$rune.sha256")
Reject {Assert-PublicInventory $payload $inventory $files}
Put "$rune.sha256" $sidecar
foreach($external in @('vantare-core.exe','foreign.exe')){
    $bad=$inventory|ConvertTo-Json -Depth 20|ConvertFrom-Json
    $bad.external_bins=@($external)
    Reject {Assert-PublicInventory $payload $bad $files}
    Reject {Assert-PublicBins @() $bad}
}
Assert-PublicInventory $payload $inventory $files
$duplicate=$inventory|ConvertTo-Json -Depth 20|ConvertFrom-Json
$duplicate.executables+=@('vantare-hub.exe')
Reject {Assert-PublicInventory $payload $duplicate $files}
foreach($field in @('qa','version','source_sha','source_tree_sha256')){
    $bad=$receipt|ConvertTo-Json -Depth 20|ConvertFrom-Json
    $bad.$field=switch($field){qa {$true} version {'0.0.988'} source_sha {('c'*40)} source_tree_sha256 {'invalid'}}
    Write-BuildJson $receiptPath $bad
    Reject {Assert-HubPackage $ui $receiptPath '0.0.989' ('a'*40) $false}
}
Write-BuildJson $receiptPath $receipt
foreach($name in @('resources/app.asar','vk_swiftshader.dll','locales/es.pak','vantare-hub-ui.exe.sha256')){
    $path=Join-Path $ui $name;$before=[IO.File]::ReadAllBytes($path)
    Put $path 'tampered'
    Reject {Assert-HubPackage $ui $receiptPath '0.0.989' ('a'*40) $false}
    [IO.File]::WriteAllBytes($path,$before)
}
Put (Join-Path $ui 'unlisted.dll') 'extra'
Reject {Assert-HubPackage $ui $receiptPath '0.0.989' ('a'*40) $false}
[IO.File]::Delete((Join-Path $ui 'unlisted.dll'))
# QA bytes in web assets must fail even with no EXE in the tree/archive. The Hub update
# TEST authority (#2771) counts through its marker and every spelling of its public key.
$qa=Join-Path $root 'qa/hub-ui/resources/app.asar'
$latin=[Text.Encoding]::GetEncoding(28591)
$updateKey='GX9rI-FshTLGq8g4-s1ep4m-DHaykgM0A5v6iz02jWE'
$updateBytes=Get-NativeLicensePublicKeyBytes $updateKey
$qaMarkers=@('VANTARE_QA_E2E_NOT_FOR_DISTRIBUTION_1916','HUB_QA_DRIVER','VANTARE_QA_HUB_UPDATE_NOT_FOR_DISTRIBUTION',$updateKey,
    [Convert]::ToBase64String($updateBytes),[BitConverter]::ToString($updateBytes).Replace('-','').ToLowerInvariant(),$latin.GetString($updateBytes))
$portable=Join-Path $root 'portable/generations/fixture/hub-ui/resources/app.asar'
[IO.Directory]::CreateDirectory((Split-Path $qa))|Out-Null;[IO.Directory]::CreateDirectory((Split-Path $portable))|Out-Null
for($index=0;$index -lt $qaMarkers.Count;$index++){
    # Latin-1 writes the raw key bytes unchanged; the name cannot carry them.
    [IO.File]::WriteAllBytes($qa,$latin.GetBytes(('x'*65533)+$qaMarkers[$index]))
    Reject {Assert-NativeDistributionTree (Join-Path $root 'qa')}
    $archive=Join-Path $root "qa-asar-$index.zip"
    New-BuildZip (Join-Path $root 'qa') $archive
    Reject {Assert-NativeDistributionArchive $archive}
    [IO.File]::WriteAllBytes($portable,$latin.GetBytes($qaMarkers[$index]))
    $portableZip=Join-Path $root "portable-$index.zip"
    New-BuildZip (Join-Path $root 'portable') $portableZip
    Reject {Assert-NativeDistributionArchive $portableZip}
}
Put $qa 'normal fixture'
Assert-NativeDistributionTree (Join-Path $root 'qa')
$cleanArchive=Join-Path $root 'qa-asar-clean.zip'
New-BuildZip (Join-Path $root 'qa') $cleanArchive
Assert-NativeDistributionArchive $cleanArchive
'PASS public inventory: declared extra EXE/sidecar, sealed UI, tampering, QA ASAR and Hub update TEST authority'

$project=Join-Path $root 'notices'
Put (Join-Path $project 'package.json') '{}'
Put (Join-Path $project 'bun.lock') '{}'
Put (Join-Path $project 'node_modules/example/LICENSE-MIT') 'inert transitive MIT license'
$notices=Join-Path $root 'notices.txt'
Write-HubNotices $project $notices
if(-not ([IO.File]::ReadAllText($notices)).Contains('inert transitive MIT license')){throw 'npm license text omitted'}
