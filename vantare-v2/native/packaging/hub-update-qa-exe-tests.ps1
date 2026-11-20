# Real-executable controls for the Hub update TEST authority (#2771). Reads bytes and,
# only with -RefusalRoot, starts the QA launcher to prove that it exits before touching
# its root when no isolated Windows context is injected. No Electron, window or secret.
#requires -Version 5.1
param(
    [Parameter(Mandatory)][string]$QaExecutable,
    [Parameter(Mandatory)][string]$CleanExecutable,
    [Parameter(Mandatory)][string]$EvidenceDirectory,
    [string]$RefusalRoot
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'no-qa.ps1')
function Expect-QaRejection([string]$Path) {
    $rejected=$false
    try {Assert-NativeDistributionBinary $Path} catch {
        if($_.Exception.Message -cne 'QA executable in distribution payload.'){throw}
        $rejected=$true
    }
    if(-not $rejected){throw "Hub update QA control escaped the distribution gate: $Path"}
}
# Latin-1 keeps every byte. Same public key as services/examples/matrix-verifier.rs.
$encoding=[Text.Encoding]::GetEncoding(28591)
$key=Get-NativeLicensePublicKeyBytes 'GX9rI-FshTLGq8g4-s1ep4m-DHaykgM0A5v6iz02jWE'
$needles=[ordered]@{'marker'='VANTARE_QA_HUB_UPDATE_NOT_FOR_DISTRIBUTION';'TEST public key'=$encoding.GetString($key)}
$qa=$encoding.GetString([IO.File]::ReadAllBytes($QaExecutable))
$clean=$encoding.GetString([IO.File]::ReadAllBytes($CleanExecutable))
[IO.Directory]::CreateDirectory($EvidenceDirectory)|Out-Null
$probe=Join-Path $EvidenceDirectory 'single-needle.exe'
foreach($name in $needles.Keys) {
    if(-not $qa.Contains($needles[$name])){throw "Hub update QA $name is not contiguous in the real QA executable."}
    if($clean.Contains($needles[$name])){throw "Hub update QA $name found in the clean executable."}
    # Either one alone is enough for the gate: neither hides behind another QA marker.
    [IO.File]::WriteAllBytes($probe,$encoding.GetBytes($needles[$name]))
    Expect-QaRejection $probe
}
Expect-QaRejection $QaExecutable
'Real Hub update QA EXE carries marker and contiguous TEST key and is rejected; clean EXE has neither PASS'
if(-not $RefusalRoot){return}
$root=Join-Path $RefusalRoot ('root-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
[IO.File]::WriteAllText((Join-Path $root 'sentinel.txt'),'untouched')
foreach($mode in @('--root','--session')) {
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=$QaExecutable
    $info.Arguments="$mode -Root `"$root`""
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    foreach($name in @('VANTARE_QA_REGISTRY_PREFIX','VANTARE_QA_LOCAL_APP_DATA','VANTARE_QA_SHELL_ROOT','VANTARE_INSTALLER_QA_CONTEXT')) {
        $info.EnvironmentVariables.Remove($name)
    }
    $process=[Diagnostics.Process]::Start($info)
    try {
        if(-not $process.WaitForExit(30000)){throw "QA launcher $mode kept running without an isolated context."}
        if($process.ExitCode -eq 0){throw "QA launcher $mode succeeded without an isolated context."}
    } finally {
        if(-not $process.HasExited){$process.Kill();$process.WaitForExit()}
        $process.Dispose()
    }
}
$left=@(Get-ChildItem -LiteralPath $root -Force -Recurse)
if($left.Count -ne 1 -or $left[0].Name -cne 'sentinel.txt' -or [IO.File]::ReadAllText($left[0].FullName) -cne 'untouched') {
    throw 'QA launcher touched its root without an isolated context.'
}
'Real Hub update QA launcher refuses --root and --session without isolated context, root untouched PASS'
