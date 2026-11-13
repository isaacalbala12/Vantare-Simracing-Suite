// Native Windows APIs only. Loading this type does not create a graphics device.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace Vantare141 {
    public struct CounterSample {
        public string Name;
        public double Value;
        public uint Status;
    }
    public sealed class Counters : IDisposable {
        [DllImport("pdh.dll", CharSet=CharSet.Unicode)]
        static extern uint PdhOpenQueryW(string source, IntPtr data, out IntPtr query);
        [DllImport("pdh.dll", CharSet=CharSet.Unicode)]
        static extern uint PdhAddEnglishCounterW(IntPtr query, string path, IntPtr data, out IntPtr counter);
        [DllImport("pdh.dll")] static extern uint PdhCollectQueryData(IntPtr query);
        [DllImport("pdh.dll", CharSet=CharSet.Unicode)]
        static extern uint PdhGetFormattedCounterArrayW(IntPtr counter, uint format, ref uint bytes, out uint count, IntPtr items);
        [DllImport("pdh.dll")] static extern uint PdhCloseQuery(IntPtr query);
        [DllImport("kernel32.dll", SetLastError=true)]
        public static extern bool QueryProcessCycleTime(IntPtr process, out ulong cycles);
        [StructLayout(LayoutKind.Sequential)] struct Value { public uint Status; public double Number; }
        [StructLayout(LayoutKind.Sequential)] struct Item { public IntPtr Name; public Value Value; }
        IntPtr query;
        readonly Dictionary<string,IntPtr> counters = new Dictionary<string,IntPtr>();
        static void Check(uint error, string operation) {
            if(error != 0) throw new Win32Exception(unchecked((int)error), operation);
        }
        public Counters() {
            Check(PdhOpenQueryW(null,IntPtr.Zero,out query),"Abrir contadores PDH");
            try {
                Add("gpu_engine",@"\GPU Engine(*)\Utilization Percentage");
                Add("gpu_memory",@"\GPU Process Memory(*)\Dedicated Usage");
                Add("process_cpu",@"\Process(*)\% Processor Time");
                Add("process_id",@"\Process(*)\ID Process");
                Add("system_cpu",@"\Processor(*)\% Processor Time");
                Add("cpu_frequency",@"\Processor Information(*)\Processor Frequency");
                Add("cpu_active_time",@"\Processor Information(*)\% Processor Time");
                Add("cpu_performance",@"\Processor Information(*)\% Processor Performance");
                Add("cpu_limit",@"\Processor Information(*)\% Performance Limit");
                Add("cpu_limit_flags",@"\Processor Information(*)\Performance Limit Flags");
            } catch { Dispose(); throw; }
        }
        void Add(string name, string path) {
            IntPtr counter;
            Check(PdhAddEnglishCounterW(query,path,IntPtr.Zero,out counter),"Contador " + name);
            counters.Add(name,counter);
        }
        public void Collect() { Check(PdhCollectQueryData(query),"Muestrear PDH"); }
        public CounterSample[] Read(string name) {
            uint format=0x200; // PDH_FMT_DOUBLE, Windows SDK pdh.h
            if(name=="process_cpu" || name=="cpu_performance") format |= 0x8000; // PDH_FMT_NOCAP100
            uint bytes=0, count;
            uint status=PdhGetFormattedCounterArrayW(counters[name],format,ref bytes,out count,IntPtr.Zero);
            if(status != 0x800007D2 && status != 0) Check(status,"Dimensionar " + name);
            if(bytes==0) return new CounterSample[0];
            IntPtr memory=Marshal.AllocHGlobal(checked((int)bytes));
            try {
                Check(PdhGetFormattedCounterArrayW(counters[name],format,ref bytes,out count,memory),"Leer " + name);
                var result=new CounterSample[count];
                int stride=Marshal.SizeOf(typeof(Item));
                for(int index=0;index<count;index++) {
                    Item item=(Item)Marshal.PtrToStructure(IntPtr.Add(memory,index*stride),typeof(Item));
                    result[index]=new CounterSample { Name=Marshal.PtrToStringUni(item.Name), Value=item.Value.Number, Status=item.Value.Status };
                }
                return result;
            } finally { Marshal.FreeHGlobal(memory); }
        }
        public void Dispose() { if(query!=IntPtr.Zero) { PdhCloseQuery(query); query=IntPtr.Zero; } }
    }
}
