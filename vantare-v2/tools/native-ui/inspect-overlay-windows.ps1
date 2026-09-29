param(
    [Parameter(Mandatory)] [string] $Endpoint,
    [string] $QtBin
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NativeOverlayTrial {
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
    public delegate bool EnumCallback(IntPtr handle, IntPtr param);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumCallback callback, IntPtr param);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out Rect rect);
    [DllImport("user32.dll")] public static extern IntPtr GetWindowLongPtrW(IntPtr handle, int index);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
'@

$trialRoot = $PSScriptRoot
if ($QtBin) { $env:PATH = "$QtBin;$env:PATH" }
$candidates = @(
    @{ Name = 'qt'; Executable = 'out/qtquick/vantare-native-go-qt.exe'; Arguments = @('--endpoint', $Endpoint, '--mode', 'overlay') },
    @{ Name = 'slint'; Executable = 'slint/target/release/vantare-native-go-slint.exe'; Arguments = @('--endpoint', $Endpoint, '--mode', 'overlay') },
    @{ Name = 'wails'; Executable = 'out/wails/vantare-native-go-wails.exe'; Arguments = @('-endpoint', $Endpoint, '-mode', 'overlay') }
)

foreach ($candidate in $candidates) {
    $executable = (Resolve-Path -LiteralPath (Join-Path $trialRoot $candidate.Executable)).Path
    $startInfo = [Diagnostics.ProcessStartInfo]::new($executable)
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    foreach ($argument in $candidate.Arguments) { [void] $startInfo.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::Start($startInfo)
    if (-not $process) { throw "Could not launch $($candidate.Name)" }
    $underlay = $null
    try {
        $deadline = [DateTime]::UtcNow.AddSeconds(15)
        $handle = [IntPtr]::Zero
        $script:trialHandle = [IntPtr]::Zero
        do {
            Start-Sleep -Milliseconds 100
            $process.Refresh()
            if ($process.HasExited) { throw "$($candidate.Name) exited with code $($process.ExitCode)" }
            [NativeOverlayTrial]::EnumWindows({
                param($window, $param)
                [uint32] $owner = 0
                [NativeOverlayTrial]::GetWindowThreadProcessId($window, [ref] $owner) | Out-Null
                if ($owner -ne $process.Id -or -not [NativeOverlayTrial]::IsWindowVisible($window)) { return $true }
                $bounds = [NativeOverlayTrial+Rect]::new()
                if (-not [NativeOverlayTrial]::GetWindowRect($window, [ref] $bounds)) { return $true }
                if (($bounds.Right - $bounds.Left) -ge 400 -and ($bounds.Bottom - $bounds.Top) -ge 400) {
                    $script:trialHandle = $window
                    return $false
                }
                return $true
            }, [IntPtr]::Zero) | Out-Null
            $handle = $script:trialHandle
        } until ($handle -ne [IntPtr]::Zero -or [DateTime]::UtcNow -gt $deadline)
        if ($handle -eq [IntPtr]::Zero) { throw "$($candidate.Name) has no overlay window" }
        $rect = [NativeOverlayTrial+Rect]::new()
        if (-not [NativeOverlayTrial]::GetWindowRect($handle, [ref] $rect)) { throw 'GetWindowRect failed' }
        $width = $rect.Right - $rect.Left
        $height = $rect.Bottom - $rect.Top
        if ($width -le 0 -or $height -le 0) { throw 'Invalid overlay bounds' }

        $underlay = [Windows.Forms.Form]::new()
        $underlay.FormBorderStyle = [Windows.Forms.FormBorderStyle]::None
        $underlay.StartPosition = [Windows.Forms.FormStartPosition]::Manual
        $underlay.Bounds = [Drawing.Rectangle]::new($rect.Left, $rect.Top, $width, $height)
        $underlay.BackColor = [Drawing.Color]::Magenta
        $button = [Windows.Forms.Button]::new()
        $button.Dock = [Windows.Forms.DockStyle]::Fill
        $button.BackColor = [Drawing.Color]::Magenta
        $script:underlayClicked = $false
        $button.Add_Click({ $script:underlayClicked = $true })
        $underlay.Controls.Add($button)
        $underlay.Show()
        [Windows.Forms.Application]::DoEvents()
        $underlay.TopMost = $true
        $underlay.Activate()
        [NativeOverlayTrial]::SetForegroundWindow($underlay.Handle) | Out-Null
        [Windows.Forms.Application]::DoEvents()
        $x = [int] (($rect.Left + $rect.Right) / 2)
        $y = [int] (($rect.Top + $rect.Bottom) / 2)
        [NativeOverlayTrial]::SetCursorPos($x, $y) | Out-Null
        [NativeOverlayTrial]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
        [NativeOverlayTrial]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
        [Windows.Forms.Application]::DoEvents()
        $script:underlayClicked = $false
        $underlay.TopMost = $false
        Start-Sleep -Seconds 2
        $foregroundBefore = [NativeOverlayTrial]::GetForegroundWindow()
        if ($foregroundBefore -ne $underlay.Handle) { throw "$($candidate.Name): underlay could not take foreground" }
        $bitmap = [Drawing.Bitmap]::new($width, $height)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
            $corner = $bitmap.GetPixel(2, 2)
            $button.BackColor = [Drawing.Color]::Lime
            $underlay.BackColor = [Drawing.Color]::Lime
            [Windows.Forms.Application]::DoEvents()
            Start-Sleep -Milliseconds 100
            $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
            $limeCorner = $bitmap.GetPixel(2, 2)
        } finally {
            $graphics.Dispose()
            $bitmap.Dispose()
        }
        [NativeOverlayTrial]::SetCursorPos($x, $y) | Out-Null
        $point = [NativeOverlayTrial+Point]::new()
        $point.X, $point.Y = $x, $y
        $hitBefore = [NativeOverlayTrial]::WindowFromPoint($point)
        [NativeOverlayTrial]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
        [NativeOverlayTrial]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 250
        [Windows.Forms.Application]::DoEvents()
        $foregroundAfter = [NativeOverlayTrial]::GetForegroundWindow()
        $style = [NativeOverlayTrial]::GetWindowLongPtrW($handle, -20).ToInt64()
        [pscustomobject]@{
            Candidate = $candidate.Name
            Bounds = "${width}x${height}"
            ExtendedStyle = ('0x{0:X}' -f $style)
            TransparentStyle = ($style -band 0x20) -ne 0
            NoActivateStyle = ($style -band 0x08000000) -ne 0
            CornerRespondsToUnderlay = [Math]::Abs([int] $corner.R - [int] $limeCorner.R) + [Math]::Abs([int] $corner.G - [int] $limeCorner.G) + [Math]::Abs([int] $corner.B - [int] $limeCorner.B) -gt 50
            ClickThrough = $script:underlayClicked
            ForegroundPreserved = $foregroundBefore -eq $foregroundAfter
            UnderlayForegroundBefore = $foregroundBefore -eq $underlay.Handle
            HitIsUnderlay = $hitBefore -eq $button.Handle -or $hitBefore -eq $underlay.Handle
            CornerRGB = "$($corner.R),$($corner.G),$($corner.B)"
            LimeCornerRGB = "$($limeCorner.R),$($limeCorner.G),$($limeCorner.B)"
        } | ConvertTo-Json -Compress
    } finally {
        if ($underlay) { $underlay.Close(); $underlay.Dispose() }
        if (-not $process.HasExited) {
            $process.CloseMainWindow() | Out-Null
            if (-not $process.WaitForExit(2000)) { $process.Kill($true); $process.WaitForExit() }
        }
        $process.Dispose()
    }
}
