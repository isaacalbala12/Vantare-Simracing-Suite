param([Parameter(Mandatory)][int]$ProcessId,[Parameter(Mandatory)][string]$Executable,[string]$Output,[switch]$Prepare)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../../../native/hub/reference/tools/capture-bitmap.ps1')
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class VisualWindow {
 public struct Rect {public int l,t,r,b;}
 public delegate bool Callback(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback,IntPtr p);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowTextW(IntPtr h,System.Text.StringBuilder text,int max);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h,out Rect rect);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Rect rect);
 [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
 [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 public static IntPtr Find(int process,bool requireVisible) {
  SetThreadDpiAwarenessContext(new IntPtr(-4));
  IntPtr found=IntPtr.Zero;string details="";
  EnumWindows((h,p)=>{uint pid;GetWindowThreadProcessId(h,out pid);Rect r;if(pid==process&&GetClientRect(h,out r)){var text=new System.Text.StringBuilder(256);GetWindowTextW(h,text,text.Capacity);details+=" "+h+":"+IsWindowVisible(h)+":"+r.r+"x"+r.b+":"+text;if(text.ToString()=="Vantare · Hub"&&(!requireVisible||IsWindowVisible(h))&&r.r>200&&r.b>100){found=h;return false;}}return true;},IntPtr.Zero);
  if(found==IntPtr.Zero)throw new InvalidOperationException("QA window unavailable for "+process+details);
  return found;
 }
 public static void Check(IntPtr h) {Rect r;GetClientRect(h,out r);if(r.r!=1440||r.b!=900)throw new InvalidOperationException("Expected 1440x900 physical client pixels");}
 public static void Resize(IntPtr h) {Rect client,outer;GetClientRect(h,out client);GetWindowRect(h,out outer);if(!SetWindowPos(h,IntPtr.Zero,0,0,1440+outer.r-outer.l-client.r,900+outer.b-outer.t-client.b,2|4|16|64))throw new InvalidOperationException("Could not prepare QA client");}
}
'@
$process=Get-Process -Id $ProcessId
if($process.Path -ne [IO.Path]::GetFullPath($Executable)){throw 'Unexpected process image'}
$window=[VisualWindow]::Find($ProcessId,(-not $Prepare))
# SWP_SHOWWINDOW + NOACTIVATE prepares only the verified QA process, never the desktop.
if($Prepare){[VisualWindow]::Resize($window);[VisualWindow]::Check($window);return}
if(-not $Output){throw 'Output required for capture'}
[VisualWindow]::Check($window)
$bitmap=[HubCaptureBitmap]::new(1440,900)
try {
 if(-not $bitmap.Capture($window)){throw 'PrintWindow failed'}
 Save-HubCaptureBitmap $bitmap ([IO.Path]::GetFullPath($Output))
}finally{$bitmap.Dispose()}
