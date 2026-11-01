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
$source=Join-Path $qaGuardRoot 'engine'
[IO.Directory]::CreateDirectory((Join-Path $source 'matrix'))|Out-Null
Copy-Item -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'installation-matrix-tests.ps1') -Destination $source
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'guard.ps1') -Destination (Join-Path $source 'matrix/guard.ps1')
foreach($name in @('candidate.ps1','beta.ps1','installer-driver.ps1')){[IO.File]::WriteAllBytes((Join-Path $source $name),[Text.Encoding]::UTF8.GetBytes("# inert LF fixture`n"))}
Assert-MatrixSourceBytes $source
$sourceChecks=1
foreach($name in @('candidate.ps1','beta.ps1','installer-driver.ps1')){
    $file=Join-Path $source $name
    [IO.File]::WriteAllBytes($file,[Text.Encoding]::UTF8.GetBytes("# inert CRLF fixture`r`n"))
    $failure=$null
    try{Assert-MatrixSourceBytes $source}catch{$failure=$_.Exception.Message}
    if(-not $failure -or -not $failure.StartsWith('MATRIX_SOURCE_EOL: '+$name)){throw 'Noncanonical source bytes were accepted'}
    [IO.File]::WriteAllBytes($file,[Text.Encoding]::UTF8.GetBytes("# inert LF fixture`n"))
    $sourceChecks++
}
[IO.File]::WriteAllBytes((Join-Path $source 'beta.ps1'),[Text.Encoding]::UTF8.GetBytes("throw 'PRODUCT_MUST_NOT_LOAD'`r`n"))
$rejectedRoot=Join-Path $qaGuardRoot 'rejected-source'
$info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $source 'installation-matrix-tests.ps1')+'" -Root "'+$rejectedRoot+'" -LegacyPackage unused -TestVerifier unused -BootProbe unused'
$child=[Diagnostics.Process]::Start($info)
try{
    $out=$child.StandardOutput.ReadToEndAsync();$err=$child.StandardError.ReadToEndAsync()
    if(-not $child.WaitForExit(30000)){$child.Kill();$child.WaitForExit();throw 'Source guard timeout'}
    if($child.ExitCode -eq 0 -or -not $err.Result.Contains('MATRIX_SOURCE_EOL: beta.ps1') -or (Test-Path -LiteralPath $rejectedRoot)){throw 'Source guard did not reject before product loading and writes'}
}finally{$child.Dispose()}
$sourceChecks++
"PASS: $passed root/reparse rejections, safe root accepted, sentinel intact, missing root fails without writes; $sourceChecks source-byte checks"
