param(
    [Parameter(Mandatory)] [ValidateSet('qt', 'slint')] [string] $Candidate,
    [Parameter(Mandatory)] [string] $Endpoint,
    [string] $QtBin
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NativeEditorTrial {
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out Rect rect);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
'@

$trialRoot = $PSScriptRoot
$executable = if ($Candidate -eq 'qt') {
    Join-Path $trialRoot 'out/qtquick/vantare-native-go-qt.exe'
} else {
    Join-Path $trialRoot 'slint/target/release/vantare-native-go-slint.exe'
}
if ($QtBin) { $env:PATH = "$QtBin;$env:PATH" }
$startInfo = [Diagnostics.ProcessStartInfo]::new((Resolve-Path -LiteralPath $executable).Path)
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
foreach ($argument in @('--endpoint', $Endpoint, '--mode', 'editor')) {
    [void] $startInfo.ArgumentList.Add($argument)
}
$process = [Diagnostics.Process]::Start($startInfo)
if (-not $process) { throw 'Could not start editor' }

try {
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
        Start-Sleep -Milliseconds 100
        $process.Refresh()
        if ($process.HasExited) { throw "Editor exited with code $($process.ExitCode)" }
    } until (($process.MainWindowHandle -ne [IntPtr]::Zero -and $process.MainWindowTitle -like '*Editor*') -or [DateTime]::UtcNow -gt $deadline)
    if ($process.MainWindowHandle -eq [IntPtr]::Zero -or $process.MainWindowTitle -notlike '*Editor*') { throw 'Editor window did not appear' }
    $root = [Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    $edit = $null
    $button = $null
    do {
        $items = $root.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
        foreach ($item in $items) {
            if (-not $edit -and $item.Current.ControlType -eq [Windows.Automation.ControlType]::Edit) { $edit = $item }
            if ($item.Current.ControlType -eq [Windows.Automation.ControlType]::Button -and $item.Current.Name -eq 'Restablecer borrador') { $button = $item }
        }
        if (-not $edit -or -not $button) { Start-Sleep -Milliseconds 100 }
    } until (($edit -and $button) -or [DateTime]::UtcNow -gt $deadline)
    if (-not $edit -or -not $button) { throw "Editor controls absent: window=$($root.Current.Name), elements=$($items.Count), edit=$([bool]$edit), button=$([bool]$button)" }
    $rows = @($items | Where-Object { $_.Current.Name -match '^STANDINGS\s*·\s*44 coches$' })
    if ($rows.Count -ne 1) { throw "Expected observed Go row count, found $($rows.Count)" }
    [NativeEditorTrial]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
    $edit.SetFocus()
    [Windows.Forms.SendKeys]::SendWait('^a')
    [Windows.Forms.SendKeys]::SendWait('NATIVE')
    Start-Sleep -Milliseconds 200
    $value = $edit.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)
    if ($value.Current.Value -ne 'NATIVE') { throw "Title did not accept keyboard input: $($value.Current.Value)" }

    $rect = [NativeEditorTrial+Rect]::new()
    if (-not [NativeEditorTrial]::GetWindowRect($process.MainWindowHandle, [ref] $rect)) { throw 'Could not read window bounds' }
    $bitmap = [Drawing.Bitmap]::new($rect.Right - $rect.Left, $rect.Bottom - $rect.Top)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
        $bitmap.Save((Join-Path $trialRoot "evidence/$Candidate-go-editor-interaction.png"), [Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }

    $bounds = $button.Current.BoundingRectangle
    [NativeEditorTrial]::SetCursorPos([int] ($bounds.X + $bounds.Width / 2), [int] ($bounds.Y + $bounds.Height / 2)) | Out-Null
    [NativeEditorTrial]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
    [NativeEditorTrial]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 200
    if ($value.Current.Value -ne 'STANDINGS') { throw "Reset did not restore title: $($value.Current.Value)" }
    Write-Output "$Candidate editor: 44 Go rows, keyboard title and physical reset OK"
} finally {
    if (-not $process.HasExited) {
        $process.CloseMainWindow() | Out-Null
        if (-not $process.WaitForExit(2000)) { $process.Kill($true); $process.WaitForExit() }
    }
    $process.Dispose()
}
