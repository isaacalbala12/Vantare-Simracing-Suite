[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Executable,
    [Parameter(Mandatory)][string]$QtRoot,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [ValidateRange(1, 100)][int]$Repetitions = 10,
    [ValidateSet('overtake', 'full', 'enter', 'retirement')]
    [string[]]$Scenarios = @('overtake', 'full', 'enter', 'retirement')
)

$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path -LiteralPath $Executable).Path
$qt = (Resolve-Path -LiteralPath $QtRoot).Path
$output = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $output) { throw "output directory already exists: $output" }
if (-not (Test-Path -LiteralPath (Join-Path $qt 'bin\Qt6Core.dll') -PathType Leaf)) { throw 'Qt runtime is incomplete' }
$release = Split-Path -Parent $exe
$replay = Join-Path $release 'replay\redline-viewmodels-v1.jsonl'
$manifest = Join-Path $release 'replay\redline-viewmodels-v1.manifest.json'
foreach ($required in @($replay, $manifest)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "packaged custody file is absent: $required" }
}
$repo = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Git root is unavailable' }
$commit = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[0-9a-f]{40}$') { throw 'Git HEAD is invalid' }
if ((& git status --porcelain --untracked-files=no).Count -ne 0) { throw 'tracked worktree must be clean before baseline capture' }

$sceneByScenario = [ordered]@{
    overtake = 'standings-overtake'
    full = 'standings-full'
    enter = 'standings-car-enters'
    retirement = 'standings-retirement'
}
New-Item -ItemType Directory -Path $output | Out-Null
$oldPath = $env:PATH
$oldPluginPath = $env:QT_PLUGIN_PATH
$oldForceLogging = $env:QT_FORCE_STDERR_LOGGING
$oldScene = $env:VANTARE_REDLINE_SCENE
$oldTrace = $env:VANTARE_QT_MOTION_TRACE
$entries = @()
try {
    $env:PATH = "$(Join-Path $qt 'bin');$env:PATH"
    $env:QT_PLUGIN_PATH = Join-Path $qt 'plugins'
    $env:QT_FORCE_STDERR_LOGGING = '1'
    foreach ($scenario in $Scenarios) {
        foreach ($repetition in 1..$Repetitions) {
            $residual = @(Get-CimInstance Win32_Process | Where-Object {
                $_.ExecutablePath -and $_.ExecutablePath.Equals($exe, [StringComparison]::OrdinalIgnoreCase)
            })
            if ($residual.Count -ne 0) { throw "candidate residual before $scenario/$repetition" }
            $traceName = '{0}-r{1:d2}.trace.json' -f $scenario, $repetition
            $tracePath = Join-Path $output $traceName
            $env:VANTARE_REDLINE_SCENE = $sceneByScenario[$scenario]
            $env:VANTARE_QT_MOTION_TRACE = $tracePath
            $started = [DateTimeOffset]::UtcNow
            $console = @(& $exe 2>&1 | ForEach-Object { [string]$_ })
            $exitCode = $LASTEXITCODE
            if ($exitCode -ne 0 -or -not (Test-Path -LiteralPath $tracePath -PathType Leaf)) {
                throw "candidate failed $scenario/$repetition exit=$exitCode output=$($console -join ' | ')"
            }
            $residual = @(Get-CimInstance Win32_Process | Where-Object {
                $_.ExecutablePath -and $_.ExecutablePath.Equals($exe, [StringComparison]::OrdinalIgnoreCase)
            })
            if ($residual.Count -ne 0) { throw "candidate residual after $scenario/$repetition" }
            $entries += [ordered]@{
                scenario = $scenario
                sceneId = $sceneByScenario[$scenario]
                repetition = $repetition
                startedAt = $started.ToString('O')
                exitCode = $exitCode
                traceFile = $traceName
                traceBytes = (Get-Item -LiteralPath $tracePath).Length
                traceSha256 = (Get-FileHash -LiteralPath $tracePath -Algorithm SHA256).Hash.ToLowerInvariant()
            }
            Write-Output ("PASS {0} r{1:d2}" -f $scenario, $repetition)
        }
    }
}
finally {
    $env:PATH = $oldPath
    $env:QT_PLUGIN_PATH = $oldPluginPath
    $env:QT_FORCE_STDERR_LOGGING = $oldForceLogging
    $env:VANTARE_REDLINE_SCENE = $oldScene
    $env:VANTARE_QT_MOTION_TRACE = $oldTrace
}

$cpu = @(Get-CimInstance Win32_Processor | ForEach-Object Name)
$gpu = @(Get-CimInstance Win32_VideoController | ForEach-Object Name)
$runManifest = [ordered]@{
    schema = 'vantare.qt-standings-baseline-run.v1'
    createdAt = [DateTimeOffset]::UtcNow.ToString('O')
    commit = $commit
    repetitions = $Repetitions
    scenarios = @($Scenarios)
    executable = [ordered]@{ file = [IO.Path]::GetFileName($exe); sha256 = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant() }
    replay = [ordered]@{ file = [IO.Path]::GetFileName($replay); sha256 = (Get-FileHash $replay -Algorithm SHA256).Hash.ToLowerInvariant() }
    manifest = [ordered]@{ file = [IO.Path]::GetFileName($manifest); sha256 = (Get-FileHash $manifest -Algorithm SHA256).Hash.ToLowerInvariant() }
    qtCore = [ordered]@{ file = 'Qt6Core.dll'; sha256 = (Get-FileHash (Join-Path $qt 'bin\Qt6Core.dll') -Algorithm SHA256).Hash.ToLowerInvariant() }
    runnerSha256 = (Get-FileHash $MyInvocation.MyCommand.Path -Algorithm SHA256).Hash.ToLowerInvariant()
    environment = [ordered]@{
        os = [Environment]::OSVersion.VersionString
        cpu = $cpu
        gpu = $gpu
    }
    traces = $entries
}
$manifestPath = Join-Path $output 'run-manifest.json'
[IO.File]::WriteAllText($manifestPath, ($runManifest | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))
Write-Output "manifest=$manifestPath"
