# Distribution boundary: inspect resolved features AND the bytes actually copied.
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Assert-NativeDistributionFeatures($Features) {
    if (@($Features | Where-Object { $_ -cin @('qa-e2e','parity-capture') }).Count) { throw 'QA feature in distribution graph.' }
}
function Assert-NativeDistributionStream([IO.Stream]$stream) {
    $markers=@('qa-e2e','VANTARE_QA_E2E_NOT_FOR_DISTRIBUTION_1916','qa-rfc8032','11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo','VANTARE_QA_','qa-fixture-public')
    $encoding=[Text.Encoding]::GetEncoding(28591)
    $markers+= $encoding.GetString([Convert]::FromBase64String('11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo='))
    $overlap=($markers|ForEach-Object {$_.Length}|Measure-Object -Maximum).Maximum
    $buffer=[byte[]]::new(65536)
    $previous=''
    while(($count=$stream.Read($buffer,0,$buffer.Length)) -gt 0) {
        $text=$previous+$encoding.GetString($buffer,0,$count)
        foreach($marker in $markers) {
            if($text.Contains($marker)){throw 'QA executable in distribution payload.'}
        }
        $previous=$text.Substring([Math]::Max(0,$text.Length-$overlap))
    }
}
function Assert-NativeDistributionBinary([string]$Path) {
    $stream=[IO.File]::OpenRead($Path)
    try {Assert-NativeDistributionStream $stream} finally {$stream.Dispose()}
}
function Assert-NativeDistributionArchive([string]$Path) {
    $zip=[IO.Compression.ZipFile]::OpenRead($Path)
    try {
        foreach($entry in $zip.Entries) {
            if(-not $entry.FullName.EndsWith('.exe',[StringComparison]::OrdinalIgnoreCase)){continue}
            $stream=$entry.Open()
            try {Assert-NativeDistributionStream $stream} finally {$stream.Dispose()}
        }
    } finally {$zip.Dispose()}
}

function Assert-NativeDistributionTree([string]$Directory) {
    foreach($exe in Get-ChildItem -LiteralPath $Directory -Filter '*.exe' -File -Recurse) {
        Assert-NativeDistributionBinary $exe.FullName
    }
}
