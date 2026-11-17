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
# M4 adds a single executable name and its sidecar, without changing the validator.
$extra=$inventory|ConvertTo-Json -Depth 20|ConvertFrom-Json
$extra.executables+=@('vantare-overlays-rune.exe')
Put (Join-Path $payload 'bin/vantare-overlays-rune.exe') 'future inert executable'
Put (Join-Path $payload 'bin/vantare-overlays-rune.exe.sha256') "$(Get-NativeHash (Join-Path $payload 'bin/vantare-overlays-rune.exe'))  vantare-overlays-rune.exe`n"
Assert-PublicInventory $payload $extra $files
Reject {Assert-PublicInventory $payload $inventory $files}
Put (Join-Path $payload 'bin/vantare-overlays-rune.exe.sha256') ('0'*64)
Reject {Assert-PublicInventory $payload $extra $files}
[IO.File]::Delete((Join-Path $payload 'bin/vantare-overlays-rune.exe.sha256'))
Reject {Assert-PublicInventory $payload $extra $files}
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
# QA bytes in web assets must fail even with no EXE in the tree/archive.
$qa=Join-Path $root 'qa/hub-ui/resources/app.asar'
Put $qa (('x'*65533)+'VANTARE_QA_E2E_NOT_FOR_DISTRIBUTION_1916')
Reject {Assert-NativeDistributionTree (Join-Path $root 'qa')}
$archive=Join-Path $root 'qa.zip'
New-BuildZip (Join-Path $root 'qa') $archive
Reject {Assert-NativeDistributionArchive $archive}
'PASS public inventory: declared extra EXE/sidecar, sealed UI, tampering and QA ASAR'
