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
$archiveTree=Join-Path $EvidenceDirectory 'archive-fixture'
[IO.Directory]::CreateDirectory($archiveTree)|Out-Null
$archiveExe=Join-Path $archiveTree 'Vantare.exe'
[IO.File]::WriteAllText($archiveExe,'qa-e2e')
$archive=Join-Path $EvidenceDirectory 'qa-package.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($archiveTree,$archive)
$rejected=$false;try{Assert-NativeDistributionArchive $archive}catch{if($_.Exception.Message -ne 'QA executable in distribution payload.'){throw};$rejected=$true}
if(-not $rejected){throw 'QA EXE escaped ZIP scan'}
[IO.File]::Delete($archive)
[IO.File]::WriteAllText($archiveExe,'clean inert fixture')
[IO.Compression.ZipFile]::CreateFromDirectory($archiveTree,$archive)
Assert-NativeDistributionArchive $archive
"$count fixture controls rejected across buffer boundary; QA ZIP rejected, clean EXE and ZIP admitted PASS"
