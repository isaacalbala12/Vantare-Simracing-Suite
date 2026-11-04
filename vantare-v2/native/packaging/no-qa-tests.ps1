param([Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'no-qa.ps1')
[IO.Directory]::CreateDirectory($EvidenceDirectory)|Out-Null
$fixtures=@('qa-e2e','qa-rfc8032','11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo','VANTARE_QA_','qa-fixture-public','VANTARE_QA_E2E_NOT_FOR_DISTRIBUTION_1916')
$encoding=[Text.Encoding]::GetEncoding(28591)
$fixtures+=$encoding.GetString([Convert]::FromBase64String('11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo='))
$count=0
foreach($fixture in $fixtures) {
    # Cross the scanner's buffer boundary, in an EXE outside the three runtime names.
    $exe=Join-Path $EvidenceDirectory 'nested/Uninstall.exe'
    [IO.Directory]::CreateDirectory((Split-Path $exe))|Out-Null
    [IO.File]::WriteAllBytes($exe,$encoding.GetBytes(('x'*65530)+$fixture+'tail'))
    $rejected=$false
    try {Assert-NativeDistributionTree $EvidenceDirectory}
    catch {if($_.Exception.Message -ne 'QA executable in distribution payload.'){throw};$rejected=$true}
    if(-not $rejected){throw 'Fixture marker escaped distribution scan'}
    $count++
}
[IO.File]::WriteAllText($exe,'clean inert fixture')
Assert-NativeDistributionTree $EvidenceDirectory
"$count fixture controls rejected across buffer boundary; clean EXE admitted PASS"
