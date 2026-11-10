param([Parameter(Mandatory)][int]$ProcessId,[Parameter(Mandatory)][string]$Executable)
$ErrorActionPreference='Stop'
$process=Get-Process -Id $ProcessId
if($process.Path -ne [IO.Path]::GetFullPath($Executable)){throw 'Unexpected QA process image'}
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class QaWindowState {
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
@{pid=$ProcessId;hwnd=$window.ToInt64();minimized=[QaWindowState]::IsIconic($window);maximized=[QaWindowState]::IsZoomed($window)}|ConvertTo-Json -Compress
