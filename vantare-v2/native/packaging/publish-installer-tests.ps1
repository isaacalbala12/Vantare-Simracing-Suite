#requires -Version 5.1
# Ejecuta el publisher real; solo sustituye build/firma por fixtures inertes.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Join-Path ([IO.Path]::GetTempPath()) ('vantare-publisher-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'publish-beta.ps1') -Destination $root
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $root 'beta.ps1'), @'
param([switch]$Library,[Alias('Root')][string]$StubRoot)
$script:BetaRepository = 'fixture/downloads'
function Read-BetaVersion($Version) { $Version }
function Assert-NativePath($Path) { [IO.Path]::GetFullPath($Path) }
function Get-NativeHash($Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Build-NativeCandidate($Output, $Version, $Channel, $Profile, $Dirty) {
    [IO.Directory]::CreateDirectory($Output) | Out-Null
    [IO.File]::WriteAllText((Join-Path $Output 'build.txt'), "$Version/$Channel/$Profile")
    [IO.File]::WriteAllText((Join-Path $Output 'vantare-native-amd64-package.zip'), 'fixture')
    @{ sha256 = ('a' * 64) }
}
function Invoke-BetaManifestTool($Verifier, $Json, $Key) { $Json }
function Read-BetaManifest($Json, $Remote, $Verifier) { $Json | ConvertFrom-Json }
'@, $utf8)
[IO.File]::WriteAllText((Join-Path $root 'build-config.ps1'), @'
function Restore-NativeBuildConfig($Config) {}
'@, $utf8)
[IO.File]::WriteAllText((Join-Path $root 'build-installer.ps1'), @'
param($Version, $OutputDirectory, $BuildProfile)
if ($Version -eq '0.0.980') { throw 'fixture: build rechazado' }
[IO.File]::WriteAllText((Join-Path $OutputDirectory 'VantareSetup.exe'), "rust-gpui/$Version/$BuildProfile")
'@, $utf8)
[IO.File]::WriteAllText((Join-Path $root 'nsis.ps1'), @'
param([Parameter(ValueFromRemainingArguments)][string[]]$Defines)
$output = ($Defines | Where-Object { $_.StartsWith('/DOUTPUT=') }).Substring(9)
[IO.File]::WriteAllText((Join-Path $output 'VantareSetup.exe'), 'nsis-legacy')
$global:LASTEXITCODE = 0
'@, $utf8)
$passed = 0
function Assert-Publish([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
    $script:passed++
    "PASS $Message"
}
# No claves, configuración, compilación ni comandos de publicación reales.
$publisher = Join-Path $root 'publish-beta.ps1'
$cases = @(
    @{ version = '0.0.979'; legacy = $false; expected = 'rust-gpui/0.0.979/Release' },
    @{ version = '0.0.976'; legacy = $false; expected = 'nsis-legacy' },
    @{ version = '0.0.979'; legacy = $true; expected = 'nsis-legacy' }
)
foreach ($case in $cases) {
    $output = Join-Path $root ([guid]::NewGuid().ToString('N'))
    $compiler = if ($case.expected.StartsWith('rust-gpui')) { Join-Path $root 'nsis-no-existe.exe' } else { Join-Path $root 'nsis.ps1' }
    $messages = @(& $publisher -Version $case.version -OutputDirectory $output -SigningKeyFile 'fixture-no-key' -NsisCompiler $compiler -LegacyNsis:$case.legacy)
    $setup = Join-Path $output 'VantareSetup.exe'
    Assert-Publish ([IO.File]::ReadAllText($setup) -ceq $case.expected) "Seleccion $($case.version), legacy=$($case.legacy)"
    $hash = (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLowerInvariant()
    Assert-Publish ([IO.File]::ReadAllText("$setup.sha256").Trim() -ceq "$hash  VantareSetup.exe") 'Sidecar corresponde al Setup seleccionado'
    Assert-Publish ([IO.File]::ReadAllText((Join-Path $output 'build.txt')) -ceq "$($case.version)/beta/Release") 'Payload conserva version/canal/perfil'
    Assert-Publish (@($messages | Where-Object { $_ -like 'gh release create *' }).Count -eq 1) 'Publicacion solo como instrucción de salida'
}
$output = Join-Path $root 'failed'
$rejected = $false
try {
    $null = & $publisher -Version '0.0.980' -OutputDirectory $output -SigningKeyFile 'fixture-no-key' -NsisCompiler (Join-Path $root 'nsis-no-existe.exe')
} catch { $rejected = $true }
Assert-Publish ($rejected -and -not (Test-Path -LiteralPath (Join-Path $output 'VantareSetup.exe.sha256'))) 'Fallo GPUI impide declarar Setup listo, sin fallback NSIS'
"$passed checks PASS; fixtures conservadas en $root"
