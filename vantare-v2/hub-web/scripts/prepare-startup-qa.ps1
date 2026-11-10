# Inert installer matrix fixture. Never launches its product placeholders.
param([Parameter(Mandatory)][string]$Root,[Parameter(Mandatory)][string]$Generation)
$ErrorActionPreference='Stop'
$rootPath=[IO.Path]::GetFullPath($Root)
$qaNamespace=if($env:VANTARE_HUB_QA_ROOT){[IO.Path]::GetFullPath($env:VANTARE_HUB_QA_ROOT)}else{[IO.Path]::GetFullPath([IO.Path]::GetTempPath())}
$qaPrefix=$qaNamespace.TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
if(-not $rootPath.StartsWith($qaPrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Root must be a child of the QA namespace'}
if($Generation -cnotmatch '^[a-f0-9]{32}$'){throw 'Invalid generation'}
$matrix=Join-Path $PSScriptRoot '../../native/packaging/matrix'
. (Join-Path $matrix 'support.ps1')
. (Join-Path $matrix 'fixtures.ps1')
# Electron packaging is a later step: keep its QA generation outside this inert installation.
$installation=Join-Path $rootPath 'installer-fixture'
$generationPath=Join-Path $installation ('generations/'+$Generation)
[IO.Directory]::CreateDirectory((Join-Path $generationPath 'data'))|Out-Null
$placeholder=Join-Path $env:WINDIR 'System32/cmd.exe'
New-MatrixPayload $generationPath '0.0.988' $placeholder
$manifestPath=Join-Path $generationPath 'manifest.json'
[IO.File]::WriteAllText((Join-Path $installation '.vantare-native'),'offline-candidate-v1')
Copy-Item -LiteralPath $placeholder -Destination (Join-Path $installation 'Vantare.exe')
Copy-Item -LiteralPath $placeholder -Destination (Join-Path $installation 'Uninstall.exe')
Write-NativeJson (Join-Path $installation 'state.json') @{schema=1;product='vantare-native';channel='beta';active=@{generation=$Generation;manifest_sha256=(Get-NativeHash $manifestPath)};previous=$null}
Write-NativeJson (Join-Path $installation 'installer-ui.json') @{schema=1;kind='rust-gpui';uninstaller='Uninstall.exe';sha256=(Get-NativeHash (Join-Path $installation 'Uninstall.exe'));desktop=$false;autostart=$false}
$id=[guid]::NewGuid().ToString('N')
$contextBase=Join-Path ([IO.Path]::GetDirectoryName($rootPath)) ('context-'+$id)
$local=Join-Path $contextBase 'local';$shell=Join-Path $contextBase 'shell'
[IO.Directory]::CreateDirectory($local)|Out-Null
[IO.Directory]::CreateDirectory($shell)|Out-Null
Write-NativeJson (Join-Path $installation 'qa-context.json') @{localAppData=$local;registryPrefix=('Software\VantareInstallerMatrix\'+$id);shellRoot=$shell}
'PASS inert fixture prepared; registration and shell remain scoped by the Rust QA context'
