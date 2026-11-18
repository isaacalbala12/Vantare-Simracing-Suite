#requires -Version 5.1
param([Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-tooling.ps1')
function Reject-QaDistribution([scriptblock]$Action,[string]$Expected) {
    try {& $Action} catch {
        if($_.Exception.Message -cne $Expected){throw}
        return
    }
    throw "Expected rejection: $Expected"
}
$inventoryPath=Join-Path $PSScriptRoot 'public-inventory.json'
$inventory=[IO.File]::ReadAllText($inventoryPath)|ConvertFrom-Json
$qa='vantare-qa-license'
if("$qa.exe" -iin $inventory.executables){throw 'QA binary listed in the public inventory.'}
Push-Location (Split-Path $PSScriptRoot)
try{
    $metadata=& cargo metadata --offline --locked --no-deps --format-version 1 | ConvertFrom-Json
    if($LASTEXITCODE){throw 'Cargo metadata failed.'}
}finally{Pop-Location}
$available=@($metadata.packages|Where-Object {$_.id -cin $metadata.workspace_members}|ForEach-Object {
    $_.targets|Where-Object {'bin' -cin $_.kind}|ForEach-Object {$_.name}
}|Sort-Object -Unique)
if($qa -cnotin $available){throw 'The QA target must be present in Cargo metadata.'}
Assert-PublicBins $available $inventory
foreach($mode in @('direct','override')){
    $bad=[IO.File]::ReadAllText($inventoryPath)|ConvertFrom-Json
    if($mode -ceq 'direct'){$bad.executables+=@("$qa.exe")}
    else{$bad.artifact_overrides.'vantare-hub.exe'="$qa.exe"}
    Reject-QaDistribution {Assert-PublicBins $available $bad} 'QA license binary in public inventory.'
    Reject-QaDistribution {Assert-PublicInventory $EvidenceDirectory $bad} 'QA license binary in public inventory.'
}

. (Join-Path $PSScriptRoot 'no-qa.ps1')
$tree=Join-Path $EvidenceDirectory ('scanner-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($tree)|Out-Null
$markerError='QA executable in distribution payload.'
$probe=Join-Path $tree 'probe.exe'
[IO.File]::WriteAllText($probe,('x'*65532)+$qa+'other-data')
Reject-QaDistribution {Assert-NativeDistributionTree $tree} $markerError
[IO.File]::Delete($probe)
[IO.File]::WriteAllText((Join-Path $tree 'VANTARE-QA-LICENSE.bin'),'clean')
Reject-QaDistribution {Assert-NativeDistributionTree $tree} $markerError
$archive=Join-Path $EvidenceDirectory ('scanner-'+[guid]::NewGuid().ToString('N')+'.zip')
foreach($name in @('bin/probe.exe','nested/VANTARE-QA-LICENSE.bin')){
    $zip=[IO.Compression.ZipFile]::Open($archive,[IO.Compression.ZipArchiveMode]::Create)
    try {
        $writer=[IO.StreamWriter]::new($zip.CreateEntry($name).Open())
        try {
            if($name -ceq 'bin/probe.exe'){$writer.Write(('x'*65532)+$qa+'other-data')}
            else{$writer.Write('clean')}
        }finally{$writer.Dispose()}
    }finally{$zip.Dispose()}
    Reject-QaDistribution {Assert-NativeDistributionArchive $archive} $markerError
    [IO.File]::Delete($archive)
}

# Approve a synthetic public fingerprint so that only the reserved ID can reject it.
$policy=Join-Path $EvidenceDirectory ('qa-license-policy-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($policy)|Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'no-qa.ps1') -Destination $policy
$key=[byte[]]::new(32)
$rng=[Security.Cryptography.RandomNumberGenerator]::Create()
try{$rng.GetBytes($key)}finally{$rng.Dispose()}
$sha=[Security.Cryptography.SHA256]::Create()
try{$hash=[BitConverter]::ToString($sha.ComputeHash($key)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
[IO.File]::WriteAllText((Join-Path $policy 'production-license-keys.sha256'),$hash)
$encoded=[Convert]::ToBase64String($key).TrimEnd('=').Replace('+','-').Replace('/','_')
. (Join-Path $policy 'no-qa.ps1')
Assert-NativeDistributionFeatures @('network')
foreach($feature in @('qa-e2e','parity-capture','hub-update-qa','qa-license')){
    Reject-QaDistribution {Assert-NativeDistributionFeatures @('network',$feature)} 'QA feature in distribution graph.'
}
$normal='approved-control:'+$encoded
Assert-NativeDistributionLicenseRegistry $normal -Required
foreach($id in @('qa-a1b2c3d4','qa-rfc8032','QA-reserved')){
    Reject-QaDistribution {Assert-NativeDistributionLicenseRegistry ($normal+','+$id+':'+$encoded)} 'QA license key ID in distribution registry.'
}
"QA license distribution controls PASS (PowerShell $($PSVersionTable.PSVersion))"
