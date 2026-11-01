#requires -Version 5.1
param([string]$Root)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'guard.ps1')
$qaGuardRoot=Assert-MatrixRoot $Root
if (Test-Path -LiteralPath $qaGuardRoot) { throw 'Guard tests need a fresh root' }
[IO.Directory]::CreateDirectory($qaGuardRoot) | Out-Null
$sentinel=Join-Path $qaGuardRoot 'sentinel.bin'
[IO.File]::WriteAllText($sentinel,'guard does not write')
$before=[IO.File]::ReadAllBytes($sentinel)
$passed=0
foreach ($bad in @('', 'C:/Users/matrix/Programs/Vantare','C:/VantareServer/installed','D:/VantareServer/qa-other/install','D:/VantareServer/qa/../installed')) {
    $failure=$null
    try { $null=Assert-MatrixRoot $bad } catch { $failure=$_.Exception.Message }
    if ($failure -cnotin @('MATRIX_ROOT_REQUIRED','MATRIX_ROOT_REJECTED')) { throw 'Wrong guard rejection' }
    $passed++
}
$destination=Join-Path $qaGuardRoot 'destination'
[IO.Directory]::CreateDirectory($destination) | Out-Null
$junction=Join-Path $qaGuardRoot 'junction'
New-Item -ItemType Junction -Path $junction -Target $destination | Out-Null
try {
    foreach ($bad in @($junction,(Join-Path $junction 'child'))) {
        $failure=$null
        try { $null=Assert-MatrixRoot $bad } catch { $failure=$_.Exception.Message }
        if ($failure -cne 'MATRIX_REPARSE_REJECTED') { throw 'Reparse point escaped guard' }
        $passed++
    }
} finally {
    # Remove only this junction, never recursively traverse its target.
    $null=Assert-MatrixRoot $qaGuardRoot
    [IO.Directory]::Delete($junction)
}
if ((Assert-MatrixRoot (Join-Path $qaGuardRoot 'accepted')) -cne (Join-Path $qaGuardRoot 'accepted')) { throw 'Safe path rejected' }
if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($sentinel)) -cne [Convert]::ToBase64String($before)) { throw 'Guard changed sentinel' }
$info=[Diagnostics.ProcessStartInfo]::new()
$info.FileName="$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe"
$info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path (Split-Path $PSScriptRoot -Parent) 'installation-matrix-tests.ps1')+'"'
$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardError=$true;$info.RedirectStandardOutput=$true
$info.EnvironmentVariables['TEMP']=$qaGuardRoot;$info.EnvironmentVariables['TMP']=$qaGuardRoot
$child=[Diagnostics.Process]::Start($info)
try {
    $out=$child.StandardOutput.ReadToEndAsync();$err=$child.StandardError.ReadToEndAsync()
    if (-not $child.WaitForExit(30000)) { $child.Kill();$child.WaitForExit();throw 'Guard child timeout' }
    if ($child.ExitCode -eq 0 -or -not $err.Result.Contains('MATRIX_ROOT_REQUIRED')) { throw 'Missing root did not fail closed' }
} finally { $child.Dispose() }
if (@(Get-ChildItem -LiteralPath $qaGuardRoot -Force).Count -ne 2) { throw 'Missing-root call wrote files' }
"PASS: $passed root/reparse rejections, safe root accepted, sentinel intact, missing root fails without writes"
