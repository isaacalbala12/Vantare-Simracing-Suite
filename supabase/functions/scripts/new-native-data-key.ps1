#Requires -Version 7.4
[CmdletBinding()]
param([Parameter(Mandatory)][string]$PrivatePath,
      [Parameter(Mandatory)][string]$PublicPath)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# No network, environment/secrets inspection or stdout key material. CreateNew
# prevents replacement. ACL/mode is applied atomically, before writing a byte.
function New-ProtectedFile([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if ($IsWindows) {
        $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $acl = [Security.AccessControl.FileSecurity]::new()
        $acl.SetOwner($sid)
        $acl.SetAccessRuleProtection($true, $false)
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
            $sid, [Security.AccessControl.FileSystemRights]::FullControl,
            [Security.AccessControl.AccessControlType]::Allow))
        return [IO.FileSystemAclExtensions]::Create([IO.FileInfo]::new($full),
            [IO.FileMode]::CreateNew, [Security.AccessControl.FileSystemRights]::FullControl,
            [IO.FileShare]::None, 4096, [IO.FileOptions]::None, $acl)
    }
    $options = [IO.FileStreamOptions]::new()
    $options.Mode = [IO.FileMode]::CreateNew
    $options.Access = [IO.FileAccess]::Write
    $options.Share = [IO.FileShare]::None
    $options.UnixCreateMode = [IO.UnixFileMode]::UserRead -bor [IO.UnixFileMode]::UserWrite
    return [IO.FileStream]::new($full, $options)
}
function ConvertTo-Base64Url([byte[]]$Bytes) {
    return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}

$privateFile = $null
$publicFile = $null
$ecdsa = $null
try {
    if ([IO.Path]::GetFullPath($PrivatePath) -eq [IO.Path]::GetFullPath($PublicPath)) {
        throw 'distinct_paths_required'
    }
    # All files must be outside any Git checkout. Parents must already exist;
    # reject symlinks/reparse points, including ancestors of the output directory.
    foreach ($path in @($PrivatePath, $PublicPath)) {
        $parent = [IO.DirectoryInfo]::new([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($path)))
        if (-not $parent.Exists) { throw 'parent_required' }
        while ($null -ne $parent) {
            if (($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
                (Test-Path -LiteralPath (Join-Path $parent.FullName '.git'))) {
                throw 'unsafe_output_directory'
            }
            $parent = $parent.Parent
        }
    }
    $privateFile = New-ProtectedFile $PrivatePath
    $publicFile = New-ProtectedFile $PublicPath
    $ecdsa = [Security.Cryptography.ECDsa]::Create([Security.Cryptography.ECCurve+NamedCurves]::nistP256)
    $parameters = $ecdsa.ExportParameters($true)
    $public = [ordered]@{ kty='EC'; crv='P-256'; alg='ES256'; kid=[guid]::NewGuid().ToString(); use='sig'
        x=(ConvertTo-Base64Url $parameters.Q.X); y=(ConvertTo-Base64Url $parameters.Q.Y) }
    $private = [ordered]@{}
    foreach ($entry in $public.GetEnumerator()) { $private[$entry.Key] = $entry.Value }
    $private['d'] = ConvertTo-Base64Url $parameters.D
    $private['key_ops'] = @('sign')
    $public['key_ops'] = @('verify')
    $bytes = [Text.Encoding]::UTF8.GetBytes(($private | ConvertTo-Json -Compress))
    try { $privateFile.Write($bytes); $privateFile.Flush($true) }
    finally { [Array]::Clear($bytes, 0, $bytes.Length); [Array]::Clear($parameters.D, 0, $parameters.D.Length) }
    $publicBytes = [Text.Encoding]::UTF8.GetBytes(($public | ConvertTo-Json -Compress))
    $publicFile.Write($publicBytes)
    $publicFile.Flush($true)
    Write-Output 'ES256 key pair written to protected files; no key material printed.'
} catch {
    # Avoid diagnostics that could contain material from cryptographic objects.
    throw 'Key generation failed; inspect output paths/permissions locally. Existing files are never replaced. A failed run may leave empty files.'
} finally {
    if ($null -ne $ecdsa) { $ecdsa.Dispose() }
    if ($null -ne $privateFile) { $privateFile.Dispose() }
    if ($null -ne $publicFile) { $publicFile.Dispose() }
}
