param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\evidence\functional")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeBakeoff {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int index);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
}
"@

$benchmarkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$outRoot = Join-Path $benchmarkRoot "out"
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null

$candidates = @(
    [pscustomobject]@{ Name = "wails"; Directory = $outRoot; Executable = "vantare-wails-reference.exe"; Control = @("-mode", "control"); Overlay = @("-mode", "overlay"); AutoClose = @("-auto-close", "2500ms") },
    [pscustomobject]@{ Name = "qtquick"; Directory = (Join-Path $outRoot "qtquick"); Executable = "vantare-qtquick-bakeoff.exe"; Control = @("--mode", "control"); Overlay = @("--mode", "overlay"); AutoClose = @("--auto-close-ms", "2500") },
    [pscustomobject]@{ Name = "slint"; Directory = $outRoot; Executable = "vantare-slint-bakeoff.exe"; Control = @("--mode", "control"); Overlay = @("--mode", "overlay"); AutoClose = @("--auto-close-ms", "2500") }
)

function Start-Candidate([object]$Candidate, [string]$Mode, [string[]]$AdditionalArguments = @()) {
    $arguments = @($(if ($Mode -eq "control") { $Candidate.Control } else { $Candidate.Overlay })) + $AdditionalArguments
    $process = Start-Process -FilePath (Join-Path $Candidate.Directory $Candidate.Executable) -ArgumentList $arguments -WorkingDirectory $Candidate.Directory -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
        Start-Sleep -Milliseconds 100
        $process.Refresh()
        if ($process.HasExited) { throw "$($Candidate.Name) $Mode exited before exposing a window (code $($process.ExitCode))" }
    } until ($process.MainWindowHandle -ne [IntPtr]::Zero -or [DateTime]::UtcNow -gt $deadline)
    if ($process.MainWindowHandle -eq [IntPtr]::Zero) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        throw "$($Candidate.Name) $Mode did not expose a main window"
    }
    Start-Sleep -Milliseconds 800
    $process.Refresh()
    return $process
}

function Stop-Candidate([Diagnostics.Process]$Process) {
    if (-not $Process.HasExited) {
        $null = $Process.CloseMainWindow()
        if (-not $Process.WaitForExit(3000)) { Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue }
    }
}

function Get-WindowRectangle([IntPtr]$Handle) {
    $rectangle = New-Object NativeBakeoff+RECT
    $success = [NativeBakeoff]::GetWindowRect($Handle, [ref]$rectangle)
    if (-not $success) { throw "GetWindowRect failed" }
    return $rectangle
}

function Save-WindowScreenshot([IntPtr]$Handle, [string]$Path) {
    $rect = Get-WindowRectangle $Handle | Select-Object -Last 1
    $width = [Math]::Max(1, $rect.Right - $rect.Left)
    $height = [Math]::Max(1, $rect.Bottom - $rect.Top)
    $bitmap = [Drawing.Bitmap]::new($width, $height)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
        $bitmap.Save($Path, [Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
    return $rect
}

function Get-AutomationSummary([IntPtr]$Handle) {
    $root = [Windows.Automation.AutomationElement]::FromHandle($Handle)
    $elements = $root.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
    $summary = @()
    for ($index = 0; $index -lt $elements.Count; $index++) {
        $element = $elements.Item($index)
        $type = $element.Current.ControlType.ProgrammaticName
        if ($type -in @("ControlType.Edit", "ControlType.CheckBox", "ControlType.Button", "ControlType.Text")) {
            $summary += [pscustomobject]@{ Type = $type; Name = $element.Current.Name; Enabled = $element.Current.IsEnabled }
        }
    }
    return @($summary)
}

function Test-ControlInteraction([IntPtr]$Handle) {
    $root = [Windows.Automation.AutomationElement]::FromHandle($Handle)
    $editCondition = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::Edit)
    $checkCondition = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::CheckBox)
    $edit = $root.FindFirst([Windows.Automation.TreeScope]::Descendants, $editCondition)
    $check = $root.FindFirst([Windows.Automation.TreeScope]::Descendants, $checkCondition)
    $editPass = $false
    $clipboardPass = $false
    $togglePass = $false
    if ($null -ne $edit) {
        $valuePattern = $edit.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)
        $valuePattern.SetValue("ISA-1404 acceso nativo")
        Start-Sleep -Milliseconds 250
        $editPass = $valuePattern.Current.Value -eq "ISA-1404 acceso nativo"
        [Windows.Forms.Clipboard]::SetText("Portapapeles Vantare")
        $edit.SetFocus()
        [Windows.Forms.SendKeys]::SendWait("^a")
        [Windows.Forms.SendKeys]::SendWait("^v")
        Start-Sleep -Milliseconds 250
        $clipboardPass = $valuePattern.Current.Value -eq "Portapapeles Vantare"
    }
    if ($null -ne $check) {
        $toggle = $check.GetCurrentPattern([Windows.Automation.TogglePattern]::Pattern)
        $before = $toggle.Current.ToggleState
        $toggle.Toggle()
        Start-Sleep -Milliseconds 200
        $after = $toggle.Current.ToggleState
        $togglePass = $after -ne $before
        $toggle.Toggle()
    }
    return [pscustomobject]@{ Edit = $editPass; ClipboardPaste = $clipboardPass; Toggle = $togglePass }
}

function New-Underlay([NativeBakeoff+RECT]$Rectangle) {
    $form = New-Object Windows.Forms.Form
    $form.FormBorderStyle = [Windows.Forms.FormBorderStyle]::None
    $form.BackColor = [Drawing.Color]::Magenta
    $form.StartPosition = [Windows.Forms.FormStartPosition]::Manual
    $form.Bounds = [Drawing.Rectangle]::new($Rectangle.Left, $Rectangle.Top, ($Rectangle.Right - $Rectangle.Left), ($Rectangle.Bottom - $Rectangle.Top))
    $button = New-Object Windows.Forms.Button
    $button.Text = "UNDERLAY"
    $button.Dock = [Windows.Forms.DockStyle]::Fill
    $button.BackColor = [Drawing.Color]::Magenta
    $script:underlayClicked = $false
    $button.Add_Click({ $script:underlayClicked = $true })
    $form.Controls.Add($button)
    $form.Show()
    [Windows.Forms.Application]::DoEvents()
    return $form
}

function Test-Overlay([Diagnostics.Process]$Process, [string]$ScreenshotPath) {
    $handle = $Process.MainWindowHandle
    $rect = Get-WindowRectangle $handle | Select-Object -Last 1
    $underlay = New-Underlay $rect
    try {
        [NativeBakeoff]::SetForegroundWindow($underlay.Handle) | Out-Null
        [Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 200
        $foregroundBefore = [NativeBakeoff]::GetForegroundWindow()
        $capturedRect = Save-WindowScreenshot $handle $ScreenshotPath | Select-Object -Last 1
        $bitmap = [Drawing.Bitmap]::FromFile($ScreenshotPath)
        try { $corner = $bitmap.GetPixel(2, 2) } finally { $bitmap.Dispose() }
        $centerX = [int](($capturedRect.Left + $capturedRect.Right) / 2)
        $centerY = [int](($capturedRect.Top + $capturedRect.Bottom) / 2)
        [NativeBakeoff]::SetCursorPos($centerX, $centerY) | Out-Null
        [NativeBakeoff]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
        [NativeBakeoff]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 250
        [Windows.Forms.Application]::DoEvents()
        $foregroundAfter = [NativeBakeoff]::GetForegroundWindow()
        $style = [NativeBakeoff]::GetWindowLongPtr($handle, -20).ToInt64()
        return [pscustomobject]@{
            Bounds = [pscustomobject]@{ X = $rect.Left; Y = $rect.Top; Width = $rect.Right - $rect.Left; Height = $rect.Bottom - $rect.Top }
            ExtendedStyleHex = "0x{0:X}" -f $style
            TransparentStyle = ($style -band 0x20) -ne 0
            NoActivateStyle = ($style -band 0x08000000) -ne 0
            ToolWindowStyle = ($style -band 0x80) -ne 0
            AppWindowStyle = ($style -band 0x40000) -ne 0
            CornerShowsUnderlay = $corner.R -gt 220 -and $corner.B -gt 220 -and $corner.G -lt 40
            ClickThrough = $script:underlayClicked
            ForegroundPreserved = $foregroundBefore -eq $foregroundAfter
        }
    } finally {
        $underlay.Close()
        $underlay.Dispose()
    }
}

$results = @()
foreach ($candidate in $candidates) {
    $control = Start-Candidate $candidate "control"
    try {
        $controlShot = Join-Path $OutputDirectory "$($candidate.Name)-control.png"
        $controlRect = Save-WindowScreenshot $control.MainWindowHandle $controlShot | Select-Object -Last 1
        $automation = Get-AutomationSummary $control.MainWindowHandle
        $interaction = Test-ControlInteraction $control.MainWindowHandle
    } finally { Stop-Candidate $control }

    $overlay = Start-Candidate $candidate "overlay"
    try {
        $overlayShot = Join-Path $OutputDirectory "$($candidate.Name)-overlay.png"
        $overlayResult = Test-Overlay $overlay $overlayShot
    } finally { Stop-Candidate $overlay }

    $cyclePass = $true
    $cycleTimes = @()
    1..5 | ForEach-Object {
        $watch = [Diagnostics.Stopwatch]::StartNew()
        $cycle = Start-Candidate $candidate "overlay" $candidate.AutoClose
        if (-not $cycle.WaitForExit(5000)) { Stop-Candidate $cycle; $cyclePass = $false }
        $watch.Stop()
        $cycleTimes += $watch.ElapsedMilliseconds
        if (Get-Process -Id $cycle.Id -ErrorAction SilentlyContinue) { $cyclePass = $false }
    }
    $results += [pscustomobject]@{
        Candidate = $candidate.Name
        ControlBounds = [pscustomobject]@{ X = $controlRect.Left; Y = $controlRect.Top; Width = $controlRect.Right - $controlRect.Left; Height = $controlRect.Bottom - $controlRect.Top }
        Automation = $automation
        Interaction = $interaction
        Overlay = $overlayResult
        LifecycleFiveCycles = $cyclePass
        LifecycleMilliseconds = $cycleTimes
    }
}

$resultPath = Join-Path $OutputDirectory "functional-results.json"
$results | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 $resultPath
$results | Select-Object Candidate, @{n="Edit";e={$_.Interaction.Edit}}, @{n="Paste";e={$_.Interaction.ClipboardPaste}}, @{n="Toggle";e={$_.Interaction.Toggle}}, @{n="Alpha";e={$_.Overlay.CornerShowsUnderlay}}, @{n="ClickThrough";e={$_.Overlay.ClickThrough}}, @{n="NoActivate";e={$_.Overlay.ForegroundPreserved}}, LifecycleFiveCycles | Format-Table -AutoSize
Write-Host "Evidence: $resultPath"
