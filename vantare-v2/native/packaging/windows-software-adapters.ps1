#requires -Version 5.1
param([Parameter(Mandatory)][string]$OutputFile,[switch]$RequireSoftwareOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
# Read-only DXGI enumeration; no window, device reset, driver or machine change.
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class QaDxgi {
 [DllImport("dxgi.dll", ExactSpelling=true)] static extern int CreateDXGIFactory1(ref Guid iid, out IntPtr factory);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int EnumAdapter(IntPtr self, uint index, out IntPtr adapter);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetDescription(IntPtr self, out Description desc);
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct Description {
  [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string Name;
  public uint VendorId, DeviceId, SubSysId, Revision;
  public UIntPtr DedicatedVideoMemory, DedicatedSystemMemory, SharedSystemMemory;
  public uint LuidLow; public int LuidHigh; public uint Flags;
 }
 public static Description[] Read() {
  Guid iid = new Guid("770aae78-f26f-4dba-a829-253c83d1b387");
  IntPtr factory; Marshal.ThrowExceptionForHR(CreateDXGIFactory1(ref iid, out factory));
  var result = new List<Description>();
  try {
   IntPtr table = Marshal.ReadIntPtr(factory);
   var enumerate = (EnumAdapter)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(table, 12*IntPtr.Size), typeof(EnumAdapter));
   for (uint i=0; ; i++) {
    IntPtr adapter; int hr=enumerate(factory, i, out adapter);
    if (hr == unchecked((int)0x887A0002)) break;
    Marshal.ThrowExceptionForHR(hr);
    try {
     var describe=(GetDescription)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(adapter), 10*IntPtr.Size), typeof(GetDescription));
     Description desc; Marshal.ThrowExceptionForHR(describe(adapter, out desc)); result.Add(desc);
    } finally { Marshal.Release(adapter); }
   }
  } finally { Marshal.Release(factory); }
  return result.ToArray();
 }
}
'@
$adapters=@([QaDxgi]::Read() | ForEach-Object { [ordered]@{name=$_.Name;vendor=$_.VendorId;device=$_.DeviceId;flags=$_.Flags;software=(($_.Flags -band 2) -ne 0)} })
ConvertTo-Json -InputObject $adapters -Depth 3 | Set-Content -LiteralPath $OutputFile -Encoding UTF8
if($RequireSoftwareOnly -and ($adapters.Count -eq 0 -or @($adapters | Where-Object {-not $_.software}).Count)){throw 'WARP not accredited: GPUI selects the first compatible DXGI adapter; this runner is not software-only. See clean-windows-qa.md.'}
