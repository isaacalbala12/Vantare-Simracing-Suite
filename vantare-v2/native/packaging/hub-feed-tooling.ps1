# Separate feed contract; installation manifests keep their current schema/product.
function Assert-HubBetaManifest([object]$Manifest) {
    $names=@($Manifest.PSObject.Properties.Name|Sort-Object)
    $expected=@('channel','compressed_bytes','expanded_bytes','notes','product','schema','sha256','url','version')
    if(($names -join ',') -cne ($expected -join ',')){throw 'Campos del manifiesto Hub inválidos'}
    if(($Manifest.schema -isnot [int] -and $Manifest.schema -isnot [long]) -or $Manifest.schema -ne 2 -or $Manifest.product -cne 'vantare-hub' -or $Manifest.channel -cne 'beta'){throw 'Manifiesto Hub incompatible'}
    if($Manifest.version -isnot [string] -or $Manifest.version -cnotmatch '^(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\z' -or @($Manifest.version.Split('.')|Where-Object {[int]$_ -gt 65535}).Count){throw 'Versión Hub inválida'}
    $url="https://github.com/isaacalbala12/Vantare-Downloads/releases/download/hub-beta-v$($Manifest.version)/vantare-native-amd64-package.zip"
    if($Manifest.url -isnot [string] -or $Manifest.url -cne $url -or $Manifest.sha256 -isnot [string] -or $Manifest.sha256 -cnotmatch '^[0-9a-f]{64}\z' -or $Manifest.notes -isnot [string] -or [Text.Encoding]::UTF8.GetByteCount($Manifest.notes) -gt 8192){throw 'URL, SHA o notas Hub inválidos'}
    foreach($field in @(@('compressed_bytes',256MB),@('expanded_bytes',768MB))){
        $value=$Manifest.($field[0])
        if(($value -isnot [int] -and $value -isnot [long]) -or $value -le 0 -or $value -gt $field[1]){throw 'Tamaño firmado Hub fuera de los límites'}
    }
}
function Assert-LegacyFeedCapacity([string]$Archive) {
    if((Get-Item -LiteralPath (Assert-BuildPath $Archive)).Length -gt 128MB){throw 'El publicador native-beta no admite ZIP mayor de128MiB'}
}
function New-HubBetaManifest([string]$Archive,[string]$Version,[string]$Notes='') {
    Assert-BuildPackageCapacity $Archive
    $zip=[IO.Compression.ZipFile]::OpenRead($Archive)
    try{[long]$expanded=0;foreach($entry in $zip.Entries){$expanded+=$entry.Length}}finally{$zip.Dispose()}
    $manifest=[pscustomobject]@{schema=2;product='vantare-hub';channel='beta';version=$Version;url="https://github.com/isaacalbala12/Vantare-Downloads/releases/download/hub-beta-v$Version/vantare-native-amd64-package.zip";sha256=(Get-NativeHash $Archive);notes=$Notes;compressed_bytes=(Get-Item -LiteralPath $Archive).Length;expanded_bytes=$expanded}
    Assert-HubBetaManifest $manifest
    $manifest
}
