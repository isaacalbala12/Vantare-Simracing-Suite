param(
    [Parameter(Mandatory)][string]$HubExecutable,
    [Parameter(Mandatory)][string]$QaRoot
)
$ErrorActionPreference = 'Stop'
$qa = [IO.Path]::GetFullPath($QaRoot)
$server = [IO.Path]::GetFullPath('D:\VantareServer\qa') + '\'
$ci = if ($env:CI -eq 'true' -and $env:RUNNER_TEMP) {
    [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\') + '\'
} else { '' }
if (-not ($qa.StartsWith($server, [StringComparison]::OrdinalIgnoreCase) -or
        ($ci -and $qa.StartsWith($ci, [StringComparison]::OrdinalIgnoreCase)))) {
    throw 'QA guard rejected the test root'
}
$case = Join-Path $qa "hub-development-fallback-$PID"
$case = [IO.Path]::GetFullPath($case)
if (-not $case.StartsWith($qa.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'QA case escaped its root'
}
$hub = [IO.Path]::GetFullPath($HubExecutable)
if (-not (Test-Path -LiteralPath $hub -PathType Leaf) -or $hub -match '[\\/]generations[\\/]') {
    throw 'use a standalone development Hub binary'
}
$saved = @{}
foreach ($name in 'LOCALAPPDATA', 'APPDATA', 'TEMP', 'VANTARE_NATIVE_DATA_ROOT') {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
function Invoke-HubProbe {
    $start = [Diagnostics.ProcessStartInfo]::new($hub)
    $start.ArgumentList.Add('--qa-data-root')
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($start)
    try {
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        if (-not $process.WaitForExit(10000)) {
            $process.Kill()
            throw 'Hub QA probe timed out'
        }
        return [pscustomobject]@{ Code = $process.ExitCode; Output = $stdout.Trim(); Error = $stderr }
    } finally { $process.Dispose() }
}
try {
    New-Item -ItemType Directory -Path $case -Force | Out-Null
    $env:LOCALAPPDATA = Join-Path $case 'localappdata'
    $env:APPDATA = Join-Path $case 'appdata'
    $env:TEMP = Join-Path $case 'temp'
    Remove-Item Env:VANTARE_NATIVE_DATA_ROOT -ErrorAction SilentlyContinue
    $positive = Invoke-HubProbe
    if ($positive.Code -ne 0) { throw "development Hub rejected LOCALAPPDATA fallback: $($positive.Error)" }
    $expected = Join-Path $env:LOCALAPPDATA 'VantareNative\hub'
    if ($positive.Output.Replace('/', '\') -ne $expected.Replace('/', '\')) {
        throw "fallback mismatch: $($positive.Output)"
    }
    $env:LOCALAPPDATA = 'relative-root'
    $negative = Invoke-HubProbe
    if ($negative.Code -eq 0 -or $negative.Error -notmatch 'absoluta') {
        throw 'development Hub accepted a relative LOCALAPPDATA'
    }
    Write-Output 'development fallback through Hub: PASS'
} finally {
    foreach ($name in $saved.Keys) {
        [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process')
    }
    if (Test-Path -LiteralPath $case) { Remove-Item -LiteralPath $case -Recurse -Force }
}
