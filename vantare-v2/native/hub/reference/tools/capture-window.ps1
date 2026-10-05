# Captura física del área cliente. Solo opera el ejecutable/PID indicado.
param(
    [Parameter(Mandatory)][int]$ProcessId,
    [Parameter(Mandatory)][string]$ExpectedExecutable,
    [Parameter(Mandatory)][string]$OutputPath,
    [string]$Screen = '',
    [string]$RepositoryRoot,
    [int]$X = -1,
    [int]$Y = -1,
    [string]$Keys = '',
    [int]$WheelSteps = 0,
    [ValidateRange(0, 8192)][int]$Width = 0,
    [ValidateRange(0, 8192)][int]$Height = 0
)
$ErrorActionPreference = 'Stop'
if (($Width -eq 0) -ne ($Height -eq 0)) { throw 'Indica ancho y alto juntos' }
if ($Width -eq 0) {
    $width = 1440
    $height = 900
    if ($Screen.StartsWith('strategy-v5-', [StringComparison]::Ordinal)) {
        $width = 1672
        $height = 941
    }
}
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
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr hdc,uint f);
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
    # GPUI recalcula el marco tras el primer resize; vuelve a medirlo antes de corregir.
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        if (-not [HubReferenceWindow]::GetWindowRect($handle,[ref]$outer) -or
            -not [HubReferenceWindow]::GetClientRect($handle,[ref]$client)) { throw 'No se pudo medir la ventana' }
        if (-not [HubReferenceWindow]::MoveWindow($handle,0,0,$width+($outer.R-$outer.L-$client.R),$height+($outer.B-$outer.T-$client.B),$true)) {
            throw 'No se pudo ajustar el área cliente'
        }
        Start-Sleep -Milliseconds 300
        if ([HubReferenceWindow]::GetClientRect($handle,[ref]$client) -and $client.R -eq $width -and $client.B -eq $height) { break }
    }
    if ([HubReferenceWindow]::GetDpiForWindow($handle) -ne 96) { throw 'El monitor no está a DPI 100 %' }
    if (-not [HubReferenceWindow]::GetClientRect($handle,[ref]$client) -or $client.R -ne $width -or $client.B -ne $height) {
        throw "El área cliente mide $($client.R) x $($client.B), se esperaban ${width} x ${height}"
    }
    $origin = New-Object HubReferenceWindow+POINT
    if (-not [HubReferenceWindow]::ClientToScreen($handle,[ref]$origin)) { throw 'No se pudo localizar el área cliente' }
    if ([HubReferenceWindow]::GetForegroundWindow() -ne $handle) { throw 'El Hub no tiene el foco' }
    if ($X -ge 0 -or $Y -ge 0) {
        if ($X -lt 0 -or $X -ge $width -or $Y -lt 0 -or $Y -ge $height) { throw 'Click fuera del área cliente' }
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
    $bitmap = [Drawing.Bitmap]::new($width,$height)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $hdc = $graphics.GetHdc()
    $printed = [HubReferenceWindow]::PrintWindow($handle,$hdc,3)
    $graphics.ReleaseHdc($hdc)
    if (-not $printed) { $graphics.CopyFromScreen($origin.X,$origin.Y,0,0,$bitmap.Size) }
    $bitmap.Save($output,[Drawing.Imaging.ImageFormat]::Png)
    Write-Output "${width} x ${height}; DPI 96; PID $ProcessId; $output"
} finally {
    if ($graphics) { $graphics.Dispose() }
    if ($bitmap) { $bitmap.Dispose() }
    [void][HubReferenceWindow]::SetThreadDpiAwarenessContext($previousDpi)
}
