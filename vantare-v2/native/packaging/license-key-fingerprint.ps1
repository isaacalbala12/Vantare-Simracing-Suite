# Reads only explicitly supplied PUBLIC registry/key text on stdin. No env/config lookup.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'no-qa.ps1')
try {
    $text=[Console]::In.ReadToEnd().Trim()
    if(-not $text){throw 'empty'}
    $fingerprints=@()
    foreach($pair in $text.Split(',')) {
        $encoded=$pair.Trim()
        if($encoded.Contains(':')) {
            if($encoded -cnotmatch '^[A-Za-z0-9_.-]{1,64}:([A-Za-z0-9_-]{43})$'){throw 'registry'}
            $encoded=$Matches[1]
        }
        $bytes=Get-NativeLicensePublicKeyBytes $encoded
        if($null -eq $bytes){throw 'key'}
        $fingerprints+=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
    }
    foreach($fingerprint in $fingerprints){[Console]::Out.WriteLine($fingerprint)}
} catch {
    [Console]::Error.WriteLine('Invalid public Ed25519 key input.')
    exit 1
}
