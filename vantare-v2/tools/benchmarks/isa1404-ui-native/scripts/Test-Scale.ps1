param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\evidence\scale")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeScale {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
}
"@

$benchmarkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$outRoot = Join-Path $benchmarkRoot "out"
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$candidates = @(
    [pscustomobject]@{ Name="wails"; Directory=$outRoot; Executable="vantare-wails-reference.exe"; Arguments=@("-mode","control"); Environment="WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"; Prefix="--force-device-scale-factor=" },
    [pscustomobject]@{ Name="qtquick"; Directory=(Join-Path $outRoot "qtquick"); Executable="vantare-qtquick-bakeoff.exe"; Arguments=@("--mode","control"); Environment="QT_SCALE_FACTOR"; Prefix="" },
    [pscustomobject]@{ Name="slint"; Directory=$outRoot; Executable="vantare-slint-bakeoff.exe"; Arguments=@("--mode","control"); Environment="SLINT_SCALE_FACTOR"; Prefix="" }
)

function Wait-Window([Diagnostics.Process]$Process) {
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
        Start-Sleep -Milliseconds 100
        $Process.Refresh()
        $rect = [NativeScale+RECT]::new()
        $valid = $Process.MainWindowHandle -ne [IntPtr]::Zero -and [NativeScale]::GetWindowRect($Process.MainWindowHandle, [ref]$rect) -and ($rect.Right-$rect.Left) -gt 100
    } until ($valid -or $Process.HasExited -or [DateTime]::UtcNow -gt $deadline)
    if ($Process.MainWindowHandle -eq [IntPtr]::Zero) { throw "window unavailable for process $($Process.Id)" }
    Start-Sleep -Seconds 1
}

function Capture([IntPtr]$Handle, [string]$Path) {
    $rect = [NativeScale+RECT]::new()
    if (-not [NativeScale]::GetWindowRect($Handle, [ref]$rect)) { throw "GetWindowRect failed" }
    $bitmap = [Drawing.Bitmap]::new($rect.Right-$rect.Left, $rect.Bottom-$rect.Top)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try { $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size); $bitmap.Save($Path) } finally { $graphics.Dispose(); $bitmap.Dispose() }
    return $rect
}

$results = @()
foreach ($candidate in $candidates) {
    foreach ($scale in @(1.0, 1.5)) {
        $previous = [Environment]::GetEnvironmentVariable($candidate.Environment, "Process")
        [Environment]::SetEnvironmentVariable($candidate.Environment, "$($candidate.Prefix)$scale", "Process")
        try {
            $process = Start-Process -FilePath (Join-Path $candidate.Directory $candidate.Executable) -ArgumentList $candidate.Arguments -WorkingDirectory $candidate.Directory -PassThru
        } finally {
            [Environment]::SetEnvironmentVariable($candidate.Environment, $previous, "Process")
        }
        try {
            Wait-Window $process
            $path = Join-Path $OutputDirectory "$($candidate.Name)-scale-$($scale.ToString('0.0',[Globalization.CultureInfo]::InvariantCulture)).png"
            $rect = Capture $process.MainWindowHandle $path | Select-Object -Last 1
            $root = [Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
            $nameCondition = [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty, "81.252")
            $lastValue = $root.FindFirst([Windows.Automation.TreeScope]::Descendants, $nameCondition)
            $visible = $false
            if ($null -ne $lastValue) {
                $bounds = $lastValue.Current.BoundingRectangle
                $visible = -not $lastValue.Current.IsOffscreen -and $bounds.Bottom -le $rect.Bottom -and $bounds.Right -le $rect.Right
            }
            $results += [pscustomobject]@{ Candidate=$candidate.Name; Scale=$scale; Width=$rect.Right-$rect.Left; Height=$rect.Bottom-$rect.Top; LastRowVisible=$visible; Screenshot=$path }
        } finally { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
    }
}
$results | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $OutputDirectory "scale-results.json")
$results | Format-Table -AutoSize
