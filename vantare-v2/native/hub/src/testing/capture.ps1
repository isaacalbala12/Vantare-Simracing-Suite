# Captura/interacción limitada a la ventana del Hub compilado en este worktree.
# No inicia juegos, procesos de núcleo, servicios ni envía el informe.
param(
    [Parameter(Mandatory)][int]$HubProcessId,
    [string]$OutputPath,
    [int]$Width = 1440,
    [int]$Height = 900,
    [int]$X = -1,
    [int]$Y = -1,
    [ValidateRange(-2400,2400)][int]$WheelDelta = 0,
    [string]$Keys = ''
)
$ErrorActionPreference = 'Stop'
while (Test-Path -LiteralPath 'C:/tmp/fase2/pantalla-ocupada') {
    Start-Sleep -Seconds 60
}
$captureMutex = [System.Threading.Mutex]::new($false, 'Global\VantareParityCapture')
$captureHeld = $false
try {
    $captureHeld = $captureMutex.WaitOne()
    # Otro worker pudo reservar la pantalla mientras esperábamos el mutex.
    while (Test-Path -LiteralPath 'C:/tmp/fase2/pantalla-ocupada') {
        $captureMutex.ReleaseMutex()
        $captureHeld = $false
        Start-Sleep -Seconds 60
        $captureHeld = $captureMutex.WaitOne()
    }
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices;
public class TestingCapture {
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int command);
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a,uint b,bool attach);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int height,bool repaint);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,int data,UIntPtr extra);
 public struct RECT { public int L,T,R,B; }
 public static void FocusHub(IntPtr h) {
   uint ignored;
   uint current=GetCurrentThreadId();
   uint foreground=GetWindowThreadProcessId(GetForegroundWindow(),out ignored);
   uint target=GetWindowThreadProcessId(h,out ignored);
   bool attachForeground=foreground!=0 && foreground!=current && AttachThreadInput(current,foreground,true);
   bool attachTarget=target!=0 && target!=current && target!=foreground && AttachThreadInput(current,target,true);
   try { ShowWindow(h,9); BringWindowToTop(h); SetForegroundWindow(h); }
   finally {
     if(attachTarget) AttachThreadInput(current,target,false);
     if(attachForeground) AttachThreadInput(current,foreground,false);
   }
 }
}
'@
$nativeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$expected = Join-Path $nativeRoot 'target/debug/vantare-hub.exe'
$hubProcess = Get-Process -Id $HubProcessId -ErrorAction Stop
if ($hubProcess.Path -ne $expected) { throw 'Proceso ajeno a este worktree' }
if ($hubProcess.MainWindowHandle -eq 0) { throw 'La ventana no está disponible' }
[TestingCapture]::FocusHub($hubProcess.MainWindowHandle)
if ($OutputPath) {
    [void][TestingCapture]::MoveWindow($hubProcess.MainWindowHandle,0,0,$Width,$Height,$true)
    # Evita tooltips/hover del control pulsado sin salir de la ventana de QA.
    [void][TestingCapture]::SetCursorPos([int]($Width * 0.65),80)
}
[void][TestingCapture]::SetForegroundWindow($hubProcess.MainWindowHandle)
Start-Sleep -Milliseconds 500
$foreground = [TestingCapture]::GetForegroundWindow()
$foregroundOwner = [uint32]0
[void][TestingCapture]::GetWindowThreadProcessId($foreground,[ref]$foregroundOwner)
if ($foregroundOwner -ne $HubProcessId) { throw 'El Hub no tiene el foco; no se opera otra aplicación' }
if ($X -ge 0 -and $Y -ge 0) {
    $bounds = New-Object TestingCapture+RECT
    if (-not [TestingCapture]::GetWindowRect($foreground,[ref]$bounds)) { throw 'No se pudo leer la ventana' }
    if ($X -lt $bounds.L -or $X -ge $bounds.R -or $Y -lt $bounds.T -or $Y -ge $bounds.B) { throw 'Click fuera de la ventana' }
    [void][TestingCapture]::SetCursorPos($X,$Y)
    [TestingCapture]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero)
    [TestingCapture]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)
}
if ($Keys) { [System.Windows.Forms.SendKeys]::SendWait($Keys) }
if ($WheelDelta -ne 0) {
    $bounds = New-Object TestingCapture+RECT
    if (-not [TestingCapture]::GetWindowRect($foreground,[ref]$bounds)) { throw 'No se pudo leer la ventana' }
    [void][TestingCapture]::SetCursorPos(($bounds.L + [int](($bounds.R-$bounds.L)*0.75)),($bounds.T + [int](($bounds.B-$bounds.T)*0.75)))
    [TestingCapture]::mouse_event(0x0800,0,0,$WheelDelta,[UIntPtr]::Zero)
}
if ($OutputPath) {
    if ([TestingCapture]::GetForegroundWindow() -ne $hubProcess.MainWindowHandle) { throw 'Solo se captura el Hub, sin diálogos ni otras aplicaciones' }
    $rect = New-Object TestingCapture+RECT
    if (-not [TestingCapture]::GetWindowRect($hubProcess.MainWindowHandle,[ref]$rect)) { throw 'No se pudo leer la ventana' }
    $bitmap = New-Object Drawing.Bitmap ($rect.R-$rect.L),($rect.B-$rect.T)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen($rect.L,$rect.T,0,0,$bitmap.Size)
        $bitmap.Save([IO.Path]::GetFullPath($OutputPath))
        Write-Output "$($bitmap.Width) x $($bitmap.Height) · PID $HubProcessId"
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
} finally {
    if ($captureHeld) { $captureMutex.ReleaseMutex() }
    $captureMutex.Dispose()
}
