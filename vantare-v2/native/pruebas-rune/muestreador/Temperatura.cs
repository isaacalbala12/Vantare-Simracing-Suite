// Declarations verified against Windows SDK 10.0.26100.0 shared/d3dkmthk.h.
// Compile on server only; never instantiate or query adapters there.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace Vantare141 {
    public struct ThermalSample {
        public string AdapterLuid;
        public uint Status;
        public uint CapsStatus;
        public double? TemperatureC;
        public double? WarningC;
        public uint FanRpm;
        public uint PowerTenthsPercent;
        public ulong MemoryFrequencyHz;
    }
    public sealed class GpuThermals : IDisposable {
        [StructLayout(LayoutKind.Sequential)] struct AdapterInfo {
            public uint Handle, LuidLow; public int LuidHigh;
            public uint Sources; public int PreciseRegions;
        }
        [StructLayout(LayoutKind.Sequential)] struct Enumeration { public uint Count; public IntPtr Adapters; }
        [StructLayout(LayoutKind.Sequential)] struct QueryInfo {
            public uint Handle, Type; public IntPtr Data; public uint Bytes;
        }
        [StructLayout(LayoutKind.Sequential)] struct PerfData {
            public uint PhysicalAdapterIndex;
            public ulong MemoryFrequency, MaxMemoryFrequency, MaxMemoryFrequencyOc, MemoryBandwidth, PcieBandwidth;
            public uint FanRpm, Power, Temperature;
            public byte PowerStateOverride;
        }
        [StructLayout(LayoutKind.Sequential)] struct PerfCaps {
            public uint PhysicalAdapterIndex;
            public ulong MaxMemoryBandwidth, MaxPcieBandwidth;
            public uint MaxFanRpm, TemperatureMax, TemperatureWarning;
        }
        [DllImport("gdi32.dll")] static extern int D3DKMTEnumAdapters2(ref Enumeration data);
        [DllImport("gdi32.dll")] static extern int D3DKMTQueryAdapterInfo(ref QueryInfo data);
        [DllImport("gdi32.dll")] static extern int D3DKMTCloseAdapter(ref uint handle);
        sealed class Adapter {
            public AdapterInfo Info;
            public PerfCaps Caps;
            public uint CapsStatus;
        }
        readonly List<Adapter> adapters=new List<Adapter>();
        public uint InitializationStatus { get; private set; }

        // Pure layout check, safe on server: no native function is called.
        public static bool LayoutsMatchSdk() {
            return IntPtr.Size==8 && Marshal.SizeOf(typeof(AdapterInfo))==20
                && Marshal.SizeOf(typeof(Enumeration))==16 && Marshal.SizeOf(typeof(QueryInfo))==24
                && Marshal.SizeOf(typeof(PerfData))==64 && Marshal.SizeOf(typeof(PerfCaps))==40;
        }
        public GpuThermals() {
            if(!LayoutsMatchSdk()) throw new PlatformNotSupportedException("Usar PowerShell x64");
            Enumeration request=new Enumeration();
            InitializationStatus=unchecked((uint)D3DKMTEnumAdapters2(ref request));
            if(InitializationStatus!=0 || request.Count==0 || request.Count>64) return;
            int stride=Marshal.SizeOf(typeof(AdapterInfo));
            request.Adapters=Marshal.AllocHGlobal(checked((int)request.Count*stride));
            try {
                InitializationStatus=unchecked((uint)D3DKMTEnumAdapters2(ref request));
                if(InitializationStatus!=0) return;
                for(int i=0;i<request.Count;i++) {
                    var info=(AdapterInfo)Marshal.PtrToStructure(IntPtr.Add(request.Adapters,i*stride),typeof(AdapterInfo));
                    adapters.Add(new Adapter { Info=info });
                }
                foreach(var adapter in adapters) {
                    PerfCaps caps=new PerfCaps();
                    adapter.CapsStatus=Query(adapter.Info.Handle,63,ref caps); // KMTQAITYPE_ADAPTERPERFDATA_CAPS
                    adapter.Caps=caps;
                }
            } catch { Dispose(); throw; }
            finally { Marshal.FreeHGlobal(request.Adapters); }
        }
        static uint Query<T>(uint handle,uint type,ref T value) where T:struct {
            int size=Marshal.SizeOf(typeof(T));
            IntPtr memory=Marshal.AllocHGlobal(size);
            try {
                Marshal.StructureToPtr(value,memory,false);
                var request=new QueryInfo { Handle=handle, Type=type, Data=memory, Bytes=(uint)size };
                uint status=unchecked((uint)D3DKMTQueryAdapterInfo(ref request));
                if(status==0) value=(T)Marshal.PtrToStructure(memory,typeof(T));
                return status;
            } finally { Marshal.FreeHGlobal(memory); }
        }
        public ThermalSample[] Read() {
            var rows=new List<ThermalSample>();
            foreach(var adapter in adapters) {
                PerfData perf=new PerfData();
                uint status=Query(adapter.Info.Handle,62,ref perf); // KMTQAITYPE_ADAPTERPERFDATA
                rows.Add(new ThermalSample {
                    AdapterLuid="luid_0x"+unchecked((uint)adapter.Info.LuidHigh).ToString("x8")+"_0x"+adapter.Info.LuidLow.ToString("x8"),
                    Status=status, CapsStatus=adapter.CapsStatus,
                    TemperatureC=status==0 && perf.Temperature>0 ? (double?)perf.Temperature/10.0 : null,
                    WarningC=adapter.CapsStatus==0 && adapter.Caps.TemperatureWarning>0
                        ? (double?)adapter.Caps.TemperatureWarning/10.0 : null,
                    FanRpm=perf.FanRpm, PowerTenthsPercent=perf.Power, MemoryFrequencyHz=perf.MemoryFrequency
                });
            }
            return rows.ToArray();
        }
        public void Dispose() {
            foreach(var adapter in adapters) {
                uint handle=adapter.Info.Handle;
                if(handle!=0) { D3DKMTCloseAdapter(ref handle); adapter.Info=new AdapterInfo(); }
            }
            adapters.Clear();
        }
    }
}
