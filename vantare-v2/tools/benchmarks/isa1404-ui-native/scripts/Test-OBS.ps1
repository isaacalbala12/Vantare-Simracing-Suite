param(
    [int]$Port = 4467,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\evidence\obs")
)

$ErrorActionPreference = "Stop"
$benchmarkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$outRoot = Join-Path $benchmarkRoot "out"
$installedObs = "C:\Program Files\obs-studio"
if (-not (Test-Path (Join-Path $installedObs "bin\64bit\obs64.exe"))) { throw "OBS executable not found" }
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$sandbox = Join-Path $OutputDirectory "sandbox"
$portableRoot = Join-Path $sandbox "portable-obs"
if (-not (Test-Path (Join-Path $portableRoot "bin\64bit\obs64.exe"))) {
    New-Item -ItemType Directory -Force $portableRoot | Out-Null
    Copy-Item -Path (Join-Path $installedObs "*") -Destination $portableRoot -Recurse -Force
}
$obsExecutable = Join-Path $portableRoot "bin\64bit\obs64.exe"
$obsConfig = Join-Path $portableRoot "config\obs-studio"
$websocketConfig = Join-Path $obsConfig "plugin_config\obs-websocket"
New-Item -ItemType Directory -Force $websocketConfig | Out-Null
@"
[General]
FirstRun=false
"@ | Set-Content -Encoding ascii (Join-Path $obsConfig "global.ini")
@{
    server_enabled = $true
    server_port = $Port
    auth_required = $false
    first_load = $false
} | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $websocketConfig "config.json")

$obs = Start-Process -FilePath $obsExecutable -ArgumentList "--portable", "--multi", "--disable-shutdown-check", "--disable-updater", "--minimize-to-tray" -WorkingDirectory (Split-Path $obsExecutable) -PassThru

try {
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 250
        $ready = Test-NetConnection 127.0.0.1 -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
    } until ($ready -or $obs.HasExited -or [DateTime]::UtcNow -gt $deadline)
    if (-not $ready) { throw "OBS websocket did not start; exit=$($obs.HasExited)" }

    $candidates = @(
        [pscustomobject]@{ Name = "wails"; Directory = $outRoot; Executable = "vantare-wails-reference.exe"; Arguments = @("-mode", "overlay"); Title = "Wails Overlay" },
        [pscustomobject]@{ Name = "qtquick"; Directory = (Join-Path $outRoot "qtquick"); Executable = "vantare-qtquick-bakeoff.exe"; Arguments = @("--mode", "overlay"); Title = "Qt Quick Overlay" },
        [pscustomobject]@{ Name = "slint"; Directory = $outRoot; Executable = "vantare-slint-bakeoff.exe"; Arguments = @("--mode", "overlay"); Title = "Slint Overlay" }
    )
    $results = @()
    foreach ($candidate in $candidates) {
        $overlay = Start-Process -FilePath (Join-Path $candidate.Directory $candidate.Executable) -ArgumentList $candidate.Arguments -WorkingDirectory $candidate.Directory -PassThru
        try {
            Start-Sleep -Seconds 2
            $path = Join-Path $OutputDirectory "$($candidate.Name)-obs.png"
            python (Join-Path $PSScriptRoot "obs_capture.py") --port $Port --title $candidate.Title --output $path --input "Vantare $($candidate.Name)"
            if ($LASTEXITCODE -ne 0) { throw "OBS capture helper failed for $($candidate.Name)" }
            $results += [pscustomobject]@{ Candidate = $candidate.Name; Captured = (Test-Path $path); Bytes = (Get-Item $path).Length; Path = $path }
        } finally {
            Stop-Process -Id $overlay.Id -Force -ErrorAction SilentlyContinue
        }
    }
    $results | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $OutputDirectory "obs-results.json")
    $results | Format-Table -AutoSize
} finally {
    Stop-Process -Id $obs.Id -Force -ErrorAction SilentlyContinue
}
