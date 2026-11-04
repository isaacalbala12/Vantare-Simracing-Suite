Add-Type -AssemblyName System.IO.Compression.FileSystem
# Public trust anchors only. Empty list denies every configured license key.
function Get-NativeProductionLicenseKeyFingerprints {
    $fingerprints=@()
    foreach($line in [IO.File]::ReadAllLines((Join-Path $PSScriptRoot 'production-license-keys.sha256'))) {
        $value=$line.Trim()
        if(-not $value -or $value.StartsWith('#')){continue}
        if($value -cnotmatch '^[0-9a-f]{64}$'){throw 'Invalid production license fingerprint list.'}
        $fingerprints+=$value
    }
    if(-not $fingerprints.Count){throw 'Production license fingerprint list is empty.'}
    return $fingerprints
}
function Get-NativeLicensePublicKeyBytes([string]$Encoded) {
    if($Encoded -cnotmatch '^[A-Za-z0-9_-]{43}$'){return $null}
    try {$bytes=[Convert]::FromBase64String($Encoded.Replace('-','+').Replace('_','/')+'=')}
    catch {return $null}
    if($bytes.Length -ne 32){return $null}
    $canonical=[Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
    if($canonical -cne $Encoded){return $null}
    return ,$bytes
}
function Assert-NativeLicensePublicKey([string]$Encoded, $Approved) {
    $bytes=Get-NativeLicensePublicKeyBytes $Encoded
    if($null -eq $bytes){throw 'Invalid distribution license public key.'}
    $fingerprint=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
    if($fingerprint -cnotin @($Approved)){throw 'Unapproved license public key in distribution payload.'}
}
function Assert-NativeDistributionLicenseRegistry([string]$Registry) {
    if(-not $Registry){return} # Unconfigured smoke packages carry no trust root.
    $approved=@(Get-NativeProductionLicenseKeyFingerprints)
    foreach($pair in $Registry.Split(',')) {
        if($pair -cnotmatch '^[A-Za-z0-9_.-]{1,64}:([A-Za-z0-9_-]{43})$'){throw 'Invalid distribution license registry.'}
        Assert-NativeLicensePublicKey $Matches[1] $approved
    }
}
# Distribution boundary: inspect resolved features AND the bytes actually copied.
function Assert-NativeDistributionFeatures($Features) {
    if (@($Features | Where-Object { $_ -cin @('qa-e2e','parity-capture') }).Count) { throw 'QA feature in distribution graph.' }
}
function Get-NativeKnownTestLicenseMarkers {
    $markers=@()
    $encoding=[Text.Encoding]::GetEncoding(28591)
    foreach($line in [IO.File]::ReadAllLines((Join-Path $PSScriptRoot 'known-test-license-keys'))) {
        $value=$line.Trim()
        if(-not $value -or $value.StartsWith('#')){continue}
        $bytes=Get-NativeLicensePublicKeyBytes $value
        if($null -eq $bytes){throw 'Invalid known test license key list.'}
        $markers+=$value
        $markers+=$encoding.GetString($bytes)
    }
    if(-not $markers.Count){throw 'Known test license key list is empty.'}
    return $markers
}
function Assert-NativeDistributionStream([IO.Stream]$Stream, [string]$ExpectedRegistry) {
    $requireRegistry=$PSBoundParameters.ContainsKey('ExpectedRegistry')
    if($requireRegistry) {
        if(-not $ExpectedRegistry){throw 'Missing configured license registry.'}
        Assert-NativeDistributionLicenseRegistry $ExpectedRegistry
    }
    $markers=@('qa-e2e','VANTARE_QA_E2E_NOT_FOR_DISTRIBUTION_1916','qa-rfc8032','VANTARE_QA_','qa-fixture-public')
    $markers+=@(Get-NativeKnownTestLicenseMarkers)
    # Registry/markers are ASCII emitted by Rust option_env! as UTF-8, never
    # UTF-16. Latin-1 preserves every byte, including the raw 32-byte test keys.
    # Literal comparisons deliberately have NO word boundaries: .rdata literals
    # may be adjacent to arbitrary other strings.
    $encoding=[Text.Encoding]::GetEncoding(28591)
    $overlap=($markers|ForEach-Object {$_.Length}|Measure-Object -Maximum).Maximum
    if($requireRegistry){$overlap=[Math]::Max($overlap,$ExpectedRegistry.Length)}
    $foundRegistry=$false
    $buffer=[byte[]]::new(65536)
    $previous=''
    while(($count=$stream.Read($buffer,0,$buffer.Length)) -gt 0) {
        $text=$previous+$encoding.GetString($buffer,0,$count)
        foreach($marker in $markers) {
            if($text.Contains($marker)){throw 'QA executable in distribution payload.'}
        }
        if($requireRegistry -and $text.Contains($ExpectedRegistry)){$foundRegistry=$true}
        $previous=$text.Substring([Math]::Max(0,$text.Length-$overlap))
    }
    if($requireRegistry -and -not $foundRegistry){throw 'Configured license registry missing from executable.'}
}

function Assert-NativeDistributionBinary([string]$Path, [string]$ExpectedRegistry) {
    $stream=[IO.File]::OpenRead($Path)
    try {
        if($PSBoundParameters.ContainsKey('ExpectedRegistry')) {
            Assert-NativeDistributionStream $stream -ExpectedRegistry $ExpectedRegistry
        } else {Assert-NativeDistributionStream $stream}
    } finally {$stream.Dispose()}
}
# Scan ZIP members directly: no extraction paths or temporary executable launch.
function Assert-NativeDistributionArchive([string]$Path, [string]$Registry) {
    Assert-NativeDistributionLicenseRegistry $Registry
    $owners=@('vantare-core.exe','vantare-services.exe')
    $found=@()
    $zip=[IO.Compression.ZipFile]::OpenRead($Path)
    try {
        foreach($entry in $zip.Entries) {
            if(-not $entry.FullName.EndsWith('.exe',[StringComparison]::OrdinalIgnoreCase)){continue}
            $name=[IO.Path]::GetFileName($entry.FullName)
            $stream=$entry.Open()
            try {
                if($Registry -and $name -cin $owners) {
                    Assert-NativeDistributionStream $stream -ExpectedRegistry $Registry
                    $found+=$name
                } else {Assert-NativeDistributionStream $stream}
            } finally {$stream.Dispose()}
        }
    } finally {$zip.Dispose()}
    if($Registry -and @($owners|Where-Object {$_ -cnotin $found}).Count){throw 'License registry executable missing from package.'}
}

function Assert-NativeDistributionTree([string]$Directory) {
    foreach($exe in Get-ChildItem -LiteralPath $Directory -Filter '*.exe' -File -Recurse) {
        Assert-NativeDistributionBinary $exe.FullName
    }
}

# Self-contained entry point: no builder functions, environment or build
# layout assumptions. The caller supplies the actual EXE inventory and registry.
function Assert-NativeDistributionLicensePackage([string[]]$Executables,[string]$Registry) {
    Assert-NativeDistributionLicenseRegistry $Registry
    $owners=@('vantare-core.exe','vantare-services.exe')
    $found=@()
    foreach($exe in $Executables) {
        $name=[IO.Path]::GetFileName($exe)
        if($Registry -and $name -cin $owners) {
            Assert-NativeDistributionBinary $exe -ExpectedRegistry $Registry
            $found+=$name
        } else {Assert-NativeDistributionBinary $exe}
    }
    if($Registry -and @($owners|Where-Object {$_ -cnotin $found}).Count){throw 'License registry executable missing from package.'}
}
