# Captura física del área cliente. Solo opera el ejecutable/PID indicado.
param(
    [Parameter(Mandatory)][int]$ProcessId,
    [Parameter(Mandatory)][string]$ExpectedExecutable,
    [Parameter(Mandatory)][string]$OutputPath,
    [string]$RepositoryRoot,
    [int]$X = -1,
    [int]$Y = -1,
    [string]$Keys = '',
    [int]$WheelSteps = 0
)
$ErrorActionPreference = 'Stop'
$repo = if ($RepositoryRoot) { [IO.Path]::GetFullPath($RepositoryRoot) } else { [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../../..')) }
$output = [IO.Path]::GetFullPath($OutputPath)
if ($output.StartsWith($repo + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'La evidencia debe quedar fuera del repo'
}
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class HubReferenceWindow {
 public struct RECT { public int L,T,R,B; }
 public struct POINT { public int X,Y; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h,ref POINT p);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int height,bool repaint);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int command);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a,uint b,bool attach);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 public delegate bool EnumProc(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback,IntPtr p);
 [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h,StringBuilder text,int capacity);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,int data,UIntPtr extra);
 public static IntPtr Find(uint pid) {
   IntPtr result=IntPtr.Zero;
   EnumWindows((h,p)=>{
     uint owner; GetWindowThreadProcessId(h,out owner);
     var title=new StringBuilder(256); GetWindowText(h,title,256);
     if(owner==pid && title.ToString().StartsWith("Vantare")) { result=h; return false; }
     return true;
   },IntPtr.Zero);
   return result;
 }
 public static void Focus(IntPtr h) {
   uint ignored; uint current=GetCurrentThreadId();
   uint foreground=GetWindowThreadProcessId(GetForegroundWindow(),out ignored);
   uint target=GetWindowThreadProcessId(h,out ignored);
   bool a=foreground!=0 && foreground!=current && AttachThreadInput(current,foreground,true);
   bool b=target!=0 && target!=current && target!=foreground && AttachThreadInput(current,target,true);
   try { ShowWindow(h,9); BringWindowToTop(h); SetForegroundWindow(h); }
   finally { if(b) AttachThreadInput(current,target,false); if(a) AttachThreadInput(current,foreground,false); }
 }
}
'@
# SAFETY: Win32 solo recibe el HWND del PID y ejecutable verificados.
$target = Get-Process -Id $ProcessId
if ($target.Path -ne [IO.Path]::GetFullPath($ExpectedExecutable)) { throw 'Ejecutable inesperado' }
$handle = $target.MainWindowHandle
if ($handle -eq 0) { $handle = [HubReferenceWindow]::Find($ProcessId) }
if ($handle -eq 0) { throw 'Ventana no disponible' }
$previousDpi = [HubReferenceWindow]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
$bitmap = $null
$graphics = $null
try {
    [HubReferenceWindow]::Focus($handle)
    $outer = New-Object HubReferenceWindow+RECT
    $client = New-Object HubReferenceWindow+RECT
    if (-not [HubReferenceWindow]::GetWindowRect($handle,[ref]$outer) -or
        -not [HubReferenceWindow]::GetClientRect($handle,[ref]$client)) { throw 'No se pudo medir la ventana' }
    if (-not [HubReferenceWindow]::MoveWindow($handle,0,0,1440+($outer.R-$outer.L-$client.R),900+($outer.B-$outer.T-$client.B),$true)) {
        throw 'No se pudo ajustar el área cliente'
    }
    Start-Sleep -Milliseconds 600
    if ([HubReferenceWindow]::GetDpiForWindow($handle) -ne 96) { throw 'El monitor no está a DPI 100 %' }
    if (-not [HubReferenceWindow]::GetClientRect($handle,[ref]$client) -or $client.R -ne 1440 -or $client.B -ne 900) {
        throw 'El área cliente no mide 1440 x 900'
    }
    $origin = New-Object HubReferenceWindow+POINT
    if (-not [HubReferenceWindow]::ClientToScreen($handle,[ref]$origin)) { throw 'No se pudo localizar el área cliente' }
    if ([HubReferenceWindow]::GetForegroundWindow() -ne $handle) { throw 'El Hub no tiene el foco' }
    if ($X -ge 0 -or $Y -ge 0) {
        if ($X -lt 0 -or $X -ge 1440 -or $Y -lt 0 -or $Y -ge 900) { throw 'Click fuera del área cliente' }
        if (-not [HubReferenceWindow]::SetCursorPos($origin.X+$X,$origin.Y+$Y)) { throw 'No se pudo mover el cursor' }
        if ($WheelSteps -eq 0) {
            [HubReferenceWindow]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
            [HubReferenceWindow]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
        }
    }
    if ($WheelSteps -ne 0) {
        if ($X -lt 0 -or $Y -lt 0 -or [Math]::Abs($WheelSteps) -gt 16) { throw 'Indica punto y entre -16 y 16 pasos de rueda' }
        [HubReferenceWindow]::mouse_event(0x0800,0,0,-120*$WheelSteps,[UIntPtr]::Zero)
    }
    if ($Keys) { [System.Windows.Forms.SendKeys]::SendWait($Keys) }
    Start-Sleep -Milliseconds 500
    if ([HubReferenceWindow]::GetForegroundWindow() -ne $handle) { throw 'Otra ventana ha recibido el foco' }
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($output))
    $bitmap = [Drawing.Bitmap]::new(1440,900)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($origin.X,$origin.Y,0,0,$bitmap.Size)
    $bitmap.Save($output,[Drawing.Imaging.ImageFormat]::Png)
    Write-Output "1440 x 900; DPI 96; PID $ProcessId; $output"
} finally {
    if ($graphics) { $graphics.Dispose() }
    if ($bitmap) { $bitmap.Dispose() }
    [void][HubReferenceWindow]::SetThreadDpiAwarenessContext($previousDpi)
}
