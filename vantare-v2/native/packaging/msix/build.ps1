#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$OutputDirectory,
    [ValidateSet('Debug', 'Release')][string]$BuildProfile = 'Release',
    [string]$BinaryDirectory,
    [string]$Version = '0.1.0.0',
    [string]$IdentityName = 'Vantare.Native.LocalTest',
    [string]$Publisher = 'CN=Vantare Native Local Test',
    [string]$DisplayName = 'Vantare Native Candidate',
    [string]$PublisherDisplayName = 'Vantare (prueba local)',
    [string]$SdkDirectory,
    [switch]$TestSign,
    [string]$TestCertificateThumbprint
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (Test-Path Env:DUCKDB_LIB_DIR) { throw [InvalidOperationException]::new('Empaquetado exige DuckDB bundled; retira DUCKDB_LIB_DIR del entorno de desarrollo.') }
$native = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$output = [IO.Path]::GetFullPath($OutputDirectory)
# Todo artefacto, incluido CER público, debe quedar en target ignorado.
$allowed = [IO.Path]::GetFullPath((Join-Path $native 'target')) + [IO.Path]::DirectorySeparatorChar
if (-not $output.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) { throw 'Salida debe estar dentro de native/target/.' }
for ($ancestor = $output; $ancestor -ne $native; $ancestor = [IO.Path]::GetDirectoryName($ancestor)) {
    if ((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Salida a través de enlace rechazada.' }
}
if ((Test-Path -LiteralPath $output) -and @(Get-ChildItem -LiteralPath $output -Force).Count) { throw 'Salida debe estar vacía; no se borra evidencia.' }
if ($Version -notmatch '^\d{1,5}\.\d{1,5}\.\d{1,5}\.\d{1,5}$' -or @($Version.Split('.') | Where-Object { [int]$_ -gt 65535 }).Count -or [version]$Version -eq [version]'0.0.0.0') { throw 'Versión MSIX inválida (cuatro componentes 0..65535, distinta de 0.0.0.0).' }
$Version = ([version]$Version).ToString()
if ($IdentityName -notmatch '^[A-Za-z0-9.-]{3,50}$') { throw 'Identity Name inválido.' }
if ($TestCertificateThumbprint -and -not $TestSign) { throw 'Thumbprint exige TestSign.' }
if ($TestCertificateThumbprint -and $TestCertificateThumbprint -notmatch '^[A-Fa-f0-9]{40}$') { throw 'Thumbprint inválido.' }
if ($TestSign -and ($IdentityName -ne 'Vantare.Native.LocalTest' -or $Publisher -ne 'CN=Vantare Native Local Test')) { throw 'Firma de prueba solo para la identidad local, nunca Store.' }
if (-not $SdkDirectory) {
    $sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/bin'
    if (-not (Test-Path -LiteralPath $sdkRoot)) { throw 'Instala Windows SDK 10.0.26100 (makeappx y signtool x64); ver MSIX.md.' }
    $SdkDirectory = Get-ChildItem -LiteralPath $sdkRoot -Directory | Where-Object { $_.Name -match '^10\.0\.\d+\.0$' } |
        Sort-Object { [version]$_.Name } -Descending | ForEach-Object { Join-Path $_.FullName 'x64' } |
        Where-Object { (Test-Path (Join-Path $_ 'makeappx.exe')) -and (Test-Path (Join-Path $_ 'signtool.exe')) } | Select-Object -First 1
}
if (-not $SdkDirectory -or -not (Test-Path (Join-Path $SdkDirectory 'makeappx.exe')) -or -not (Test-Path (Join-Path $SdkDirectory 'signtool.exe'))) { throw 'Instala Windows SDK 10.0.26100: herramientas de apps Desktop (makeappx y signtool x64). Ver MSIX.md.' }
[IO.Directory]::CreateDirectory($output) | Out-Null
Push-Location $native
try {
    $sourceSha = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE) { throw 'No se pudo leer HEAD.' }
    $dirty = [bool]@(& git status --porcelain)
    if ($LASTEXITCODE) { throw 'No se pudo leer estado Git.' }
    if (-not $BinaryDirectory) {
        $arguments = @('build', '--workspace', '--bins', '--locked', '--offline', '-j', '2')
        if ($BuildProfile -eq 'Release') { $arguments += '--release' }
        & cargo @arguments
        if ($LASTEXITCODE) { throw 'Build Rust falló.' }
    }
    $metadataText = & cargo metadata --offline --locked --no-deps --format-version 1
    if ($LASTEXITCODE) { throw 'cargo metadata falló.' }
    $metadata = $metadataText | ConvertFrom-Json
} finally { Pop-Location }
$bins = @($metadata.packages | Where-Object { $_.id -cin $metadata.workspace_members } | ForEach-Object { $_.targets | Where-Object { 'bin' -cin $_.kind } | ForEach-Object { $_.name } })
if (-not $BinaryDirectory) { $BinaryDirectory = Join-Path $metadata.target_directory $BuildProfile.ToLowerInvariant() }
$payload = Join-Path $output 'payload'
[IO.Directory]::CreateDirectory((Join-Path $payload 'bin')) | Out-Null
[IO.Directory]::CreateDirectory((Join-Path $payload 'Assets')) | Out-Null
[IO.Directory]::CreateDirectory((Join-Path $payload 'licenses')) | Out-Null
foreach ($bin in $bins) {
    $source = Join-Path $BinaryDirectory "$bin.exe"
    if ((Get-Item -LiteralPath $source).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Enlace rechazado: $bin" }
    $stream = [IO.File]::OpenRead($source)
    $reader = [IO.BinaryReader]::new($stream)
    try {
        if ($reader.ReadUInt16() -ne 0x5a4d) { throw "No es PE: $bin" }
        $stream.Position = 0x3c
        $stream.Position = $reader.ReadUInt32()
        if ($reader.ReadUInt32() -ne 0x4550 -or $reader.ReadUInt16() -ne 0x8664) { throw "No es PE x64: $bin" }
    } finally { $reader.Dispose() }
    Copy-Item -LiteralPath $source -Destination (Join-Path $payload "bin/$bin.exe")
}
# Activos aprobados y versionados (#1504); incluye qualifiers targetsize/altform.
# No redimensionar aquí: perdería las variantes ópticas de 16/24 px.
Copy-Item -Path (Join-Path $PSScriptRoot 'Assets/*.png') -Destination (Join-Path $payload 'Assets')
Copy-Item -LiteralPath (Join-Path $native 'ui/assets/fonts/OFL-Inter.txt') -Destination (Join-Path $payload 'licenses/OFL-Inter.txt')
[xml]$manifest = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'AppxManifest.xml'))
$manifest.Package.Identity.Name = $IdentityName
$manifest.Package.Identity.Publisher = $Publisher
$manifest.Package.Identity.Version = $Version
$manifest.Package.Properties.DisplayName = $DisplayName
$manifest.Package.Properties.PublisherDisplayName = $PublisherDisplayName
$manifest.Package.Applications.Application[0].VisualElements.DisplayName = $DisplayName
$manifest.Save((Join-Path $payload 'AppxManifest.xml'))
$package = Join-Path $output "vantare-native-$Version-x64.msix"
& (Join-Path $SdkDirectory 'makeappx.exe') pack /d $payload /p $package /h SHA256
if ($LASTEXITCODE) { throw 'makeappx rechazó el paquete.' }
$certificate = $null
if ($TestSign) {
    if ($TestCertificateThumbprint) {
        $certificate = Get-Item -LiteralPath "Cert:/CurrentUser/My/$TestCertificateThumbprint"
        if ($certificate.Subject -ne $Publisher -or -not $certificate.HasPrivateKey -or $certificate.NotAfter -le [DateTime]::Now) { throw 'Certificado de prueba inválido.' }
    } else {
        # Clave NO exportable en CurrentUser/My. Nunca escribir PFX ni contraseña.
        $certificate = New-SelfSignedCertificate -Type Custom -Subject $Publisher -CertStoreLocation 'Cert:/CurrentUser/My' `
            -KeyUsage DigitalSignature -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy NonExportable `
            -NotAfter ([DateTime]::Now.AddDays(30)) -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
    }
    try {
        Export-Certificate -Cert $certificate -FilePath (Join-Path $output 'local-test.cer') | Out-Null
        & (Join-Path $SdkDirectory 'signtool.exe') sign /fd SHA256 /s My /sha1 $certificate.Thumbprint $package
        if ($LASTEXITCODE) { throw 'Firma local falló.' }
    } catch {
        if (-not $TestCertificateThumbprint) { Remove-Item -LiteralPath "Cert:/CurrentUser/My/$($certificate.Thumbprint)" -DeleteKey }
        throw
    }
}
$files = @(Get-ChildItem -LiteralPath $payload -File -Recurse | ForEach-Object { [ordered]@{ path = $_.FullName.Substring($payload.Length + 1); sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() } })
$evidence = [ordered]@{ source_sha = $sourceSha; source_dirty = $dirty; build_profile = $BuildProfile; external_binary_directory = [bool]$PSBoundParameters.ContainsKey('BinaryDirectory'); version = $Version; identity = $IdentityName; publisher = $Publisher; sdk_directory = $SdkDirectory; test_certificate_thumbprint = $(if ($certificate) { $certificate.Thumbprint } else { $null }); package_sha256 = (Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash.ToLowerInvariant(); files = $files }
$evidence | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $output 'build-evidence.json') -Encoding UTF8
Write-Output $package
