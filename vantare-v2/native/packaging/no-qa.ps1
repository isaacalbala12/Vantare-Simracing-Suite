# Distribution boundary: inspect resolved features AND the bytes actually copied.
function Assert-NativeDistributionFeatures($Features) {
    if (@($Features | Where-Object { $_ -cin @('qa-e2e','parity-capture') }).Count) { throw 'QA feature in distribution graph.' }
}
function Assert-NativeDistributionBinary([string]$Path) {
    $marker='VANTARE_QA_E2E_NOT_FOR_DISTRIBUTION_1916'
    $stream=[IO.File]::OpenRead($Path)
    try {
        $buffer=[byte[]]::new(65536)
        $previous=''
        while(($count=$stream.Read($buffer,0,$buffer.Length)) -gt 0) {
            $text=$previous+[Text.Encoding]::ASCII.GetString($buffer,0,$count)
            if($text.Contains($marker)){throw 'QA executable in distribution payload.'}
            $previous=$text.Substring([Math]::Max(0,$text.Length-$marker.Length))
        }
    } finally {$stream.Dispose()}
}
