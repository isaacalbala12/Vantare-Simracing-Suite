# Distribution boundary: inspect resolved features AND the bytes actually copied.
function Assert-NativeDistributionFeatures($Features) {
    if (@($Features | Where-Object { $_ -cin @('qa-e2e','parity-capture') }).Count) { throw 'QA feature in distribution graph.' }
}
function Assert-NativeDistributionBinary([string]$Path) {
    $markers=@('qa-e2e','VANTARE_QA_E2E_NOT_FOR_DISTRIBUTION_1916','qa-rfc8032','11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo','VANTARE_QA_','qa-fixture-public')
    $encoding=[Text.Encoding]::GetEncoding(28591)
    $markers+= $encoding.GetString([Convert]::FromBase64String('11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo='))
    $overlap=($markers|ForEach-Object {$_.Length}|Measure-Object -Maximum).Maximum
    $stream=[IO.File]::OpenRead($Path)
    try {
        $buffer=[byte[]]::new(65536)
        $previous=''
        while(($count=$stream.Read($buffer,0,$buffer.Length)) -gt 0) {
            $text=$previous+$encoding.GetString($buffer,0,$count)
            foreach($marker in $markers) {
                if($text.Contains($marker)){throw 'QA executable in distribution payload.'}
            }
            $previous=$text.Substring([Math]::Max(0,$text.Length-$overlap))
        }
    } finally {$stream.Dispose()}
}

function Assert-NativeDistributionTree([string]$Directory) {
    foreach($exe in Get-ChildItem -LiteralPath $Directory -Filter '*.exe' -File -Recurse) {
        Assert-NativeDistributionBinary $exe.FullName
    }
}
