param([Parameter(Mandatory)][string]$EvidenceDirectory,[string]$CleanExecutable,[string]$FixtureExecutable)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'no-qa.ps1')
[IO.Directory]::CreateDirectory($EvidenceDirectory)|Out-Null
$encoding=[Text.Encoding]::GetEncoding(28591)
$exe=Join-Path $EvidenceDirectory 'nested/Uninstall.exe'
[IO.Directory]::CreateDirectory((Split-Path $exe))|Out-Null
function Expect-GateFailure([scriptblock]$Action,[string]$Expected) {
    $failed=$false
    try {& $Action} catch {
        if($_.Exception.Message -cne $Expected){throw}
        $failed=$true
    }
    if(-not $failed){throw 'Distribution negative control escaped.'}
}
# Real entry points must reject beta before any build/signing/payload work.
$emptyConfig=Join-Path $EvidenceDirectory 'empty-public.cfg'
[IO.File]::WriteAllText($emptyConfig,'# No licensing authority: local smoke only.')
$betaOutput=Join-Path $EvidenceDirectory 'beta-rejection'
$duckBefore=$env:DUCKDB_LIB_DIR
try {
    Remove-Item Env:DUCKDB_LIB_DIR -ErrorAction SilentlyContinue
    foreach($config in @('',$emptyConfig)) {
        $expected=if($config){'Beta requires a configured license registry.'}else{'Beta requires an explicit public ConfigFile.'}
        Expect-GateFailure {
            & (Join-Path $PSScriptRoot 'build-candidate.ps1') -Version '0.0.0' -Channel beta -OutputDirectory $betaOutput -ConfigFile $config -AllowDirty | Out-Null
        } $expected
        Expect-GateFailure {
            & (Join-Path $PSScriptRoot 'publish-beta.ps1') -Version '0.0.0' -OutputDirectory $betaOutput -ConfigFile $config -SigningKeyFile $emptyConfig -AllowDirty | Out-Null
        } $expected
        Expect-GateFailure {
            & (Join-Path $PSScriptRoot 'build-installer.ps1') -Version '0.0.0' -OutputDirectory $betaOutput -ConfigFile $config | Out-Null
        } $expected
    }
} finally {$env:DUCKDB_LIB_DIR=$duckBefore}
Assert-NativeDistributionConfigFile 'nightly' ''
Assert-NativeDistributionLicenseRegistry ''
Assert-NativeDistributionConfigFile 'beta' $emptyConfig
if(@(Get-ChildItem -LiteralPath $betaOutput -Recurse -File -ErrorAction SilentlyContinue).Count){throw 'Rejected beta left artifacts.'}
'Beta entry points reject absent ConfigFile and empty registry; local empty smoke allowed PASS'
$markers=@('qa-e2e','VANTARE_QA_E2E_NOT_FOR_DISTRIBUTION_1916','qa-rfc8032','VANTARE_QA_','qa-fixture-public')
$markers+=@(Get-NativeKnownTestLicenseMarkers)
$hex=@($markers|Where-Object {$_ -cmatch '^[0-9A-F]{64}$'})[0]
$markers+=($hex.Substring(0,32).ToLowerInvariant()+$hex.Substring(32))
foreach($marker in $markers) {
    # No separators; the literal key/marker crosses 64 KiB between other words.
    [IO.File]::WriteAllBytes($exe,$encoding.GetBytes(('x'*65533)+$marker+'vantare-services.exe'))
    Expect-GateFailure {Assert-NativeDistributionTree $EvidenceDirectory} 'QA executable in distribution payload.'
}
"$($markers.Count) adjacent literal test-key/QA controls rejected across 64 KiB PASS"
[IO.File]::WriteAllText($exe,':versionupdated_msprofilesstartup_profileerr')
Assert-NativeDistributionTree $EvidenceDirectory
'Status serde fields admitted without generic key heuristics PASS'

# A synthetic policy approves a fresh opaque public-key value for this run only.
# Neither the production whitelist nor real configuration is read or modified.
$policy=Join-Path $EvidenceDirectory 'isolated-policy'
[IO.Directory]::CreateDirectory($policy)|Out-Null
foreach($name in @('no-qa.ps1','known-test-license-keys')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $policy
}
$policyList=Join-Path $policy 'production-license-keys.sha256'
$key=[Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
$encoded=[Convert]::ToBase64String($key).TrimEnd('=').Replace('+','-').Replace('/','_')
$hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($key)).ToLowerInvariant()
$registry='approved-control:'+$encoded
[IO.File]::WriteAllText($policyList,$hash)
. (Join-Path $policy 'no-qa.ps1')
$probe=Join-Path $policy 'vantare-core.exe'
Assert-NativeDistributionLicenseRegistry $registry -Required
[IO.File]::WriteAllText($probe,$registry)
Assert-NativeDistributionBinary $probe -ExpectedRegistry $registry
'Approved literal registry with no QA content admitted PASS'
$service=Join-Path $policy 'vantare-services.exe'
$supervisor=Join-Path $policy 'vantare.exe'
[IO.File]::WriteAllText($service,$registry)
[IO.File]::WriteAllText($supervisor,':versionupdated_msprofilesstartup_profileerr')
Assert-NativeDistributionLicensePackage -Registry $registry -Executables @($probe,$service,$supervisor)
Expect-GateFailure {Assert-NativeDistributionLicensePackage -Registry $registry -Executables @($supervisor)} 'License registry executable missing from package.'
'Self-contained package gate validates both registry owners PASS'

# Installer scans compressed members with the same literal registry policy.
function Write-LicenseTestArchive([string]$Path,$Members) {
    if([IO.File]::Exists($Path)){[IO.File]::Delete($Path)}
    $zip=[IO.Compression.ZipFile]::Open($Path,[IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach($name in $Members.Keys) {
            $writer=[IO.StreamWriter]::new($zip.CreateEntry($name).Open(),$encoding)
            try {$writer.Write($Members[$name])} finally {$writer.Dispose()}
        }
    } finally {$zip.Dispose()}
}
$archive=Join-Path $EvidenceDirectory 'package-control.zip'
$members=@{'bin/vantare-core.exe'=$registry;'bin/vantare-services.exe'=$registry;'bin/vantare.exe'=':versionupdated_msprofilesstartup_profileerr'}
Write-LicenseTestArchive $archive $members
Assert-NativeDistributionArchive $archive -Registry $registry
Assert-NativeDistributionArchive $archive # Unconfigured CI smoke.
$members['bin/vantare-core.exe']='missing registry'
Write-LicenseTestArchive $archive $members
Expect-GateFailure {Assert-NativeDistributionArchive $archive -Registry $registry} 'Configured license registry missing from executable.'
$members.Remove('bin/vantare-core.exe')
Write-LicenseTestArchive $archive $members
Expect-GateFailure {Assert-NativeDistributionArchive $archive -Registry $registry} 'License registry executable missing from package.'
$members['bin/vantare-core.exe']='nightly'+$registry+'vantare-services.exe'
foreach($marker in $markers) {
    $members['extra/Uninstall.exe']=('x'*65533)+$marker+'vantare-services.exe'
    Write-LicenseTestArchive $archive $members
    Expect-GateFailure {Assert-NativeDistributionArchive $archive -Registry $registry} 'QA executable in distribution payload.'
}
$members.Remove('extra/Uninstall.exe')
Write-LicenseTestArchive $archive $members
Assert-NativeDistributionArchive $archive -Registry $registry
'ZIP gate: approved registry, missing registry/owner, all adjacent test keys and QA markers PASS'

# Both sides are alphanumeric, exactly like adjacent Rust .rdata strings.
[IO.File]::WriteAllText($probe,('x'*65530)+$registry+'vantare-services.exe')
Assert-NativeDistributionBinary $probe -ExpectedRegistry $registry
[IO.File]::WriteAllText($probe,':versionupdated_msprofilesstartup_profileerr')
Expect-GateFailure {Assert-NativeDistributionBinary $probe -ExpectedRegistry $registry} 'Configured license registry missing from executable.'
'Configured registry absent from binary rejected PASS'
# Unknown key in config is rejected before compilation, regardless of binary text.
$other=[Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
$otherEncoded=[Convert]::ToBase64String($other).TrimEnd('=').Replace('+','-').Replace('/','_')
Expect-GateFailure {Assert-NativeDistributionLicenseRegistry ('unapproved:'+$otherEncoded)} 'Unapproved license public key in distribution payload.'
Expect-GateFailure {Assert-NativeDistributionArchive $archive -Registry ('unapproved:'+$otherEncoded)} 'Unapproved license public key in distribution payload.'
Expect-GateFailure {Assert-NativeDistributionLicenseRegistry ($registry+',unapproved:'+$otherEncoded)} 'Unapproved license public key in distribution payload.'
[IO.File]::WriteAllText($policyList,'')
Expect-GateFailure {Assert-NativeDistributionLicenseRegistry $registry} 'Production license fingerprint list is empty.'
[IO.File]::WriteAllText($policyList,'malformed')
Expect-GateFailure {Assert-NativeDistributionLicenseRegistry $registry} 'Invalid production license fingerprint list.'
[IO.File]::Delete($policyList)
$missingRejected=$false
try {Assert-NativeDistributionLicenseRegistry $registry} catch {$missingRejected=$true}
if(-not $missingRejected){throw 'Missing whitelist admitted configured registry.'}
[IO.File]::WriteAllText($policyList,$hash)
'Unapproved config and empty/missing/malformed whitelist rejected PASS'
# An approved fingerprint cannot override the literal known-test denylist.
$testKey='11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo'
$testRegistry='qa-rfc8032:'+$testKey
$testHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData((Get-NativeLicensePublicKeyBytes $testKey))).ToLowerInvariant()
[IO.File]::WriteAllText($policyList,$testHash)
Assert-NativeDistributionLicenseRegistry $testRegistry
[IO.File]::WriteAllText($probe,'nightly'+$testRegistry+'vantare-services.exe')
Expect-GateFailure {Assert-NativeDistributionBinary $probe -ExpectedRegistry $testRegistry} 'QA executable in distribution payload.'

# Real EXE controls are supplied by CI distribution after its actual builds.
if($CleanExecutable -or $FixtureExecutable) {
    if(-not $CleanExecutable -or -not $FixtureExecutable){throw 'Both real executable controls are required.'}
    [IO.File]::WriteAllText($policyList,'')
    Assert-NativeDistributionBinary $CleanExecutable
    Expect-GateFailure {Assert-NativeDistributionBinary $FixtureExecutable} 'QA executable in distribution payload.'
    'CI actual non-QA EXE admitted; actual RFC8032 QA EXE rejected PASS'
}
$fingerprintTool=Join-Path $PSScriptRoot 'license-key-fingerprint.ps1'
$actual=@('qa-rfc8032:11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo' | & pwsh -NoProfile -File $fingerprintTool)
if($LASTEXITCODE -or $actual.Count -ne 1 -or $actual[0] -cne '21fe31dfa154a261626bf854046fd2271b7bed4b6abe45aa58877ef47f9721b9'){throw 'Public fingerprint output mismatch.'}
$invalid=@('invalid' | & pwsh -NoProfile -File $fingerprintTool 2>$null)
if(-not $LASTEXITCODE -or $invalid.Count){throw 'Invalid public input leaked output or succeeded.'}
'Public-key fingerprint command output PASS'
$global:LASTEXITCODE=0
