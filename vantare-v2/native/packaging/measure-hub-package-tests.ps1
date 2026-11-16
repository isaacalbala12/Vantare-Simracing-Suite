# Measurement regression: inert package data, no Electron process.
#requires -Version 7.0
param([Parameter(Mandatory)][string]$QaRoot)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
. (Join-Path $PSScriptRoot 'matrix/guard.ps1')
$qa=Assert-MatrixRoot $QaRoot
$root=Join-Path $qa ('measure-'+[guid]::NewGuid().ToString('N'))
$source=Join-Path $root 'source'
[IO.Directory]::CreateDirectory((Join-Path $source 'resources'))|Out-Null
[IO.Directory]::CreateDirectory((Join-Path $source 'locales'))|Out-Null
$payload=[Text.Encoding]::UTF8.GetBytes(('ASAR fixture, never executed. '*2048))
$json=[Text.Encoding]::UTF8.GetBytes('{"files":{"main.js":{"size":'+$payload.Length+',"offset":"0"}}}')
$padding=(4-($json.Length%4))%4
$buffer=[IO.MemoryStream]::new();$writer=[IO.BinaryWriter]::new($buffer)
$writer.Write([uint32]4);$writer.Write([uint32](8+$json.Length+$padding));$writer.Write([uint32](4+$json.Length+$padding));$writer.Write([uint32]$json.Length)
$writer.Write($json);$writer.Write([byte[]]::new($padding));$writer.Write($payload);$writer.Flush()
$asar=$buffer.ToArray();$writer.Dispose();$buffer.Dispose()
[IO.File]::WriteAllBytes((Join-Path $source 'resources/app.asar'),$asar)
foreach($path in @('vantare-hub-ui.exe','locales/es.pak','locales/en-US.pak','locales/fr.pak','resources/source.js.map')){
    [IO.File]::WriteAllText((Join-Path $source $path),('Inert fixture '+$path+' ')*1000)
}
$before=@(Get-ChildItem -LiteralPath $source -File -Recurse | Sort-Object FullName | ForEach-Object {Get-NativeHash $_.FullName})
$baseline=Join-Path $root 'baseline.zip'
New-BuildZip $source $baseline
$output=Join-Path $root 'result'
& (Join-Path $PSScriptRoot 'measure-hub-package.ps1') -PackageDirectory $source -BaselineZip $baseline -BaselineSha256 (Get-NativeHash $baseline) -OutputDirectory $output
$result=Get-Content -LiteralPath (Join-Path $output 'measurement.json') -Raw|ConvertFrom-Json
if($result.removedMaps -ne 1 -or $result.removedLocales -ne 1){throw 'Pruning measurement wrong'}
if($result.afterZipBytes -ge $result.beforeZipBytes){throw 'Pruning did not reduce the fixture ZIP'}
if($result.asarGzipHeaderValid -or -not $result.asarGzipRoundTrip){throw 'Gzip was confused with a loadable ASAR'}
if($result.asarCompressionApplied){throw 'Gzip replaced app.asar in the package'}
if($result.beforeBytes -le $result.afterBytes){throw 'Expanded byte counts wrong'}
$zip=[IO.Compression.ZipFile]::OpenRead((Join-Path $output 'reduced.zip'))
try{
    if((($zip.Entries.FullName|Sort-Object) -join '|') -cne 'locales/en-US.pak|locales/es.pak|resources/app.asar|vantare-hub-ui.exe'){throw 'Kept package members wrong'}
    $entry=$zip.GetEntry('resources/app.asar');$readStream=$entry.Open();$memory=[IO.MemoryStream]::new()
    try{$readStream.CopyTo($memory);if([Convert]::ToBase64String($memory.ToArray()) -cne [Convert]::ToBase64String($asar)){throw 'ASAR bytes changed'}}
    finally{$readStream.Dispose();$memory.Dispose()}
}finally{$zip.Dispose()}
$after=@(Get-ChildItem -LiteralPath $source -File -Recurse | Sort-Object FullName | ForEach-Object {Get-NativeHash $_.FullName})
if(($before -join '|') -cne ($after -join '|')){throw 'Measurement modified the source'}
$badOutput=Join-Path $root 'bad-sha'
$rejected=$false
try{& (Join-Path $PSScriptRoot 'measure-hub-package.ps1') -PackageDirectory $source -BaselineZip $baseline -BaselineSha256 ('0'*64) -OutputDirectory $badOutput}catch{$rejected=$true}
if(-not $rejected -or (Test-Path -LiteralPath $badOutput)){throw 'Bad SHA allowed output mutation'}
'PASS measurement: prune maps/extra locales; preserve ASAR/source; gzip round trip is not a loadable ASAR; bad SHA writes nothing.'
