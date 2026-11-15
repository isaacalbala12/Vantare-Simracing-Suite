param([Parameter(Mandatory)][int]$ProcessId,[Parameter(Mandatory)][string]$Executable,[Parameter(Mandatory)][ValidateSet('minimize','restore')][string]$Action)
$ErrorActionPreference='Stop'
$target=Get-Process -Id $ProcessId
if($target.Path -ne [IO.Path]::GetFullPath($Executable)){throw 'Unexpected QA process image'}
$target.Refresh()
$window=$target.MainWindowHandle
if($window -eq [IntPtr]::Zero -or $target.MainWindowTitle -ne 'Vantare · Hub'){throw 'QA Hub window unavailable'}
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class HubResourceWindow {
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);
 [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr window,int command);
 public static void Set(IntPtr window,int process,bool minimize) {
  uint owner; GetWindowThreadProcessId(window,out owner);
  if(owner!=(uint)process)throw new InvalidOperationException("Unexpected HWND owner");
  ShowWindowAsync(window,minimize?6:9);
 }
}
'@
[HubResourceWindow]::Set($window,$ProcessId,($Action -eq 'minimize'))
@{pid=$ProcessId;hwnd=$window.ToInt64();action=$Action}|ConvertTo-Json -Compress
