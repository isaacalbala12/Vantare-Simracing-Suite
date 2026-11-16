# CPU-only: fake PDH callback; never constructs Counters or calls a native query.
$ErrorActionPreference='Stop'
$source=Get-Content (Join-Path $PSScriptRoot 'Contadores.cs') -Raw
$tests=@'
namespace Vantare141 {
 public static class CounterBufferTests {
  [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
  struct V {public uint Status;public double Number;}
  [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
  struct I {public System.IntPtr Name;public V Value;}
  static void Assert(bool condition,string message){if(!condition)throw new System.Exception(message);}
  public static string Run(){
   const uint more=0x800007D2,invalid=0xC0000BC6;
   int stride=System.Runtime.InteropServices.Marshal.SizeOf(typeof(I));
   var a=System.Runtime.InteropServices.Marshal.StringToHGlobalUni("A");
   var b=System.Runtime.InteropServices.Marshal.StringToHGlobalUni("B");
   try{
    int reads=0;
    var result=Counters.ReadArray("fake",(System.IntPtr memory,ref uint bytes,out uint count)=>{
     count=reads==0?1u:2u;bytes=(uint)(stride*count);
     if(memory==System.IntPtr.Zero)return more;
     reads++;
     if(reads==1){bytes=(uint)(stride*2);count=2;return more;}
     System.Runtime.InteropServices.Marshal.StructureToPtr(new I{Name=a,Value=new V{Status=0,Number=1.5}},memory,false);
     System.Runtime.InteropServices.Marshal.StructureToPtr(new I{Name=b,Value=new V{Status=0,Number=2.5}},System.IntPtr.Add(memory,stride),false);
     return 0;
    });
    Assert(reads==2 && result.Length==2 && result[0].Name=="A" && result[1].Value==2.5,"Growing instance list not recovered");
    var empty=Counters.ReadArray("empty",(System.IntPtr m,ref uint bytes,out uint count)=>{bytes=0;count=0;return 0;});
    Assert(empty.Length==0,"Empty array not preserved");
    int calls=0;bool bounded=false;
    try{Counters.ReadArray("unstable",(System.IntPtr m,ref uint bytes,out uint count)=>{calls++;bytes=(uint)stride;count=1;return more;});}
    catch(System.ComponentModel.Win32Exception e){bounded=unchecked((uint)e.NativeErrorCode)==more;}
    Assert(bounded && calls==8,"Retries not bounded to four attempts");
    bool exact=false;
    try{Counters.ReadArray("error",(System.IntPtr m,ref uint bytes,out uint count)=>{bytes=(uint)stride;count=1;return m==System.IntPtr.Zero?more:invalid;});}
    catch(System.ComponentModel.Win32Exception e){exact=unchecked((uint)e.NativeErrorCode)==invalid;}
    Assert(exact,"Non-sizing error was hidden");
    return "PASS: buffer growth retry, values, empty result, bounded retries and native error preserved; fake callback only";
   }finally{System.Runtime.InteropServices.Marshal.FreeHGlobal(a);System.Runtime.InteropServices.Marshal.FreeHGlobal(b);}
  }
 }
}
'@
Add-Type -TypeDefinition ($source+[Environment]::NewLine+$tests)
[Vantare141.CounterBufferTests]::Run()

