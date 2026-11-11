param([Parameter(Mandatory)][int]$ProcessId,[Parameter(Mandatory)][string]$Executable,[ValidateSet("state","drag","doubleClick","hitTest")][string]$Action="state",[int]$X=0,[int]$Y=0)
$ErrorActionPreference='Stop'
$process=Get-Process -Id $ProcessId
if($process.Path -ne [IO.Path]::GetFullPath($Executable)){throw 'Unexpected QA process image'}
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class QaWindowState {
 public struct Rect {public int l,t,r,b;}
 public struct Point {public int x,y;}
 [StructLayout(LayoutKind.Sequential)] public struct GuiInfo {public uint size,flags;public IntPtr active,focus,capture,menuOwner,moveSize,caret;public Rect caretRect;}
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h,ref Point p);
 [DllImport("user32.dll")] static extern bool GetCursorPos(out Point p);
 [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint thread,ref GuiInfo info);
 [DllImport("user32.dll")] static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 [DllImport("user32.dll")] static extern IntPtr SendMessageTimeoutW(IntPtr h,uint msg,IntPtr wp,IntPtr lp,uint flags,uint timeout,out IntPtr result);
 static bool Moving(uint thread) {var info=new GuiInfo();info.size=(uint)Marshal.SizeOf<GuiInfo>();return GetGUIThreadInfo(thread,ref info)&&(info.flags&2)!=0;}
 public static Rect Bounds(IntPtr h){Rect r;if(!GetWindowRect(h,out r))throw new Exception("GetWindowRect failed");return r;}
 public static int Hit(IntPtr h,int x,int y) {
  Point point=new Point{x=x,y=y};ClientToScreen(h,ref point);
  IntPtr hit;var packed=new IntPtr((point.y<<16)|(point.x&65535));
  if(SendMessageTimeoutW(h,0x84,IntPtr.Zero,packed,2,5000,out hit)==IntPtr.Zero)throw new Exception("WM_NCHITTEST timed out");
  return hit.ToInt32();
 }
 public static void Input(IntPtr h,string action,int x,int y) {
  var hit=Hit(h,x,y);if(hit!=2)throw new Exception("Title point is not HTCAPTION: "+hit);
  Point point=new Point{x=x,y=y};ClientToScreen(h,ref point);
  SetForegroundWindow(h);
  if(!System.Threading.SpinWait.SpinUntil(()=>GetForegroundWindow()==h,5000))throw new Exception("QA window could not receive real desktop input");
  Point previous;GetCursorPos(out previous);SetCursorPos(point.x,point.y);
  uint pid;uint thread=GetWindowThreadProcessId(h,out pid);
  try {
   if(action=="doubleClick") {
    mouse_event(2,0,0,0,UIntPtr.Zero);mouse_event(4,0,0,0,UIntPtr.Zero);
    mouse_event(2,0,0,0,UIntPtr.Zero);mouse_event(4,0,0,0,UIntPtr.Zero);
   } else {
    var before=Bounds(h);mouse_event(2,0,0,0,UIntPtr.Zero);
    try {
     // Windows starts caption dragging after the pointer crosses its drag threshold.
     var start=System.Diagnostics.Stopwatch.StartNew();
     int step=0;
     while(!Moving(thread)&&start.ElapsedMilliseconds<5000) {
      SetCursorPos(point.x+10+(step++%2)*10,point.y+10);
      System.Threading.Thread.Sleep(10); // Bounded polling of native move-loop readiness.
     }
     if(!Moving(thread))throw new Exception("Native caption move loop did not start");
     SetCursorPos(point.x+80,point.y+50);
     if(!System.Threading.SpinWait.SpinUntil(()=>{var r=Bounds(h);return r.l!=before.l||r.t!=before.t;},5000))throw new Exception("Dragging did not move the HWND");
    } finally {mouse_event(4,0,0,0,UIntPtr.Zero);}
    if(!System.Threading.SpinWait.SpinUntil(()=>!Moving(thread),5000))throw new Exception("Native move loop did not finish");
   }
  } finally {mouse_event(4,0,0,0,UIntPtr.Zero);SetCursorPos(previous.x,previous.y);}
 }
 public delegate bool Callback(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback,IntPtr p);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowTextW(IntPtr h,System.Text.StringBuilder text,int max);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
 public static IntPtr Find(int process) {
  IntPtr found=IntPtr.Zero;
  EnumWindows((h,p)=>{uint pid;GetWindowThreadProcessId(h,out pid);if(pid==process){var text=new System.Text.StringBuilder(256);GetWindowTextW(h,text,text.Capacity);if(text.ToString()=="Vantare · Hub"){found=h;return false;}}return true;},IntPtr.Zero);
  if(found==IntPtr.Zero)throw new InvalidOperationException("QA Hub HWND unavailable");
  return found;
 }
}
'@
$window=[QaWindowState]::Find($ProcessId)
if($Action -eq 'drag' -or $Action -eq 'doubleClick'){[QaWindowState]::Input($window,$Action,$X,$Y)}
$rect=[QaWindowState]::Bounds($window)
@{hit= $(if($Action -eq 'hitTest'){[QaWindowState]::Hit($window,$X,$Y)}else{$null});left=$rect.l;top=$rect.t;pid=$ProcessId;hwnd=$window.ToInt64();minimized=[QaWindowState]::IsIconic($window);maximized=[QaWindowState]::IsZoomed($window)}|ConvertTo-Json -Compress
