# Solo HWND de captura fuera de todos los monitores. Nunca activa ni mueve.
param(
    [Parameter(Mandatory)][int]$ProcessId,
    [Parameter(Mandatory)][string]$ExpectedExecutable,
    [Parameter(Mandatory)][string]$OutputPath,
    [string]$Screen = '', [string]$RepositoryRoot,
    [int]$X = -1, [int]$Y = -1, [string]$Keys = '', [int]$WheelSteps = 0,
    [ValidateRange(0,8192)][int]$Width = 0, [ValidateRange(0,8192)][int]$Height = 0
)
$ErrorActionPreference = 'Stop'
if ($X -ne -1 -or $Y -ne -1 -or $Keys -or $WheelSteps) { throw 'Usa escenas declaradas en --capture-batch; no se permite manejar el escritorio.' }
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
. "$PSScriptRoot/capture-bitmap.ps1"
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class OffscreenCaptureWindow {
 public struct RECT { public int L,T,R,B; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
 public delegate bool EnumProc(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback,IntPtr p);
 public static IntPtr Find(uint pid) {
   IntPtr result=IntPtr.Zero;
   EnumWindows((h,p)=>{uint owner; GetWindowThreadProcessId(h,out owner); if(owner==pid){result=h; return false;} return true;},IntPtr.Zero);
   return result;
 }
}
'@
$target = Get-Process -Id $ProcessId
if ($target.Path -ne [IO.Path]::GetFullPath($ExpectedExecutable)) { throw 'Ejecutable inesperado' }
$handle = [OffscreenCaptureWindow]::Find($ProcessId)
if ($handle -eq 0) { throw 'HWND no disponible' }
$dpi = [OffscreenCaptureWindow]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
$buffer = $null
try {
    $rect = New-Object OffscreenCaptureWindow+RECT
    $client = New-Object OffscreenCaptureWindow+RECT
    if (-not [OffscreenCaptureWindow]::GetWindowRect($handle,[ref]$rect)) { throw 'GetWindowRect falló' }
    foreach ($monitor in [Windows.Forms.Screen]::AllScreens) {
        $m = $monitor.Bounds
        if ($rect.L -lt $m.Right -and $rect.R -gt $m.Left -and $rect.T -lt $m.Bottom -and $rect.B -gt $m.Top) { throw 'La ventana no está fuera de todos los monitores; no se captura.' }
    }
    if ([OffscreenCaptureWindow]::GetForegroundWindow() -eq $handle) { throw 'La captura recibió foco' }
    if (-not [OffscreenCaptureWindow]::GetClientRect($handle,[ref]$client)) { throw 'GetClientRect falló' }
    if (($Width -and $client.R -ne $Width) -or ($Height -and $client.B -ne $Height)) { throw 'Fija el tamaño en el manifiesto antes de presentar la ventana' }
    if ([OffscreenCaptureWindow]::GetDpiForWindow($handle) -ne 96) { throw 'Captura requiere DPI 96' }
    $output = [IO.Path]::GetFullPath($OutputPath)
    $repo = if ($RepositoryRoot) { [IO.Path]::GetFullPath($RepositoryRoot) } else { [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../../..')) }
    if ($output.StartsWith($repo + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'La evidencia debe quedar fuera del repo' }
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($output))
    $buffer = [HubCaptureBitmap]::new($client.R,$client.B)
    if (-not $buffer.Capture($handle)) { throw 'PrintWindow falló; no se permite copiar el escritorio' }
    Save-HubCaptureBitmap $buffer $output
    & "$PSScriptRoot/assert-opaque.ps1" -Path $output
} finally {
    if ($buffer) { $buffer.Dispose() }
    [void][OffscreenCaptureWindow]::SetThreadDpiAwarenessContext($dpi)
}
