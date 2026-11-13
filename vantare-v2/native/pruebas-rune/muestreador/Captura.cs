// Windows SDK 10.0.26100.0 shared/evntrace.h, EVENT_TRACE_PROPERTIES (x64).
// Only QUERY of our own unique session; never stops someone else's capture.
// Loading/compiling this type makes no native calls and creates no device.
using System;
using System.Runtime.InteropServices;
using System.Text;

namespace Vantare141 {
    public struct CaptureState {
        public bool Active;
        public uint Status;
        public uint EventsLost;
        public uint LogBuffersLost;
        public uint RealTimeBuffersLost;
    }
    public static class CaptureSession {
        [DllImport("advapi32.dll", CharSet=CharSet.Unicode)]
        static extern uint ControlTraceW(ulong handle, string name, IntPtr properties, uint control);

        public static CaptureState Query(string name) {
            if(IntPtr.Size != 8) throw new PlatformNotSupportedException("Usar PowerShell x64");
            if(String.IsNullOrEmpty(name) || !name.StartsWith("vantare141-",StringComparison.Ordinal))
                throw new ArgumentException("Solo consultar la sesion propia");
            const int size=65536;
            IntPtr memory=Marshal.AllocHGlobal(size);
            try {
                Marshal.Copy(new byte[size],0,memory,size);
                byte[] label=Encoding.Unicode.GetBytes(name+"\0");
                Marshal.WriteInt32(memory,0,size); // Wnode.BufferSize
                Marshal.WriteInt32(memory,116,120); // LoggerNameOffset
                Marshal.WriteInt32(memory,112,120+label.Length); // LogFileNameOffset
                Marshal.Copy(label,0,IntPtr.Add(memory,120),label.Length);
                uint status=ControlTraceW(0,name,memory,0); // EVENT_TRACE_CONTROL_QUERY
                return new CaptureState {
                    Active=status==0, Status=status,
                    EventsLost=status==0 ? unchecked((uint)Marshal.ReadInt32(memory,88)) : 0,
                    LogBuffersLost=status==0 ? unchecked((uint)Marshal.ReadInt32(memory,96)) : 0,
                    RealTimeBuffersLost=status==0 ? unchecked((uint)Marshal.ReadInt32(memory,100)) : 0
                };
            } finally { Marshal.FreeHGlobal(memory); }
        }
    }
}
