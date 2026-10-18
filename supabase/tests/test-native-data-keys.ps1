#Requires -Version 7.4
$ErrorActionPreference = 'Stop'
$generator = Join-Path $PSScriptRoot '../functions/scripts/new-native-data-key.ps1'
$dir = Join-Path ([IO.Path]::GetTempPath()) ('b01-test-keys-' + [guid]::NewGuid())
[IO.Directory]::CreateDirectory($dir) | Out-Null
$privatePath = Join-Path $dir 'TEST-private.jwk'
$publicPath = Join-Path $dir 'TEST-public.jwk'
try {
    $output = & $generator -PrivatePath $privatePath -PublicPath $publicPath
    $privateText = [IO.File]::ReadAllText($privatePath)
    $publicText = [IO.File]::ReadAllText($publicPath)
    $private = $privateText | ConvertFrom-Json
    $public = $publicText | ConvertFrom-Json
    if ($public.PSObject.Properties.Name -contains 'd' -or $private.d.Length -ne 43 -or
        $public.kid -ne $private.kid -or $public.alg -ne 'ES256' -or
        $private.x -ne $public.x -or $private.y -ne $public.y -or
        ($output -join '').Contains($private.d)) { throw 'Invalid key separation/output' }
    if ($IsWindows) {
        $acl = Get-Acl -LiteralPath $privatePath
        $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        if (-not $acl.AreAccessRulesProtected) { throw 'Inherited private ACL' }
        foreach ($rule in $acl.Access) {
            if ($rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $sid) {
                throw 'Private file grants another identity'
            }
        }
    } else {
        $mode = [IO.File]::GetUnixFileMode($privatePath)
        if ([int]$mode -ne 384) { throw 'Private mode is not 0600' }
    }
    # Import generated files independently and prove they are the same EC pair.
    function Decode([string]$s) { return [Convert]::FromBase64String($s.Replace('-','+').Replace('_','/') + '=') }
    $parameters = [Security.Cryptography.ECParameters]::new()
    $parameters.Curve = [Security.Cryptography.ECCurve+NamedCurves]::nistP256
    $point = [Security.Cryptography.ECPoint]::new()
    $point.X = Decode $public.x; $point.Y = Decode $public.y
    $parameters.Q = $point
    $verifier = [Security.Cryptography.ECDsa]::Create($parameters)
    $parameters.D = Decode $private.d
    $signer = [Security.Cryptography.ECDsa]::Create($parameters)
    try {
        $data = [Text.Encoding]::UTF8.GetBytes('B01 synthetic test')
        $signature = $signer.SignData($data, [Security.Cryptography.HashAlgorithmName]::SHA256,
            [Security.Cryptography.DSASignatureFormat]::IeeeP1363FixedFieldConcatenation)
        if (-not $verifier.VerifyData($data, $signature, [Security.Cryptography.HashAlgorithmName]::SHA256,
            [Security.Cryptography.DSASignatureFormat]::IeeeP1363FixedFieldConcatenation)) { throw 'Pair verification failed' }
    } finally { $signer.Dispose(); $verifier.Dispose() }
    $rejected = $false
    try { & $generator -PrivatePath $privatePath -PublicPath $publicPath | Out-Null } catch { $rejected = $true }
    if (-not $rejected -or [IO.File]::ReadAllText($privatePath) -ne $privateText -or
        [IO.File]::ReadAllText($publicPath) -ne $publicText) { throw 'Existing keys replaced' }
    Write-Output 'PASS: TEST ES256 pair, public/private separation, protected permissions, no private stdout, no overwrite.'
} finally {
    # Only the two explicitly known TEST files in our unique temporary directory.
    foreach ($path in @($privatePath, $publicPath)) { if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path } }
    [IO.Directory]::Delete($dir)
}
