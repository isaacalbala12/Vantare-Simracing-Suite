param([Parameter(Mandatory)][int]$ProcessId,[Parameter(Mandatory)][string]$Executable,[ValidateRange(0,1439)][int]$ClientX=38,[ValidateRange(0,899)][int]$ClientY=724)
$ErrorActionPreference='Stop'
$process=Get-Process -Id $ProcessId
if ([IO.Path]::GetFullPath($process.Path) -ne [IO.Path]::GetFullPath($Executable)) { throw 'Unexpected bank executable' }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class GpuiSidebar {
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
 public delegate bool Visitor(IntPtr window,IntPtr data);
 [DllImport("user32.dll")] static extern bool EnumWindows(Visitor visitor,IntPtr data);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
 [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window,out Rect rect);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll",SetLastError=true)] static extern bool PostMessageW(IntPtr window,uint message,UIntPtr wparam,IntPtr lparam);
 public static long Toggle(uint process,int x,int y) {
  IntPtr found=IntPtr.Zero;
  Visitor visitor=(window,data)=>{ uint pid; Rect rect; GetWindowThreadProcessId(window,out pid); if(pid==process && GetClientRect(window,out rect) && rect.Right==1440 && rect.Bottom==900) { found=window; return false; } return true; };
  EnumWindows(visitor,IntPtr.Zero); GC.KeepAlive(visitor);
  if(found==IntPtr.Zero) throw new InvalidOperationException("QA 1440x900 bank HWND missing");
  IntPtr point=new IntPtr((y<<16)|x);
  foreach(uint message in new uint[]{0x200,0x201,0x202}) if(!PostMessageW(found,message,new UIntPtr(message==0x201 ? 1u:0u),point)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  if(!PostMessageW(found,0x200,UIntPtr.Zero,new IntPtr((890<<16)|1000))) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  return found.ToInt64();
 }
}
'@
$foreground=[GpuiSidebar]::GetForegroundWindow()
$window=[GpuiSidebar]::Toggle([uint32]$ProcessId,$ClientX,$ClientY)
if (-not $process.WaitForInputIdle(10000)) { throw 'Bank input loop timed out' }
if ([GpuiSidebar]::GetForegroundWindow() -ne $foreground) { throw 'Foreground changed unexpectedly' }
@{pid=$ProcessId;hwnd=$window;client=@($ClientX,$ClientY);foreground_unchanged=$true} | ConvertTo-Json -Compress
