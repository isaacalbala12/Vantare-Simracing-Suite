# ZIP transport regression; fixtures only, never a product installation.
#requires -Version 5.1
param([Parameter(Mandatory)][string]$QaRoot)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
. (Join-Path $PSScriptRoot 'matrix/guard.ps1')
$qa=Assert-MatrixRoot $QaRoot
$root=Join-Path $qa ('zip-'+[guid]::NewGuid().ToString('N'))
$source=Join-Path $root 'source'
[IO.Directory]::CreateDirectory((Join-Path $source 'hub-ui/resources'))|Out-Null
[IO.Directory]::CreateDirectory((Join-Path $source 'empty'))|Out-Null
$expected=@{'first.bin'=[byte[]](0..255);'hub-ui/resources/app.asar'=[Text.Encoding]::UTF8.GetBytes(('Actualización para José. '+[char]10)*4096)}
foreach($path in $expected.Keys){[IO.File]::WriteAllBytes((Join-Path $source $path),$expected[$path])}
$bad=Join-Path $root 'invalid.zip'
$rejected=$false
try{New-BuildZip $source $bad -CompressionLevel 'invalid'}catch{$rejected=$true}
if(-not $rejected -or (Test-Path -LiteralPath $bad)){throw 'An invalid compression request produced an archive'}
$levels=@('Optimal')
if([Enum]::GetNames([IO.Compression.CompressionLevel]) -contains 'SmallestSize'){$levels+='SmallestSize'}
else{
    $unavailable=Join-Path $root 'unavailable.zip'
    $rejected=$false
    try{New-BuildZip $source $unavailable -CompressionLevel 'SmallestSize'}catch{$rejected=$true}
    if(-not $rejected -or (Test-Path -LiteralPath $unavailable)){throw 'Unavailable compression produced an archive'}
}
foreach($level in $levels){
    $archive=Join-Path $root ($level+'.zip')
    New-BuildZip $source $archive -CompressionLevel $level
    $zip=[IO.Compression.ZipFile]::OpenRead($archive)
    try{
        if($zip.Entries.Count -ne $expected.Count){throw 'ZIP member count changed'}
        foreach($entry in $zip.Entries){
            if(-not $expected.ContainsKey($entry.FullName) -or $entry.FullName.EndsWith('/')){throw 'ZIP member changed or directory entry emitted'}
            $input=$entry.Open();$memory=[IO.MemoryStream]::new()
            try{$input.CopyTo($memory);$actual=$memory.ToArray()}
            finally{$input.Dispose();$memory.Dispose()}
            if([Convert]::ToBase64String($actual) -cne [Convert]::ToBase64String($expected[$entry.FullName])){throw 'ZIP bytes changed'}
        }
    }finally{$zip.Dispose()}
    # Compression method remains Deflate, supported by the existing Rust extractor.
    $input=[IO.File]::OpenRead($archive);$reader=[IO.BinaryReader]::new($input)
    try{
        if($reader.ReadUInt32() -ne 0x04034b50){throw 'ZIP local header missing'}
        $input.Position=8
        if($reader.ReadUInt16() -ne 8){throw 'ZIP no longer uses Deflate'}
    }finally{$reader.Dispose();$input.Dispose()}
}
'PASS ZIP: invalid/unavailable requests create no archive; available levels preserve members and bytes, without directory records.'
